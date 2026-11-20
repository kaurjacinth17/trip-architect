import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { _resetBudget } from '../../api/_lib/budget';
import { _resetDedupe } from '../../api/_lib/dedupe';
import { MASKS } from '../../api/_lib/places';
import { _resetRateLimit } from '../../api/_lib/ratelimit';
import { _resetRedis } from '../../api/_lib/redis';
import { GET as hours } from '../../api/places/hours';
import { POST as legs } from '../../api/routes/legs';

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
