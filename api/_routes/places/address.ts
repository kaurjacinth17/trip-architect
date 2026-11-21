// GET /api/places/address?id=osm-N123&lang=hi  A place's address from Nominatim (OpenStreetMap) in a language, for the
// "show to driver" card. Names appear in that language where OpenStreetMap has them.
import { z } from 'zod';
import { dedupe } from '../../_lib/dedupe.js';
import { ApiError, handler, json } from '../../_lib/http.js';
import { nominatimLookup, OSM_ID_RE } from '../../_lib/osm.js';
import { PlaceIdSchema } from '../../_lib/places.js';
import { edgeCache } from '../../_lib/upstream.js';

const Q = z.object({ id: PlaceIdSchema.or(z.string().regex(OSM_ID_RE)), lang: z.enum(['en', 'hi', 'bn', 'ta', 'te', 'kn', 'ml', 'mr', 'gu', 'pa', 'or', 'as', 'ur', 'ne']).default('en') });

export const GET = handler({ methods: ['GET'], rateLimit: { bucket: 'address', limit: 30, windowSec: 60 } }, async (_r, { url }) => {
  const q = Q.parse(Object.fromEntries(url.searchParams));
  if (!OSM_ID_RE.test(q.id)) throw new ApiError(404, 'not_found', 'Address unavailable for this place');
  const [p] = await dedupe(`addr:${q.id}:${q.lang}`, () => nominatimLookup([q.id], q.lang));
  return json({ address: p?.display_name || null, lang: q.lang }, { cache: edgeCache(7 * 86400) });
});
