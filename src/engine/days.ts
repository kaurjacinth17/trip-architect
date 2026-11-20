// Day operations: insert, delete, duplicate, swap and reorder days. Dates are positional (start date + index),
// so moving a day moves its plan to another date. Each returns a new trip.
import { isAct } from './schedule';
import type { Day, Trip } from './types';
import { clone, uid } from './util';

const done = (t: Trip) => { t.days = t.plan.length; return t; };

/** Insert an empty day at index `at` (0 = before Day 1), in the destination of its neighbour. */
export function insertDay(t0: Trip, at: number): Trip {
  const t = clone(t0);
  const i = Math.max(0, Math.min(at, t.plan.length));
  const near = t.plan[i - 1] || t.plan[i];
  t.plan.splice(i, 0, { dest: near?.dest || t.dests[0], label: '', items: [] });
  return done(t);
}

/** Delete a day; its activities go to the wishlist. A trip keeps at least one day. */
export function deleteDay(t0: Trip, di: number): Trip {
  if (t0.plan.length < 2) throw new Error('A trip needs at least one day');
  const t = clone(t0);
  const [d] = t.plan.splice(di, 1);
  t.wish.push(...d.items.filter(isAct).map((x) => ({ ...x, locked: false })));
  return done(t);
}

/** Copy a day (new item ids) and insert the copy right after it. */
export function duplicateDay(t0: Trip, di: number): Trip {
  const t = clone(t0);
  const copy: Day = { ...clone(t.plan[di]), items: t.plan[di].items.map((x) => ({ ...x, id: uid(), done: false })) };
  copy.label = copy.label ? `${copy.label} (copy)` : '';
  t.plan.splice(di + 1, 0, copy);
  return done(t);
}

export function swapDays(t0: Trip, a: number, b: number): Trip {
  const t = clone(t0);
  if (a === b || !t.plan[a] || !t.plan[b]) return t;
  [t.plan[a], t.plan[b]] = [t.plan[b], t.plan[a]];
  return t;
}

/** Move day `from` to position `to` (drag to reorder). */
export function moveDay(t0: Trip, from: number, to: number): Trip {
  const t = clone(t0);
  if (from === to || !t.plan[from] || to < 0 || to >= t.plan.length) return t;
  const [d] = t.plan.splice(from, 1);
  t.plan.splice(to, 0, d);
  return t;
}
