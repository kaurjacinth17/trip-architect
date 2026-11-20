// Starter-itinerary generator, ported from the reference `scorePlace` / `allocDays` / `genPlan` / `buildTrip`.
import { paceOf } from '../data/constants';
import { D, PL } from '../data/destinations';
import { estBudget } from './budget';
import { geo, km, travelMin } from './geo';
import { genPack } from './packing';
import { cascade, customItem, itemFromPlace, sortDay } from './schedule';
import type { Day, Item, PaceKey, Place, Prefs, Trip } from './types';
import { isoDate, r500, sum, uid, up15 } from './util';

const num = (v: number | undefined) => (v == null ? NaN : v);
const FOODISH = ['food', 'cafe'];

export function scorePlace(p: Place, pr: Partial<Prefs>): number {
  let s = 2 + (p.must ? 4 : 0) + (p.hidden ? 0.8 : 0);
  const nc = pr.natureCity || 0, se = pr.sightExp || 0, fs = pr.foodShop || 0, ac = pr.advComfort || 0, tier = pr.tier ?? 1;
  if (p.cat === 'nature') s -= nc * 0.8;
  if (['heritage', 'sight', 'shop', 'night'].includes(p.cat)) s += nc * 0.5;
  if (['heritage', 'sight'].includes(p.cat)) s -= se * 0.6;
  if (['activity', 'food', 'cafe'].includes(p.cat)) s += se * 0.7;
  if (FOODISH.includes(p.cat)) s -= fs * 0.7;
  if (p.cat === 'shop') s += fs * 0.9;
  const adv = (p.cat === 'activity' && p.c >= 700) || (p.cat === 'nature' && p.d >= 150);
  if (adv) s -= ac * 0.8;
  if (p.cat === 'cafe' || p.cat === 'spiritual') s += ac * 0.3;
  if (tier === 2 && p.c >= 800) s += 0.6;
  if (tier === 0 && p.c >= 1000) s -= 1;
  return s;
}

/** Split `days` across destinations in proportion to each one's minimum recommended stay. */
export function allocDays(dests: string[], days: number): string[] {
  if (dests.length === 1) return Array(days).fill(dests[0]);
  const w = dests.map((id) => (D[id] ? D[id].days[0] : 2));
  const tot = sum(w);
  const alloc = w.map((x) => Math.max(1, Math.round((x / tot) * days)));
  while (sum(alloc) > days) { const i = alloc.indexOf(Math.max(...alloc)); alloc[i]--; }
  while (sum(alloc) < days) alloc[alloc.indexOf(Math.min(...alloc))]++;
  return dests.flatMap((id, i) => Array(alloc[i]).fill(id));
}

interface GenInput { dests: string[]; days: number; pace: PaceKey | string; prefs?: Partial<Prefs> }
interface Scored { p: Place; s: number }

export function genPlan(t: GenInput): { plan: Day[]; wish: Item[] } {
  const pr = t.prefs || {};
  const pace = paceOf(t.pace);
  const map = allocDays(t.dests, t.days);
  const plan: Day[] = map.map((id) => ({ dest: id, label: '', items: [] }));
  const wish: Item[] = [];
  const used = new Set<string>();

  for (const id of t.dests) {
    const d = D[id];
    if (!d) continue;
    const idx = map.map((x, i) => (x === id ? i : -1)).filter((i) => i >= 0);
    let pool: Scored[] = d.pl.map((p) => ({ p, s: scorePlace(p, pr) })).sort((a, b) => b.s - a.s);
    const dayTrips = pool.filter((x) => x.p.d >= 360);
    pool = pool.filter((x) => x.p.d < 360);

    idx.forEach((di, k) => {
      const day = plan[di];
      const first = di === 0, last = di === t.days - 1 && t.days > 1, arrive = k === 0 && di > 0;
      let cur = pace.start, cap = pace.cap, maxN = pace.max;
      if (first) {
        day.items.push(
          customItem({ t: 'Arrive and check in', cat: 'transit', s: 720, d: 60, dest: id }),
          customItem({ t: 'Lunch', cat: 'meal', s: 795, d: 60, dest: id }),
        );
        cur = 870;
        cap = Math.round(cap * 0.55);
        maxN = Math.min(maxN, 3);
      }
      if (arrive) {
        const from = D[map[di - 1]];
        const dist = from ? km({ lat: from.center[0], lng: from.center[1] }, { lat: d.center[0], lng: d.center[1] })! : 0;
        const tr = Math.max(120, up15(travelMin(dist)));
        day.items.push(customItem({ t: `Travel to ${d.name}`, cat: 'transit', s: 480, d: tr, dest: id, n: from ? `About ${Math.round(dist)} km from ${from.name}. Check train and bus timings.` : '' }));
        cur = up15(480 + tr + 45);
        cap = Math.max(120, Math.round(cap - (cur - pace.start) * 0.8));
        maxN = Math.min(maxN, 3);
      }
      if (last) {
        cap = Math.round(cap * 0.6);
        maxN = Math.min(maxN, 3);
      }
      const spare = idx.length - k >= 2 && idx.length > d.days[0];
      if (!first && !arrive && !last && spare && dayTrips.length && (num(pr.natureCity) <= 0 || num(pr.advComfort) < 0)) {
        const dt = dayTrips.shift()!;
        used.add(dt.p.pid);
        day.items.push(itemFromPlace(dt.p, pace.start));
        day.label = dt.p.n;
        return;
      }
      let avail = pool.filter((x) => !used.has(x.p.pid));
      if (first || arrive) {
        const late = avail.filter((x) => x.p.best !== 'am' && x.p.d <= Math.max(90, cap) && !(first && FOODISH.includes(x.p.cat)));
        avail = late.length ? late : avail;
      }
      if (arrive && cur > 17 * 60) avail = avail.filter((x) => x.p.best === 'eve' || x.p.best === 'any');
      if (!avail.length || cur + avail[0].p.d > 21 * 60) {
        day.label = (arrive ? 'Travel to ' : '') + d.name;
        return;
      }
      const anchor = first || arrive ? avail[0] : avail.find((x) => x.p.best !== 'eve') || avail[0];
      const pick: Place[] = [anchor.p];
      used.add(anchor.p.pid);
      let mins = anchor.p.d, foods = FOODISH.includes(anchor.p.cat) ? 1 : 0;
      const cands = avail
        .filter((x) => x !== anchor && km(x.p, anchor.p)! < 8)
        .map((x) => ({ ...x, v: x.s - km(x.p, anchor.p)! * 0.7 + (x.p.area === anchor.p.area ? 1.5 : 0) }))
        .sort((a, b) => b.v - a.v);
      for (const c of cands) {
        if (pick.length >= maxN) break;
        const isF = FOODISH.includes(c.p.cat);
        if (isF && foods >= 1) continue;
        if (mins + c.p.d > cap + 20) continue;
        if (c.p.best === 'eve' && pick.some((x) => x.best === 'eve')) continue;
        pick.push(c.p);
        used.add(c.p.pid);
        mins += c.p.d;
        if (isF) foods++;
      }
      const rank = { am: 0, any: 1, pm: 1, eve: 2 } as const;
      pick.sort((a, b) => rank[a.best] - rank[b.best]);
      for (let i = 1; i < pick.length - 1; i++) {
        let bj = i, bd = 1e9;
        for (let j = i; j < pick.length && rank[pick[j].best] === rank[pick[i].best]; j++) {
          const dd = km(pick[i - 1], pick[j])!;
          if (dd < bd) { bd = dd; bj = j; }
        }
        [pick[i], pick[bj]] = [pick[bj], pick[i]];
      }
      let lunch = first || cur >= 780;
      for (const p of pick) {
        const prev = day.items[day.items.length - 1];
        if (prev && geo(prev)) cur += travelMin(km(prev, p));
        cur = up15(cur);
        if (!lunch && cur >= 750 && !FOODISH.includes(p.cat)) {
          day.items.push(customItem({ t: 'Lunch', cat: 'meal', s: cur, d: 60, dest: id }));
          cur += 60;
          lunch = true;
        }
        if (FOODISH.includes(p.cat) && cur >= 720 && cur <= 870) lunch = true;
        if (p.best === 'eve' && cur < 990) cur = 1005;
        if (cur + p.d > 21.5 * 60) { used.delete(p.pid); continue; }
        day.items.push(itemFromPlace(p, cur));
        cur += p.d;
      }
      if (!lunch && cur > 780) {
        day.items.push(customItem({ t: 'Lunch', cat: 'meal', s: 780, d: 60, dest: id }));
        cascade(day);
      }
      cascade(day);
      const areas = pick.map((p) => p.area);
      const top = areas.sort((a, b) => areas.filter((x) => x === b).length - areas.filter((x) => x === a).length)[0];
      day.label = (first ? 'Arrival + ' : arrive ? 'Travel + ' : last ? 'Last day: ' : '') + (top || d.name);
    });
    for (const x of pool.concat(dayTrips)) {
      if (!used.has(x.p.pid) && wish.length < 6 * t.dests.length && x.s >= 3) wish.push(itemFromPlace(x.p));
    }
  }
  if (t.days > 1) {
    const ld = plan[t.days - 1];
    sortDay(ld);
    const lastEnd = ld.items.length ? Math.max(...ld.items.map((x) => x.s + x.d)) : 900;
    ld.items.push(customItem({ t: 'Head to the station or airport', cat: 'transit', s: up15(lastEnd + 30), d: 60, dest: ld.dest }));
  }
  plan.forEach(sortDay);
  return { plan, wish: wish.slice(0, 8) };
}

export interface BuildInput {
  dests: string[];
  days: number;
  start?: string;
  group?: string;
  travelers: string[];
  pace: PaceKey;
  prefs: Prefs;
  budgetTotal?: number;
  name?: string;
}

export function buildTrip(o: BuildInput): Trip {
  const now = Date.now();
  const t: Trip = {
    id: uid(),
    name: o.name || o.dests.map((id) => D[id]?.name).join(' + ') + ' trip',
    dests: o.dests, start: o.start || '', days: o.days, group: o.group || 'couple', travelers: o.travelers,
    pace: o.pace, prefs: o.prefs, budgetTotal: o.budgetTotal || 0,
    plan: [], wish: [], budget: { travel: 0, stay: 0, food: 0, local: 0, act: 0, shop: 0, misc: 0 },
    expenses: [], stays: [], pack: [], notes: '', created: now, updated: now,
  };
  const g = genPlan(t);
  t.plan = g.plan;
  t.wish = g.wish;
  t.budget = estBudget(t);
  t.pack = genPack(t);
  return t;
}

export const DEFAULT_PREFS: Prefs = { natureCity: 0, sightExp: 0, foodShop: 0, advComfort: 0, tier: 1 };

/** The first-visit sample trip, exactly as the reference start-up block builds it. */
export function buildSampleTrip(today = new Date()): Trip {
  const d = new Date(today);
  d.setDate(d.getDate() + 21);
  const start = isoDate(d);
  const t = buildTrip({ dests: ['jaipur'], days: 4, start, travelers: ['You', 'Riya'], group: 'couple', pace: 'balanced', prefs: { ...DEFAULT_PREFS }, budgetTotal: 25000, name: 'Jaipur getaway' });
  t.sample = true;
  t.touched = false;
  t.budget.travel = 3000;
  t.stays = [
    { id: uid(), name: 'Old City haveli (sample)', area: 'Old City', dest: 'jaipur', lat: 26.9235, lng: 75.825, price: 3800, nights: 3, checkin: start, checkout: '', rating: 4.5, link: '', notes: 'Rooftop with fort views', status: 'shortlisted' },
    { id: uid(), name: 'C-Scheme boutique hotel (sample)', area: 'C-Scheme', dest: 'jaipur', lat: 26.905, lng: 75.806, price: 4600, nights: 3, checkin: start, checkout: '', rating: 4, link: '', notes: 'Near cafés, quieter at night', status: 'idea' },
  ];
  t.expenses = [{ id: uid(), amt: 2380, cat: 'travel', date: isoDate(today), paid: 0, among: [0, 1], note: 'Train tickets (sample)' }];
  const d3 = t.plan[2];
  if (d3) {
    const p = PL['jaipur:chokhi'];
    if (!d3.items.some((x) => x.pid === p.pid)) {
      d3.items.push(itemFromPlace(p, 1080));
      sortDay(d3);
    }
  }
  return t;
}

/** Wizard live estimate (reference `wzEst`). */
export function wizardEstimate(w: { n: number; prefs: Prefs; dests: string[]; days: number }): number {
  const tmp = { travelers: Array(w.n).fill('x'), prefs: w.prefs, plan: allocDays(w.dests.length ? w.dests : ['jaipur'], w.days).map((id) => ({ dest: id, items: [] as Item[] })) };
  const b = estBudget(tmp);
  const fees = sum(w.dests, (id) => sum(D[id].pl.filter((p) => p.must), (p) => p.c)) * w.n;
  return r500(b.stay + b.food + b.local + fees + (b.stay + b.food + b.local) * 0.13);
}
