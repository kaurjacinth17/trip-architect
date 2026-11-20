// Which stay is "home" on a given day: the stay whose dates cover the night before it, else the booked (then
// shortlisted) stay in that day's destination. Used for day start/end locations and the distance-to-hotel check.
import { dayDate } from './time';
import type { Stay, Trip } from './types';

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function stayForDay(t: Trip, di: number): Stay | null {
  const date = dayDate(t, di);
  const withCoords = t.stays.filter((s) => s.lat != null && s.lng != null);
  if (date) {
    const day = iso(date);
    const prev = new Date(date);
    prev.setDate(prev.getDate() - 1);
    const night = iso(prev);
    const covers = (s: Stay, d: string) => {
      if (!s.checkin) return false;
      const out = s.checkout || (() => { const c = new Date(s.checkin + 'T00:00:00'); c.setDate(c.getDate() + s.nights); return iso(c); })();
      return s.checkin <= d && d < out;
    };
    const dated = withCoords.filter((s) => covers(s, day) || covers(s, night));
    const pick = dated.find((s) => s.status === 'booked') || dated[0];
    if (pick) return pick;
  }
  const dest = t.plan[di]?.dest;
  const same = withCoords.filter((s) => s.dest === dest);
  return same.find((s) => s.status === 'booked') || same.find((s) => s.status === 'shortlisted') || null;
}

/** Start or end point of a day: the custom point, the stay for that night (default), or none. */
export function dayEndpoint(t: Trip, di: number, which: 'start' | 'end'): { label: string; lat: number; lng: number } | null {
  const loc = which === 'start' ? t.plan[di]?.startLoc : t.plan[di]?.endLoc;
  if (loc?.kind === 'none') return null;
  if (loc?.kind === 'point') return loc;
  const s = stayForDay(t, di);
  return s ? { label: s.name || 'your hotel', lat: s.lat!, lng: s.lng! } : null;
}
