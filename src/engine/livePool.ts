// Turn live Google results into the generator's place pool, and pick lunch spots near each day's plan.
import { km } from './geo';
import { categorise, isLodging } from './placeTypes';
import { PRIOR, bayesScores, isHiddenGem } from './ranking';
import type { Day, DestRecord, Item, Place, Stay, Trip } from './types';
import { customItem, placeAtExact, placeOnDay } from './schedule';
import { uid } from './util';

export interface LivePlace {
  id: string;
  name: string;
  types: string[];
  primaryType?: string;
  location?: { lat: number; lng: number };
  rating?: number;
  userRatingCount?: number;
  closed?: 'temporarily' | 'permanently';
}

/** Ranked pool for genPlan. Names are transient (used only for this generation, never stored on items). */
export function poolFromLive(destKey: string, list: LivePlace[]): Place[] {
  const usable = list.filter((p) => p.location && !p.closed && !isLodging(p.types));
  const scores = bayesScores(usable, PRIOR.attractions);
  const order = usable.map((p, i) => ({ p, s: scores[i] })).sort((a, b) => b.s - a.s);
  return order.map(({ p }, rank) => {
    const { cat, duration } = categorise(p.primaryType, p.types);
    return {
      pid: 'g:' + p.id, gid: p.id, dest: destKey, n: p.name, cat, area: '', lat: p.location!.lat, lng: p.location!.lng,
      d: duration, c: 0, best: 'any', desc: '', must: rank < 10, hidden: isHiddenGem(p), wd: null,
    };
  });
}

/**
 * Replace each generic "Lunch" block on a live destination's days with a top-rated restaurant near the
 * previous stop (rating 4.0+, 100+ reviews, within 3 km). Each restaurant is used once.
 */
export function pickLunches(plan: Day[], destKey: string, restaurants: LivePlace[]): number {
  const ok = restaurants.filter((r) => r.location && !r.closed && (r.rating ?? 0) >= 4 && (r.userRatingCount ?? 0) >= 100);
  const score = bayesScores(ok, PRIOR.other);
  const used = new Set<string>();
  let n = 0;
  for (const day of plan) {
    if (day.dest !== destKey) continue;
    const items = [...day.items].sort((a, b) => a.s - b.s);
    const li = items.findIndex((x) => x.cat === 'meal' && x.t === 'Lunch' && !x.gid);
    if (li < 0) continue;
    const ref = [...items.slice(0, li)].reverse().find((x) => x.lat != null) || items.slice(li + 1).find((x) => x.lat != null);
    if (!ref) continue;
    const best = ok.map((r, i) => ({ r, s: score[i], d: km(ref, r.location!)! }))
      .filter((c) => c.d <= 3 && !used.has(c.r.id))
      .sort((a, b) => b.s - a.s || a.d - b.d)[0];
    if (!best) continue;
    used.add(best.r.id);
    const meal = items[li];
    Object.assign(meal, { gid: best.r.id, t: '', lat: best.r.location!.lat, lng: best.r.location!.lng, coordsFetchedAt: Date.now() });
    n++;
  }
  return n;
}


export type MealKind = 'breakfast' | 'lunch' | 'dinner';
export const MEALS: Record<MealKind, { start: number; dur: number; label: string }> = {
  breakfast: { start: 510, dur: 45, label: 'Breakfast' },
  lunch: { start: 780, dur: 60, label: 'Lunch' },
  dinner: { start: 1170, dur: 90, label: 'Dinner' },
};

/** Make sure a destination is part of the trip's route (no days change). */
export function ensureDest(t: Trip, key: string, record?: DestRecord) {
  if (!t.dests.includes(key)) t.dests.push(key);
  if (record) t.destRecords = { ...(t.destRecords || {}), [key]: record };
}

/** An itinerary item for a live Google place (ID + coordinates only; the name is shown live). */
export function itemFromLive(p: LivePlace, destKey: string, meal?: MealKind): Item {
  const { cat, duration } = categorise(p.primaryType, p.types);
  return customItem({
    gid: p.id, t: '', cat: meal ? 'meal' : cat, d: meal ? MEALS[meal].dur : duration, c: 0,
    lat: p.location?.lat ?? null, lng: p.location?.lng ?? null, coordsFetchedAt: p.location ? Date.now() : undefined,
    dest: destKey, pri: 'nice',
  });
}

/** Add a live place to day `di` at `start` (or the next free slot / the meal's usual time). Mutates `t`. */
export function addLiveToDay(t: Trip, p: LivePlace, opts: { destKey: string; record?: DestRecord; di: number; start?: number | null; meal?: MealKind }) {
  ensureDest(t, opts.destKey, opts.record);
  const x = itemFromLive(p, opts.destKey, opts.meal);
  const at = opts.start ?? (opts.meal ? MEALS[opts.meal].start : null);
  if (at != null) placeAtExact(t, opts.di, x, at);
  else placeOnDay(t, opts.di, x);
  return x;
}

/** A shortlisted stay for a Google hotel. The price is left for the user to type (no live room prices exist). */
export function stayFromLive(t: Trip, p: LivePlace, destKey: string, record?: DestRecord): Stay {
  ensureDest(t, destKey, record);
  const s: Stay = {
    id: uid(), name: '', gid: p.id, area: '', dest: destKey, lat: p.location?.lat ?? null, lng: p.location?.lng ?? null,
    coordsFetchedAt: p.location ? Date.now() : undefined, price: 0, nights: Math.max(1, t.plan.length - 1), checkin: t.start,
    checkout: '', rating: 0, link: '', notes: '', status: 'shortlisted',
  };
  t.stays.push(s);
  return s;
}
