// POST /api/places/autocomplete  { input, sessionToken }
// Destination search: cities, towns, hill stations, islands, regions and parks, anywhere, biased toward India.
import { z } from 'zod';
import { dedupe } from '../_lib/dedupe';
import { googlePlaces } from '../_lib/google';
import { handler, json, readJson } from '../_lib/http';
import { MASKS } from '../_lib/places';

const Body = z.object({
  input: z.string().trim().min(2).max(80),
  sessionToken: z.string().regex(/^[A-Za-z0-9-]{8,64}$/),
});

/** Up to 5 primary types (Google's limit): localities, states/regions, districts, natural features, national parks. */
export const DESTINATION_TYPES = ['locality', 'administrative_area_level_1', 'administrative_area_level_2', 'natural_feature', 'national_park'];
/** Bias (not restriction) toward India: its bounding rectangle. */
export const INDIA_BIAS = { rectangle: { low: { latitude: 6.5, longitude: 68.1 }, high: { latitude: 35.7, longitude: 97.4 } } };

interface GAuto { suggestions?: { placePrediction?: { placeId: string; types?: string[]; structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } } } }[] }

export const POST = handler({ methods: ['POST'], rateLimit: { bucket: 'autocomplete', limit: 60, windowSec: 60 } }, async (request) => {
  const b = Body.parse(await readJson(request));
  const body = { input: b.input, sessionToken: b.sessionToken, includedPrimaryTypes: DESTINATION_TYPES, locationBias: INDIA_BIAS, languageCode: 'en' };
  const r = await dedupe('ac:' + b.input.toLowerCase(), () => googlePlaces<GAuto>({ path: 'places:autocomplete', body, fieldMask: MASKS.autocomplete, sku: 'autocomplete' }), 30_000);
  const suggestions = (r.suggestions || []).flatMap((s) => {
    const p = s.placePrediction;
    if (!p) return [];
    return [{ placeId: p.placeId, name: p.structuredFormat?.mainText?.text || '', secondary: p.structuredFormat?.secondaryText?.text || '', types: p.types || [] }];
  });
  return json({ suggestions });
});
