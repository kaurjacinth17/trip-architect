// Answer the app's /api calls from test fixtures (the Vite preview server has no functions).
import type { Page, Route } from '@playwright/test';
import { mapDestination, mapDetails, mapPlace, type GPlace } from '../../api/_lib/places';
import { monthlyNormals } from '../../api/climate';
import { mapAreas } from '../../api/areas';
import { frankfurter, googleAutocomplete, googleDestination, googleSearch, openMeteoArchive, overpass, wikipedia } from '../fixtures/providers';

export interface MockOptions { quota?: boolean; unconfigured?: boolean }

export async function mockApi(page: Page, opts: MockOptions = {}) {
  const calls: string[] = [];
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const p = url.pathname;
    calls.push(p);
    if (p === '/api/health') return json(route, { ok: true, providers: { googlePlaces: !opts.unconfigured, unsplash: false, supabase: false, upstash: true }, resting: opts.quota ? ['textSearchEnterprise'] : [] });
    if (opts.quota && p.startsWith('/api/places')) return json(route, { error: { code: 'quota_exhausted', message: 'Live place data is resting for today; showing saved and curated info.' } }, 503);
    if (p === '/api/places/autocomplete') {
      const b = route.request().postDataJSON() as { input: string };
      return json(route, { suggestions: googleAutocomplete(b.input).suggestions.map((s) => ({ placeId: s.placePrediction.placeId, name: s.placePrediction.structuredFormat.mainText.text, secondary: s.placePrediction.structuredFormat.secondaryText.text, types: s.placePrediction.types })) });
    }
    if (p === '/api/places/destination') {
      const d = googleDestination[url.searchParams.get('id') || ''];
      return d ? json(route, mapDestination(d as GPlace)) : json(route, { error: { code: 'not_found', message: 'Not found' } }, 404);
    }
    if (p === '/api/places/search') {
      const b = route.request().postDataJSON() as { tab: string; area?: string; text?: string; center: { lat: number; lng: number } };
      let list = (googleSearch[b.tab] || { places: [] }).places as GPlace[];
      if (b.text) {
        // free-text search: matching fixtures, placed a few hundred metres from the searched destination
        list = (Object.values(googleSearch).flatMap((x) => x.places) as GPlace[])
          .filter((x) => (x.displayName?.text || '').toLowerCase().includes(b.text!.toLowerCase()))
          .map((x, i) => ({ ...x, location: { latitude: b.center.lat + 0.003 * (i + 1), longitude: b.center.lng + 0.002 } }));
      }
      // Area queries return the places Google lists in that neighbourhood
      if (b.area) list = list.filter((x) => x.addressComponents?.some((c) => c.longText === b.area));
      return json(route, { places: list.map(mapPlace) });
    }
    if (p === '/api/places/photo') return json(route, { uri: null });
    if (p === '/api/places/hours') {
      // Every fixture place opens 10:00–17:00 daily, except it's closed on Mondays
      const periods = [0, 2, 3, 4, 5, 6].map((d) => ({ open: d * 1440 + 600, close: d * 1440 + 1020 }));
      return json(route, { id: url.searchParams.get('id'), hours: periods, closed: null });
    }
    if (p === '/api/routes/legs') {
      const b = route.request().postDataJSON() as { legs: { key: string }[] };
      return json(route, { legs: Object.fromEntries(b.legs.map((l) => [l.key, { minutes: 17, meters: 4000 }])) });
    }
    if (/^\/api\/places\/ChIJ/.test(p)) {
      const id = decodeURIComponent(p.split('/').pop()!);
      const all = Object.values(googleSearch).flatMap((x) => x.places) as GPlace[];
      const m = all.find((x) => x.id === id);
      return m ? json(route, mapDetails({ ...m, formattedAddress: 'Fixture address', regularOpeningHours: { weekdayDescriptions: ['Monday: 9:00 AM – 9:00 PM'] }, servesVegetarianFood: true })) : json(route, { error: { code: 'not_found' } }, 404);
    }
    if (p === '/api/places/lite') {
      const id = url.searchParams.get('id');
      const all = Object.values(googleSearch).flatMap((x) => x.places) as GPlace[];
      const m = all.find((x) => x.id === id);
      return m ? json(route, { id: m.id, name: m.displayName?.text, location: { lat: m.location!.latitude, lng: m.location!.longitude } }) : json(route, { error: { code: 'not_found' } }, 404);
    }
    if (p === '/api/places/summary') return json(route, { summary: null });
    if (p === '/api/summary') return json(route, { summary: url.searchParams.get('title') === 'Jodhpur' ? { title: wikipedia.title, extract: wikipedia.extract, url: wikipedia.content_urls.desktop.page, source: 'wikipedia' } : null });
    if (p === '/api/climate') return json(route, { months: monthlyNormals(openMeteoArchive().daily), period: '2015–2024' });
    if (p === '/api/areas') return json(route, { areas: mapAreas(overpass as never), scope: 'boundary' });
    if (p === '/api/fx') return json(route, { ...frankfurter, rates: { ...frankfurter.rates, INR: 1 } });
    return json(route, { error: { code: 'not_found' } }, 404);
  });
  return calls;
}
