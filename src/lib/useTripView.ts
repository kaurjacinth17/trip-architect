// The trip as shown on screen: Google places get their names from live data (never stored), and Google coordinates
// that are missing or due for refresh are updated in the background.
import { useEffect, useMemo } from 'react';
import { COORD_REFRESH_MS, setItemCoords } from '../engine/coords';
import type { Trip } from '../engine/types';
import { clone } from '../engine/util';
import { fetchDestinationRecord, tripGids, usePlaceLites } from './live';
import { useLiveStatus } from './liveStatus';
import { useTrips } from '../store/trips';

export function useTripView(raw: Trip | undefined): Trip | undefined {
  const gids = useMemo(() => (raw ? tripGids(raw) : []), [raw]);
  const lites = usePlaceLites(gids);
  const live = useLiveStatus((s) => s.state);

  // Background coordinate refresh (no undo entry).
  useEffect(() => {
    if (!raw) return;
    const now = Date.now();
    const due = [...raw.plan.flatMap((d) => d.items), ...raw.wish].filter((x) => x.gid && lites[x.gid]?.location && (x.lat == null || !x.coordsFetchedAt || now - x.coordsFetchedAt >= COORD_REFRESH_MS));
    if (due.length) useTrips.getState().refresh(raw.id, (t) => { for (const x of due) setItemCoords(t, x.gid!, lites[x.gid!].location!, now); });
  }, [raw, lites]);

  useEffect(() => {
    if (!raw || live !== 'live') return;
    const stale = Object.values(raw.destRecords || {}).filter((r) => r.kind === 'google' && r.placeId && (!r.center || !r.coordsFetchedAt || Date.now() - r.coordsFetchedAt >= COORD_REFRESH_MS));
    for (const r of stale) {
      fetchDestinationRecord(r.placeId!).then((g) => useTrips.getState().refresh(raw.id, (t) => {
        const cur = t.destRecords?.[r.key];
        if (cur) Object.assign(cur, { center: g.center, viewport: g.viewport, coordsFetchedAt: g.coordsFetchedAt });
      })).catch(() => {});
    }
  }, [raw, live]);

  return useMemo(() => {
    if (!raw || !gids.length) return raw;
    const t = clone(raw);
    for (const x of [...t.plan.flatMap((d) => d.items), ...t.wish]) {
      if (!x.gid || x.t) continue;
      x.t = lites[x.gid]?.name || (live === 'live' ? 'Loading place…' : 'Saved place (connect to load its name)');
      x.nameLive = true;
    }
    return t;
  }, [raw, lites, gids.length, live]);
}
