// GET /api/places/hours?id=…  Opening periods and open/closed status for one place in the day being viewed.
// Held in memory by the client only; used for the opening-hours checks.
import { z } from 'zod';
import { dedupe } from '../../_lib/dedupe';
import { googlePlaces } from '../../_lib/google';
import { handler, json } from '../../_lib/http';
import { MASKS, PlaceIdSchema, mapPeriods, type GPlace } from '../../_lib/places';

const Q = z.object({ id: PlaceIdSchema });

export const GET = handler({ methods: ['GET'], rateLimit: { bucket: 'details', limit: 120, windowSec: 60 } }, async (_r, { url }) => {
  const q = Q.parse(Object.fromEntries(url.searchParams));
  const p = await dedupe('hrs:' + q.id, () => googlePlaces<GPlace>({ path: 'places/' + encodeURIComponent(q.id), fieldMask: MASKS.hours, sku: 'detailsEnterprise' }));
  return json({
    id: p.id,
    hours: mapPeriods(p.regularOpeningHours?.periods) ?? null,
    closed: p.businessStatus === 'CLOSED_PERMANENTLY' ? 'permanently' : p.businessStatus === 'CLOSED_TEMPORARILY' ? 'temporarily' : null,
  });
});
