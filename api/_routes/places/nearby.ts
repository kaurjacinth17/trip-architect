// POST /api/places/nearby  { layer, center, radius }  Map layers for the visible area, only when a layer is switched
// on or "Search this area" is tapped. Restaurants, cafés and attractions use Nearby Search Enterprise (ratings,
// price, open now); ATMs and pharmacies use Nearby Search Pro (no ratings needed).
import { z } from 'zod';
import { dedupe } from '../../_lib/dedupe';
import { googlePlaces } from '../../_lib/google';
import { handler, json, readJson } from '../../_lib/http';
import { LatLngSchema, MASKS, mapPlace, type GPlace } from '../../_lib/places';

export const LAYERS = {
  restaurants: { types: ['restaurant'], rich: true },
  cafes: { types: ['cafe', 'coffee_shop'], rich: true },
  attractions: { types: ['tourist_attraction'], rich: true },
  atms: { types: ['atm'], rich: false },
  pharmacies: { types: ['pharmacy'], rich: false },
  hospitals: { types: ['hospital'], rich: false },
} as const;

const Body = z.object({
  layer: z.enum(Object.keys(LAYERS) as [keyof typeof LAYERS, ...(keyof typeof LAYERS)[]]),
  center: LatLngSchema,
  radius: z.number().min(100).max(10_000),
});

const r4 = (n: number) => Math.round(n * 1e3) / 1e3;

export const POST = handler({ methods: ['POST'], rateLimit: { bucket: 'nearby', limit: 30, windowSec: 60 } }, async (request) => {
  const b = Body.parse(await readJson(request));
  const L = LAYERS[b.layer];
  const body = {
    includedTypes: L.types, maxResultCount: 20, rankPreference: 'POPULARITY', languageCode: 'en',
    locationRestriction: { circle: { center: { latitude: b.center.lat, longitude: b.center.lng }, radius: Math.round(b.radius) } },
  };
  const key = `nb:${b.layer}:${r4(b.center.lat)},${r4(b.center.lng)}:${Math.round(b.radius / 100)}`;
  const r = await dedupe(key, () => googlePlaces<{ places?: GPlace[] }>({
    path: 'places:searchNearby', body, fieldMask: L.rich ? MASKS.nearby : MASKS.nearbyBasic, sku: L.rich ? 'nearbySearchEnterprise' : 'nearbySearchPro',
  }));
  return json({ places: (r.places || []).map(mapPlace) });
});
