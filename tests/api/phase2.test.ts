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
import { GET as summary } from '../../api/_routes/summary';
import { frankfurter, googleAutocomplete, googleDestination, googleSearch, openMeteoArchive, overpass, wikipedia } from '../fixtures/providers';

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

describe('field masks (every change here changes the Google bill)', () => {
  it('match the snapshot', () => {
    expect(MASKS).toMatchInlineSnapshot(`
      {
        "address": "formattedAddress",
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
