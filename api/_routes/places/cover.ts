// GET /api/places/cover?q=Rishikesh, Uttarakhand, India  A destination's OpenStreetMap ID (Photon) and a photo from
// its Wikipedia article (Wikimedia Commons, credited with the photographer and licence). Edge-cached for a week.
import { z } from 'zod';
import { dedupe } from '../../_lib/dedupe.js';
import { handler, json } from '../../_lib/http.js';
import { commonsCredit, osmId, photon, sized, wikiSummary } from '../../_lib/osm.js';
import { edgeCache } from '../../_lib/upstream.js';

const Q = z.object({ q: z.string().trim().min(2).max(120), w: z.coerce.number().int().min(200).max(1200).default(800) });

/** Wikipedia titles to try for "Name, State, Country": the name, then "Name, State". */
export const titlesFor = (q: string) => {
  const [name, state] = q.split(',').map((s) => s.trim());
  const base = name.replace(/\s*\(.*\)$/, '');
  return [...new Set([base, state ? `${base}, ${state}` : '', name].filter(Boolean))];
};

export const GET = handler({ methods: ['GET'], rateLimit: { bucket: 'cover', limit: 60, windowSec: 60 } }, async (_r, { url }) => {
  const q = Q.parse(Object.fromEntries(url.searchParams));
  const out = await dedupe(`cover:${q.q.toLowerCase()}:${q.w}`, async () => {
    const [feats, ...wikis] = await Promise.all([photon(q.q, 1).catch(() => []), ...titlesFor(q.q).map((t) => wikiSummary(t).catch(() => null))]);
    const f = feats[0];
    const w = wikis.find((x) => x && x.type !== 'disambiguation' && (x.thumbnail || x.originalimage));
    const img = w?.thumbnail?.source || w?.originalimage?.source;
    const credit = img ? await commonsCredit(img) : null;
    return {
      id: f ? osmId(f.properties.osm_type, f.properties.osm_id) : null,
      uri: img ? sized(img, q.w) : null,
      author: credit ? { name: credit.name + (credit.licence ? ` (${credit.licence})` : ''), uri: credit.uri } : null,
      mapsUri: w?.content_urls?.desktop?.page || null,
    };
  });
  return json(out, { cache: edgeCache(7 * 86400) });
});
