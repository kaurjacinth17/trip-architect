// POST /api/places/search  Places for a City Guide tab from OpenStreetMap (Overpass), around the destination or one
// of its areas, optionally matching a name. Sorted by open notability signals (a Wikipedia article, heritage
// listing, website). Edge-cached for a day. No ratings or reviews exist in open data.
import { z } from 'zod';
import { dedupe } from '../../_lib/dedupe.js';
import { handler, json, readJson } from '../../_lib/http.js';
import { LatLngSchema, ViewportSchema } from '../../_lib/places.js';
import { aroundQuery, mapList, overpass, photon } from '../../_lib/osm.js';
import { edgeCache } from '../../_lib/upstream.js';

export const TABS = ['famous', 'todo', 'restaurants', 'cafes', 'hotels', 'shopping', 'nightlife'] as const;

export const Body = z.object({
  tab: z.enum(TABS),
  destName: z.string().trim().min(1).max(80),
  center: LatLngSchema,
  viewport: ViewportSchema.optional(),
  area: z.string().trim().max(80).optional(),
  text: z.string().trim().max(80).optional(),
  pageToken: z.string().max(2000).optional(),
});

const R = 6371000, rad = (x: number) => (x * Math.PI) / 180;
const dist = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => 2 * R * Math.asin(Math.sqrt(Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2));

/** Search radius: half the destination's extent, between 3 and 15 km (25 km for sights, which spread wider). */
export function radiusFor(b: z.infer<typeof Body>) {
  const half = b.viewport ? dist(b.viewport.low, b.viewport.high) / 2 : 8000;
  return Math.round(Math.max(3000, Math.min(half, b.tab === 'famous' || b.tab === 'todo' ? 25_000 : 15_000)));
}

export const POST = handler({ methods: ['POST'], rateLimit: { bucket: 'search', limit: 40, windowSec: 60 } }, async (request) => {
  const b = Body.parse(await readJson(request));
  if (b.pageToken) return json({ places: [] });
  let center = b.center, radius = radiusFor(b);
  if (b.area) {
    const f = (await photon(`${b.area}, ${b.destName}`, 1))[0];
    if (f) { center = { lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] }; radius = 2000; }
  }
  const key = `os:${b.tab}:${center.lat.toFixed(3)},${center.lng.toFixed(3)}:${radius}:${(b.text || '').toLowerCase()}`;
  const places = await dedupe(key, async () => mapList(await overpass(aroundQuery([b.tab], center, radius, { text: b.text, limit: 200 }))).slice(0, 60));
  return json({ places, source: 'OpenStreetMap' }, { cache: edgeCache(86400) });
});
