// One-click fixes, ported from the reference `FIXES`. Each takes a trip and returns a NEW trip plus a
// toast message, or `message: null` when nothing could be done (the store then discards the change).
import { D } from '../data/destinations';
import {
  cascade, cascadeOrdered, customItem, dayStats, findItem, lightest, placeOnDay, pullItem, routeOrder, sortDay,
} from './schedule';
import type { Trip, TripFix } from './types';
import { clone, up5 } from './util';

export interface FixResult { trip: Trip; message: string | null }

type Impl<A extends TripFix['a']> = (t: Trip, f: Extract<TripFix, { a: A }>) => string | null;

const impl: { [A in TripFix['a']]: Impl<A> } = {
  moveOut(t, f) {
    const day = t.plan[f.di];
    const cand = dayStats(day).acts
      .filter((x) => !x.done)
      .sort((a, b) => Number(a.pri === 'must') - Number(b.pri === 'must') || b.s - a.s)
      .slice(0, f.v);
    const moved: string[] = [];
    for (const x of cand) {
      const tgt = lightest(t, f.di, x.dest);
      if (tgt < 0) break;
      pullItem(t, x.id);
      placeOnDay(t, tgt, x);
      moved.push(`${x.t} → Day ${tgt + 1}`);
    }
    cascade(day);
    return moved.length ? `Moved ${moved.join(', ')}` : null;
  },
  cascade(t, f) {
    cascade(t.plan[f.di]);
    return 'Later items pushed back';
  },
  addTransit(t, f) {
    const day = t.plan[f.di];
    sortDay(day);
    const i = day.items.findIndex((x) => x.id === f.id);
    if (i < 0) return null;
    const prev = day.items[i - 1];
    const b = day.items[i];
    const s = prev ? prev.s + prev.d : b.s;
    day.items.splice(i, 0, customItem({ t: `Travel to ${b.area || (b.dest && D[b.dest]?.name) || 'next stop'}`, cat: 'transit', s: up5(s), d: f.v, dest: b.dest }));
    cascadeOrdered(day);
    return 'Travel block added';
  },
  breakAfter(t, f) {
    const day = t.plan[f.di];
    sortDay(day);
    const i = day.items.findIndex((x) => x.id === f.id);
    if (i < 0) return null;
    const a = day.items[i];
    day.items.splice(i + 1, 0, customItem({ t: 'Break', cat: 'rest', s: a.s + a.d, d: 30, dest: a.dest }));
    cascadeOrdered(day);
    return 'Break added';
  },
  addLunch(t, f) {
    const day = t.plan[f.di];
    sortDay(day);
    let at = 780, best = 1e9;
    for (const x of day.items) {
      const e = x.s + x.d;
      if (e >= 690 && e <= 900 && Math.abs(e - 780) < best) { best = Math.abs(e - 780); at = e; }
    }
    const m = customItem({ t: 'Lunch', cat: 'meal', s: up5(at), d: 60, dest: day.dest });
    const idx = day.items.findIndex((x) => x.s >= at);
    day.items.splice(idx < 0 ? day.items.length : idx, 0, m);
    cascadeOrdered(day);
    return 'Lunch added; later items moved back';
  },
  route(t, f) {
    return routeOrder(t.plan[f.di]) ? 'Reordered by distance' : null;
  },
  toEvening(t, f) {
    const g = findItem(t, f.id);
    if (!g) return null;
    g.x.s = Math.max(1005, g.x.s);
    cascade(g.day);
    return `${g.x.t} moved to the evening`;
  },
  moveTo(t, f) {
    const g = pullItem(t, f.id);
    if (!g) return null;
    placeOnDay(t, f.v, g.x);
    return `Moved to Day ${f.v + 1}`;
  },
  setAct(t, f) {
    t.budget.act = f.v;
    return 'Activities budget updated';
  },
};

export function applyFix(trip: Trip, f: TripFix): FixResult {
  const t = clone(trip);
  const fn = impl[f.a] as Impl<typeof f.a>;
  const message = fn(t, f as never);
  return { trip: message ? t : trip, message };
}

export const FIXES = impl;
