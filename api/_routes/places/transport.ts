// POST /api/places/transport  { center }  Railway stations and airports near a destination (OpenStreetMap), for the
// hotel comparison. Edge-cached for a week.
import { z } from 'zod';
import { dedupe } from '../../_lib/dedupe.js';
import { handler, json, readJson } from '../../_lib/http.js';
import { aroundQuery, mapList, overpass } from '../../_lib/osm.js';
import { LatLngSchema } from '../../_lib/places.js';
import { edgeCache } from '../../_lib/upstream.js';

const Body = z.object({ center: LatLngSchema });
const r3 = (n: number) => Math.round(n * 1e3) / 1e3;

export const POST = handler({ methods: ['POST'], rateLimit: { bucket: 'transport', limit: 20, windowSec: 60 } }, async (request) => {
  const { center } = Body.parse(await readJson(request));
  const out = await dedupe(`tr:${r3(center.lat)},${r3(center.lng)}`, async () => {
    const [st, ap] = await Promise.all([overpass(aroundQuery(['stations'], center, 25_000, { limit: 20 })), overpass(aroundQuery(['airports'], center, 50_000, { limit: 10 }))]);
    const pick = (l: ReturnType<typeof mapList>) => l.slice(0, 3).map((p) => ({ id: p.id, name: p.name, location: p.location }));
    return { stations: pick(mapList(st)), airports: pick(mapList(ap)) };
  });
  return json(out, { cache: edgeCache(7 * 86400) });
});
