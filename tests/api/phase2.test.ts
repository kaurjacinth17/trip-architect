import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { _resetBudget } from '../../api/_lib/budget';
import { _resetDedupe } from '../../api/_lib/dedupe';
import { MASKS } from '../../api/_lib/places';
import { _resetRateLimit } from '../../api/_lib/ratelimit';
import { _resetRedis } from '../../api/_lib/redis';
import { GET as areas, overpassQuery } from '../../api/_routes/areas';
import { GET as climate } from '../../api/_routes/climate';
import { GET as fx } from '../../api/_routes/fx';
import { POST as autocomplete } from '../../api/_routes/places/autocomplete';
import { GET as destination } from '../../api/_routes/places/destination';
import { GET as lite } from '../../api/_routes/places/lite';
import { POST as search, buildSearch } from '../../api/_routes/places/search';
import { GET as summary } from '../../api/_routes/summary';
import { IDS, frankfurter, googleAutocomplete, googleDestination, googleSearch, openMeteoArchive, overpass, wikipedia } from '../fixtures/providers';

const KEY = 'AIzaTEST-server-key';
const seen: { url: string; mask: string | null; body?: unknown }[] = [];

const server = setupServer(
  http.post(/places\.googleapis\.com\/v1\/places:autocomplete$/, async ({ request }) => {
    const body = (await request.json()) as { input: string };
    seen.push({ url: request.url, mask: request.headers.get('x-goog-fieldmask'), body });
    return HttpResponse.json(googleAutocomplete(body.input));
  }),
  http.post(/places\.googleapis\.com\/v1\/places:searchText$/, async ({ request }) => {
    const body = (await request.json()) as { textQuery: string };
    seen.push({ url: request.url, mask: request.headers.get('x-goog-fieldmask'), body });
    if (/quota/.test(body.textQuery)) return HttpResponse.json({ error: { status: 'RESOURCE_EXHAUSTED' } }, { status: 429 });
    return HttpResponse.json(/restaurant/.test(body.textQuery) ? googleSearch.restaurants : googleSearch.famous);
  }),
  http.get('https://places.googleapis.com/v1/places/:id', ({ request, params }) => {
    seen.push({ url: request.url, mask: request.headers.get('x-goog-fieldmask') });
    const d = googleDestination[params.id as string] || (googleSearch.famous.places as { id: string }[]).find((p) => p.id === params.id);
    return d ? HttpResponse.json(d) : HttpResponse.json({ error: { status: 'NOT_FOUND' } }, { status: 404 });
  }),
  http.get('https://en.wikipedia.org/api/rest_v1/page/summary/:title', ({ params }) =>
    params.title === 'Jodhpur' ? HttpResponse.json(wikipedia) : HttpResponse.json({ type: 'disambiguation', extract: 'x' })),
  http.get('https://archive-api.open-meteo.com/v1/archive', () => HttpResponse.json(openMeteoArchive())),
  http.post('https://overpass-api.de/api/interpreter', () => HttpResponse.json(overpass)),
  http.get('https://api.frankfurter.dev/v1/latest', () => HttpResponse.json(frankfurter)),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
beforeEach(() => {
  _resetRedis(null); _resetBudget(); _resetDedupe(); _resetRateLimit();
  seen.length = 0;
  process.env.GOOGLE_PLACES_SERVER_KEY = KEY;
});
afterEach(() => { delete process.env.GOOGLE_PLACES_SERVER_KEY; });

const get = (path: string) => new Request('http://localhost' + path, { headers: { 'x-forwarded-for': '5.5.5.5' } });
const post = (path: string, body: unknown) => new Request('http://localhost' + path, { method: 'POST', body: JSON.stringify(body), headers: { 'x-forwarded-for': '5.5.5.5' } });
const noKey = async (r: Response) => { const t = await r.clone().text(); expect(t).not.toContain(KEY); return r; };

describe('field masks (every change here changes the Google bill)', () => {
  it('match the snapshot', () => {
    expect(MASKS).toMatchInlineSnapshot(`
      {
        "autocomplete": "suggestions.placePrediction.placeId,suggestions.placePrediction.structuredFormat,suggestions.placePrediction.types",
        "cover": "places.id,places.photos",
        "destination": "id,displayName,location,viewport,types,primaryType,addressComponents,timeZone,googleMapsUri",
        "details": "id,displayName,formattedAddress,location,types,primaryType,rating,userRatingCount,priceLevel,regularOpeningHours,currentOpeningHours.openNow,websiteUri,nationalPhoneNumber,internationalPhoneNumber,googleMapsUri,photos,accessibilityOptions,businessStatus",
        "detailsFood": "id,displayName,formattedAddress,location,types,primaryType,rating,userRatingCount,priceLevel,regularOpeningHours,currentOpeningHours.openNow,websiteUri,nationalPhoneNumber,internationalPhoneNumber,googleMapsUri,photos,accessibilityOptions,businessStatus,servesVegetarianFood,editorialSummary",
        "editorial": "id,editorialSummary",
        "hours": "id,regularOpeningHours.periods,businessStatus",
        "lite": "id,displayName,location,primaryType,types,googleMapsUri,businessStatus",
        "nearby": "places.id,places.displayName,places.types,places.primaryType,places.location,places.rating,places.userRatingCount,places.priceLevel,places.currentOpeningHours.openNow,places.googleMapsUri,places.shortFormattedAddress,places.businessStatus",
        "nearbyBasic": "places.id,places.displayName,places.types,places.primaryType,places.location,places.googleMapsUri,places.shortFormattedAddress,places.businessStatus",
        "routes": "routes.duration,routes.distanceMeters",
        "search": "places.id,places.displayName,places.types,places.primaryType,places.location,places.rating,places.userRatingCount,places.priceLevel,places.currentOpeningHours.openNow,places.regularOpeningHours.periods,places.accessibilityOptions.wheelchairAccessibleEntrance,places.googleMapsUri,places.addressComponents,places.shortFormattedAddress,places.businessStatus,nextPageToken",
        "transport": "places.id,places.displayName,places.location,places.types",
      }
    `);
  });
});

describe('POST /api/places/autocomplete', () => {
  it('searches destinations with 5 types and an India bias, returning names and regions', async () => {
    const r = await noKey(await autocomplete(post('/api/places/autocomplete', { input: 'Jodh', sessionToken: 'abcd1234-ef' })));
    expect(r.status).toBe(200);
    expect((await r.json()).suggestions).toEqual([{ placeId: IDS.jodhpur, name: 'Jodhpur', secondary: 'Rajasthan, India', types: ['locality', 'political'] }]);
    const call = seen[0];
    expect(call.mask).toBe(MASKS.autocomplete);
    expect(call.body).toMatchObject({ includedPrimaryTypes: ['locality', 'administrative_area_level_1', 'administrative_area_level_2', 'natural_feature', 'national_park'], locationBias: { rectangle: expect.any(Object) }, sessionToken: 'abcd1234-ef' });
    expect(call.body).not.toHaveProperty('locationRestriction');
    expect(call.body).not.toHaveProperty('includedRegionCodes');
  });
  it('rejects too-short input and bad session tokens without calling Google', async () => {
    expect((await autocomplete(post('/api/places/autocomplete', { input: 'J', sessionToken: 'abcd1234' }))).status).toBe(400);
    expect((await autocomplete(post('/api/places/autocomplete', { input: 'Jodhpur', sessionToken: '<script>' }))).status).toBe(400);
    expect(seen).toHaveLength(0);
  });
});

describe('GET /api/places/destination', () => {
  it('maps a destination record and passes the session token', async () => {
    const r = await noKey(await destination(get(`/api/places/destination?id=${IDS.jodhpur}&session=abcd1234-ef`)));
    expect(await r.json()).toMatchObject({ placeId: IDS.jodhpur, name: 'Jodhpur', region: 'Rajasthan', country: 'India', countryCode: 'IN', center: { lat: 26.2389, lng: 73.0243 }, timezone: 'Asia/Kolkata' });
    expect(seen[0].mask).toBe(MASKS.destination);
    expect(seen[0].url).toContain('sessionToken=abcd1234-ef');
    expect(r.headers.get('cache-control')).toBe('no-store');
  });
  it('rejects malformed IDs', async () => {
    expect((await destination(get('/api/places/destination?id=../../etc'))).status).toBe(400);
  });
});

describe('POST /api/places/search', () => {
  const body = { tab: 'famous', destName: 'Jodhpur', center: { lat: 26.24, lng: 73.02 }, viewport: { low: { lat: 26.18, lng: 72.95 }, high: { lat: 26.33, lng: 73.1 } } };
  it('builds a typed, viewport-restricted query and maps rating, reviews, price and area', async () => {
    const r = await noKey(await search(post('/api/places/search', body)));
    const b = await r.json();
    expect(b.places[0]).toMatchObject({ id: IDS.mehrangarh, name: 'Mehrangarh Fort', rating: 4.7, userRatingCount: 61000, areaHint: 'Fort Area', openNow: true });
    expect(seen[0].mask).toBe(MASKS.search);
    expect(seen[0].body).toMatchObject({ textQuery: 'top tourist attractions in Jodhpur', includedType: 'tourist_attraction', pageSize: 20, locationRestriction: { rectangle: expect.any(Object) } });
    expect(r.headers.get('cache-control')).toBe('no-store');
  });
  it('maps price levels to 0–4', async () => {
    const b = await (await search(post('/api/places/search', { ...body, tab: 'restaurants' }))).json();
    expect(b.places.map((p: { priceLevel?: number }) => p.priceLevel)).toEqual([2, 1]);
  });
  it('searches inside an area by name instead of by coordinates', () => {
    expect(buildSearch({ ...body, tab: 'hotels', area: 'Old City' } as never)).toMatchObject({ textQuery: 'hotels in Old City, Jodhpur', includedType: 'lodging', locationBias: expect.any(Object) });
  });
  it('turns a Google quota error into the resting message', async () => {
    const r = await search(post('/api/places/search', { ...body, text: 'quota' }));
    expect(r.status).toBe(503);
    expect((await r.json()).error).toMatchObject({ code: 'quota_exhausted', message: expect.stringMatching(/resting for today/) });
  });
  it('rejects unknown tabs', async () => {
    expect((await search(post('/api/places/search', { ...body, tab: 'casinos' }))).status).toBe(400);
  });
});

describe('GET /api/places/lite', () => {
  it('returns only name, coordinates and links', async () => {
    const b = await (await lite(get(`/api/places/lite?id=${IDS.mehrangarh}`))).json();
    const allowed = ['closed', 'googleMapsUri', 'id', 'location', 'name', 'primaryType', 'types'];
    expect(Object.keys(b).every((k) => allowed.includes(k))).toBe(true);
    expect(b).toMatchObject({ id: IDS.mehrangarh, name: 'Mehrangarh Fort' });
    expect(seen[0].mask).toBe(MASKS.lite);
  });
});

describe('open data endpoints', () => {
  it('Wikipedia summary, edge-cached; rejects disambiguation pages', async () => {
    const r = await summary(get('/api/summary?title=Jodhpur&lat=26.24&lng=73.02'));
    expect((await r.json()).summary).toMatchObject({ title: 'Jodhpur', source: 'wikipedia', url: 'https://en.wikipedia.org/wiki/Jodhpur' });
    expect(r.headers.get('cache-control')).toMatch(/s-maxage=604800/);
    expect((await (await summary(get('/api/summary?title=Mercury'))).json()).summary).toBeNull();
  });
  it('rejects a Wikipedia article whose coordinates are far away', async () => {
    expect((await (await summary(get('/api/summary?title=Jodhpur&lat=10&lng=76'))).json()).summary).toBeNull();
  });
  it('climate normals: 12 months from 10 years of daily data', async () => {
    const b = await (await climate(get('/api/climate?lat=26.24&lng=73.02'))).json();
    expect(b.months).toHaveLength(12);
    expect(b.months[4]).toMatchObject({ tmax: 41, tmin: 29, rainDays: 1 });
    expect(b.months[6]).toMatchObject({ rainMm: 96, rainDays: 12 });
    expect(b.period).toBe('2015–2024');
  });
  it('OSM areas: de-duplicated and sorted, with the boundary query', async () => {
    const b = await (await areas(get('/api/areas?name=Jodhpur&lat=26.24&lng=73.02'))).json();
    expect(b.areas.map((a: { name: string }) => a.name)).toEqual(['Cantonment', 'Old City', 'Sardarpura']);
    expect(overpassQuery({ name: 'Jod"hpur', lat: 1, lng: 2 }, 'boundary')).toContain('["name"="Jodhpur"]');
  });
  it('exchange rates include the base and the date', async () => {
    const b = await (await fx(get('/api/fx?base=INR'))).json();
    expect(b).toMatchObject({ base: 'INR', date: '2026-11-20', rates: { INR: 1, USD: 0.0118 } });
    expect((await fx(get('/api/fx?base=inr!'))).status).toBe(400);
  });
});
