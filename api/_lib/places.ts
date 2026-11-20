// Field masks and response mapping for Places API (New). Field masks are exported so tests can snapshot them:
// every field changes what Google bills, so a change here must be deliberate.
import { z } from 'zod';

export const MASKS = {
  /** Autocomplete Requests SKU */
  autocomplete: 'suggestions.placePrediction.placeId,suggestions.placePrediction.structuredFormat,suggestions.placePrediction.types',
  /** Place Details Pro: a destination the user picked */
  destination: 'id,displayName,location,viewport,types,primaryType,addressComponents,timeZone,googleMapsUri',
  /** Place Details Pro: name + coordinates for a place saved in a trip (names are never stored) */
  lite: 'id,displayName,location,primaryType,types,googleMapsUri,businessStatus',
  /** Text Search Enterprise: list rows with rating, review count, price level and open-now */
  search: 'places.id,places.displayName,places.types,places.primaryType,places.location,places.rating,places.userRatingCount,places.priceLevel,places.currentOpeningHours.openNow,places.googleMapsUri,places.addressComponents,places.shortFormattedAddress,places.businessStatus,nextPageToken',
  /** Place Details Enterprise + Atmosphere: fallback destination overview */
  editorial: 'id,editorialSummary',
} as const;

export interface GLatLng { latitude: number; longitude: number }
export const toLL = (p?: GLatLng | null) => (p ? { lat: p.latitude, lng: p.longitude } : undefined);

export interface GAddressComponent { longText?: string; shortText?: string; types?: string[] }
export interface GPlace {
  id: string;
  displayName?: { text?: string };
  types?: string[];
  primaryType?: string;
  location?: GLatLng;
  viewport?: { low: GLatLng; high: GLatLng };
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  currentOpeningHours?: { openNow?: boolean };
  googleMapsUri?: string;
  addressComponents?: GAddressComponent[];
  shortFormattedAddress?: string;
  businessStatus?: string;
  timeZone?: { id?: string };
  editorialSummary?: { text?: string };
}

const PRICE: Record<string, number> = {
  PRICE_LEVEL_FREE: 0, PRICE_LEVEL_INEXPENSIVE: 1, PRICE_LEVEL_MODERATE: 2, PRICE_LEVEL_EXPENSIVE: 3, PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

const comp = (p: GPlace, ...types: string[]) => {
  for (const t of types) {
    const c = p.addressComponents?.find((x) => x.types?.includes(t));
    if (c) return c;
  }
  return undefined;
};

/** The neighbourhood Google itself reports for a place (used for the Area filter; never point-in-polygon). */
export const areaOf = (p: GPlace) => comp(p, 'neighborhood', 'sublocality_level_1', 'sublocality', 'sublocality_level_2')?.longText;

export function mapPlace(p: GPlace) {
  return {
    id: p.id,
    name: p.displayName?.text || '',
    types: p.types || [],
    primaryType: p.primaryType,
    location: toLL(p.location),
    rating: p.rating,
    userRatingCount: p.userRatingCount,
    priceLevel: p.priceLevel ? PRICE[p.priceLevel] : undefined,
    openNow: p.currentOpeningHours?.openNow,
    googleMapsUri: p.googleMapsUri,
    areaHint: areaOf(p),
    address: p.shortFormattedAddress,
    closed: p.businessStatus === 'CLOSED_PERMANENTLY' ? 'permanently' as const : p.businessStatus === 'CLOSED_TEMPORARILY' ? 'temporarily' as const : undefined,
  };
}
export type MappedPlace = ReturnType<typeof mapPlace>;

export function mapDestination(p: GPlace) {
  const country = comp(p, 'country');
  const region = comp(p, 'administrative_area_level_1');
  return {
    placeId: p.id,
    name: p.displayName?.text || '',
    region: region?.longText,
    country: country?.longText,
    countryCode: country?.shortText,
    center: toLL(p.location),
    viewport: p.viewport ? { low: toLL(p.viewport.low)!, high: toLL(p.viewport.high)! } : undefined,
    types: p.types || [],
    primaryType: p.primaryType,
    timezone: p.timeZone?.id,
    googleMapsUri: p.googleMapsUri,
  };
}

export const PlaceIdSchema = z.string().regex(/^[A-Za-z0-9_-]{10,300}$/, 'Invalid place ID');
export const LatLngSchema = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });
export const ViewportSchema = z.object({ low: LatLngSchema, high: LatLngSchema });
