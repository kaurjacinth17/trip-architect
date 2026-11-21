// GET /api/places/lite?id=…  Name and coordinates of a place saved in a trip. Shown live, never stored
// (coordinates may be cached by the client for up to 30 days).
import { z } from 'zod';
import { dedupe } from '../../_lib/dedupe.js';
import { googlePlaces } from '../../_lib/google.js';
import { handler, json } from '../../_lib/http.js';
import { MASKS, PlaceIdSchema, mapPlace, type GPlace } from '../../_lib/places.js';

const Q = z.object({ id: PlaceIdSchema });

export const GET = handler({ methods: ['GET'], rateLimit: { bucket: 'details', limit: 120, windowSec: 60 } }, async (_r, { url }) => {
  const q = Q.parse(Object.fromEntries(url.searchParams));
  const p = await dedupe('lite:' + q.id, () => googlePlaces<GPlace>({ path: 'places/' + encodeURIComponent(q.id), fieldMask: MASKS.lite, sku: 'detailsPro', query: { languageCode: 'en' } }));
  const m = mapPlace(p);
  return json({ id: m.id, name: m.name, location: m.location, primaryType: m.primaryType, types: m.types, googleMapsUri: m.googleMapsUri, closed: m.closed });
});
