// POST /api/places/search  One page (20) of places for a destination tab. Text Search Enterprise.
import { z } from 'zod';
import { dedupe } from '../_lib/dedupe';
import { googlePlaces } from '../_lib/google';
import { handler, json, readJson } from '../_lib/http';
import { LatLngSchema, MASKS, ViewportSchema, mapPlace, type GPlace } from '../_lib/places';

export const TABS = {
  famous: { q: 'top tourist attractions', type: 'tourist_attraction' },
  todo: { q: 'things to do', type: undefined },
  restaurants: { q: 'restaurants', type: 'restaurant' },
  cafes: { q: 'cafes', type: 'cafe' },
  hotels: { q: 'hotels', type: 'lodging' },
  shopping: { q: 'shopping markets', type: undefined },
  nightlife: { q: 'bars and nightlife', type: undefined },
} as const;

export const Body = z.object({
  tab: z.enum(Object.keys(TABS) as [keyof typeof TABS, ...(keyof typeof TABS)[]]),
  destName: z.string().trim().min(1).max(80),
  center: LatLngSchema,
  viewport: ViewportSchema.optional(),
  area: z.string().trim().max(80).optional(),
  text: z.string().trim().max(80).optional(),
  pageToken: z.string().max(2000).optional(),
});

/** The Text Search request for a tab (exported for tests). Only rectangles are allowed as a restriction. */
export function buildSearch(b: z.infer<typeof Body>) {
  const t = TABS[b.tab];
  const where = b.area ? `${b.area}, ${b.destName}` : b.destName;
  const textQuery = `${b.text ? b.text + ' ' : ''}${b.text && b.tab === 'todo' ? '' : t.q} in ${where}`.replace(/\s+/g, ' ').trim();
  const loc = b.viewport && !b.area
    ? { locationRestriction: { rectangle: { low: { latitude: b.viewport.low.lat, longitude: b.viewport.low.lng }, high: { latitude: b.viewport.high.lat, longitude: b.viewport.high.lng } } } }
    : { locationBias: { circle: { center: { latitude: b.center.lat, longitude: b.center.lng }, radius: 30_000 } } };
  return {
    textQuery,
    ...(t.type ? { includedType: t.type } : {}),
    pageSize: 20,
    languageCode: 'en',
    ...loc,
    ...(b.pageToken ? { pageToken: b.pageToken } : {}),
  };
}

export const POST = handler({ methods: ['POST'], rateLimit: { bucket: 'search', limit: 30, windowSec: 60 } }, async (request) => {
  const b = Body.parse(await readJson(request));
  const body = buildSearch(b);
  const r = await dedupe('ts:' + JSON.stringify(body), () => googlePlaces<{ places?: GPlace[]; nextPageToken?: string }>({ path: 'places:searchText', body, fieldMask: MASKS.search, sku: 'textSearchEnterprise' }));
  return json({ places: (r.places || []).map(mapPlace), nextPageToken: r.nextPageToken });
});
