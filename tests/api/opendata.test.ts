// Open data instead of Google: Photon (search), Nominatim (destination details, addresses), Overpass
// (OpenStreetMap places) and Wikipedia/Wikimedia Commons (summaries, photos). All upstreams mocked.
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { _resetDedupe } from '../../api/_lib/dedupe';
import { aroundQuery, mapOsm, parseOpeningHours, typesOf } from '../../api/_lib/osm';
import { _resetRateLimit } from '../../api/_lib/ratelimit';
import { _resetRedis } from '../../api/_lib/redis';
import { POST as autocomplete } from '../../api/_routes/places/autocomplete';
import { GET as cover } from '../../api/_routes/places/cover';
import { GET as destination } from '../../api/_routes/places/destination';
import { GET as details } from '../../api/_routes/places/[id]';
import { GET as hours } from '../../api/_routes/places/hours';
import { GET as lite } from '../../api/_routes/places/lite';
import { POST as nearby } from '../../api/_routes/places/nearby';
import { POST as search } from '../../api/_routes/places/search';
import { POST as transport } from '../../api/_routes/places/transport';
import { POST as legs } from '../../api/_routes/routes/legs';

const queries: string[] = [];
const fort = { type: 'way', id: 4242, center: { lat: 26.298, lon: 73.018 }, tags: { name: 'Mehrangarh Fort', historic: 'fort', tourism: 'attraction', wikipedia: 'en:Mehrangarh', opening_hours: 'Mo-Su 09:00-17:00', website: 'https://mehrangarh.org', wheelchair: 'limited' } };
const cafe = { type: 'node', id: 99, lat: 26.29, lon: 73.02, tags: { name: 'Stepwell Cafe', amenity: 'cafe', 'diet:vegetarian': 'yes', cuisine: 'indian;coffee_shop', opening_hours: 'Mo-Fr 08:00-23:00; Sa,Su 09:00-01:00', 'addr:suburb': 'Old City' } };
const hotel = { type: 'node', id: 7, lat: 26.3, lon: 73.03, tags: { name: 'Raas Haveli', tourism: 'hotel', stars: '4', website: 'https://raas.example' } };
const plain = { type: 'node', id: 8, lat: 26.31, lon: 73.04, tags: { name: 'Corner Restaurant', amenity: 'restaurant' } };

const server = setupServer(
  http.get(/photon\.komoot\.io\/api\//, ({ request }) => {
    const q = new URL(request.url).searchParams.get('q') || '';
    return HttpResponse.json({ features: [
      { geometry: { coordinates: [73.02, 26.29] }, properties: { osm_type: 'R', osm_id: 1953000, osm_key: 'place', osm_value: 'city', name: q.split(',')[0], state: 'Rajasthan', country: 'India' } },
      { geometry: { coordinates: [73.0, 26.0] }, properties: { osm_type: 'N', osm_id: 5, osm_key: 'amenity', osm_value: 'restaurant', name: 'Jodhpur Sweets', country: 'India' } },
    ] });
  }),
  http.get(/nominatim\.openstreetmap\.org\/lookup/, ({ request }) => {
    const lang = new URL(request.url).searchParams.get('accept-language');
    return HttpResponse.json([{ osm_type: 'relation', osm_id: 1953000, lat: '26.29', lon: '73.02', boundingbox: ['26.2', '26.4', '72.9', '73.1'], name: 'Jodhpur', type: 'city', display_name: lang === 'hi' ? 'जोधपुर, राजस्थान, भारत' : 'Jodhpur, Rajasthan, India', address: { state: 'Rajasthan', country: 'India', country_code: 'in' } }]);
  }),
  http.post(/overpass/, async ({ request }) => {
    const q = decodeURIComponent((await request.text()).replace(/^data=/, ''));
    queries.push(q);
    if (/way\(4242\)/.test(q)) return HttpResponse.json({ elements: [fort] });
    if (/node\(99\)/.test(q)) return HttpResponse.json({ elements: [cafe] });
    if (/railway/.test(q)) return HttpResponse.json({ elements: [{ type: 'node', id: 1, lat: 26.28, lon: 73.03, tags: { name: 'Jodhpur Junction', railway: 'station', wikidata: 'Q1' } }] });
    if (/aeroway/.test(q)) return HttpResponse.json({ elements: [{ type: 'way', id: 2, center: { lat: 26.25, lon: 73.05 }, tags: { name: 'Jodhpur Airport', aeroway: 'aerodrome', iata: 'JDH' } }] });
    return HttpResponse.json({ elements: [plain, cafe, hotel, fort, { type: 'node', id: 9, lat: 1, lon: 1, tags: { amenity: 'cafe' } }] });
  }),
  http.get(/en\.wikipedia\.org\/api\/rest_v1\/page\/summary\//, ({ request }) => {
    const t = decodeURIComponent(request.url.split('/summary/')[1]);
    if (t.includes('Nowhere')) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json({ type: 'standard', title: t, extract: `${t} is a fort.`, thumbnail: { source: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Fort_view.jpg/320px-Fort_view.jpg', width: 320, height: 200 }, content_urls: { desktop: { page: `https://en.wikipedia.org/wiki/${t}` } } });
  }),
  http.get(/commons\.wikimedia\.org\/w\/api\.php/, () => HttpResponse.json({ query: { pages: { '1': { imageinfo: [{ extmetadata: { Artist: { value: '<a href="x">A. Photographer</a>' }, LicenseShortName: { value: 'CC BY-SA 4.0' } } }] } } } })),
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
beforeEach(() => { _resetRedis(null); _resetDedupe(); _resetRateLimit(); queries.length = 0; delete process.env.GOOGLE_PLACES_SERVER_KEY; });

const get = (p: string) => new Request('http://localhost' + p, { headers: { 'x-forwarded-for': '7.7.7.7' } });
const post = (p: string, body: unknown) => new Request('http://localhost' + p, { method: 'POST', body: JSON.stringify(body), headers: { 'x-forwarded-for': '7.7.7.7' } });
const C = { lat: 26.29, lng: 73.02 };

describe('no Google key is needed', () => {
  it('destination search (Photon): places only, OSM IDs, state and country', async () => {
    const r = await autocomplete(post('/api/places/autocomplete', { input: 'Jodhpur' }));
    expect(r.status).toBe(200);
    expect((await r.json()).suggestions).toEqual([{ placeId: 'osm-R1953000', name: 'Jodhpur', secondary: 'Rajasthan, India', types: ['city'] }]);
  });
  it('destination details (Nominatim): name, region, centre and extent', async () => {
    const b = await (await destination(get('/api/places/destination?id=osm-R1953000'))).json();
    expect(b).toMatchObject({ placeId: 'osm-R1953000', name: 'Jodhpur', region: 'Rajasthan', country: 'India', countryCode: 'IN', center: { lat: 26.29, lng: 73.02 }, viewport: { low: { lat: 26.2, lng: 72.9 }, high: { lat: 26.4, lng: 73.1 } }, primaryType: 'locality' });
    expect((await destination(get('/api/places/destination?id=ChIJ_google_id_here'))).status).toBe(400);
  });
});

describe('City Guide from OpenStreetMap', () => {
  it('builds an around() query for the tab and sorts by notability; no ratings are invented', async () => {
    const r = await search(post('/api/places/search', { tab: 'famous', destName: 'Jodhpur', center: C }));
    const b = await r.json();
    expect(r.headers.get('cache-control')).toContain('s-maxage=86400');
    expect(queries[0]).toContain('nwr["historic"~"^(monument|castle|fort|palace|memorial|ruins|archaeological_site|city_gate)$"]["name"](around:8000,26.29,73.02);');
    expect(b.places.map((p: { name: string }) => p.name)).toEqual(['Mehrangarh Fort', 'Raas Haveli', 'Stepwell Cafe', 'Corner Restaurant']);
    expect(b.places[0]).toMatchObject({ id: 'osm-W4242', types: ['fort'], location: { lat: 26.298, lng: 73.018 } });
    expect([...b.places[0].hours].sort((x: { open: number }, y: { open: number }) => x.open - y.open)).toEqual([0, 1, 2, 3, 4, 5, 6].map((d) => ({ open: d * 1440 + 540, close: d * 1440 + 1020 })));
    expect(b.places.every((p: { rating?: number; userRatingCount?: number; priceLevel?: number }) => p.rating === undefined && p.userRatingCount === undefined && p.priceLevel === undefined)).toBe(true);
  });
  it('areas are found with Photon then searched within 2 km; name search uses a case-insensitive regex', async () => {
    await search(post('/api/places/search', { tab: 'cafes', destName: 'Jodhpur', center: C, area: 'Sardarpura', text: 'step"well' }));
    expect(queries[0]).toContain('(around:2000,26.29,73.02)');
    expect(queries[0]).toContain('["name"~"stepwell",i]');
  });
  it('details: website, hours text, vegetarian, wheelchair; Wikipedia summary and a credited Commons photo', async () => {
    const b = await (await details(get('/api/places/osm-W4242'))).json();
    expect(b).toMatchObject({ id: 'osm-W4242', name: 'Mehrangarh Fort', website: 'https://mehrangarh.org', weekdayHours: ['Mo-Su 09:00-17:00'], summary: 'Mehrangarh is a fort.' });
    expect(b.photos[0]).toMatchObject({ name: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Fort_view.jpg/800px-Fort_view.jpg', authors: [{ name: 'A. Photographer (CC BY-SA 4.0)', uri: 'https://commons.wikimedia.org/wiki/File:Fort_view.jpg' }] });
    const c = await (await details(get('/api/places/osm-N99'))).json();
    expect(c).toMatchObject({ veg: true, cuisine: ['indian', 'coffee shop'], areaHint: 'Old City', photos: [] });
  });
  it('lite and hours by ID; places saved from Google answer 404 (no Google account is used)', async () => {
    expect(await (await lite(get('/api/places/lite?id=osm-N99'))).json()).toMatchObject({ id: 'osm-N99', name: 'Stepwell Cafe', location: { lat: 26.29, lng: 73.02 } });
    expect((await lite(get('/api/places/lite?id=ChIJTESTplace0000000001'))).status).toBe(404);
    const h = await (await hours(get('/api/places/hours?id=osm-N99'))).json();
    expect(h.hours).toContainEqual({ open: 6 * 1440 + 540, close: 60 }); // Saturday 09:00 to Sunday 01:00
  });
});

describe('map layers, stations, photos', () => {
  it('nearby layers and nearest station and airport', async () => {
    const n = await (await nearby(post('/api/places/nearby', { layer: 'hospitals', center: C, radius: 3000 }))).json();
    expect(queries[0]).toContain('["amenity"~"^(hospital|clinic)$"]');
    expect(n.places.length).toBeGreaterThan(0);
    const t = await (await transport(post('/api/places/transport', { center: C }))).json();
    expect(t).toEqual({ stations: [{ id: 'osm-N1', name: 'Jodhpur Junction', location: { lat: 26.28, lng: 73.03 } }], airports: [{ id: 'osm-W2', name: 'Jodhpur Airport', location: { lat: 26.25, lng: 73.05 } }] });
  });
  it('cover: OSM ID from Photon, photo from Wikipedia at the asked width, credited, cached for a week', async () => {
    const r = await cover(get('/api/places/cover?q=' + encodeURIComponent('Jodhpur, Rajasthan, India') + '&w=600'));
    expect(r.headers.get('cache-control')).toContain('s-maxage=604800');
    expect(await r.json()).toMatchObject({ id: 'osm-R1953000', uri: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Fort_view.jpg/600px-Fort_view.jpg', author: { name: 'A. Photographer (CC BY-SA 4.0)' } });
  });
  it('live travel times are switched off (they needed Google Routes)', async () => {
    expect((await legs(post('/api/routes/legs', { legs: [] }))).status).toBe(503);
  });
});

describe('OSM helpers', () => {
  it('opening_hours: 24/7, day lists, several ranges, after midnight, off days; complex rules are unknown', () => {
    expect(parseOpeningHours('24/7')).toEqual([{ open: 0, close: null }]);
    expect(parseOpeningHours('Tu-Su 10:00-13:00,14:00-17:00; Mo off')).toHaveLength(12);
    expect(parseOpeningHours('Fr 20:00-02:00')).toEqual([{ open: 5 * 1440 + 1200, close: 6 * 1440 + 120 }]);
    expect(parseOpeningHours('sunrise-sunset')).toBeUndefined();
    expect(parseOpeningHours('Mo-Fr 09:00-17:00; PH off')).toBeUndefined();
  });
  it('tags → the app’s place types', () => {
    expect(typesOf({ amenity: 'place_of_worship', religion: 'sikh' })).toEqual(['gurudwara']);
    expect(typesOf({ tourism: 'guest_house' })).toEqual(['lodging', 'guest_house']);
    expect(typesOf({ natural: 'waterfall' })).toEqual(['waterfall']);
    expect(mapOsm({ type: 'node', id: 1, lat: 1, lon: 2, tags: { name: 'X', 'name:en': 'Ex', amenity: 'bar' } })).toMatchObject({ id: 'osm-N1', name: 'Ex', primaryType: 'bar' });
  });
  it('around() queries clamp the radius and strip quotes from names', () => {
    const q = aroundQuery(['restaurants'], C, 999_999, { text: 'a"b\\c' });
    expect(q).toContain('(around:50000,');
    expect(q).toContain('["name"~"abc",i]');
  });
});
