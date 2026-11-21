// GET /api/places/destination?id=…&session=…  Details for a chosen destination (closes the autocomplete session).
import { z } from 'zod';
import { dedupe } from '../../_lib/dedupe.js';
import { googlePlaces } from '../../_lib/google.js';
import { handler, json } from '../../_lib/http.js';
import { MASKS, PlaceIdSchema, mapDestination, type GPlace } from '../../_lib/places.js';

const Q = z.object({ id: PlaceIdSchema, session: z.string().regex(/^[A-Za-z0-9-]{8,64}$/).optional() });

export const GET = handler({ methods: ['GET'], rateLimit: { bucket: 'details', limit: 60, windowSec: 60 } }, async (_r, { url }) => {
  const q = Q.parse(Object.fromEntries(url.searchParams));
  const p = await dedupe('dest:' + q.id, () => googlePlaces<GPlace>({
    path: 'places/' + encodeURIComponent(q.id), fieldMask: MASKS.destination, sku: 'detailsPro',
    query: { languageCode: 'en', ...(q.session ? { sessionToken: q.session } : {}) },
  }));
  return json(mapDestination(p));
});
