// GET /api/places/summary?id=…  Google's editorial summary, used only when Wikipedia has nothing.
import { z } from 'zod';
import { dedupe } from '../../_lib/dedupe.js';
import { googlePlaces } from '../../_lib/google.js';
import { handler, json } from '../../_lib/http.js';
import { MASKS, PlaceIdSchema, type GPlace } from '../../_lib/places.js';

const Q = z.object({ id: PlaceIdSchema });

export const GET = handler({ methods: ['GET'], rateLimit: { bucket: 'details', limit: 60, windowSec: 60 } }, async (_r, { url }) => {
  const q = Q.parse(Object.fromEntries(url.searchParams));
  const p = await dedupe('ed:' + q.id, () => googlePlaces<GPlace>({ path: 'places/' + encodeURIComponent(q.id), fieldMask: MASKS.editorial, sku: 'detailsEnterpriseAtmosphere', query: { languageCode: 'en' } }));
  return json({ summary: p.editorialSummary?.text || null });
});
