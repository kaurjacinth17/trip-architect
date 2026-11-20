// POST /api/routes/legs  { legs: [{ from, to }], mode }  Live travel times for consecutive stops of ONE day
// (optional setting, off by default). One Compute Routes Essentials call per leg, no traffic data.
import { z } from 'zod';
import { dedupe } from '../_lib/dedupe';
import { ROUTES_BASE, googlePlaces } from '../_lib/google';
import { handler, json, readJson } from '../_lib/http';
import { LatLngSchema, MASKS } from '../_lib/places';

const Body = z.object({
  legs: z.array(z.object({ key: z.string().max(40), from: LatLngSchema, to: LatLngSchema })).min(1).max(12),
  mode: z.enum(['DRIVE', 'TWO_WHEELER', 'WALK']).default('DRIVE'),
});

const wp = (p: { lat: number; lng: number }) => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } });
const round = (n: number) => Math.round(n * 1e4) / 1e4;

export const POST = handler({ methods: ['POST'], rateLimit: { bucket: 'routes', limit: 20, windowSec: 60 } }, async (request) => {
  const b = Body.parse(await readJson(request));
  const out: Record<string, { minutes: number; meters: number } | null> = {};
  for (const leg of b.legs) {
    const key = `rt:${b.mode}:${round(leg.from.lat)},${round(leg.from.lng)}>${round(leg.to.lat)},${round(leg.to.lng)}`;
    const r = await dedupe(key, () => googlePlaces<{ routes?: { duration?: string; distanceMeters?: number }[] }>({
      base: ROUTES_BASE, path: 'directions/v2:computeRoutes', fieldMask: MASKS.routes, sku: 'routesEssentials',
      body: { origin: wp(leg.from), destination: wp(leg.to), travelMode: b.mode, ...(b.mode === 'WALK' ? {} : { routingPreference: 'TRAFFIC_UNAWARE' }) },
    }));
    const route = r.routes?.[0];
    out[leg.key] = route?.duration ? { minutes: Math.ceil(parseInt(route.duration, 10) / 60), meters: route.distanceMeters || 0 } : null;
  }
  return json({ legs: out, source: 'Google Maps' });
});
