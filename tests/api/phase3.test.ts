import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { _resetBudget } from '../../api/_lib/budget';
import { _resetDedupe } from '../../api/_lib/dedupe';
import { MASKS } from '../../api/_lib/places';
import { _resetRateLimit } from '../../api/_lib/ratelimit';
import { _resetRedis } from '../../api/_lib/redis';
import { GET as details } from '../../api/_routes/places/[id]';
import { GET as photo } from '../../api/_routes/places/photo';
import { POST as search } from '../../api/_routes/places/search';
import { IDS, googleSearch } from '../fixtures/providers';

const KEY = 'AIzaTEST-server-key-3';
const seen: { url: string; mask: string | null; body?: Record<string, unknown> }[] = [];
const detailsFixture = {
  ...googleSearch.restaurants.places[0] as Record<string, unknown>,
  formattedAddress: 'Test address (fixture)', websiteUri: 'https://example.com', nationalPhoneNumber: '0291 000000',
  regularOpeningHours: { periods: [{ open: { day: 1, hour: 11, minute: 0 }, close: { day: 1, hour: 23, minute: 0 } }], weekdayDescriptions: ['Monday: 11:00 AM – 11:00 PM'] },
  servesVegetarianFood: true, editorialSummary: { text: 'Fixture summary' },
  photos: [{ name: `places/${IDS.thali}/photos/AaTESTphoto0001`, widthPx: 1200, heightPx: 800, authorAttributions: [{ displayName: 'A. Photographer', uri: 'https://maps.google.com/maps/contrib/1' }] }],
};

const server = setupServer(
  http.post(/places\.googleapis\.com\/v1\/places:searchText$/, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    seen.push({ url: request.url, mask: request.headers.get('x-goog-fieldmask'), body });
    return HttpResponse.json(body.pageToken ? { places: googleSearch.famous.places.slice(2) } : { places: googleSearch.famous.places.slice(0, 2), nextPageToken: 'NEXT-TOKEN' });
  }),
  http.get(/places\.googleapis\.com\/v1\/places\/[^/]+\/photos\/[^/]+\/media/, ({ request }) => {
    seen.push({ url: request.url, mask: request.headers.get('x-goog-fieldmask') });
    return HttpResponse.json({ name: 'x', photoUri: 'https://lh3.googleusercontent.com/fixture-photo' });
  }),
  http.get(/places\.googleapis\.com\/v1\/places\/[^/]+$/, ({ request }) => {
    seen.push({ url: request.url, mask: request.headers.get('x-goog-fieldmask') });
    return HttpResponse.json(detailsFixture);
  }),
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
beforeEach(() => { _resetRedis(null); _resetBudget(); _resetDedupe(); _resetRateLimit(); seen.length = 0; process.env.GOOGLE_PLACES_SERVER_KEY = KEY; });
afterEach(() => { delete process.env.GOOGLE_PLACES_SERVER_KEY; });
const get = (path: string) => new Request('http://localhost' + path, { headers: { 'x-forwarded-for': '7.7.7.7' } });

describe('GET /api/places/:id', () => {
  it('uses the Enterprise mask by default and Enterprise + Atmosphere for food', async () => {
    const a = await (await details(get(`/api/places/${IDS.thali}`))).json();
    expect(seen[0].mask).toBe(MASKS.details);
    expect(a).toMatchObject({ id: IDS.thali, website: 'https://example.com', weekdayHours: ['Monday: 11:00 AM – 11:00 PM'], hours: [{ open: 1 * 1440 + 660, close: 1 * 1440 + 1380 }] });
    const b = await (await details(get(`/api/places/${IDS.thali}?food=1`))).json();
    expect(seen[1].mask).toBe(MASKS.detailsFood);
    expect(b).toMatchObject({ veg: true, summary: 'Fixture summary' });
    expect(b.photos[0]).toMatchObject({ name: expect.stringMatching(/\/photos\//), authors: [{ name: 'A. Photographer', uri: expect.any(String) }] });
    const raw = JSON.stringify([a, b]);
    expect(raw).not.toContain(KEY);
  });
  it('rejects bad IDs', async () => {
    expect((await details(get('/api/places/%3Cscript%3E'))).status).toBe(400);
  });
});

describe('GET /api/places/photo', () => {
  it('returns only a Google photo URI (never the image), without a field mask', async () => {
    const r = await photo(get(`/api/places/photo?name=places/${IDS.thali}/photos/AaTESTphoto0001&w=400`));
    expect(await r.json()).toEqual({ uri: 'https://lh3.googleusercontent.com/fixture-photo' });
    expect(seen[0].url).toContain('/media?maxWidthPx=400&skipHttpRedirect=true');
    expect(seen[0].mask).toBeNull();
    expect(r.headers.get('cache-control')).toBe('no-store');
  });
  it('rejects anything that isn’t a photo name', async () => {
    expect((await photo(get('/api/places/photo?name=https://evil.example/x'))).status).toBe(400);
    expect((await photo(get(`/api/places/photo?name=places/${IDS.thali}/photos/AaTESTphoto0001&w=9000`))).status).toBe(400);
  });
});

describe('POST /api/places/search pagination', () => {
  it('passes the page token through and returns the next one', async () => {
    const body = { tab: 'famous', destName: 'Jodhpur', center: { lat: 26.24, lng: 73.02 } };
    const r1 = await (await search(new Request('http://localhost/api/places/search', { method: 'POST', body: JSON.stringify(body), headers: { 'x-forwarded-for': '7.7.7.7' } }))).json();
    expect(r1.nextPageToken).toBe('NEXT-TOKEN');
    const r2 = await (await search(new Request('http://localhost/api/places/search', { method: 'POST', body: JSON.stringify({ ...body, pageToken: 'NEXT-TOKEN' }), headers: { 'x-forwarded-for': '7.7.7.7' } }))).json();
    expect(seen[1].body?.pageToken).toBe('NEXT-TOKEN');
    expect(r2.places).toHaveLength(2);
  });
});
