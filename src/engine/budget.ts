import { BCATS } from '../data/constants';
import { D } from '../data/destinations';
import { isAct, travellers } from './schedule';
import type { Budget, BudgetKey, Day, Expense, Prefs, Trip } from './types';
import { r500, sum } from './util';

type BudgetInput = { travelers: string[]; prefs?: Partial<Prefs>; plan: Pick<Day, 'dest' | 'items'>[] };

export function estBudget(t: BudgetInput): Budget {
  const n = travellers(t), tier = t.prefs?.tier ?? 1, rooms = Math.ceil(n / 2);
  const b: Budget = { travel: 0, stay: 0, food: 0, local: 0, act: 0, shop: 0, misc: 0 };
  t.plan.forEach((day, i) => {
    const d = D[day.dest];
    if (!d) return;
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

export const plannedTotal = (t: Pick<Trip, 'budget'>) => sum(BCATS, ([k]) => t.budget[k]);
export const spentBy = (t: Pick<Trip, 'expenses'>, k: BudgetKey) => sum(t.expenses.filter((e) => e.cat === k), (e) => e.amt);

/** Net balance per traveller: positive means they are owed money. */
export function balances(travelers: string[], expenses: Expense[]): number[] {
  const n = Math.max(1, travelers.length);
  const bal = travelers.map(() => 0);
  for (const e of expenses) {
    const among = (e.among?.length ? e.among : travelers.map((_, i) => i)).filter((i) => i < n);
    if (!among.length) continue;
    bal[e.paid] = (bal[e.paid] || 0) + e.amt;
    for (const i of among) bal[i] -= e.amt / among.length;
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
