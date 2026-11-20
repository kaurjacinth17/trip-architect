// Realism checks, ported rule-for-rule from the reference `analyzeDay` / `analyzeTrip`.
import { BCATS, MONTHS, WDL, paceOf } from '../data/constants';
import { PL } from '../data/destinations';
import { inrOf } from './currency';
import { visitFits, type Period } from './hours';
import { dayEndpoint } from './stays';
import { destView } from './dest';
import { seasonOf } from './season';
import { geo, km, nnKm, pathKm, travelMin } from './geo';
import { dayStats, isAct, travellers } from './schedule';
import { dayDate, fmtT, hm } from './time';
import type { Trip, TripAnalysis, Warning } from './types';
import { daysUntil, inr, plural, r500, sum, up5 } from './util';

/**
 * Live context for the checks that need it. Opening hours and travel times are Google content fetched for the open
 * day and held in memory only. `legacyOnly` runs exactly the reference rules (used by the parity tests).
 */
export interface CheckCtx {
  hours?: Record<string, Period[] | undefined>;
  closed?: Record<string, 'temporarily' | 'permanently' | undefined>;
  /** live travel minutes for consecutive blocks, keyed "fromId>toId" */
  travel?: Record<string, number | undefined>;
  legacyOnly?: boolean;
}

/** Thresholds for the newer checks (documented on the About page). */
export const HOTEL_FAR_MIN = 40;
export const CHECKIN_MORNING_MAX = 120;
export const CHECKOUT_MORNING_MAX = 150;

export function analyzeDay(t: Trip, di: number, ctx: CheckCtx = {}): Warning[] {
  const day = t.plan[di];
  const W: Warning[] = [];
  const st = dayStats(day);
  const { it, acts, actMin } = st;
  const pace = paceOf(day.pace || t.pace);
  const N = `Day ${di + 1}`;
  const date = dayDate(t, di);
  const isEdge = (di === 0 || di === t.plan.length - 1) && t.plan.length > 1;
  const cap = isEdge ? Math.round(pace.cap * 0.75) : pace.cap;

  if (!it.length) {
    W.push({ lvl: 'caution', k: 'empty', title: `${N} is empty`, body: 'Add places from the library or your wishlist, or keep it as a deliberate rest day.', fix: { l: 'Open library', a: 'ptab', v: 'lib' } });
    return W;
  }

  if (actMin > cap + 45) {
    let over = actMin - cap, k = 0;
    const cand = [...acts].filter((x) => !x.done).sort((a, b) => Number(a.pri === 'must') - Number(b.pri === 'must') || b.s - a.s);
    for (const x of cand) {
      if (over <= 0) break;
      over -= x.d;
      k++;
    }
    W.push({
      lvl: 'alert', k: 'over', title: `${N} looks overloaded`,
      body: `You’ve planned ${plural(acts.length, 'activity', 'activities')} and about ${hm(actMin)} of sightseeing, plus ${hm(st.travel)} getting around. A ${pace.l.toLowerCase()} pace fits roughly ${hm(cap)}${isEdge ? ' on a travel day' : ''}. Consider moving ${k} to another day.`,
      fix: k && t.plan.length > 1 ? { l: `Move ${k} to lighter days`, a: 'moveOut', di, v: k } : null,
    });
  } else if (actMin > cap) {
    W.push({ lvl: 'caution', k: 'heavy', title: `${N} is on the heavy side`, body: `About ${hm(actMin)} of activities against a ${pace.l.toLowerCase()} pace of ${hm(cap)}. Fine if it’s a day you care about.` });
  }

  if (acts.length > pace.max + 2 && actMin <= cap + 45) {
    W.push({ lvl: 'caution', k: 'many', title: `${plural(acts.length, 'stop')} on ${N}`, body: 'Lots of short stops add queueing, parking and ticket time that isn’t in the durations.' });
  }

  for (let i = 1; i < it.length; i++) {
    const a = it[i - 1], b = it[i];
    const end = a.s + a.d, gap = b.s - end;
    const d = geo(a) && geo(b) ? km(a, b) : null;
    const tr = ctx.travel?.[`${a.id}>${b.id}`] ?? travelMin(d);
    if (gap < 0 && (a.locked || b.locked)) {
      const lock = b.locked ? b : a, other = b.locked ? a : b;
      W.push({
        lvl: 'alert', k: 'lock', id: other.id, title: `${other.t} clashes with locked ${lock.t}`,
        body: `${lock.t} is locked at ${fmtT(lock.s)}–${fmtT(lock.s + lock.d)}, so it won’t move; ${other.t} ${b.locked ? 'runs into it' : 'starts before it ends'}.`,
        fix: !other.locked ? { l: `Move ${other.t} after it`, a: 'afterLock', di, id: other.id, lockId: lock.id } : null,
      });
      continue;
    }
    if (gap < 0) {
      W.push({ lvl: 'alert', k: 'overlap', id: b.id, title: `${b.t} overlaps ${a.t}`, body: `${a.t} runs until ${fmtT(end)} but ${b.t} starts at ${fmtT(b.s)}.`, fix: { l: 'Push later items back', a: 'cascade', di } });
      continue;
    }
    if (d != null && d > 40 && !it.slice(0, i).some((x) => x.cat === 'transit' && x.s >= a.s)) {
      W.push({ lvl: 'alert', k: 'far', id: b.id, title: 'Intercity jump', body: `${a.t} and ${b.t} are about ${Math.round(d)} km apart, roughly ${hm(tr)} by road. That’s a travel half-day, not a hop.`, fix: { l: 'Add travel block', a: 'addTransit', di, id: b.id, v: tr } });
    } else if (d != null && gap < tr) {
      W.push({
        lvl: tr - gap > 15 ? 'alert' : 'caution', k: 'transfer', id: b.id, title: `Tight transfer to ${b.t}`,
        body: `It’s ${d < 1.5 ? Math.round(d * 1000) + ' m' : d.toFixed(1) + ' km'} from ${a.t}, about ${tr} min${d < 1.5 ? ' on foot' : ' by auto or cab'}, but you’ve left ${Math.max(0, gap)} min.`,
        fix: b.locked ? null : { l: `Start ${b.t} at ${fmtT(up5(end + tr))}`, a: 'cascade', di },
      });
    }
    if (a.d >= 180 && b.d >= 120 && isAct(a) && isAct(b) && gap < 30) {
      W.push({ lvl: 'caution', k: 'fatigue', id: b.id, title: 'Long stretch with no break', body: `${hm(a.d)} at ${a.t} straight into ${hm(b.d)} at ${b.t}. Build in a pause.`, fix: { l: 'Insert a 30 min break', a: 'breakAfter', di, id: a.id } });
    }
  }

  const fs = st.first!, le = st.last!;
  if (fs < 750 && le > 870) {
    const meal = it.some((x) => ((x.cat === 'meal' || x.cat === 'food' || x.cat === 'cafe') && x.s >= 690 && x.s <= 900) || (x.cat === 'transit' && x.d >= 180 && x.s <= 780 && x.s + x.d >= 810));
    let gapOK = false;
    for (let i = 1; i < it.length; i++) {
      const e = it[i - 1].s + it[i - 1].d;
      if (it[i].s - e >= 60 && e >= 690 && e <= 870) gapOK = true;
    }
    if (!meal && !gapOK) W.push({ lvl: 'caution', k: 'lunch', title: `No lunch break on ${N}`, body: 'Activities run straight through midday. Add a meal block so the afternoon doesn’t collapse.', fix: { l: 'Add lunch break', a: 'addLunch', di } });
  }
  if (le - fs > 13 * 60 && !it.some((x) => x.cat === 'transit' && x.d >= 240)) {
    W.push({ lvl: 'caution', k: 'span', title: `${hm(le - fs)} day`, body: `From ${fmtT(fs)} to ${fmtT(le)}. Make sure that’s intentional.` });
  }
  if (le > 23 * 60) W.push({ lvl: 'caution', k: 'late', title: 'Finishes very late', body: `The last activity ends at ${fmtT(le)}.` });

  const g = acts.filter(geo);
  const clusters = new Set(g.map((x) => x.area));
  if (g.length >= 4) {
    const cur = pathKm(g), best = nnKm(g);
    if (cur - best > 3 && best < cur * 0.75) W.push({ lvl: 'tip', k: 'route', title: 'A shorter route exists', body: `Reordering ${N} by distance saves about ${Math.round(cur - best)} km of back-and-forth (${Math.round(cur)} km → ${Math.round(best)} km).`, fix: { l: 'Reorder by route', a: 'route', di } });
  } else if (clusters.size >= 4) {
    W.push({ lvl: 'caution', k: 'zig', title: `Zig-zagging across ${clusters.size} areas`, body: 'Grouping nearby places on the same day cuts travel time.' });
  }

  for (const x of acts) {
    const p = x.pid ? PL[x.pid] : undefined;
    if (!p) continue;
    if (p.best === 'eve' && x.s + x.d < 16 * 60) W.push({ lvl: 'tip', k: 'time', id: x.id, title: `${x.t} is better in the evening`, body: 'It’s at its best around sunset; you’ve scheduled it in daylight hours.', fix: x.locked ? null : { l: 'Move to evening', a: 'toEvening', di, id: x.id } });
    if (p.best === 'am' && x.s >= 13 * 60 && p.d < 300) W.push({ lvl: 'tip', k: 'time', id: x.id, title: `${x.t} is better in the morning`, body: 'Morning means softer light, smaller crowds and less heat.' });
    if (p.wd != null && date && date.getDay() !== p.wd) {
      const tgt = t.plan.findIndex((_, j) => dayDate(t, j)?.getDay() === p.wd);
      W.push({
        lvl: 'alert', k: 'weekday', id: x.id, title: `${x.t} runs on ${WDL[p.wd]}`,
        body: `${N} is a ${WDL[date.getDay()].slice(0, -1)}.${tgt >= 0 ? ` Day ${tgt + 1} is a ${WDL[p.wd].slice(0, -1)}.` : ' None of your trip days match.'}`,
        fix: tgt >= 0 && !x.locked ? { l: `Move to Day ${tgt + 1}`, a: 'moveTo', di, id: x.id, v: tgt } : null,
      });
    }
    if (p.d >= 360 && actMin - p.d > 150) W.push({ lvl: 'alert', k: 'daytrip', id: x.id, title: `${x.t} is a full-day trip`, body: `It takes about ${hm(p.d)} on its own; ${hm(actMin - p.d)} of other plans on the same day won’t fit comfortably.` });
  }

  if (t.plan.length > 2 && !isEdge && actMin < 120 && acts.length) {
    W.push({ lvl: 'tip', k: 'light', title: `${N} is light`, body: `Only ${hm(actMin)} planned. Good for rest, or pull something from your wishlist.`, fix: t.wish.length ? { l: 'Open wishlist', a: 'ptab', v: 'wish' } : null });
  }
  if (!ctx.legacyOnly) W.push(...extendedDayChecks(t, di, ctx, st));
  return W;
}

export function analyzeTrip(t: Trip, ctx: CheckCtx = {}): TripAnalysis {
  const W: Warning[] = [];
  const n = travellers(t);
  const days = t.plan.map((_, i) => analyzeDay(t, i, ctx));
  const planned = sum(BCATS, ([k]) => t.budget[k]);
  if (t.budgetTotal && planned > t.budgetTotal) {
    W.push({ lvl: 'alert', k: 'budget', title: 'Planned costs exceed your budget', body: `Categories add up to ${inr(planned)} against a budget of ${inr(t.budgetTotal)}: ${inr(planned - t.budgetTotal)} over.`, tab: 'budget' });
  }
  const spent = (k: string) => sum(t.expenses.filter((e) => e.cat === k), inrOf);
  for (const [k, l] of BCATS) {
    const s = spent(k);
    if (t.budget[k] > 0 && s > t.budget[k]) W.push({ lvl: 'caution', k: 'cat', title: `${l} is over plan`, body: `Spent ${inr(s)} of ${inr(t.budget[k])}.`, tab: 'budget' });
  }
  const actCost = sum(t.plan.flatMap((d) => d.items.filter(isAct)), (x) => x.c) * n;
  if (actCost > (t.budget.act || 0) * 1.05) {
    W.push({ lvl: 'caution', k: 'actcost', title: 'Itinerary costs more than the activities budget', body: `Entry fees and experiences in your plan add up to about ${inr(actCost)} for ${plural(n, 'traveller')}; the activities budget is ${inr(t.budget.act)}.`, fix: { l: `Set activities budget to ${inr(r500(actCost + 249))}`, a: 'setAct', v: r500(actCost + 249) } });
  }
  if (t.start) {
    const m = new Date(t.start + 'T00:00:00').getMonth() + 1;
    for (const id of t.dests) {
      const d = destView(t, id);
      if (d && seasonOf(d, m) === 'poor') W.push({ lvl: 'caution', k: 'season', title: `${MONTHS[m - 1]} is off-season for ${d.name}`, body: d.bestTime });
    }
  }
  for (const id of t.dests) {
    const d = destView(t, id);
    if (!d || !d.daysKnown) continue;
    const nd = t.plan.filter((x) => x.dest === id).length;
    if (nd && nd < d.days[0]) W.push({ lvl: 'caution', k: 'short', title: `${d.name} usually needs ${d.days[0]}–${d.days[1]} days`, body: `You have ${plural(nd, 'day')} there. Expect to choose between highlights.` });
  }
  const freeDays = t.plan.filter((d) => d.items.length && dayStats(d).free < 60).length;
  if (t.plan.length > 1 && freeDays === t.plan.length) {
    W.push({ lvl: 'caution', k: 'nofree', title: 'No free time anywhere', body: 'Every day is filled from morning to night. Leave at least one open block for wandering, rest or the unexpected.' });
  }
  const seen: Record<string, 1> = {};
  for (const d of t.plan) {
    for (const x of d.items) {
      if (!x.pid) continue;
      if (seen[x.pid]) W.push({ lvl: 'caution', k: 'dup', title: `${x.t} appears twice`, body: 'It’s scheduled on more than one day.' });
      seen[x.pid] = 1;
    }
  }
  const booked = t.stays.filter((s) => s.status === 'booked').length;
  const until = daysUntil(t.start);
  if (!booked && until != null && until >= 0 && until <= 30) W.push({ lvl: 'tip', k: 'stay', title: 'No stay booked yet', body: `The trip starts in ${plural(until, 'day')}.`, tab: 'stays' });

  const cnt = (lvl: string) => W.filter((w) => w.lvl === lvl).length + sum(days, (d) => d.filter((w) => w.lvl === lvl).length);
  return { days, trip: W, count: { alert: cnt('alert'), caution: cnt('caution') } };
}

const LVL = { alert: 0, caution: 1, tip: 2 } as const;
export const byLevel = (a: Warning, b: Warning) => LVL[a.lvl] - LVL[b.lvl];

const label = (x: { t: string }) => x.t || 'This place';

/** Checks added in the upgrade (opening hours, locks, hotel distance, check-in/out mornings, day bounds). */
function extendedDayChecks(t: Trip, di: number, ctx: CheckCtx, st: ReturnType<typeof dayStats>): Warning[] {
  const W: Warning[] = [];
  const day = t.plan[di];
  const N = `Day ${di + 1}`;
  const { it } = st;
  const date = dayDate(t, di);

  // Day start / end the user set
  if (day.start != null && it[0] && it[0].s < day.start) W.push({ lvl: 'caution', k: 'daystart', id: it[0].id, title: `${N} starts before ${fmtT(day.start)}`, body: `${label(it[0])} is at ${fmtT(it[0].s)}, earlier than the day start you set.` });
  if (day.end != null && st.last != null && st.last > day.end) W.push({ lvl: 'caution', k: 'dayend', title: `${N} runs past ${fmtT(day.end)}`, body: `The last block ends at ${fmtT(st.last)}.` });

  // Opening hours and closures (Google places; hours fetched live for the open day)
  for (const x of it) {
    if (!x.gid) continue;
    const closed = ctx.closed?.[x.gid];
    if (closed) {
      W.push({ lvl: 'alert', k: 'closed', id: x.id, title: `${label(x)} is ${closed === 'permanently' ? 'permanently' : 'temporarily'} closed`, body: 'Google Maps lists it as closed. Swap it for something else.' });
      continue;
    }
    const periods = ctx.hours?.[x.gid];
    if (!periods || !date) continue;
    const fit = visitFits(periods, date.getDay(), x.s, x.d);
    if (fit.ok) continue;
    const meal = x.cat === 'meal' || x.cat === 'food' || x.cat === 'cafe';
    const what = meal ? `${x.cat === 'meal' ? 'Meal at ' : ''}${label(x)}` : label(x);
    if (fit.reason === 'closed-day') W.push({ lvl: 'alert', k: 'hours', id: x.id, title: `${what} is closed on ${fit.weekday}s`, body: `${N} is a ${fit.weekday}. Move it to another day or pick somewhere else.` });
    else if (fit.reason === 'closed-at-start') W.push({ lvl: 'alert', k: 'hours', id: x.id, title: `${what} isn’t open at ${fmtT(x.s)}`, body: fit.opensAt != null ? `It opens at ${fmtT(fit.opensAt)} that day.` : 'It’s closed then.' });
    else W.push({ lvl: 'caution', k: 'hours', id: x.id, title: `${what} closes at ${fmtT(fit.closesAt)}`, body: `Your visit runs until ${fmtT(x.s + x.d)}.` });
  }

  // Distance from the stay at the start and end of the day
  const g = it.filter(geo);
  const home = dayEndpoint(t, di, 'start');
  if (home && g[0]) {
    const m = travelMin(km(home, g[0]));
    if (m >= HOTEL_FAR_MIN) W.push({ lvl: 'caution', k: 'hotelfar', id: g[0].id, title: `${m} min from ${home.label} to the first stop`, body: `${label(g[0])} is about ${Math.round(km(home, g[0])!)} km away. Leave early or start nearer.` });
  }
  const back = dayEndpoint(t, di, 'end');
  if (back && g.length) {
    const lastG = g[g.length - 1];
    const m = travelMin(km(lastG, back));
    if (m >= HOTEL_FAR_MIN) W.push({ lvl: 'caution', k: 'hotelback', id: lastG.id, title: `${m} min back to ${back.label}`, body: `From ${label(lastG)} at the end of the day.` });
  }

  // Heavy mornings on check-in and check-out days (bags, check-in after noon, check-out by about 11 AM)
  const morning = st.acts.filter((x) => x.s < 12 * 60).reduce((s, x) => s + Math.min(x.d, 12 * 60 - x.s), 0);
  const prevDest = di > 0 ? t.plan[di - 1].dest : null;
  const nextDest = di < t.plan.length - 1 ? t.plan[di + 1].dest : null;
  const checkIn = di > 0 && prevDest !== day.dest;
  const checkOut = (di === t.plan.length - 1 && t.plan.length > 1) || (nextDest != null && nextDest !== day.dest);
  if (checkIn && morning > CHECKIN_MORNING_MAX) W.push({ lvl: 'caution', k: 'checkin', title: `Busy morning on a check-in day`, body: `${hm(morning)} of plans before noon on ${N}, when you’re likely still carrying bags (check-in is usually after noon).` });
  if (checkOut && morning > CHECKOUT_MORNING_MAX) W.push({ lvl: 'caution', k: 'checkout', title: `Busy morning on a check-out day`, body: `${hm(morning)} of plans before noon on ${N}; check-out is usually by 11 AM–noon, so plan around your bags.` });
  return W;
}
