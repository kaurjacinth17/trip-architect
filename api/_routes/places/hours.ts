// GET /api/places/hours?id=osm-N123  Weekly opening periods parsed from OpenStreetMap's opening_hours (for the
// realism checks). Unknown or complex schedules return null (no check).
import { z } from 'zod';
import { handler, json } from '../../_lib/http.js';
import { OSM_ID_RE } from '../../_lib/osm.js';
import { PlaceIdSchema } from '../../_lib/places.js';
import { edgeCache } from '../../_lib/upstream.js';
import { lookup } from './lite.js';

const Q = z.object({ id: PlaceIdSchema.or(z.string().regex(OSM_ID_RE)) });

export const GET = handler({ methods: ['GET'], rateLimit: { bucket: 'hours', limit: 120, windowSec: 60 } }, async (_r, { url }) => {
  const q = Q.parse(Object.fromEntries(url.searchParams));
  const p = await lookup(q.id);
  return json({ id: q.id, hours: p.hours ?? null, closed: p.closed ?? null }, { cache: edgeCache(86400) });
});
