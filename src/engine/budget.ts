import { BCATS } from '../data/constants';
import { inrOf } from './currency';
import { destView } from './dest';
import { isAct, travellers } from './schedule';
import { coversNight, hasRange, roomsFor, tripNights } from './stays';
import type { AutoKey, Budget, BudgetKey, Day, DestRecord, Expense, Prefs, Stay, Trip } from './types';
import { r500, sum } from './util';

type BudgetInput = { travelers: string[]; prefs?: Partial<Prefs>; plan: Pick<Day, 'dest' | 'items'>[]; destRecords?: Record<string, DestRecord> };

export function estBudget(t: BudgetInput): Budget {
  const n = travellers(t), tier = t.prefs?.tier ?? 1, rooms = Math.ceil(n / 2);
  const b: Budget = { travel: 0, stay: 0, food: 0, local: 0, act: 0, shop: 0, misc: 0 };
  t.plan.forEach((day, i) => {
    const d = destView(t, day.dest);
    if (!d?.cost) return; // no honest cost basis: the user enters their own figures
    if (i < t.plan.length - 1 || t.plan.length === 1) b.stay += d.cost.stay[tier] * rooms;
    b.food += d.cost.food[tier] * n;
    b.local += d.cost.local[tier] * n;
  });
  b.act = sum(t.plan.flatMap((d) => d.items.filter(isAct)), (x) => x.c) * n;
  const sub = b.stay + b.food + b.local + b.act;
  b.shop = sub * 0.08;
  b.misc = sub * 0.05;
  for (const k of Object.keys(b) as BudgetKey[]) b[k] = r500(b[k] + (b[k] ? 249 : 0));
  return b;
}

/* ------------------------------------------------------------------------------- automatic budget lines */

export const isAuto = (t: Pick<Trip, 'budgetMode'>, k: AutoKey) => t.budgetMode?.[k] === 'auto';

export type StayBasis = 'booked' | 'chosen' | 'shortlisted' | 'estimate' | 'none';
export interface StayLine { stay: Stay | null; basis: StayBasis; nights: number[]; perNight: number; rooms: number; total: number; dest: string }
export interface AutoStay { total: number; lines: StayLine[]; missingPrice: Stay[] }

/**
 * Auto Stay line, night by night: Booked stays covering the night; else your stay for those nights ("Set as my
 * stay"); else the cheapest priced Shortlisted stay covering it; else the destination's cost estimate (labelled as
 * such); else nothing. Price × rooms per night.
 */
export function autoStay(t: Trip): AutoStay {
  const tier = t.prefs?.tier ?? 1;
  const N = tripNights(t);
  const map = new Map<string, StayLine>();
  const missing = new Set<Stay>();
  const add = (key: string, l: Omit<StayLine, 'nights' | 'total'>, k: number, amount: number) => {
    const cur = map.get(key) || { ...l, nights: [], total: 0 };
    cur.nights.push(k);
    cur.total += amount;
    map.set(key, cur);
  };
  for (let k = 0; k < N; k++) {
    const dest = t.plan[k]?.dest || '';
    const cover = t.stays.filter((s) => coversNight(t, s, k));
    const booked = cover.filter((s) => s.status === 'booked');
    if (booked.length) {
      for (const s of booked) {
        if (!(s.price > 0)) missing.add(s);
        add(s.id, { stay: s, basis: 'booked', perNight: s.price, rooms: roomsFor(t, s), dest: s.dest }, k, s.price * roomsFor(t, s));
      }
      continue;
    }
    const chosen = cover.filter((s) => hasRange(s) && s.status !== 'idea');
    const pick = (list: Stay[]) => list.filter((s) => s.price > 0).sort((a, b) => a.price * roomsFor(t, a) - b.price * roomsFor(t, b))[0];
    const c = pick(chosen) || (chosen.length ? null : pick(cover.filter((s) => s.status === 'shortlisted')));
    if (chosen.length && !c) chosen.forEach((s) => missing.add(s));
    if (c) {
      add(c.id, { stay: c, basis: chosen.includes(c) ? 'chosen' : 'shortlisted', perNight: c.price, rooms: roomsFor(t, c), dest: c.dest }, k, c.price * roomsFor(t, c));
      continue;
    }
    const d = destView(t, dest);
    if (d?.cost) add('est:' + dest, { stay: null, basis: 'estimate', perNight: d.cost.stay[tier], rooms: roomsFor(t), dest }, k, d.cost.stay[tier] * roomsFor(t));
    else add('none:' + dest, { stay: null, basis: 'none', perNight: 0, rooms: roomsFor(t), dest }, k, 0);
  }
  const lines = [...map.values()];
  const anyStay = lines.some((l) => l.stay);
  // No stays at all: the same rounded figure the trip was created with, so the plan doesn't jump.
  const total = anyStay ? sum(lines, (l) => l.total) : estBudget(t).stay;
  return { total, lines, missingPrice: [...missing] };
}

/** Auto Activities line: entry fees and experiences in the itinerary × travellers. */
export const autoAct = (t: Pick<Trip, 'plan' | 'travelers'>) => sum(t.plan.flatMap((d) => d.items.filter(isAct)), (x) => x.c) * travellers(t);

/** The budget with Auto lines filled in from the plan. */
export function effectiveBudget(t: Trip): Budget {
  const b = { ...t.budget };
  if (isAuto(t, 'stay')) b.stay = Math.round(autoStay(t).total);
  if (isAuto(t, 'act')) b.act = Math.round(autoAct(t));
  return b;
}

export const plannedTotal = (t: Trip) => sum(BCATS, ([k]) => effectiveBudget(t)[k]);
export const spentBy = (t: Pick<Trip, 'expenses'>, k: BudgetKey) => sum(t.expenses.filter((e) => e.cat === k), inrOf);

/** Net balance per traveller: positive means they are owed money. */
export function balances(travelers: string[], expenses: Expense[]): number[] {
  const n = Math.max(1, travelers.length);
  const bal = travelers.map(() => 0);
  for (const e of expenses) {
    const among = (e.among?.length ? e.among : travelers.map((_, i) => i)).filter((i) => i < n);
    if (!among.length) continue;
    const amt = inrOf(e);
    bal[e.paid] = (bal[e.paid] || 0) + amt;
    for (const i of among) bal[i] -= amt / among.length;
  }
  return bal;
}

/** Greedy settle-up: list of [from, to, amount]. */
export function settleUp(bal: number[]): [number, number, number][] {
  const cr = bal.map((b, i) => ({ i, b })).filter((x) => x.b > 0.5).sort((a, b) => b.b - a.b);
  const db = bal.map((b, i) => ({ i, b: -b })).filter((x) => x.b > 0.5).sort((a, b) => b.b - a.b);
  const out: [number, number, number][] = [];
  while (cr.length && db.length) {
    const c = cr[0], d = db[0], m = Math.min(c.b, d.b);
    out.push([d.i, c.i, m]);
    c.b -= m;
    d.b -= m;
    if (c.b < 0.5) cr.shift();
    if (d.b < 0.5) db.shift();
  }
  return out;
}
