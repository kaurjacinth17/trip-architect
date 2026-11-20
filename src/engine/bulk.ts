// Bulk actions on selected blocks. Locked blocks keep their times; shifts report how many were skipped.
import { cascade, findItem, isAct, pullItem, sortDay } from './schedule';
import type { Trip } from './types';
import { clone } from './util';

export interface BulkResult { trip: Trip; changed: number; skipped: number }

/** Move blocks to another day, keeping their times (later items there move back if they clash). */
export function bulkMoveToDay(t0: Trip, ids: string[], di: number): BulkResult {
  const t = clone(t0);
  let changed = 0;
  for (const id of ids) {
    const f = findItem(t, id);
    if (!f || f.di === di) continue;
    pullItem(t, id);
    t.plan[di].items.push(f.x);
    changed++;
  }
  cascade(t.plan[di]);
  return { trip: t, changed, skipped: 0 };
}

/** Shift blocks by ±minutes. Locked blocks are left alone. Times stay within the day. */
export function bulkShift(t0: Trip, ids: string[], delta: number): BulkResult {
  const t = clone(t0);
  let changed = 0, skipped = 0;
  const touched = new Set<number>();
  for (const id of ids) {
    const f = findItem(t, id);
    if (!f) continue;
    if (f.x.locked) { skipped++; continue; }
    f.x.s = Math.max(0, Math.min(1439 - f.x.d, f.x.s + delta));
    touched.add(f.di);
    changed++;
  }
  for (const di of touched) sortDay(t.plan[di]);
  return { trip: t, changed, skipped };
}

export function bulkDelete(t0: Trip, ids: string[]): BulkResult {
  const t = clone(t0);
  let changed = 0;
  for (const id of ids) if (pullItem(t, id)) changed++;
  return { trip: t, changed, skipped: 0 };
}

export function bulkToWishlist(t0: Trip, ids: string[]): BulkResult {
  const t = clone(t0);
  let changed = 0, skipped = 0;
  for (const id of ids) {
    const f = findItem(t, id);
    if (!f) continue;
    if (!isAct(f.x)) { skipped++; continue; } // meals, travel and free time aren't wishlist material
    pullItem(t, id);
    t.wish.push({ ...f.x, locked: false });
    changed++;
  }
  return { trip: t, changed, skipped };
}

/** "Running late?" Shift everything from `fromMinute` onwards on a day, except locked blocks. */
export function shiftRestOfDay(t0: Trip, di: number, fromMinute: number, delta: number): BulkResult {
  const ids = t0.plan[di].items.filter((x) => x.s >= fromMinute && !x.done).map((x) => x.id);
  return bulkShift(t0, ids, delta);
}
