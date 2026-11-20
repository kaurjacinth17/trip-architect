// Timing and day-layout helpers. These mutate the Day passed in (the store and the fixes always
// hand them a cloned trip), mirroring the reference functions one-for-one.
import { NONACT, paceOf } from '../data/constants';
import { D } from '../data/destinations';
import { geo, km, nnOrder, travelMin, trm } from './geo';
import type { Day, Item, Place, Trip } from './types';
import { sum, uid, up15, up5 } from './util';

export const isAct = (x: Pick<Item, 'cat'>) => !NONACT.includes(x.cat);
export const travellers = (t: Pick<Trip, 'travelers'>) => Math.max(1, t.travelers.length);
export const sortDay = (day: Day) => day.items.sort((a, b) => a.s - b.s);

export function itemFromPlace(p: Place, s?: number): Item {
  return {
    id: uid(), pid: p.pid, t: p.n, cat: p.cat, s: s ?? 540, d: p.d, c: p.c, lat: p.lat, lng: p.lng,
    area: p.area, dest: p.dest, pri: p.must ? 'must' : 'nice', n: '', done: false,
  };
}

export function customItem(o: Partial<Item>): Item {
  return {
    id: uid(), pid: null, t: 'Custom activity', cat: 'custom', s: 540, d: 60, c: 0, lat: null, lng: null,
    area: '', dest: null, pri: 'nice', n: '', done: false, ...o,
  };
}

/** Sort by start, then push any item that starts before the previous one ends (+ travel) later. Never earlier. */
export function cascade(day: Day) {
  sortDay(day);
  cascadeOrdered(day);
}

/** Like cascade, but keeps the current array order (used after explicit inserts/reorders). */
export function cascadeOrdered(day: Day) {
  const it = day.items;
  for (let i = 1; i < it.length; i++) {
    const a = it[i - 1], b = it[i];
    const min = a.s + a.d + trm(a, b);
    if (b.s < min) b.s = up5(min);
  }
}

/** Close every gap: items run back-to-back with travel buffers from `start` (default: first item's start). */
export function tidy(day: Day, start?: number) {
  sortDay(day);
  const it = day.items;
  if (!it.length) return;
  let cur = start ?? it[0].s;
  it.forEach((x, i) => {
    if (i) cur += trm(it[i - 1], x);
    x.s = up5(cur);
    cur = x.s + x.d;
  });
}

/** Next quarter-hour after the last item (+ travel to `item`), or null for an empty day. */
export function nextSlot(day: Day, item: Item): number | null {
  sortDay(day);
  const last = day.items[day.items.length - 1];
  if (!last) return null;
  return up15(last.s + last.d + trm(last, item));
}

/** Reorder mapped items by nearest neighbour (unmapped items keep their slots) and re-time from the first start. */
export function routeOrder(day: Day): boolean {
  sortDay(day);
  const it = day.items;
  const g = it.filter(geo);
  if (g.length < 3) return false;
  const start = it[0].s;
  const order = nnOrder(g);
  const res: Item[] = [];
  let gi = 0;
  for (const x of it) res.push(geo(x) ? order[gi++] : x);
  let cur = start;
  res.forEach((x, i) => {
    if (i) cur += trm(res[i - 1], x);
    x.s = up5(cur);
    cur = x.s + x.d;
  });
  day.items = res;
  return true;
}

export interface DayStats {
  it: Item[];
  acts: Item[];
  actMin: number;
  travel: number;
  free: number;
  cost: number;
  first: number | undefined;
  last: number | null;
}

export function dayStats(day: Day): DayStats {
  const it = [...day.items].sort((a, b) => a.s - b.s);
  const acts = it.filter(isAct);
  const actMin = sum(acts, (x) => x.d);
  let travel = 0;
  for (let i = 1; i < it.length; i++) {
    if (geo(it[i - 1]) && geo(it[i])) travel += travelMin(km(it[i - 1], it[i]));
  }
  const W0 = 540, W1 = 1260;
  let busy = 0;
  for (const x of it) busy += Math.max(0, Math.min(W1, x.s + x.d) - Math.max(W0, x.s));
  return {
    it, acts, actMin, travel,
    free: Math.max(0, 720 - busy - travel),
    cost: sum(acts, (x) => x.c),
    first: it[0]?.s,
    last: it.length ? Math.max(...it.map((x) => x.s + x.d)) : null,
  };
}

export function findItem(t: Trip, id: string) {
  for (let i = 0; i < t.plan.length; i++) {
    const j = t.plan[i].items.findIndex((x) => x.id === id);
    if (j >= 0) return { di: i, day: t.plan[i], x: t.plan[i].items[j], j };
  }
  return null;
}

export function pullItem(t: Trip, id: string) {
  const f = findItem(t, id);
  if (!f) return null;
  f.day.items.splice(f.j, 1);
  return f;
}

export function startFor(t: Trip, day: Day, x: Item): number {
  return nextSlot(day, x) ?? paceOf(t.pace).start;
}

export function placeOnDay(t: Trip, di: number, x: Item, at?: number | null) {
  const day = t.plan[di];
  if (at != null) x.s = at;
  else x.s = startFor(t, day, x);
  if (!x.dest) x.dest = day.dest;
  day.items.push(x);
  cascade(day);
}

/** The day with the fewest activity minutes (excluding `exclude`; same base when the trip has several). */
export function lightest(t: Trip, exclude: number, dest?: string | null): number {
  let best = -1, bv = 1e9;
  t.plan.forEach((d, i) => {
    if (i === exclude) return;
    if (dest && t.dests.length > 1 && d.dest !== dest) return;
    const v = dayStats(d).actMin;
    if (v < bv) { bv = v; best = i; }
  });
  return best;
}

/** Centre of today's mapped activities, or the destination centre. */
export function dayCentre(day: Day): { lat: number; lng: number } | null {
  const c = dayStats(day).acts.filter(geo) as (Item & { lat: number; lng: number })[];
  if (c.length) return { lat: sum(c, (x) => x.lat) / c.length, lng: sum(c, (x) => x.lng) / c.length };
  const d = D[day.dest];
  return d ? { lat: d.center[0], lng: d.center[1] } : null;
}
