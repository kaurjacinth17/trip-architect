// GET /api/places/address?id=<placeId>&lang=hi  A place's formatted address in a language (Place Details Essentials),
// for the "show to driver" card. Fetched live each time; never stored.
import { z } from 'zod';
import { dedupe } from '../../_lib/dedupe';
import { googlePlaces } from '../../_lib/google';
import { handler, json } from '../../_lib/http';
import { MASKS, PlaceIdSchema } from '../../_lib/places';

const Q = z.object({ id: PlaceIdSchema, lang: z.enum(['en', 'hi', 'bn', 'ta', 'te', 'kn', 'ml', 'mr', 'gu', 'pa', 'or', 'as', 'ur', 'ne']).default('en') });

export const GET = handler({ methods: ['GET'], rateLimit: { bucket: 'address', limit: 30, windowSec: 60 } }, async (_r, { url }) => {
  const q = Q.parse(Object.fromEntries(url.searchParams));
  const r = await dedupe(`addr:${q.id}:${q.lang}`, () => googlePlaces<{ formattedAddress?: string }>({ path: `places/${q.id}`, fieldMask: MASKS.address, sku: 'detailsEssentials', query: { languageCode: q.lang } }));
  return json({ address: r.formattedAddress || null, lang: q.lang });
});
