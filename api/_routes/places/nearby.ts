// POST /api/places/nearby  { layer, center, radius }  Map layers from OpenStreetMap: restaurants, cafés, attractions,
// ATMs, pharmacies and hospitals around the visible area. Edge-cached for a day.
import { z } from 'zod';
import { dedupe } from '../../_lib/dedupe.js';
import { handler, json, readJson } from '../../_lib/http.js';
import { aroundQuery, mapList, overpass } from '../../_lib/osm.js';
import { LatLngSchema } from '../../_lib/places.js';
import { edgeCache } from '../../_lib/upstream.js';

export const LAYERS = { restaurants: 'restaurants', cafes: 'cafes', attractions: 'attractions', atms: 'atms', pharmacies: 'pharmacies', hospitals: 'hospitals' } as const;

const Body = z.object({
  layer: z.enum(Object.keys(LAYERS) as [keyof typeof LAYERS, ...(keyof typeof LAYERS)[]]),
  center: LatLngSchema,
  radius: z.number().min(100).max(10_000),
});
const r3 = (n: number) => Math.round(n * 1e3) / 1e3;

export const POST = handler({ methods: ['POST'], rateLimit: { bucket: 'nearby', limit: 30, windowSec: 60 } }, async (request) => {
  const b = Body.parse(await readJson(request));
  const named = b.layer !== 'atms';
  const key = `nb:${b.layer}:${r3(b.center.lat)},${r3(b.center.lng)}:${Math.round(b.radius / 100)}`;
  const places = await dedupe(key, async () => mapList(await overpass(aroundQuery([LAYERS[b.layer]], b.center, b.radius, { named, limit: 120 }))).slice(0, 40));
  return json({ places }, { cache: edgeCache(86400) });
});
