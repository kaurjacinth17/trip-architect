// Opening hours as Google-style periods in minutes of the week (Sunday 00:00 = 0, Saturday 23:59 = 10079).
// A period with close === null means open 24 hours. Periods may wrap past midnight (and past Saturday night).
export interface Period { open: number; close: number | null }

export const WEEK = 7 * 1440;
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** The [start, end) interval of a period, end > start (wrapping periods get +1 week). */
const span = (p: Period): [number, number] => {
  if (p.close == null) return [0, WEEK * 2]; // open 24/7
  return [p.open, p.close > p.open ? p.close : p.close + WEEK];
};

/** Is the place open at this weekday (0 = Sunday) and minute of the day? */
export function isOpenAt(periods: Period[], weekday: number, minute: number): boolean {
  if (!periods.length) return false;
  const t = weekday * 1440 + minute;
  return periods.some((p) => { const [a, b] = span(p); return (t >= a && t < b) || (t + WEEK >= a && t + WEEK < b); });
}

export type VisitFit =
  | { ok: true }
  | { ok: false; reason: 'closed-day'; weekday: string }
  | { ok: false; reason: 'closed-at-start'; opensAt: number | null }
  | { ok: false; reason: 'closes-early'; closesAt: number };

/** Does a visit of `dur` minutes starting at `start` (minute of day, may exceed 1440) fit in one opening period? */
export function visitFits(periods: Period[], weekday: number, start: number, dur: number): VisitFit {
  if (!periods.length) return { ok: false, reason: 'closed-day', weekday: WEEKDAY_NAMES[weekday] };
  const t = weekday * 1440 + start;
  for (const p of periods) {
    const [a, b] = span(p);
    for (const off of [0, WEEK]) {
      if (t + off >= a && t + off < b) {
        if (t + off + dur <= b) return { ok: true };
        return { ok: false, reason: 'closes-early', closesAt: ((b - off) % WEEK) % 1440 };
      }
    }
  }
  if (closedAllDay(periods, weekday)) return { ok: false, reason: 'closed-day', weekday: WEEKDAY_NAMES[weekday] };
  const later = periods.map((p) => span(p)[0]).filter((a) => a >= weekday * 1440 && a < (weekday + 1) * 1440 && a > t).sort((x, y) => x - y)[0];
  return { ok: false, reason: 'closed-at-start', opensAt: later != null ? later % 1440 : null };
}

/** True if no opening period touches that day. */
export function closedAllDay(periods: Period[], weekday: number): boolean {
  const d0 = weekday * 1440, d1 = d0 + 1440;
  return !periods.some((p) => {
    const [a, b] = span(p);
    return (a < d1 && b > d0) || (a < d1 + WEEK && b > d0 + WEEK);
  });
}

export const is24h = (periods: Period[]) => periods.some((p) => p.close == null);
