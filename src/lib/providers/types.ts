// Swappable data sources. Each has a live implementation (Phase 2+) and a curated/offline fallback, so tests and
// quota outages can use mocks without touching the UI.
import type { Cat } from '../../engine/types';

export interface LatLngLiteral { lat: number; lng: number }
export interface Viewport { low: LatLngLiteral; high: LatLngLiteral }

/** A place as shown in lists. Google fields are live-only and must never be persisted. */
export interface PlaceLite {
  /** Google place ID, or a curated pid like "jaipur:hawa". */
  id: string;
  source: 'google' | 'curated';
  name: string;
  category: Cat;
  types?: string[];
  location?: LatLngLiteral;
  rating?: number;
  userRatingCount?: number;
  /** 0 (free) … 4 (very expensive), Google's scale */
  priceLevel?: number;
  openNow?: boolean;
  /** Neighbourhood from Google's address components, or the curated area */
  areaHint?: string;
  googleMapsUri?: string;
  /** Curated place linked to this result (editor's pick, realism metadata) */
  curatedPid?: string;
}

export interface PlaceDetails extends PlaceLite {
  address?: string;
  websiteUri?: string;
  phone?: string;
  weekdayHours?: string[];
  summary?: string;
  photos?: PlacePhotoRef[];
}

export interface PlacePhotoRef { name: string; widthPx: number; heightPx: number; authors: { displayName: string; uri?: string }[] }

export type GuideTab = 'famous' | 'todo' | 'restaurants' | 'cafes' | 'hotels' | 'shopping' | 'nightlife';

export interface DestinationLite { key: string; name: string; center: LatLngLiteral; viewport?: Viewport; country?: string }

export interface PlaceSearch { dest: DestinationLite; tab: GuideTab; text?: string; area?: string; pageToken?: string }
export interface PlacePage { places: PlaceLite[]; nextPageToken?: string }

export interface DestinationSuggestion { placeId: string; name: string; secondary: string; types: string[] }

export interface PlacesProvider {
  readonly id: 'google' | 'curated';
  search(q: PlaceSearch, signal?: AbortSignal): Promise<PlacePage>;
  details(id: string, signal?: AbortSignal): Promise<PlaceDetails | null>;
  suggestDestinations(input: string, sessionToken: string, signal?: AbortSignal): Promise<DestinationSuggestion[]>;
}

export interface Area { name: string; center: LatLngLiteral; kind?: string; bestFor?: string }
export interface AreasProvider { areas(dest: DestinationLite, signal?: AbortSignal): Promise<Area[]> }

export interface Summary { title: string; extract: string; url?: string; source: 'wikipedia' | 'google' | 'curated' }
export interface SummaryProvider { summary(dest: DestinationLite, signal?: AbortSignal): Promise<Summary | null> }

/** Monthly climate normals, index 0 = January. */
export interface MonthClimate { tmax: number; tmin: number; rainMm: number; rainDays: number }
export interface ClimateProvider { normals(dest: DestinationLite, signal?: AbortSignal): Promise<MonthClimate[] | null> }

export interface Photo { id: string; src: string; srcSet?: string; width: number; height: number; alt: string; credit: { name: string; url?: string; source: 'unsplash' | 'google' }; sourceUrl?: string }
export interface PhotoProvider { photos(dest: DestinationLite, signal?: AbortSignal): Promise<Photo[]> }
