// City Guide data: paged lists (20 per page, up to Google's 60), the on-request "All areas" run, details and photos.
// All Google content lives only in TanStack Query's memory cache.
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { DestView } from '../engine/dest';
import type { Period } from '../engine/hours';
import type { GuideFilters, GuidePlace, SortKey } from '../engine/placeFilters';
import { apiGet, apiPost } from './api';
import { searchBody } from './live';
import { useLiveStatus } from './liveStatus';

export type GuideTab = 'famous' | 'todo' | 'restaurants' | 'cafes' | 'hotels' | 'shopping' | 'nightlife' | 'areas';
export const GUIDE_TABS: [GuideTab, string][] = [
  ['famous', 'Famous attractions'], ['todo', 'Things to do'], ['restaurants', 'Restaurants'], ['cafes', 'Cafés'],
  ['hotels', 'Hotels'], ['shopping', 'Shopping'], ['nightlife', 'Nightlife'], ['areas', 'Areas'],
];
export const MAX_PAGES = 3; // Google returns at most 60 results per query

export interface ApiPlace {
  id: string; name: string; types: string[]; primaryType?: string; location?: { lat: number; lng: number };
  rating?: number; userRatingCount?: number; priceLevel?: number; openNow?: boolean; hours?: Period[]; wheelchair?: boolean;
  googleMapsUri?: string; areaHint?: string; address?: string; closed?: 'temporarily' | 'permanently';
}
interface Page { places: ApiPlace[]; nextPageToken?: string }

/** One tab (optionally inside one area): first page on open, more only on "Load more". */
export function useGuideList(v: DestView | null, tab: GuideTab, area?: string) {
  const live = useLiveStatus((s) => s.state === 'live');
  return useInfiniteQuery({
    queryKey: ['guide', v?.key, tab, area || ''],
    enabled: live && !!v?.center && tab !== 'areas',
    initialPageParam: '',
    queryFn: ({ pageParam, signal }) => apiPost<Page>('/api/places/search', searchBody(v!, tab, { ...(area ? { area } : {}), ...(pageParam ? { pageToken: pageParam } : {}) }), signal),
    getNextPageParam: (last, all) => (all.length < MAX_PAGES ? last.nextPageToken || undefined : undefined),
  });
}

export interface AreaRun { running: boolean; done: number; total: number; pages: { area: string; places: ApiPlace[] }[]; failed: string[]; stopped: string | null }

/**
 * "All areas": one first-page query per area, only when the user asks. Two at a time; stops early (and says so) if
 * the daily budget runs out. Results are cached per area, so re-running doesn't spend again.
 */
export function useAllAreas(v: DestView | null, tab: GuideTab) {
  const qc = useQueryClient();
  const [run, setRun] = useState<AreaRun | null>(null);
  const cancel = useRef(false);
  useEffect(() => () => { cancel.current = true; }, []);
  useEffect(() => { setRun(null); }, [v?.key, tab]);

  const start = useCallback(async (areas: string[]) => {
    if (!v?.center) return;
    cancel.current = false;
    const state: AreaRun = { running: true, done: 0, total: areas.length, pages: [], failed: [], stopped: null };
    setRun({ ...state });
    const queue = [...areas];
    const worker = async () => {
      while (queue.length && !cancel.current && !state.stopped) {
        const area = queue.shift()!;
        try {
          const page = await qc.fetchQuery({
            queryKey: ['guide-area', v.key, tab, area],
            queryFn: () => apiPost<Page>('/api/places/search', searchBody(v, tab, { area })),
            staleTime: 30 * 60_000,
          });
          state.pages.push({ area, places: page.places });
        } catch (e) {
          state.failed.push(area);
          if ((e as { code?: string })?.code === 'quota_exhausted') state.stopped = 'Live place data is resting for today; stopped early.';
        }
        state.done++;
        setRun({ ...state, pages: [...state.pages] });
      }
    };
    await Promise.all([worker(), worker()]);
    state.running = false;
    setRun({ ...state, pages: [...state.pages] });
  }, [v, tab, qc]);

  return { run, start, stop: () => { cancel.current = true; } };
}

export interface PlacePhoto { name: string; width?: number; height?: number; googleMapsUri?: string; authors: { name: string; uri?: string }[] }
export interface PlaceDetailsRes extends ApiPlace {
  address?: string; website?: string; phone?: string; phoneIntl?: string; weekdayHours?: string[]; veg?: boolean; summary?: string; photos: PlacePhoto[];
}

export const isFoodTab = (tab: GuideTab | string) => tab === 'restaurants' || tab === 'cafes';

export function usePlaceDetails(id: string | null, food: boolean) {
  return useQuery({
    queryKey: ['details', id, food],
    enabled: !!id && useLiveStatus.getState().state === 'live',
    queryFn: ({ signal }) => apiGet<PlaceDetailsRes>(`/api/places/${encodeURIComponent(id!)}${food ? '?food=1' : ''}`, signal),
  });
}

/** A Google photo URI, requested only once the image is on screen (Place Details Photos is a 220/day budget). */
export function usePhotoUri(name: string | null, width: number, visible: boolean) {
  return useQuery({
    queryKey: ['photo', name, width],
    enabled: !!name && visible,
    queryFn: ({ signal }) => apiGet<{ uri: string | null }>(`/api/places/photo?name=${encodeURIComponent(name!)}&w=${width}`, signal),
    staleTime: 30 * 60_000,
  });
}

/* ------------------------------------------------------------------------------------- URL filter state */

export interface GuideState {
  tab: GuideTab;
  /** Run the tab's query inside this area ("Hotels here") */
  inArea?: string;
  filters: GuideFilters & { openDay?: number; openTime?: string };
  sort: SortKey;
  trip?: string;
  day?: number;
}

const num = (s: string | null) => (s != null && s !== '' && Number.isFinite(+s) ? +s : undefined);

export function parseGuide(p: URLSearchParams): GuideState {
  const tab = (GUIDE_TABS.find(([k]) => k === p.get('tab'))?.[0] || 'famous') as GuideTab;
  const open = p.get('open');
  const openDay = open?.startsWith('day') ? num(open.slice(3).split('@')[0]) : undefined;
  return {
    tab,
    inArea: p.get('in') || undefined,
    sort: (['famous', 'rating', 'reviews', 'nearHotel', 'nearDay', 'price'].includes(p.get('sort') || '') ? p.get('sort') : 'famous') as SortKey,
    trip: p.get('trip') || undefined,
    day: num(p.get('day')),
    filters: {
      minRating: num(p.get('rating')),
      minReviews: num(p.get('reviews')),
      price: p.get('price')?.split(',').map(Number).filter((x) => x >= 0 && x <= 4),
      areas: p.get('areas')?.split('|').filter(Boolean),
      open: open === 'now' ? 'now' : undefined,
      openDay,
      openTime: open?.includes('@') ? open.split('@')[1] : undefined,
      veg: p.get('veg') === '1' || undefined,
      wheelchair: p.get('wc') === '1' || undefined,
      q: p.get('q') || undefined,
    },
  };
}

export function guideParams(s: GuideState): URLSearchParams {
  const p = new URLSearchParams();
  const f = s.filters;
  if (s.tab !== 'famous') p.set('tab', s.tab);
  if (s.inArea) p.set('in', s.inArea);
  if (s.sort !== 'famous') p.set('sort', s.sort);
  if (s.trip) p.set('trip', s.trip);
  if (s.day != null) p.set('day', String(s.day));
  if (f.minRating) p.set('rating', String(f.minRating));
  if (f.minReviews) p.set('reviews', String(f.minReviews));
  if (f.price?.length) p.set('price', f.price.join(','));
  if (f.areas?.length) p.set('areas', f.areas.join('|'));
  if (f.open === 'now') p.set('open', 'now');
  else if (f.openDay != null) p.set('open', `day${f.openDay}@${f.openTime || '13:00'}`);
  if (f.veg) p.set('veg', '1');
  if (f.wheelchair) p.set('wc', '1');
  if (f.q) p.set('q', f.q);
  return p;
}

export const toGuidePlace = (p: ApiPlace, rank: number, foundIn?: string): GuidePlace => ({ ...p, rank, foundIn });

export interface TransportHub { id: string; name: string; location?: { lat: number; lng: number } }
/** Main railway stations and airports near a destination (only when a hotel comparison is open). */
export function useTransport(center: { lat: number; lng: number } | null, enabled: boolean) {
  const live = useLiveStatus((s) => s.state === 'live');
  return useQuery({
    queryKey: ['transport', center ? `${center.lat.toFixed(3)},${center.lng.toFixed(3)}` : ''],
    enabled: live && enabled && !!center,
    queryFn: ({ signal }) => apiPost<{ stations: TransportHub[]; airports: TransportHub[] }>('/api/places/transport', { center }, signal),
    staleTime: Infinity,
  });
}
