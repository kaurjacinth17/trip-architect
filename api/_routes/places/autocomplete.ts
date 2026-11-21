// POST /api/places/autocomplete  { input }  Destination search with Photon (OpenStreetMap data; komoot's public
// instance, fair use). Cities, towns, regions, islands, hill stations and parks, biased toward India.
import { z } from 'zod';
import { dedupe } from '../../_lib/dedupe.js';
import { handler, json, readJson } from '../../_lib/http.js';
import { osmId, photon } from '../../_lib/osm.js';

const Body = z.object({ input: z.string().trim().min(2).max(80), sessionToken: z.string().max(64).optional() });
/** Feature kinds that make sense as a destination */
const OK = /^(place:(city|town|village|hamlet|suburb|island|archipelago|region|state|county|district|municipality|locality)|boundary:(administrative|national_park|protected_area)|natural:(valley|peak|beach|bay|peninsula|island)|leisure:nature_reserve|tourism:attraction)$/;

export const POST = handler({ methods: ['POST'], rateLimit: { bucket: 'autocomplete', limit: 60, windowSec: 60 } }, async (request) => {
  const b = Body.parse(await readJson(request));
  const feats = await dedupe('ac:' + b.input.toLowerCase(), () => photon(b.input, 12), 30_000);
  const seen = new Set<string>();
  const suggestions = feats.filter((f) => OK.test(`${f.properties.osm_key}:${f.properties.osm_value}`) && f.properties.name).flatMap((f) => {
    const p = f.properties;
    const id = osmId(p.osm_type, p.osm_id);
    const label = `${p.name}|${p.state}|${p.country}`;
    if (seen.has(label)) return [];
    seen.add(label);
    return [{ placeId: id, name: p.name!, secondary: [p.county !== p.name ? p.county : '', p.state, p.country].filter(Boolean).join(', '), types: [p.osm_value || 'locality'] }];
  }).slice(0, 8);
  return json({ suggestions });
});
