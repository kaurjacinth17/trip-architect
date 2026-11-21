// GET /api/places/osm-N123  The detail drawer: address, website, phone, opening hours, vegetarian and wheelchair
// tags from OpenStreetMap; a summary and photo from Wikipedia/Wikimedia Commons when the place has an article.
import { z } from 'zod';
import { dedupe } from '../../_lib/dedupe.js';
import { handler, json } from '../../_lib/http.js';
import { byIdQuery, commonsCredit, mapOsm, OSM_ID_RE, overpass, sized, wikiSummary } from '../../_lib/osm.js';
import { PlaceIdSchema } from '../../_lib/places.js';
import { edgeCache } from '../../_lib/upstream.js';
import { lookup } from './lite.js';

const Q = z.object({ id: PlaceIdSchema.or(z.string().regex(OSM_ID_RE)), food: z.enum(['0', '1']).optional() });

export const GET = handler({ methods: ['GET'], rateLimit: { bucket: 'details', limit: 60, windowSec: 60 } }, async (_r, { url }) => {
  const id = decodeURIComponent(url.pathname.split('/').pop() || '');
  const q = Q.parse({ id: url.searchParams.get('id') || id, food: url.searchParams.get('food') || undefined });
  const base = await lookup(q.id);
  const r = await dedupe('osm:' + q.id, () => overpass(byIdQuery([q.id])));
  const t = r.elements?.[0]?.tags || {};
  const wp = /^([a-z]{2,3}):(.+)$/.exec(t.wikipedia || '');
  const w = wp ? await wikiSummary(wp[2], wp[1]).catch(() => null) : null;
  const img = w?.thumbnail?.source || w?.originalimage?.source;
  const credit = img ? await commonsCredit(img) : null;
  return json({
    ...mapOsm(r.elements![0]),
    ...base,
    address: base.address,
    website: t.website || t['contact:website'] || undefined,
    phone: t.phone || t['contact:phone'] || undefined,
    phoneIntl: t.phone || t['contact:phone'] || undefined,
    weekdayHours: t.opening_hours ? t.opening_hours.split(';').map((x) => x.trim()).filter(Boolean) : undefined,
    veg: base.veg,
    summary: w?.extract || t.description || undefined,
    summarySource: w?.content_urls?.desktop?.page,
    photos: img ? [{ name: sized(img, 800), width: w?.thumbnail?.width, height: w?.thumbnail?.height, googleMapsUri: credit?.uri, authors: credit ? [{ name: credit.name + (credit.licence ? ` (${credit.licence})` : ''), uri: credit.uri }] : [] }] : [],
  }, { cache: edgeCache(7 * 86400) });
});
