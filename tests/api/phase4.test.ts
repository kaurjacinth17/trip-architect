import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { _resetBudget } from '../../api/_lib/budget';
import { _resetDedupe } from '../../api/_lib/dedupe';
import { MASKS } from '../../api/_lib/places';
import { _resetRateLimit } from '../../api/_lib/ratelimit';
import { _resetRedis } from '../../api/_lib/redis';
import { GET as hours } from '../../api/_routes/places/hours';
import { POST as legs } from '../../api/_routes/routes/legs';

const KEY = 'AIzaTEST-server-key-4';
const seen: { url: string; mask: string | null; body?: Record<string, unknown> }[] = [];
const server = setupServer(
  http.get(/places\.googleapis\.com\/v1\/places\/[^/]+$/, ({ request }) => {
    seen.push({ url: request.url, mask: request.headers.get('x-goog-fieldmask') });
    return HttpResponse.json({ id: 'ChIJTESTplace0000000001', businessStatus: 'CLOSED_TEMPORARILY', regularOpeningHours: { periods: [{ open: { day: 0, hour: 0, minute: 0 } }] } });
  }),
  http.post('https://routes.googleapis.com/directions/v2:computeRoutes', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    seen.push({ url: request.url, mask: request.headers.get('x-goog-fieldmask'), body });
    return HttpResponse.json({ routes: [{ duration: '1290s', distanceMeters: 8400 }] });
  }),
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
beforeEach(() => { _resetRedis(null); _resetBudget(); _resetDedupe(); _resetRateLimit(); seen.length = 0; process.env.GOOGLE_PLACES_SERVER_KEY = KEY; });
afterEach(() => { delete process.env.GOOGLE_PLACES_SERVER_KEY; });

describe('GET /api/places/hours', () => {
  it('returns periods (24 h place → open with no close) and closure status, with the hours mask', async () => {
    const r = await hours(new Request('http://localhost/api/places/hours?id=ChIJTESTplace0000000001'));
    expect(await r.json()).toEqual({ id: 'ChIJTESTplace0000000001', hours: [{ open: 0, close: null }], closed: 'temporarily' });
    expect(seen[0].mask).toBe(MASKS.hours);
  });
});

describe('POST /api/routes/legs', () => {
  it('one Essentials call per leg, no traffic, minutes rounded up', async () => {
    const r = await legs(new Request('http://localhost/api/routes/legs', { method: 'POST', body: JSON.stringify({ mode: 'DRIVE', legs: [{ key: 'a>b', from: { lat: 26.9, lng: 75.8 }, to: { lat: 26.98, lng: 75.85 } }] }) }));
    const b = await r.json();
    expect(b.legs['a>b']).toEqual({ minutes: 22, meters: 8400 });
    expect(seen[0].mask).toBe('routes.duration,routes.distanceMeters');
    expect(seen[0].body).toMatchObject({ travelMode: 'DRIVE', routingPreference: 'TRAFFIC_UNAWARE' });
    expect(JSON.stringify(b)).not.toContain(KEY);
  });
  it('rejects more than 12 legs and bad coordinates', async () => {
    const leg = { key: 'x', from: { lat: 1, lng: 1 }, to: { lat: 2, lng: 2 } };
    expect((await legs(new Request('http://localhost/api/routes/legs', { method: 'POST', body: JSON.stringify({ legs: Array(13).fill(leg) }) }))).status).toBe(400);
    expect((await legs(new Request('http://localhost/api/routes/legs', { method: 'POST', body: JSON.stringify({ legs: [{ ...leg, to: { lat: 99, lng: 0 } }] }) }))).status).toBe(400);
  });
});

import { POST as nearby } from '../../api/_routes/places/nearby';
describe('POST /api/places/nearby', () => {
  it('uses the Enterprise mask for rated layers and the Pro mask for ATMs/pharmacies', async () => {
    const calls: { mask: string | null; body: Record<string, unknown> }[] = [];
    server.use(http.post(/places\.googleapis\.com\/v1\/places:searchNearby$/, async ({ request }) => {
      calls.push({ mask: request.headers.get('x-goog-fieldmask'), body: (await request.json()) as Record<string, unknown> });
      return HttpResponse.json({ places: [{ id: 'ChIJTESTatm000000000001', displayName: { text: 'ATM' }, location: { latitude: 1, longitude: 2 }, types: ['atm'] }] });
    }));
    const req = (layer: string, radius = 1500) => new Request('http://localhost/api/places/nearby', { method: 'POST', body: JSON.stringify({ layer, center: { lat: 26.9, lng: 75.8 }, radius }) });
    expect((await (await nearby(req('restaurants'))).json()).places[0].name).toBe('ATM');
    expect(calls[0].mask).toBe(MASKS.nearby);
    expect(calls[0].body).toMatchObject({ includedTypes: ['restaurant'], maxResultCount: 20, locationRestriction: { circle: { radius: 1500 } } });
    await nearby(req('atms'));
    expect(calls[1].mask).toBe(MASKS.nearbyBasic);
    expect((await nearby(req('casinos'))).status).toBe(400);
    expect((await nearby(req('atms', 50_000))).status).toBe(400);
  });
});

import { POST as transport } from '../../api/_routes/places/transport';
describe('POST /api/places/transport (Phase 6)', () => {
  it('two Nearby Search Pro calls (stations, airports) with the transport mask; IDs, names and coordinates only', async () => {
    const calls: { mask: string | null; body: Record<string, unknown> }[] = [];
    server.use(http.post(/places\.googleapis\.com\/v1\/places:searchNearby$/, async ({ request }) => {
      const body = (await request.json()) as { includedTypes: string[] };
      calls.push({ mask: request.headers.get('x-goog-fieldmask'), body });
      const st = body.includedTypes[0] === 'train_station';
      return HttpResponse.json({ places: [{ id: st ? 'ChIJTESTstation00000001' : 'ChIJTESTairport00000001', displayName: { text: st ? 'Junction' : 'Airport' }, location: { latitude: 26.2, longitude: 73 }, types: body.includedTypes, rating: 4.9 }] });
    }));
    const r = await transport(new Request('http://localhost/api/places/transport', { method: 'POST', body: JSON.stringify({ center: { lat: 26.29, lng: 73.02 } }) }));
    const b = await r.json();
    expect(b).toEqual({ stations: [{ id: 'ChIJTESTstation00000001', name: 'Junction', location: { lat: 26.2, lng: 73 } }], airports: [{ id: 'ChIJTESTairport00000001', name: 'Airport', location: { lat: 26.2, lng: 73 } }] });
    expect(calls.map((c) => c.mask)).toEqual([MASKS.transport, MASKS.transport]);
    expect(MASKS.transport).toBe('places.id,places.displayName,places.location,places.types');
    expect(calls[1].body).toMatchObject({ includedTypes: ['airport'], maxResultCount: 3, locationRestriction: { circle: { radius: 50000 } } });
    expect(JSON.stringify(b)).not.toContain(KEY);
    expect((await transport(new Request('http://localhost/api/places/transport', { method: 'POST', body: JSON.stringify({ center: { lat: 200, lng: 0 } }) }))).status).toBe(400);
  });
});
