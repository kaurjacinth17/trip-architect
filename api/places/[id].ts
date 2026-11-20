// GET /api/places/:id[?food=1]  Details for the drawer, fetched only when a place is opened.
// food=1 (restaurants and cafés) adds veg-friendly and the editorial summary (Enterprise + Atmosphere).
import { z } from 'zod';
import { dedupe } from '../_lib/dedupe';
import { googlePlaces } from '../_lib/google';
import { handler, json } from '../_lib/http';
import { MASKS, PlaceIdSchema, mapDetails, type GPlace } from '../_lib/places';

const Q = z.object({ id: PlaceIdSchema, food: z.enum(['0', '1']).optional() });

export const GET = handler({ methods: ['GET'], rateLimit: { bucket: 'details', limit: 60, windowSec: 60 } }, async (_r, { url }) => {
  const id = decodeURIComponent(url.pathname.split('/').pop() || '');
  const q = Q.parse({ id: url.searchParams.get('id') || id, food: url.searchParams.get('food') || undefined });
  const food = q.food === '1';
  const p = await dedupe(`det:${q.id}:${food}`, () => googlePlaces<GPlace>({
    path: 'places/' + encodeURIComponent(q.id), fieldMask: food ? MASKS.detailsFood : MASKS.details,
    sku: food ? 'detailsEnterpriseAtmosphere' : 'detailsEnterprise', query: { languageCode: 'en' },
  }));
  return json(mapDetails(p));
});
