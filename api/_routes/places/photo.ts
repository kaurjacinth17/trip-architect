// GET /api/places/photo?name=places/…/photos/…&w=800  A short-lived photo URI from Google (Place Details Photos).
// The image itself is loaded by the browser from Google; it is never downloaded, re-hosted or cached here.
import { z } from 'zod';
import { dedupe } from '../../_lib/dedupe.js';
import { googlePlaces } from '../../_lib/google.js';
import { handler, json } from '../../_lib/http.js';
import { PhotoNameSchema } from '../../_lib/places.js';

const Q = z.object({ name: PhotoNameSchema, w: z.coerce.number().int().min(80).max(1600).default(800) });

export const GET = handler({ methods: ['GET'], rateLimit: { bucket: 'photos', limit: 60, windowSec: 60 } }, async (_r, { url }) => {
  const q = Q.parse(Object.fromEntries(url.searchParams));
  const r = await dedupe(`ph:${q.name}:${q.w}`, () => googlePlaces<{ photoUri?: string }>({
    path: q.name + '/media', fieldMask: null, sku: 'placePhotos', query: { maxWidthPx: String(q.w), skipHttpRedirect: 'true' },
  }));
  return json({ uri: r.photoUri || null });
});
