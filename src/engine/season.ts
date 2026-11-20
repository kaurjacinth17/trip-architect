import type { Dest } from './types';
import { r500, sum } from './util';

export type Season = 'good' | 'ok' | 'poor';
export const seasonOf = (d: Pick<Dest, 'good' | 'poor'>, m: number): Season =>
  d.good.includes(m) ? 'good' : d.poor.includes(m) ? 'poor' : 'ok';

/** On-ground estimate per person for `days` at a cost tier (stay on twin share + food + local + must-see fees). */
export function estPP(d: Dest, days: number, tier = 1): number {
  const c = d.cost;
  const act = sum(d.pl.filter((p) => p.must), (p) => p.c);
  return r500(days * (c.stay[tier] / 2 + c.food[tier] + c.local[tier]) + act);
}
export const estRange = (d: Dest): [number, number] =>
  [estPP(d, d.days[0], 1) * 0.85, estPP(d, d.days[1], 1) * 1.1].map(r500) as [number, number];
