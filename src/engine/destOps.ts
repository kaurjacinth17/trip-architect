// Add, insert, remove and reorder destinations in a trip. Every operation has a preview (what happens to each
// day) and returns a new trip; the original is never mutated.
import { destName, destView } from './dest';
import { km, travelMin } from './geo';
import { customItem, isAct } from './schedule';
import type { Day, DestRecord, Item, Trip } from './types';
import { clone, up15 } from './util';

export interface DayChange { day: number; was: string | null; now: string; newDay: boolean }
export interface DestPreview { trip: Trip; changes: DayChange[]; displaced: Item[]; summary: string }

const lastIndexOf = (plan: Day[], key: string) => plan.reduce((acc, d, i) => (d.dest === key ? i : acc), -1);

function arrivalDay(t: Trip, key: string, prevKey: string | null): Day {
  const d = destView(t, key);
  const from = prevKey ? destView(t, prevKey) : null;
  const items: Item[] = [];
  if (from && d && from.key !== d.key) {
    const dist = from.center && d.center ? km(from.center, d.center) : null;
    const tr = dist != null ? Math.max(120, up15(travelMin(dist))) : 240;
    items.push(customItem({ t: `Travel to ${d.name}`, cat: 'transit', s: 480, d: tr, dest: key, n: dist != null ? `About ${Math.round(dist)} km from ${from.name}. Check train and bus timings.` : `From ${from.name}. Check routes and timings.` }));
  }
  return { dest: key, label: (items.length ? 'Travel to ' : '') + (d?.name || ''), items };
}

/**
 * Insert destination `key` after the stop at `afterIndex` in `t.dests` (-1 = first).
 * mode 'add': adds `days` new days (the trip gets longer, later days shift).
 * mode 'reassign': takes `days` existing days right after that stop (trip length unchanged); their activities
 * move to the wishlist.
 */
export function previewInsertDest(t0: Trip, key: string, opts: { days: number; afterIndex: number; mode: 'add' | 'reassign'; record?: DestRecord }): DestPreview {
  const t = clone(t0);
  if (opts.record) t.destRecords = { ...(t.destRecords || {}), [key]: opts.record };
  if (t.dests.includes(key)) throw new Error('That destination is already in the trip');
  const n = Math.max(1, Math.min(30, Math.round(opts.days)));
  const prevKey = opts.afterIndex >= 0 ? t.dests[opts.afterIndex] ?? null : null;
  const at = prevKey ? lastIndexOf(t.plan, prevKey) + 1 : 0;
  const before = t.plan.map((d) => d.dest);
  const displaced: Item[] = [];
  const dests = [...t.dests];
  dests.splice(opts.afterIndex + 1, 0, key);
  t.dests = dests;

  if (opts.mode === 'add') {
    const fresh = Array.from({ length: n }, (_, i) => (i === 0 ? arrivalDay(t, key, prevKey) : { dest: key, label: destName(t, key), items: [] as Item[] }));
    t.plan.splice(at, 0, ...fresh);
  } else {
    const take = Math.min(n, Math.max(0, t.plan.length - 1));
    const start = Math.min(at, t.plan.length - take);
    for (let i = start; i < start + take; i++) {
      displaced.push(...t.plan[i].items.filter(isAct));
      t.plan[i] = i === start ? arrivalDay(t, key, start > 0 ? t.plan[start - 1].dest : null) : { dest: key, label: destName(t, key), items: [] };
    }
  }
  t.wish.push(...displaced);
  t.days = t.plan.length;
  const changes: DayChange[] = t.plan.map((d, i) => {
    const newDay = opts.mode === 'add' && i >= at && i < at + n;
    const was = newDay ? null : opts.mode === 'add' ? before[i >= at + n ? i - n : i] : before[i];
    return { day: i + 1, was, now: d.dest, newDay };
  });
  const name = destName(t, key);
  const summary = opts.mode === 'add'
    ? `Adds ${n} day${n > 1 ? 's' : ''} for ${name}${prevKey ? ` after ${destName(t, prevKey)}` : ' at the start'}. The trip becomes ${t.plan.length} days${at < t0.plan.length ? `; later days move ${n} day${n > 1 ? 's' : ''} later` : ''}.`
    : `Uses ${n} existing day${n > 1 ? 's' : ''} for ${name}. ${displaced.length ? `${displaced.length} activit${displaced.length > 1 ? 'ies move' : 'y moves'} to the wishlist.` : 'No activities are displaced.'}`;
  return { trip: t, changes, displaced, summary };
}

/** Remove a destination: its days are removed and their activities go to the wishlist. */
export function previewRemoveDest(t0: Trip, key: string): DestPreview {
  const t = clone(t0);
  if (t.dests.length < 2) throw new Error('A trip needs at least one destination');
  const displaced = t.plan.filter((d) => d.dest === key).flatMap((d) => d.items.filter(isAct));
  t.dests = t.dests.filter((k) => k !== key);
  t.plan = t.plan.filter((d) => d.dest !== key);
  if (!t.plan.length) t.plan = [{ dest: t.dests[0], label: '', items: [] }];
  t.wish = [...t.wish.filter((w) => w.dest !== key), ...displaced.map((x) => x)];
  t.days = t.plan.length;
  if (t.destRecords) { const r = { ...t.destRecords }; delete r[key]; t.destRecords = r; }
  const removedDays = t0.plan.filter((d) => d.dest === key).length;
  return {
    trip: t, displaced, changes: t.plan.map((d, i) => ({ day: i + 1, was: d.dest, now: d.dest, newDay: false })),
    summary: `Removes ${destName(t0, key)} and its ${removedDays} day${removedDays === 1 ? '' : 's'}. ${displaced.length ? `${displaced.length} activit${displaced.length > 1 ? 'ies go' : 'y goes'} to the wishlist.` : ''}`.trim(),
  };
}

/** Move a destination in the route; its days move with it (days keep their order within each destination). */
export function moveDest(t0: Trip, from: number, to: number): Trip {
  const t = clone(t0);
  if (from === to || from < 0 || to < 0 || from >= t.dests.length || to >= t.dests.length) return t;
  const [k] = t.dests.splice(from, 1);
  t.dests.splice(to, 0, k);
  const order = new Map(t.dests.map((d, i) => [d, i]));
  t.plan = t.plan.map((d, i) => ({ d, i })).sort((a, b) => (order.get(a.d.dest) ?? 99) - (order.get(b.d.dest) ?? 99) || a.i - b.i).map((x) => x.d);
  return t;
}

/** Days allotted to a destination by default when adding it. */
export const defaultDaysFor = (t: Trip, key: string, record?: DestRecord) => {
  const v = destView(record ? { destRecords: { ...(t.destRecords || {}), [key]: record } } : t, key);
  return v?.days[0] ?? 2;
};

