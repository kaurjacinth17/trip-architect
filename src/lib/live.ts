// Client hooks for live data. Google content stays in TanStack Query's in-memory cache only.
import { useQueries, useQuery } from '@tanstack/react-query';
import { DESTS } from '../data/destinations';
import { recordFromGoogle, type DestView, type GoogleDestination } from '../engine/dest';
import type { LivePlace } from '../engine/livePool';
import type { Rates } from '../engine/currency';
import type { DestRecord, MonthClimate, Trip } from '../engine/types';
import { useDebounced } from '../hooks/useDebounced';
import { apiGet, apiPost } from './api';
import { useLiveStatus } from './liveStatus';

export const newSessionToken = () => crypto.randomUUID();

export interface Suggestion { key: string; placeId?: string; name: string; secondary: string; kind: 'curated' | 'google' }

const curatedMatches = (q: string): Suggestion[] => {
  const t = q.trim().toLowerCase();
  if (!t) return [];
  return DESTS.filter((d) => (d.name + ' ' + d.state + ' ' + d.tag).toLowerCase().includes(t)).map((d) => ({ key: d.id, name: d.name, secondary: d.state + ', India · curated guide', kind: 'curated' }));
};

/** Destination suggestions: curated guides instantly, Google after 400 ms of no typing (only when live). */
export function useDestinationSuggestions(input: string, sessionToken: string) {
  const live = useLiveStatus((s) => s.state === 'live');
  const q = useDebounced(input.trim(), 400);
  const g = useQuery({
    queryKey: ['ac', q],
    enabled: live && q.length >= 2,
    queryFn: ({ signal }) => apiPost<{ suggestions: { placeId: string; name: string; secondary: string }[] }>('/api/places/autocomplete', { input: q, sessionToken }, signal),
    staleTime: 10 * 60_000,
  });
  const curated = curatedMatches(input);
  const names = new Set(curated.map((c) => c.name.toLowerCase()));
  const google: Suggestion[] = (g.data?.suggestions || [])
    .filter((s) => !names.has(s.name.toLowerCase()))
    .map((s) => ({ key: 'g:' + s.placeId, placeId: s.placeId, name: s.name, secondary: s.secondary, kind: 'google' }));
  return { items: [...curated, ...google], loading: g.isFetching, live, error: g.error };
}

/** Destination details for a Google place → a storable record (closes the autocomplete session). */
export async function fetchDestinationRecord(placeId: string, sessionToken?: string): Promise<DestRecord> {
  const g = await apiGet<GoogleDestination>(`/api/places/destination?id=${encodeURIComponent(placeId)}${sessionToken ? '&session=' + sessionToken : ''}`);
  return recordFromGoogle(g);
}

export function useSummary(v: DestView | null) {
  const wiki = useQuery({
    queryKey: ['wiki', v?.name, v?.center?.lat.toFixed(1)],
    enabled: !!v && v.kind !== 'curated',
    queryFn: ({ signal }) => apiGet<{ summary: { title: string; extract: string; url?: string } | null }>(`/api/summary?title=${encodeURIComponent(v!.name)}${v!.center ? `&lat=${v!.center.lat}&lng=${v!.center.lng}` : ''}`, signal),
    staleTime: Infinity,
  });
  const live = useLiveStatus((s) => s.state === 'live');
  const google = useQuery({
    queryKey: ['editorial', v?.record?.placeId],
    enabled: live && !!v?.record?.placeId && wiki.isSuccess && !wiki.data?.summary,
    queryFn: ({ signal }) => apiGet<{ summary: string | null }>(`/api/places/summary?id=${encodeURIComponent(v!.record!.placeId!)}`, signal),
    staleTime: Infinity,
  });
  return { wiki: wiki.data?.summary || null, google: google.data?.summary || null, loading: wiki.isLoading || google.isLoading };
}

export function useClimate(center: { lat: number; lng: number } | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ['climate', center?.lat.toFixed(1), center?.lng.toFixed(1)],
    enabled: !!center && enabled,
    queryFn: ({ signal }) => apiGet<{ months: (MonthClimate | null)[] | null; period: string }>(`/api/climate?lat=${center!.lat}&lng=${center!.lng}`, signal),
    staleTime: Infinity,
    retry: 1,
  });
}

export interface OsmArea { name: string; kind?: string; center: { lat: number; lng: number } }
export function useAreas(v: DestView | null, enabled = true) {
  const vp = v?.record?.viewport;
  return useQuery({
    queryKey: ['areas', v?.key],
    enabled: !!v?.center && v.kind !== 'curated' && enabled,
    queryFn: ({ signal }) => apiGet<{ areas: OsmArea[]; scope: string }>(`/api/areas?name=${encodeURIComponent(v!.name)}&lat=${v!.center!.lat}&lng=${v!.center!.lng}${vp ? `&s=${vp.low.lat}&w=${vp.low.lng}&n=${vp.high.lat}&e=${vp.high.lng}` : ''}`, signal),
    staleTime: Infinity,
  });
}

export interface LiveListPlace extends LivePlace { rating?: number; userRatingCount?: number; priceLevel?: number; openNow?: boolean; googleMapsUri?: string; areaHint?: string; address?: string }

export function searchBody(v: DestView, tab: string, extra: Record<string, unknown> = {}) {
  return { tab, destName: v.name, center: v.center, ...(v.record?.viewport ? { viewport: v.record.viewport } : {}), ...extra };
}

/** First page of a destination tab (one Text Search call; only when the section is opened). */
export function usePlaceList(v: DestView | null, tab: string, enabled = true) {
  const live = useLiveStatus((s) => s.state === 'live');
  return useQuery({
    queryKey: ['places', v?.key, tab],
    enabled: live && !!v?.center && enabled,
    queryFn: ({ signal }) => apiPost<{ places: LiveListPlace[]; nextPageToken?: string }>('/api/places/search', searchBody(v!, tab), signal),
  });
}

/** Live pools for the starter generator: Famous attractions and restaurants (two calls per destination). */
export async function fetchPools(v: DestView): Promise<{ famous: LiveListPlace[]; restaurants: LiveListPlace[] }> {
  if (useLiveStatus.getState().state !== 'live' || !v.center) return { famous: [], restaurants: [] };
  const [f, r] = await Promise.all([
    apiPost<{ places: LiveListPlace[] }>('/api/places/search', searchBody(v, 'famous')).catch(() => ({ places: [] })),
    apiPost<{ places: LiveListPlace[] }>('/api/places/search', searchBody(v, 'restaurants')).catch(() => ({ places: [] })),
  ]);
  return { famous: f.places, restaurants: r.places };
}

export interface PlaceLiteRes { id: string; name: string; location?: { lat: number; lng: number }; googleMapsUri?: string; closed?: string; primaryType?: string; types?: string[] }

/** Names (and fresh coordinates) for Google places in a trip. One Place Details Pro call per place per session. */
export function usePlaceLites(gids: string[]) {
  const live = useLiveStatus((s) => s.state === 'live');
  const qs = useQueries({
    queries: gids.map((id) => ({
      queryKey: ['lite', id],
      enabled: live,
      queryFn: ({ signal }: { signal: AbortSignal }) => apiGet<PlaceLiteRes>(`/api/places/lite?id=${encodeURIComponent(id)}`, signal),
      staleTime: 30 * 60_000,
    })),
  });
  const map: Record<string, PlaceLiteRes> = {};
  qs.forEach((q, i) => { if (q.data) map[gids[i]] = q.data; });
  return map;
}

export function useRates(enabled: boolean) {
  return useQuery({
    queryKey: ['fx'],
    enabled,
    queryFn: ({ signal }) => apiGet<Rates>('/api/fx?base=INR', signal),
    staleTime: 6 * 3600_000,
  });
}

/** Google place IDs used anywhere in a trip. */
export const tripGids = (t: Trip) => [...new Set([...t.plan.flatMap((d) => d.items), ...t.wish, ...t.stays].map((x) => x.gid).filter(Boolean) as string[])];

export interface Cover { id: string | null; uri: string | null; author: { name: string; uri: string | null } | null; mapsUri?: string | null }
/** A destination's Google place ID and one photo (edge-cached server-side; held in memory here). */
export function useCover(q: string | null, enabled = true) {
  const live = useLiveStatus((s) => s.state === 'live');
  return useQuery({
    queryKey: ['cover', q],
    enabled: !!q && enabled && live,
    queryFn: ({ signal }) => apiGet<Cover>(`/api/places/cover?q=${encodeURIComponent(q!)}`, signal),
    staleTime: 6 * 3600_000,
    retry: false,
  });
}
