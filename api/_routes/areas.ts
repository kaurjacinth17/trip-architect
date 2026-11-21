// GET /api/areas?name=…&lat=…&lng=…&s=…&w=…&n=…&e=…  Neighbourhoods from OpenStreetMap via Overpass (ODbL).
// First tries the destination's administrative boundary; falls back to its bounding box. Edge-cached for 7 days.
import { z } from 'zod';
import { handler, json } from '../_lib/http.js';
import { edgeCache, fetchJson } from '../_lib/upstream.js';

const num = (min: number, max: number) => z.coerce.number().min(min).max(max);
const Q = z.object({ name: z.string().trim().min(1).max(80), lat: num(-90, 90), lng: num(-180, 180), s: num(-90, 90).optional(), w: num(-180, 180).optional(), n: num(-90, 90).optional(), e: num(-180, 180).optional() });

interface Overpass { elements?: { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }[] }

const KINDS = 'suburb|neighbourhood|quarter|village';
const esc = (s: string) => s.replace(/["\\]/g, '');

/** Overpass QL for areas inside the named boundary near the centre (`boundary`), or inside a bounding box (`box`). */
export function overpassQuery(q: z.infer<typeof Q>, mode: 'boundary' | 'box') {
  const sel = `["place"~"^(${KINDS})$"]`;
  if (mode === 'boundary') {
    return `[out:json][timeout:25];
rel["boundary"="administrative"]["name"="${esc(q.name)}"](around:30000,${q.lat},${q.lng});
map_to_area->.a;
(node(area.a)${sel};way(area.a)${sel};);
out center tags 400;`;
  }
  const bbox = q.s != null && q.w != null && q.n != null && q.e != null ? `${q.s},${q.w},${q.n},${q.e}` : `${q.lat - 0.25},${q.lng - 0.25},${q.lat + 0.25},${q.lng + 0.25}`;
  return `[out:json][timeout:25];
(node(${bbox})${sel};way(${bbox})${sel};);
out center tags 400;`;
}

/** Overpass instances to try in order. OVERPASS_URL overrides the first; respect each instance's fair-use policy. */
export const OVERPASS_URLS = () => [process.env.OVERPASS_URL || 'https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];

async function run(query: string): Promise<Overpass | null> {
  let last: unknown;
  for (const u of OVERPASS_URLS()) {
    try {
      return await fetchJson<Overpass>(u, { method: 'POST', body: 'data=' + encodeURIComponent(query), headers: { 'content-type': 'application/x-www-form-urlencoded' }, timeoutMs: 28_000 });
    } catch (e) { last = e; }
  }
  throw last;
}

export function mapAreas(r: Overpass | null) {
  const seen = new Set<string>();
  return (r?.elements || []).flatMap((e) => {
    const name = e.tags?.['name:en'] || e.tags?.name;
    const c = e.center ? { lat: e.center.lat, lng: e.center.lon } : e.lat != null && e.lon != null ? { lat: e.lat, lng: e.lon } : null;
    if (!name || !c || seen.has(name)) return [];
    seen.add(name);
    return [{ name, kind: e.tags?.place, center: c }];
  }).sort((a, b) => a.name.localeCompare(b.name));
}

export const GET = handler({ methods: ['GET'], rateLimit: { bucket: 'open', limit: 30, windowSec: 60 } }, async (_r, { url }) => {
  const q = Q.parse(Object.fromEntries(url.searchParams));
  let areas = mapAreas(await run(overpassQuery(q, 'boundary')));
  let scope: 'boundary' | 'box' = 'boundary';
  if (!areas.length) { areas = mapAreas(await run(overpassQuery(q, 'box'))); scope = 'box'; }
  return json({ areas, scope, source: 'OpenStreetMap' }, { cache: edgeCache(7 * 86400) });
});
