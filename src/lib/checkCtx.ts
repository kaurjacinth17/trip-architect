// Live inputs for the realism checks, gathered only where they're needed:
// - closures for every Google place in the trip (from the name lookups already made; no extra calls)
// - opening hours for the open day's Google places, only on the Itinerary tab (Place Details Enterprise)
// - live travel times for the open day, only when the user switches them on (Routes Essentials)
import { useQueries, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { CheckCtx } from '../engine/checks';
import { geo } from '../engine/geo';
import type { Period } from '../engine/hours';
import type { Trip } from '../engine/types';
import { apiGet, apiPost } from './api';
import type { DayWeather } from '../engine/extras';
import { destView } from '../engine/dest';
import { dayDate } from '../engine/time';
import { tripGids, usePlaceLites } from './live';
import { useLiveStatus } from './liveStatus';

export function useCheckCtx(t: Trip | undefined, opts: { day: number; itinerary: boolean; liveTravel: boolean }): CheckCtx {
  const live = useLiveStatus((s) => s.state === 'live');
  const gids = useMemo(() => (t ? tripGids(t) : []), [t]);
  const lites = usePlaceLites(gids);
  const day = t?.plan[Math.min(opts.day, (t?.plan.length || 1) - 1)];
  const dayGids = useMemo(() => [...new Set((day?.items || []).filter((x) => !x.stayRef).map((x) => x.gid).filter(Boolean) as string[])], [day]);

  const hoursQ = useQueries({
    queries: dayGids.map((id) => ({
      queryKey: ['hours', id],
      enabled: live && opts.itinerary,
      queryFn: ({ signal }: { signal: AbortSignal }) => apiGet<{ id: string; hours: Period[] | null; closed: 'temporarily' | 'permanently' | null }>(`/api/places/hours?id=${encodeURIComponent(id)}`, signal),
      staleTime: 30 * 60_000,
    })),
  });

  const legs = useMemo(() => {
    if (!day) return [];
    const it = [...day.items].sort((a, b) => a.s - b.s);
    const out: { key: string; from: { lat: number; lng: number }; to: { lat: number; lng: number } }[] = [];
    for (let i = 1; i < it.length; i++) if (geo(it[i - 1]) && geo(it[i])) out.push({ key: `${it[i - 1].id}>${it[i].id}`, from: { lat: it[i - 1].lat!, lng: it[i - 1].lng! }, to: { lat: it[i].lat!, lng: it[i].lng! } });
    return out.slice(0, 12);
  }, [day]);
  const travelQ = useQuery({
    queryKey: ['legs', legs.map((l) => `${l.key}@${l.from.lat},${l.from.lng}>${l.to.lat},${l.to.lng}`).join('|')],
    enabled: live && opts.itinerary && opts.liveTravel && legs.length > 0,
    queryFn: ({ signal }) => apiPost<{ legs: Record<string, { minutes: number } | null> }>('/api/routes/legs', { legs, mode: 'DRIVE' }, signal),
    staleTime: 60 * 60_000,
  });

  const weather = useTripWeather(t);
  const hoursData = hoursQ.map((q) => q.data);
  return useMemo(() => {
    const hours: Record<string, Period[] | undefined> = {};
    const closed: CheckCtx['closed'] = {};
    for (const h of hoursData) if (h) { if (h.hours) hours[h.id] = h.hours; if (h.closed) closed[h.id] = h.closed; }
    for (const [id, l] of Object.entries(lites)) if (l.closed === 'permanently' || l.closed === 'temporarily') closed[id] = l.closed;
    const travel: Record<string, number | undefined> = {};
    for (const [k, v] of Object.entries(travelQ.data?.legs || {})) if (v) travel[k] = v.minutes;
    return { hours, closed, travel, weather };
  }, [hoursData.map((h) => h?.id).join(), lites, travelQ.data, weather]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Forecast per day of the trip (Open-Meteo, 16 days ahead), keyed by day index. Only for trips that have started or start within 16 days. */
export function useTripWeather(t: Trip | undefined): Record<number, DayWeather | undefined> {
  const center = t ? destView(t, t.plan[0]?.dest || t.dests[0])?.center || null : null;
  const start = t?.start ? new Date(t.start + 'T00:00:00') : null;
  const days = start ? (start.getTime() - Date.now()) / 86_400_000 : Infinity;
  const end = t && start ? days + t.plan.length : -Infinity;
  const q = useQuery({
    queryKey: ['weather', center?.lat.toFixed(1), center?.lng.toFixed(1)],
    enabled: !!center && days <= 15 && end >= -1,
    queryFn: ({ signal }) => apiGet<{ days: (DayWeather & { date: string })[] }>(`/api/weather?lat=${center!.lat}&lng=${center!.lng}`, signal),
    staleTime: 3 * 3600_000,
  });
  return useMemo(() => {
    const out: Record<number, DayWeather | undefined> = {};
    if (!t || !q.data) return out;
    t.plan.forEach((_, i) => {
      const d = dayDate(t, i);
      if (!d) return;
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const w = q.data.days.find((x) => x.date === iso);
      if (w) out[i] = w;
    });
    return out;
  }, [t, q.data]);
}
