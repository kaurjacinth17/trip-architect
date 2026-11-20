// Provider registry. Live providers are registered in later phases; until then (or when no key is configured,
// or the daily budget is used up) everything answers from the curated guides.
import { useLiveStatus } from '../liveStatus';
import { CuratedOnlyProvider } from './curated';
import type { AreasProvider, ClimateProvider, PhotoProvider, PlacesProvider, SummaryProvider } from './types';

export interface ProviderSet { places: PlacesProvider; areas: AreasProvider; summary: SummaryProvider; climate: ClimateProvider; photos: PhotoProvider }

const curated: ProviderSet = { places: CuratedOnlyProvider, areas: CuratedOnlyProvider, summary: CuratedOnlyProvider, climate: CuratedOnlyProvider, photos: CuratedOnlyProvider };
let live: Partial<ProviderSet> = {};

/** Register live implementations (and test mocks). */
export function registerProviders(p: Partial<ProviderSet>) {
  live = { ...live, ...p };
}

export function providers(): ProviderSet {
  const s = useLiveStatus.getState().state;
  const placesLive = s === 'live' && live.places ? live.places : curated.places;
  return {
    places: placesLive,
    areas: live.areas || curated.areas,
    summary: live.summary || curated.summary,
    climate: live.climate || curated.climate,
    photos: live.photos || curated.photos,
  };
}
