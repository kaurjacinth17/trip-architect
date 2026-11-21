// Phase 10 helpers: calendar export, templates, travel legs, personal needs and weather checks. Pure functions.
import { PL } from '../data/destinations';
import { dayEndpoint } from './stays';
import { customItem, isAct, placeAtExact } from './schedule';
import { dayDate, fmtT } from './time';
import type { Item, LegMode, Needs, Trip, TravelLeg, Warning } from './types';
import { clone, uid } from './util';

/* --------------------------------------------------------------------------------------- calendar */

const pad = (n: number) => String(n).padStart(2, '0');
/** Local wall-clock time "YYYYMMDDTHHMMSS" for day `di` at `minute` (minutes may run past midnight). */
export function stamp(t: Pick<Trip, 'start'>, di: number, minute: number): string | null {
  const d = dayDate(t, di);
  if (!d) return null;
  d.setMinutes(d.getMinutes() + minute);
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
}
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
/** Fold lines at 75 octets as RFC 5545 asks. */
const fold = (line: string) => {
  const out: string[] = [];
  let cur = '';
  for (const ch of line) {
    if (new TextEncoder().encode(cur + ch).length > 74) { out.push(cur); cur = ' ' + ch; } else cur += ch;
  }
  return [...out, cur].join('\r\n');
};
const where = (x: Item) => (x.lat != null && x.lng != null ? `${x.area ? x.area + ' ' : ''}(${x.lat.toFixed(5)}, ${x.lng.toFixed(5)})` : x.area);

/** .ics for the whole trip or one day (`di`). Needs trip dates. Times are floating local times. */
export function toICS(t: Trip, di?: number): string | null {
  if (!t.start) return null;
  const now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Trip Architect//EN', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${esc(t.name)}`];
  t.plan.forEach((d, i) => {
    if (di != null && i !== di) return;
    for (const x of [...d.items].sort((a, b) => a.s - b.s)) {
      const a = stamp(t, i, x.s), b = stamp(t, i, x.s + x.d);
      if (!a || !b) continue;
      lines.push('BEGIN:VEVENT', `UID:${x.id}-${i}@trip-architect`, `DTSTAMP:${now}`, `DTSTART:${a}`, `DTEND:${b}`, `SUMMARY:${esc(x.t)}`);
      const loc = where(x);
      if (loc) lines.push(`LOCATION:${esc(loc)}`);
      const desc = [x.n, x.leg?.ref ? `Booking ${x.leg.ref}` : '', x.booking?.ref ? `Booking ${x.booking.ref}` : ''].filter(Boolean).join('\n');
      if (desc) lines.push(`DESCRIPTION:${esc(desc)}`);
      lines.push('END:VEVENT');
    }
  });
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

/** "Add to Google Calendar" link for one block. */
export function gcalLink(t: Pick<Trip, 'start' | 'name'>, di: number, x: Item): string | null {
  const a = stamp(t, di, x.s), b = stamp(t, di, x.s + x.d);
  if (!a || !b) return null;
  const q = new URLSearchParams({ action: 'TEMPLATE', text: x.t, dates: `${a}/${b}`, details: [x.n, `Part of ${t.name}`].filter(Boolean).join('\n') });
  const loc = where(x);
  if (loc) q.set('location', loc);
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

/* --------------------------------------------------------------------------------------- templates */

/** A shareable itinerary without expenses, payments, people's names, notes, stays or bookings. */
export function toTemplate(t: Trip): Trip {
  const c = clone(t);
  return {
    ...c, id: uid(), name: c.name, start: '', travelers: c.travelers.map((_, i) => `Traveller ${i + 1}`), expenses: [], payments: [], stays: [],
    notes: '', bookings: [], contacts: [], travelerUpi: undefined, me: undefined, cloud: undefined, sample: undefined, touched: undefined,
    budgetTotal: 0, pack: c.pack.map((p) => ({ ...p, done: false, assignedTo: undefined })),
    plan: c.plan.map((d) => ({ ...d, startLoc: undefined, endLoc: undefined, items: d.items.filter((x) => !x.stayRef).map((x) => ({ ...x, done: false, booking: undefined, n: x.leg ? '' : x.n, leg: x.leg ? { ...x.leg, ref: undefined, seat: undefined } : undefined })) })),
  };
}
/** "Use this itinerary": your own copy with your dates and travellers. */
export function fromTemplate(tpl: Trip, o: { start: string; travelers: string[]; name?: string }): Trip {
  const t = clone(tpl);
  const now = Date.now();
  return { ...t, id: uid(), name: o.name || t.name, start: o.start, travelers: o.travelers.length ? o.travelers : ['You'], created: now, updated: now,
    plan: t.plan.map((d) => ({ ...d, items: d.items.map((x) => ({ ...x, id: uid() })) })), wish: t.wish.map((x) => ({ ...x, id: uid() })) };
}

/* ------------------------------------------------------------------------------------------ legs */

export const LEG_MODES: [LegMode, string, string][] = [['train', 'Train', '🚆'], ['flight', 'Flight', '✈️'], ['bus', 'Bus', '🚌'], ['car', 'Car or cab', '🚗']];

/**
 * Add a travel leg to day `di`: a locked transit block from `depart` for `minutes`. A leg that arrives after
 * midnight moves the next day's start to an hour after arrival. Mutates `t`.
 */
export function addLeg(t: Trip, di: number, leg: TravelLeg, depart: number, minutes: number, cost = 0): Item {
  const x = customItem({ t: `${LEG_MODES.find((m) => m[0] === leg.mode)![1]}: ${leg.from} → ${leg.to}`, cat: 'transit', s: depart, d: Math.max(5, minutes), c: cost, locked: true, leg, dest: t.plan[di].dest, pri: 'must' });
  placeAtExact(t, di, x, depart);
  const arrive = depart + minutes;
  if (arrive > 1440 && t.plan[di + 1]) {
    const next = t.plan[di + 1];
    next.start = Math.max(next.start ?? 0, Math.min(arrive - 1440 + 60, 14 * 60));
  }
  return x;
}

/** Helper links for a leg: IRCTC, a flight search, Google Maps driving directions. */
export function legLinks(leg: TravelLeg, date: Date | null): { label: string; url: string }[] {
  const d = date ? `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` : '';
  const out: { label: string; url: string }[] = [];
  if (leg.mode === 'train') out.push({ label: 'IRCTC', url: 'https://www.irctc.co.in/nget/train-search' });
  if (leg.mode === 'flight') out.push({ label: 'Flight search', url: `https://www.google.com/travel/flights?q=${encodeURIComponent(`Flights from ${leg.from} to ${leg.to}${d ? ' on ' + d : ''}`)}` });
  out.push({ label: 'Driving time on Google Maps', url: `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(leg.from)}&destination=${encodeURIComponent(leg.to)}&travelmode=driving` });
  return out;
}

/* ------------------------------------------------------------------------- needs and weather checks */

export interface DayWeather { tmax: number; tmin: number; rainProb: number | null; rainMm: number | null; code?: number }
const OUTDOOR = new Set(['nature', 'activity', 'sight', 'heritage']);

/** Extra checks: late arrivals, personal needs and the weather forecast (append-only; never in reference parity). */
export function extraDayChecks(t: Trip, di: number, weather?: DayWeather | null): Warning[] {
  const W: Warning[] = [];
  const day = t.plan[di];
  const N = `Day ${di + 1}`;
  const prev = t.plan[di - 1];
  // A leg arriving late the evening before
  const lateLeg = prev?.items.filter((x) => x.leg).map((x) => ({ x, arr: x.s + x.d })).find((a) => a.arr >= 22 * 60 && a.arr <= 24 * 60);
  const first = [...day.items].sort((a, b) => a.s - b.s)[0];
  if (lateLeg && first && first.s < 9 * 60) {
    W.push({ lvl: 'caution', k: 'lateleg', id: first.id, title: `${LEG_MODES.find((m) => m[0] === lateLeg.x.leg!.mode)![1]} arrives ${fmtT(lateLeg.arr)}; ${N} starts at ${fmtT(first.s)}`, body: 'That leaves little sleep. Start later or move the first stop.' });
  }
  const n: Needs = t.needs || {};
  const acts = day.items.filter(isAct);
  if (n.kids) {
    const late = acts.find((x) => x.cat === 'night' || x.s + x.d > 22 * 60);
    if (late) W.push({ lvl: 'tip', k: 'kids', id: late.id, title: `${late.t} runs late for children`, body: 'You marked this trip as travelling with children.' });
  }
  if (n.senior) {
    const mins = acts.reduce((s, x) => s + x.d, 0);
    if (mins > 300) W.push({ lvl: 'caution', k: 'senior', title: `${N} has ${Math.round(mins / 6) / 10} h of sightseeing`, body: 'You chose a gentle pace for senior travellers; consider moving something to another day.' });
  }
  if (n.wheelchair) {
    const hard = acts.find((x) => x.cat === 'activity' || (x.pid && /trek|hike|climb|steps/i.test(PL[x.pid]?.desc || '')));
    if (hard) W.push({ lvl: 'tip', k: 'access', id: hard.id, title: `Check access at ${hard.t}`, body: 'You marked wheelchair access as a need; this may involve steps or rough ground.' });
  }
  if (weather) {
    const outdoor = acts.filter((x) => OUTDOOR.has(x.cat));
    const outMin = outdoor.reduce((s, x) => s + x.d, 0), actMin = acts.reduce((s, x) => s + x.d, 0);
    if ((weather.rainProb ?? 0) >= 60 && actMin && outMin / actMin >= 0.5) {
      W.push({ lvl: 'caution', k: 'rain', title: `Rain likely on ${N} (${weather.rainProb}%)`, body: 'Most of the day is outdoors. Keep an indoor option and an umbrella handy.' });
    }
    const midday = outdoor.find((x) => x.s < 15 * 60 && x.s + x.d > 12 * 60);
    if (weather.tmax >= 35 && midday) {
      W.push({ lvl: 'caution', k: 'heat', id: midday.id, title: `${Math.round(weather.tmax)}°C on ${N}: ${midday.t} is at midday`, body: 'Move outdoor stops to the morning or evening, and carry water.' });
    }
  }
  return W;
}

/** Where the day really starts (hotel or pin) for Today mode's "leave by". */
export const homeFor = (t: Trip, di: number) => dayEndpoint(t, di, 'start');
