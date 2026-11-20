// Best and avoid months from monthly climate normals (Open-Meteo, 10-year average).
//
// The rule (shown to users on destination pages):
//   AVOID a month if  average daily high ≥ 37 °C (very hot)
//                 or  average daily high ≤ 4 °C and low ≤ −5 °C (very cold)
//                 or  rainfall ≥ 200 mm, or rain on ≥ 15 days (wet season)
//   BEST if          average daily high is 15–32 °C, rainfall < 75 mm and rain on < 8 days
//   otherwise OK.
import { MONTHS } from '../data/constants';
import type { MonthClimate } from './types';

export type MonthVerdict = 'good' | 'ok' | 'poor';
export interface MonthRating { month: number; verdict: MonthVerdict; reason: string }

export const BEST_MONTHS_RULE =
  'Best months have average highs of 15–32 °C, under 75 mm of rain and fewer than 8 rainy days. Months are marked “avoid” when highs average 37 °C or more, when it’s freezing (highs ≤ 4 °C, lows ≤ −5 °C), or with 200 mm of rain or 15+ rainy days.';

export function rateMonth(c: MonthClimate | null | undefined, month: number): MonthRating {
  if (!c) return { month, verdict: 'ok', reason: 'No climate data' };
  if (c.tmax >= 37) return { month, verdict: 'poor', reason: `Very hot (highs around ${Math.round(c.tmax)} °C)` };
  if (c.tmax <= 4 && c.tmin <= -5) return { month, verdict: 'poor', reason: `Freezing (lows around ${Math.round(c.tmin)} °C)` };
  if (c.rainMm >= 200 || c.rainDays >= 15) return { month, verdict: 'poor', reason: `Wet (about ${Math.round(c.rainMm)} mm over ${Math.round(c.rainDays)} days)` };
  if (c.tmax >= 15 && c.tmax <= 32 && c.rainMm < 75 && c.rainDays < 8) return { month, verdict: 'good', reason: `Comfortable (${Math.round(c.tmin)}–${Math.round(c.tmax)} °C, little rain)` };
  const why = c.tmax > 32 ? 'Warm' : c.tmax < 15 ? 'Cool' : 'Some rain';
  return { month, verdict: 'ok', reason: `${why} (${Math.round(c.tmin)}–${Math.round(c.tmax)} °C, ${Math.round(c.rainMm)} mm rain)` };
}

export function bestMonths(normals: (MonthClimate | null)[] | null | undefined) {
  const ratings = Array.from({ length: 12 }, (_, i) => rateMonth(normals?.[i], i + 1));
  return {
    ratings,
    good: ratings.filter((r) => r.verdict === 'good').map((r) => r.month),
    poor: ratings.filter((r) => r.verdict === 'poor').map((r) => r.month),
  };
}

/** "Oct–Mar" style ranges, wrapping around the year. */
export function monthRanges(months: number[]): string {
  if (!months.length) return '';
  if (months.length === 12) return 'all year';
  const set = new Set(months);
  let start = 1;
  while (set.has(start) && set.size < 12) start = start === 12 ? 1 : start + 1; // first month not in set
  const out: string[] = [];
  let run: number[] = [];
  for (let k = 0; k < 12; k++) {
    const m = ((start - 1 + k) % 12) + 1;
    if (set.has(m)) run.push(m);
    else if (run.length) { out.push(run.length > 1 ? `${MONTHS[run[0] - 1]}–${MONTHS[run[run.length - 1] - 1]}` : MONTHS[run[0] - 1]); run = []; }
  }
  if (run.length) out.push(run.length > 1 ? `${MONTHS[run[0] - 1]}–${MONTHS[run[run.length - 1] - 1]}` : MONTHS[run[0] - 1]);
  return out.join(', ');
}

/** One-line best-time summary built from the rule (never hand-written for non-curated places). */
export function bestTimeText(normals: (MonthClimate | null)[] | null | undefined): string {
  if (!normals?.some(Boolean)) return 'No climate data yet.';
  const { good, poor } = bestMonths(normals);
  const parts = [];
  if (good.length) parts.push(`Most comfortable: ${monthRanges(good)}.`);
  if (poor.length) parts.push(`Hardest: ${monthRanges(poor)}.`);
  if (!good.length && !poor.length) parts.push('No month stands out; conditions are moderate most of the year.');
  return parts.join(' ') + ' Based on 10-year climate averages.';
}
