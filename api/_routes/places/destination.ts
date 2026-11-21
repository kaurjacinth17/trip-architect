// GET /api/places/destination?id=osm-R123  Details for a chosen destination from Nominatim (OpenStreetMap):
// name, state, country, centre and extent. Edge-cached for a week.
import { z } from 'zod';
import { dedupe } from '../../_lib/dedupe.js';
import { ApiError, handler, json } from '../../_lib/http.js';
import { nominatimLookup, OSM_ID_RE } from '../../_lib/osm.js';
import { edgeCache } from '../../_lib/upstream.js';

const Q = z.object({ id: z.string().regex(OSM_ID_RE, 'Invalid place ID'), session: z.string().max(64).optional() });
const TYPE: Record<string, string> = { city: 'locality', town: 'locality', village: 'locality', hamlet: 'locality', state: 'administrative_area_level_1', district: 'administrative_area_level_2', county: 'administrative_area_level_2', national_park: 'national_park', island: 'natural_feature', peak: 'natural_feature', valley: 'natural_feature', beach: 'natural_feature' };

export const GET = handler({ methods: ['GET'], rateLimit: { bucket: 'details', limit: 60, windowSec: 60 } }, async (_r, { url }) => {
  const q = Q.parse(Object.fromEntries(url.searchParams));
  const [p] = await dedupe('dest:' + q.id, () => nominatimLookup([q.id]));
  if (!p) throw new ApiError(404, 'not_found', 'That place wasn’t found');
  const a = p.address || {};
  const bb = p.boundingbox?.map(Number);
  const t = TYPE[p.type || ''] || 'locality';
  return json({
    placeId: q.id,
    name: p.name || a.city || a.town || a.village || a.state || (p.display_name || '').split(',')[0],
    region: a.state || a.region,
    country: a.country,
    countryCode: a.country_code?.toUpperCase(),
    center: { lat: +p.lat, lng: +p.lon },
    viewport: bb && bb.length === 4 ? { low: { lat: bb[0], lng: bb[2] }, high: { lat: bb[1], lng: bb[3] } } : undefined,
    types: [t, p.type || ''].filter(Boolean),
    primaryType: t,
    timezone: undefined,
    googleMapsUri: `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lon}`,
  }, { cache: edgeCache(7 * 86400) });
});
