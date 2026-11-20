// Guests' local cache of destination records they've opened or searched (signed-in users get a table in Phase 8).
// Records hold only what the terms allow (see DestRecord); Google coordinates expire after 30 days.
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { COORD_TTL_MS } from '../engine/coords';
import type { DestRecord } from '../engine/types';

interface DestCache {
  records: Record<string, DestRecord>;
  put: (r: DestRecord) => void;
  patch: (key: string, p: Partial<DestRecord>) => void;
}

const purge = (r: DestRecord, now = Date.now()): DestRecord =>
  r.kind === 'google' && r.coordsFetchedAt && now - r.coordsFetchedAt >= COORD_TTL_MS ? { ...r, center: null, viewport: null, coordsFetchedAt: undefined } : r;

export const useDestCache = create<DestCache>()(
  persist(
    (set) => ({
      records: {},
      put: (r) => set((s) => ({ records: { ...s.records, [r.key]: { ...s.records[r.key], ...r } } })),
      patch: (key, p) => set((s) => (s.records[key] ? { records: { ...s.records, [key]: { ...s.records[key], ...p } } } : s)),
    }),
    {
      name: 'trip-architect-dests-v1',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      merge: (p, cur) => ({ ...cur, records: Object.fromEntries(Object.entries((p as DestCache)?.records || {}).map(([k, r]) => [k, purge(r)])) }),
    },
  ),
);
