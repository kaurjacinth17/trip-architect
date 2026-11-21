// GET /api/places/cover?q=Rishikesh, Uttarakhand, India  A destination's Google place ID and one real photo for Explore
// cards and destination pages. One Text Search Pro call (IDs and photo references only) and one Place Photos call.
// The image is loaded by the browser from Google (never downloaded or re-hosted); the photographer is credited.
// The answer is cached at the edge for a few hours so a busy Explore page stays inside the daily photo budget.
import { z } from 'zod';
import { dedupe } from '../../_lib/dedupe.js';
import { googlePlaces } from '../../_lib/google.js';
import { handler, json } from '../../_lib/http.js';
import { MASKS, type GPlace } from '../../_lib/places.js';

const Q = z.object({ q: z.string().trim().min(2).max(120), w: z.coerce.number().int().min(200).max(1200).default(800) });

export const GET = handler({ methods: ['GET'], rateLimit: { bucket: 'cover', limit: 60, windowSec: 60 } }, async (_r, { url }) => {
  const q = Q.parse(Object.fromEntries(url.searchParams));
  const key = `cover:${q.q.toLowerCase()}:${q.w}`;
  const out = await dedupe(key, async () => {
    const s = await googlePlaces<{ places?: GPlace[] }>({
      path: 'places:searchText', fieldMask: MASKS.cover, sku: 'textSearchPro',
      body: { textQuery: q.q, maxResultCount: 1, languageCode: 'en', regionCode: 'IN' },
    });
    const p = s.places?.[0];
    const ph = p?.photos?.[0];
    if (!p) return { id: null, uri: null, author: null };
    if (!ph) return { id: p.id, uri: null, author: null };
    const m = await googlePlaces<{ photoUri?: string }>({ path: ph.name + '/media', fieldMask: null, sku: 'placePhotos', query: { maxWidthPx: String(q.w), skipHttpRedirect: 'true' } });
    const a = ph.authorAttributions?.[0];
    return { id: p.id, uri: m.photoUri || null, author: a ? { name: a.displayName || 'Google Maps user', uri: a.uri || null } : null, mapsUri: ph.googleMapsUri || null, width: ph.widthPx || null, height: ph.heightPx || null };
  });
  return json(out, { cache: 'public, max-age=3600, s-maxage=21600, stale-while-revalidate=43200' });
});
