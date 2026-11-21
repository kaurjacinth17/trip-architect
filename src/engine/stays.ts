// Stays: which hotel is "home" each night, "Set as my stay for nights X–Y" (locked check-in and check-out blocks),
// and "Check prices" search links. Night k is the night after Day k+1 (0-based day index k); the last day has none.
import { cascadeOrdered, customItem, placeAtExact, sortDay, travellers } from './schedule';
import { dayDate } from './time';
import type { Item, Stay, Trip } from './types';

export const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Nights in the trip (a one-day trip still counts one, as the budget estimate does). */
export const tripNights = (t: Pick<Trip, 'plan'>) => Math.max(1, t.plan.length - 1);
export const roomsFor = (t: Pick<Trip, 'travelers'>, s?: Pick<Stay, 'rooms'>) => Math.max(1, s?.rooms || Math.ceil(travellers(t) / 2));
export const hasRange = (s: Stay): s is Stay & { from: number; to: number } => s.from != null && s.to != null && s.to >= s.from;
export const CHECK_IN = 14 * 60, CHECK_OUT = 11 * 60;

/** Does stay `s` cover night `k`? Night range first, then dates, then (no dates) the first `nights` nights in its destination. */
export function coversNight(t: Trip, s: Stay, k: number): boolean {
  if (k < 0 || k >= tripNights(t)) return false;
  if (hasRange(s)) return s.from <= k && k <= s.to;
  const date = dayDate(t, k);
  if (s.checkin && date) {
    const out = s.checkout || (() => { const c = new Date(s.checkin + 'T00:00:00'); c.setDate(c.getDate() + Math.max(1, s.nights)); return iso(c); })();
    const d = iso(date);
    return s.checkin <= d && d < out;
  }
  const own = t.plan.map((d, i) => (d.dest === s.dest && i < tripNights(t) ? i : -1)).filter((i) => i >= 0);
  return own.indexOf(k) >= 0 && own.indexOf(k) < Math.max(1, s.nights);
}

const rank = (s: Stay) => (s.status === 'booked' ? 0 : hasRange(s) ? 1 : s.status === 'shortlisted' ? 2 : 3);
const located = (s: Stay) => s.lat != null && s.lng != null;

/** The stay for night `k`: booked, then "my stay" (night range), then shortlisted, then any covering stay. */
export function stayForNight(t: Trip, k: number, needCoords = true): Stay | null {
  const c = t.stays.filter((s) => (!needCoords || located(s)) && coversNight(t, s, k));
  return c.sort((a, b) => rank(a) - rank(b))[0] || null;
}

function destFallback(t: Trip, di: number): Stay | null {
  const dest = t.plan[di]?.dest;
  const same = t.stays.filter((s) => located(s) && s.dest === dest);
  return same.find((s) => s.status === 'booked') || same.find(hasRange) || same.find((s) => s.status === 'shortlisted') || null;
}

/** Which stay is "home" on a given day: the night of that day, else the night before, else the destination's stay. */
export function stayForDay(t: Trip, di: number): Stay | null {
  return stayForNight(t, di) || stayForNight(t, di - 1) || destFallback(t, di);
}

/**
 * Start or end point of a day: the custom point, none, or the stay. The day starts from the night before's stay
 * (on a check-in day, where you slept) and ends at that night's stay (on a check-out day, the next hotel).
 */
export function dayEndpoint(t: Trip, di: number, which: 'start' | 'end'): { label: string; lat: number; lng: number } | null {
  const loc = which === 'start' ? t.plan[di]?.startLoc : t.plan[di]?.endLoc;
  if (loc?.kind === 'none') return null;
  if (loc?.kind === 'point') return loc;
  const [a, b] = which === 'start' ? [di - 1, di] : [di, di - 1];
  const s = stayForNight(t, a) || stayForNight(t, b) || destFallback(t, di);
  return s ? { label: s.name || 'your hotel', lat: s.lat!, lng: s.lng! } : null;
}

/** Remove the check-in/check-out blocks linked to a stay. */
export function removeStayBlocks(t: Trip, stayId: string) {
  for (const d of t.plan) {
    for (const x of d.items) {
      if (x.stayRef?.id !== stayId || x.t !== 'Arrive and check in') continue;
      // The generator's arrival block goes back to how it was, instead of disappearing.
      delete x.stayRef;
      delete x.gid;
      delete x.coordsFetchedAt;
      Object.assign(x, { locked: false, lat: null, lng: null, area: '' });
    }
    d.items = d.items.filter((x) => x.stayRef?.id !== stayId);
  }
  t.wish = t.wish.filter((x) => x.stayRef?.id !== stayId);
}

function block(s: Stay, kind: 'in' | 'out', at: number): Item {
  return customItem({
    t: kind === 'in' ? 'Check in' : 'Check out', cat: 'rest', s: at, d: 30, locked: true, stayRef: { id: s.id, kind },
    gid: s.gid, lat: s.lat, lng: s.lng, coordsFetchedAt: s.coordsFetchedAt, area: s.area, dest: s.dest, pri: 'must',
  });
}

/**
 * "Set as my stay for nights X–Y" (0-based night indices). Sets the stay's nights and dates, clears overlapping
 * ranges of other unbooked stays, and adds locked Check-in (Day from+1, 2 PM, or the generator's arrival block)
 * and Check-out (Day to+2, 11 AM) blocks. Mutates `t`.
 */
export function setStayNights(t: Trip, stayId: string, from: number, to: number): { in: Item | null; out: Item | null } {
  const s = t.stays.find((x) => x.id === stayId);
  if (!s) return { in: null, out: null };
  const last = tripNights(t) - 1;
  from = Math.max(0, Math.min(last, Math.floor(from)));
  to = Math.max(from, Math.min(last, Math.floor(to)));
  for (const o of t.stays) {
    if (o.id === s.id || o.status === 'booked' || !hasRange(o) || o.to < from || o.from > to) continue;
    clearStayNights(t, o.id);
  }
  removeStayBlocks(t, s.id);
  Object.assign(s, { from, to, nights: to - from + 1 });
  const ci = dayDate(t, from), co = dayDate(t, to + 1);
  if (ci && co) { s.checkin = iso(ci); s.checkout = iso(co); }
  if (!t.dests.includes(s.dest)) t.dests.push(s.dest);

  // Check-in: reuse the generator's "Arrive and check in" block on that day (its time is the arrival), else 2 PM.
  const day = t.plan[from];
  const arrive = day.items.find((x) => !x.stayRef && !x.locked && x.t === 'Arrive and check in');
  let cin: Item;
  if (arrive) {
    cin = Object.assign(arrive, { locked: true, stayRef: { id: s.id, kind: 'in' as const }, gid: s.gid, lat: s.lat, lng: s.lng, coordsFetchedAt: s.coordsFetchedAt, area: s.area });
    if (!cin.gid) delete cin.gid;
    if (cin.coordsFetchedAt == null) delete cin.coordsFetchedAt;
    sortDay(day);
    cascadeOrdered(day);
  } else {
    cin = block(s, 'in', CHECK_IN);
    placeAtExact(t, from, cin, CHECK_IN);
  }
  let cout: Item | null = null;
  if (t.plan[to + 1]) {
    cout = block(s, 'out', CHECK_OUT);
    placeAtExact(t, to + 1, cout, CHECK_OUT);
  }
  for (const x of [cin, cout]) if (x && !x.gid) delete x.gid;
  for (const x of [cin, cout]) if (x && x.coordsFetchedAt == null) delete x.coordsFetchedAt;
  return { in: cin, out: cout };
}

/** Forget a stay's night range (its blocks go too). */
export function clearStayNights(t: Trip, stayId: string) {
  const s = t.stays.find((x) => x.id === stayId);
  if (!s) return;
  delete s.from;
  delete s.to;
  removeStayBlocks(t, stayId);
}

export function removeStay(t: Trip, stayId: string) {
  removeStayBlocks(t, stayId);
  t.stays = t.stays.filter((x) => x.id !== stayId);
}

/** Default night range for a destination: its consecutive days in the plan (all nights if it has none). */
export function defaultNights(t: Trip, dest: string): [number, number] {
  const n = tripNights(t);
  const own = t.plan.map((d, i) => (d.dest === dest && i < n ? i : -1)).filter((i) => i >= 0);
  return own.length ? [own[0], own[own.length - 1]] : [0, n - 1];
}

/** Dates for a stay, if the trip has dates: from its night range, else its own check-in/check-out. */
export function stayDates(t: Trip, s: Stay): { checkin: string; checkout: string } | null {
  if (hasRange(s)) {
    const a = dayDate(t, s.from), b = dayDate(t, s.to + 1);
    if (a && b) return { checkin: iso(a), checkout: iso(b) };
  }
  if (s.checkin) {
    const out = s.checkout || (() => { const c = new Date(s.checkin + 'T00:00:00'); c.setDate(c.getDate() + Math.max(1, s.nights)); return iso(c); })();
    return { checkin: s.checkin, checkout: out };
  }
  return null;
}

export interface PriceLink { site: string; url: string }

/**
 * "Check prices": plain search URLs with the hotel, city and dates filled in. Trip Architect never shows or
 * stores live room prices; the user types the price they find. (Google Hotels may ask for the dates again.)
 */
export function priceLinks(o: { hotel: string; city: string; checkin?: string; checkout?: string; adults: number; rooms: number }): PriceLink[] {
  const q = [o.hotel, o.city].filter(Boolean).join(', ');
  const d = o.checkin && o.checkout && o.checkin < o.checkout;
  const p = (base: string, params: Record<string, string | number | false | undefined>) => {
    const u = new URL(base);
    for (const [k, v] of Object.entries(params)) if (v !== false && v != null && v !== '') u.searchParams.set(k, String(v));
    return u.toString();
  };
  return [
    { site: 'Google Hotels', url: p('https://www.google.com/travel/search', { q: d ? `${q} ${o.checkin} to ${o.checkout}` : q, hl: 'en-IN', gl: 'in' }) },
    { site: 'Booking.com', url: p('https://www.booking.com/searchresults.html', { ss: q, checkin: d && o.checkin, checkout: d && o.checkout, group_adults: o.adults, no_rooms: o.rooms }) },
    { site: 'Agoda', url: p('https://www.agoda.com/search', { textToSearch: q, checkIn: d && o.checkin, checkOut: d && o.checkout, adults: o.adults, rooms: o.rooms }) },
    { site: 'Expedia', url: p('https://www.expedia.co.in/Hotel-Search', { destination: q, startDate: d && o.checkin, endDate: d && o.checkout, adults: o.adults, rooms: o.rooms }) },
  ];
}
