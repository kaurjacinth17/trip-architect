// Trips store: every trip mutation, localStorage persistence (with schema version + migration) and a per-trip
// in-memory undo stack. Mirrors the reference `S.trips`, `snap`, `mut`, `undo`, `persist`, `saveLocal`, `loadLocal`.
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import type { FactorKey, Trip, TripFix } from '../engine/types';
import { applyFix as runFix } from '../engine/fixes';
import { buildSampleTrip } from '../engine/generate';
import { normaliseTrip } from '../engine/share';
import { purgeExpiredCoords, stripLiveNames } from '../engine/coords';
import { clone, uid } from '../engine/util';

export const STORAGE_KEY = 'trip-architect-v1';
export const SCHEMA_VERSION = 3;
export const UNDO_LIMIT = 60;

export type Weights = Record<FactorKey | 'season', number>;
export interface ComparePrefs { cmp: string[]; w: Weights }

export const DEFAULT_COMPARE: ComparePrefs = {
  cmp: ['goa', 'udaipur', 'jaipur', 'kerala'],
  w: { relax: 6, culture: 6, food: 5, shop: 3, night: 3, nature: 5, adventure: 4, value: 5, season: 5 },
};

/** Result of a mutation: `false` or `null` from the callback cancels it (and its undo snapshot). */
export type MutResult = string | false | void | null | undefined;

interface TripsState {
  trips: Record<string, Trip>;
  compare: ComparePrefs;
  /** JSON snapshots per trip id, newest last. Never persisted. */
  undo: Record<string, string[]>;

  ensureSample: (today?: Date) => void;
  add: (t: Trip) => Trip;
  /** Clone the trip, snapshot it for undo, run `fn` on the clone, then commit. Returns the callback result. */
  mutate: (id: string, fn: (t: Trip) => MutResult) => MutResult;
  applyFix: (id: string, f: TripFix) => string | null;
  undoTrip: (id: string) => boolean;
  remove: (id: string) => Trip | null;
  restore: (t: Trip) => void;
  duplicate: (id: string) => Trip | null;
  importTrip: (raw: unknown) => Trip;
  setCompare: (fn: (c: ComparePrefs) => ComparePrefs) => void;
  /** Background data refresh (e.g. Google coordinates): no undo entry, doesn't count as an edit. */
  refresh: (id: string, fn: (t: Trip) => void) => void;
}

function stamp(t: Trip) {
  t.updated = Date.now();
  if (t.sample) t.touched = true;
}

/** Reads the store, upgrading the reference prototype's raw `{trips, ui}` blob to the persist envelope. */
const storage: StateStorage = {
  getItem(name) {
    try {
      const raw = localStorage.getItem(name);
      if (!raw) return null;
      const o = JSON.parse(raw);
      if (o && typeof o === 'object' && !('state' in o) && 'trips' in o) {
        return JSON.stringify({ state: { trips: o.trips, compare: { ...DEFAULT_COMPARE, ...(o.ui || {}) } }, version: 0 });
      }
      return raw;
    } catch {
      return null;
    }
  },
  setItem(name, value) {
    try { localStorage.setItem(name, value); } catch { /* quota or private mode: keep working in memory */ }
  },
  removeItem(name) {
    try { localStorage.removeItem(name); } catch { /* ignore */ }
  },
};

type Persisted = Pick<TripsState, 'trips' | 'compare'>;

/** v1 → v2: destination records, trip currency, and expenses with a currency and fixed INR value. */
export function upgradeTripV2(t: Trip): Trip {
  return {
    ...t,
    destRecords: t.destRecords || {},
    currency: t.currency || 'INR',
    expenses: (t.expenses || []).map((e) => ({ ...e, cur: e.cur || 'INR', inr: e.inr ?? e.amt })),
  };
}

/** v2 → v3: Stay and Activities budget lines can follow the plan. Existing trips keep their typed figures (manual). */
export function upgradeTripV3(t: Trip): Trip {
  return { ...t, budgetMode: { stay: t.budgetMode?.stay || 'manual', act: t.budgetMode?.act || 'manual' } };
}

export function migrate(persisted: unknown, version: number): Persisted {
  const p = (persisted || {}) as Partial<Persisted>;
  const trips: Record<string, Trip> = {};
  if (version < 1) {
    // v0: the single-file prototype. Normalise every trip but keep ids so links still work.
    for (const t of Object.values(p.trips || {})) {
      try {
        const n = upgradeTripV3(upgradeTripV2(normaliseTrip(t, { keepId: true })));
        trips[n.id] = n;
      } catch { /* drop unreadable trips */ }
    }
    return { trips, compare: { ...DEFAULT_COMPARE, ...(p.compare || {}) } };
  }
  for (const [id, t0] of Object.entries(p.trips || {})) {
    let t = t0;
    if (version < 2) t = upgradeTripV2(t);
    if (version < 3) t = upgradeTripV3(t);
    trips[id] = t;
  }
  return { trips, compare: { ...DEFAULT_COMPARE, ...(p.compare || {}) } };
}

export const useTrips = create<TripsState>()(
  persist(
    (set, get) => ({
      trips: {},
      compare: DEFAULT_COMPARE,
      undo: {},

      ensureSample(today) {
        if (Object.keys(get().trips).length) return;
        const t = buildSampleTrip(today);
        set({ trips: { [t.id]: t } });
      },

      add(t) {
        set((s) => ({ trips: { ...s.trips, [t.id]: t } }));
        return t;
      },

      mutate(id, fn) {
        const cur = get().trips[id];
        if (!cur) return false;
        const t = clone(cur);
        const r = fn(t);
        if (r === false || r === null) return r;
        stamp(t);
        if (JSON.stringify(t).includes('"nameLive"')) Object.assign(t, stripLiveNames(t)); // never persist live names
        set((s) => {
          const stack = [...(s.undo[id] || []), JSON.stringify(cur)].slice(-UNDO_LIMIT);
          return { trips: { ...s.trips, [id]: t }, undo: { ...s.undo, [id]: stack } };
        });
        return r;
      },

      applyFix(id, f) {
        let msg: string | null = null;
        get().mutate(id, (t) => {
          const r = runFix(t, f);
          if (!r.message) return false;
          Object.assign(t, r.trip);
          msg = r.message;
          return r.message;
        });
        return msg;
      },

      undoTrip(id) {
        const stack = get().undo[id];
        if (!stack?.length) return false;
        const prev = JSON.parse(stack[stack.length - 1]) as Trip;
        stamp(prev);
        set((s) => ({ trips: { ...s.trips, [id]: prev }, undo: { ...s.undo, [id]: stack.slice(0, -1) } }));
        return true;
      },

      remove(id) {
        const t = get().trips[id];
        if (!t) return null;
        set((s) => {
          const trips = { ...s.trips };
          delete trips[id];
          const undo = { ...s.undo };
          delete undo[id];
          return { trips, undo };
        });
        return t;
      },

      restore(t) {
        set((s) => ({ trips: { ...s.trips, [t.id]: t } }));
      },

      duplicate(id) {
        const src = get().trips[id];
        if (!src) return null;
        const t = clone(src);
        t.id = uid();
        t.name += ' (copy)';
        t.sample = false;
        t.touched = false;
        t.created = t.updated = Date.now();
        return get().add(t);
      },

      importTrip(raw) {
        const t = normaliseTrip(raw);
        if (Object.values(get().trips).some((x) => x.name === t.name)) t.name += ' (imported)';
        return get().add(t);
      },

      refresh(id, fn) {
        const cur = get().trips[id];
        if (!cur) return;
        const t = clone(cur);
        fn(t);
        set((s) => ({ trips: { ...s.trips, [id]: t } }));
      },

      setCompare(fn) {
        set((s) => ({ compare: fn(s.compare) }));
      },
    }),
    {
      name: STORAGE_KEY,
      version: SCHEMA_VERSION,
      storage: createJSONStorage(() => storage),
      migrate,
      // The sample trip stays out of storage until the user edits it.
      partialize: (s): Persisted => ({
        trips: Object.fromEntries(Object.entries(s.trips).filter(([, t]) => !(t.sample && !t.touched)).map(([k, t]) => [k, stripLiveNames(t)])),
        compare: s.compare,
      }),
      merge: (persisted, current) => {
        const p = persisted as Persisted;
        // Google coordinates older than 30 days are deleted on load (Places API caching limit).
        const trips = Object.fromEntries(Object.entries(p?.trips || {}).map(([id, t]) => [id, purgeExpiredCoords(t)]));
        return { ...current, ...p, trips };
      },
    },
  ),
);

/** Trips in date order, undated last (reference `tripList`). */
export const tripList = (trips: Record<string, Trip>) =>
  Object.values(trips).sort((a, b) => ((a.start || '9') > (b.start || '9') ? 1 : -1));
