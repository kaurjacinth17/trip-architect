// GET /api/places/lite?id=osm-N123  Name and coordinates of a saved place (OpenStreetMap). Places saved earlier from
// Google can't be looked up any more (no Google account is used), so they answer 404 and show as "Saved place".
import { z } from 'zod';
import { dedupe } from '../../_lib/dedupe.js';
import { ApiError, handler, json } from '../../_lib/http.js';
import { byIdQuery, mapOsm, OSM_ID_RE, overpass } from '../../_lib/osm.js';
import { PlaceIdSchema } from '../../_lib/places.js';
import { edgeCache } from '../../_lib/upstream.js';

const Q = z.object({ id: PlaceIdSchema.or(z.string().regex(OSM_ID_RE)) });

export async function lookup(id: string) {
  if (!OSM_ID_RE.test(id)) throw new ApiError(404, 'not_found', 'This place was saved from Google and can’t be looked up any more');
  const r = await dedupe('osm:' + id, () => overpass(byIdQuery([id])));
  const e = r.elements?.[0];
  if (!e) throw new ApiError(404, 'not_found', 'That place wasn’t found');
  return mapOsm(e);
}

export const GET = handler({ methods: ['GET'], rateLimit: { bucket: 'lite', limit: 120, windowSec: 60 } }, async (_r, { url }) => {
  const { id } = Q.parse(Object.fromEntries(url.searchParams));
  const p = await lookup(id);
  return json({ id: p.id, name: p.name, location: p.location, types: p.types, primaryType: p.primaryType, closed: p.closed }, { cache: edgeCache(7 * 86400) });
});
