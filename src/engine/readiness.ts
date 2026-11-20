import { analyzeTrip } from './checks';
import { isAct } from './schedule';
import type { Trip, TripAnalysis } from './types';
import { sum } from './util';

export interface Readiness {
  A: TripAnalysis;
  it: number;
  bud: number;
  core: string[];
  stay: number;
  pending: number;
  booked: number;
  nights: number;
  pk: number;
  all: number;
}

export function readiness(t: Trip, A: TripAnalysis = analyzeTrip(t)): Readiness {
  const okDays = t.plan.filter((d, i) => d.items.some(isAct) && !A.days[i].some((w) => w.lvl === 'alert')).length;
  const it = t.plan.length ? Math.round((okDays / t.plan.length) * 100) : 0;
  const core = (['travel', 'stay', 'food', 'local'] as const).filter((k) => !(t.budget[k] > 0));
  const bud = t.budgetTotal && !core.length ? 100 : Math.round(((4 - core.length) / 4) * 80 + (t.budgetTotal ? 20 : 0));
  const nights = Math.max(1, t.plan.length - 1);
  const booked = sum(t.stays.filter((s) => s.status === 'booked'), (s) => s.nights);
  const stay = Math.min(100, Math.round((booked / nights) * 100));
  const pending = t.stays.filter((s) => s.status !== 'booked').length;
  const pk = t.pack.length ? Math.round((t.pack.filter((x) => x.done).length / t.pack.length) * 100) : 0;
  return { A, it, bud, core, stay, pending, booked, nights, pk, all: Math.round((it + bud + stay + pk) / 4) };
}
