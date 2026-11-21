// POST /api/places/transport  { center }  The best-known railway stations and airports near a destination, for the
// hotel comparison ("distance to the station or airport"). Two Nearby Search Pro calls (IDs, names, coordinates only),
// only when the user opens a comparison; the browser keeps the result in memory for the session.
import { z } from 'zod';
import { dedupe } from '../_lib/dedupe';
import { googlePlaces } from '../_lib/google';
import { handler, json, readJson } from '../_lib/http';
import { LatLngSchema, MASKS, toLL, type GPlace } from '../_lib/places';

const Body = z.object({ center: LatLngSchema });
const KINDS = { stations: { types: ['train_station'], radius: 25_000 }, airports: { types: ['airport'], radius: 50_000 } } as const;
const r3 = (n: number) => Math.round(n * 1e3) / 1e3;

export const POST = handler({ methods: ['POST'], rateLimit: { bucket: 'transport', limit: 20, windowSec: 60 } }, async (request) => {
  const { center } = Body.parse(await readJson(request));
  const out: Record<keyof typeof KINDS, { id: string; name: string; location?: { lat: number; lng: number } }[]> = { stations: [], airports: [] };
  for (const [k, K] of Object.entries(KINDS) as [keyof typeof KINDS, (typeof KINDS)[keyof typeof KINDS]][]) {
    const body = {
      includedTypes: K.types, maxResultCount: 3, rankPreference: 'POPULARITY', languageCode: 'en',
      locationRestriction: { circle: { center: { latitude: center.lat, longitude: center.lng }, radius: K.radius } },
    };
    const r = await dedupe(`tr:${k}:${r3(center.lat)},${r3(center.lng)}`, () => googlePlaces<{ places?: GPlace[] }>({ path: 'places:searchNearby', body, fieldMask: MASKS.transport, sku: 'nearbySearchPro' }));
    out[k] = (r.places || []).map((p) => ({ id: p.id, name: p.displayName?.text || '', location: toLL(p.location) }));
  }
  return json(out);
});
