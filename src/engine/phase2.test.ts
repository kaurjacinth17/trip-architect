// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { COST_TABLE } from '../data/costTables';
import { D } from '../data/destinations';
import { migrate, upgradeTripV2 } from '../store/trips';
import { IDS, googleSearch, openMeteoArchive } from '../../tests/fixtures/providers';
import { monthlyNormals } from '../../api/climate';
import { mapPlace, type GPlace } from '../../api/_lib/places';
import { estBudget } from './budget';
import { bestMonths, bestTimeText, monthRanges, rateMonth } from './bestMonths';
import { analyzeTrip } from './checks';
import { COORD_TTL_MS, coordsToRefresh, purgeExpiredCoords, stripGoogleCoords } from './coords';
import { fromINR, inrOf, money, toINR, type Rates } from './currency';
import { customRecord, destView, recordFromGoogle, suggestedDays } from './dest';
import { moveDest, previewInsertDest, previewRemoveDest } from './destOps';
import { buildTrip, DEFAULT_PREFS } from './generate';
import { poolFromLive, type LivePlace } from './livePool';
import { genPack } from './packing';
import { categorise } from './placeTypes';
import { bayesScores, isHiddenGem, rankFamous } from './ranking';
import { decodeShare, encodeShare, exportJSON, normaliseTrip } from './share';
import type { MonthClimate, Trip } from './types';

beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-20T10:00:00')); });
afterAll(() => vi.useRealTimers());

const normals = monthlyNormals(openMeteoArchive().daily) as MonthClimate[];
const live = (key: string): LivePlace[] => (googleSearch[key].places as GPlace[]).map((p) => mapPlace(p) as LivePlace);
const jodhpur = () => ({ ...recordFromGoogle({ placeId: IDS.jodhpur, name: 'Jodhpur', region: 'Rajasthan', country: 'India', countryCode: 'IN', center: { lat: 26.2389, lng: 73.0243 }, types: ['locality'] }), type: 'tier2' as const, climate: normals });

describe('best months', () => {
  it('applies the documented rule', () => {
    expect(rateMonth({ tmax: 24, tmin: 12, rainMm: 0, rainDays: 0 }, 1).verdict).toBe('good');
    expect(rateMonth({ tmax: 41, tmin: 29, rainMm: 8, rainDays: 1 }, 5).verdict).toBe('poor');
    expect(rateMonth({ tmax: 30, tmin: 22, rainMm: 250, rainDays: 18 }, 7).verdict).toBe('poor');
    expect(rateMonth({ tmax: 2, tmin: -9, rainMm: 10, rainDays: 2 }, 1).verdict).toBe('poor');
    expect(rateMonth({ tmax: 34, tmin: 24, rainMm: 30, rainDays: 3 }, 10).verdict).toBe('ok');
    expect(rateMonth(null, 3).verdict).toBe('ok');
  });
  it('summarises the year', () => {
    const b = bestMonths(normals);
    expect(b.good).toEqual([1, 2, 11, 12]);
    expect(b.poor).toEqual([4, 5, 6]);
    expect(monthRanges(b.good)).toBe('Nov–Feb');
    expect(monthRanges([1, 2, 3, 6])).toBe('Jun, Jan–Mar');
    expect(bestTimeText(normals)).toMatch(/^Most comfortable: Nov–Feb\. Hardest: Apr–Jun\./);
  });
});

describe('currency', () => {
  const r: Rates = { base: 'INR', date: '2026-11-20', rates: { INR: 1, USD: 0.0118, THB: 0.41 } };
  it('converts with Frankfurter INR-based rates', () => {
    expect(toINR(100, 'USD', r)).toBeCloseTo(8474.58, 1);
    expect(fromINR(1000, 'THB', r)).toBeCloseTo(410);
    expect(toINR(500, 'INR', null)).toBe(500);
    expect(toINR(5, 'XYZ', r)).toBeNull();
    expect(inrOf({ amt: 20, cur: 'USD', inr: 1694.92 })).toBe(1694.92);
    expect(inrOf({ amt: 600 })).toBe(600);
    expect(money(1234.5)).toBe('₹1,235');
    expect(money(12.5, 'USD')).toMatch(/12\.50/);
  });
});

describe('place types and ranking', () => {
  it('maps Google types to categories and default durations', () => {
    expect(categorise('hindu_temple')).toEqual({ cat: 'spiritual', duration: 45 });
    expect(categorise('south_indian_restaurant')).toEqual({ cat: 'food', duration: 75 });
    expect(categorise('national_park')).toEqual({ cat: 'nature', duration: 240 });
    expect(categorise('tourist_attraction', ['historical_landmark'])).toEqual({ cat: 'sight', duration: 60 });
    expect(categorise(undefined, ['museum'])).toEqual({ cat: 'heritage', duration: 90 });
    expect(categorise('cafe').cat).toBe('cafe');
    expect(categorise('something_new')).toEqual({ cat: 'sight', duration: 60 });
  });
  it('Bayesian score pulls low-review ratings toward the mean', () => {
    const list = [{ rating: 5, userRatingCount: 3 }, { rating: 4.6, userRatingCount: 40_000 }, { rating: 4.0, userRatingCount: 1000 }];
    const ranked = rankFamous(list, 300);
    expect(ranked[0].userRatingCount).toBe(40_000);
    const s = bayesScores(list, 300, 0);
    const C = (5 + 4.6 + 4.0) / 3;
    expect(s[0]).toBeCloseTo((3 / 303) * 5 + (300 / 303) * C, 6);
    expect(isHiddenGem({ rating: 4.6, userRatingCount: 300 })).toBe(true);
    expect(isHiddenGem({ rating: 4.6, userRatingCount: 3000 })).toBe(false);
  });
});

describe('destinations', () => {
  it('derives the Indian cost table from curated guides of the same type, and has no metro/wildlife row', () => {
    expect(COST_TABLE.hill).toEqual(D.manali.cost);
    expect(COST_TABLE.beach!.food[1]).toBe(Math.round((D.goa.cost.food[1] + D.pondicherry.cost.food[1]) / 2 / 50) * 50);
    expect(COST_TABLE.metro).toBeUndefined();
    expect(COST_TABLE.wildlife).toBeUndefined();
  });
  it('views a Google destination: computed best months, table cost in India, none abroad', () => {
    const r = jodhpur();
    const v = destView({ destRecords: { [r.key]: r } }, r.key)!;
    expect(v).toMatchObject({ name: 'Jodhpur', kind: 'google', inIndia: true, good: [1, 2, 11, 12], costSource: 'table', currency: 'INR', daysKnown: false });
    const bkk = { ...recordFromGoogle({ placeId: 'ChIJTESTbangkok00000001', name: 'Bangkok', countryCode: 'TH', country: 'Thailand', center: { lat: 13.75, lng: 100.5 }, types: ['locality'] }), type: 'metro' as const };
    expect(destView({ destRecords: { [bkk.key]: bkk } }, bkk.key)).toMatchObject({ cost: null, currency: 'THB', inIndia: false });
  });
  it('custom destinations work everywhere, without ratings', () => {
    const c = customRecord({ name: ' Hidden hamlet ', center: { lat: 31.1, lng: 77.2 }, type: 'hill', countryCode: 'IN' });
    expect(c.key).toMatch(/^c:/);
    const t = buildTrip({ dests: [c.key], days: 2, travelers: ['A'], pace: 'balanced', prefs: DEFAULT_PREFS, destRecords: { [c.key]: c } });
    expect(t.name).toBe('Hidden hamlet trip');
    expect(t.budget.stay).toBeGreaterThan(0); // hill cost table
    expect(t.plan[0].items[0].t).toBe('Arrive and check in');
  });
  it('suggests 1 day per ~5 well-reviewed attractions, clamped to 1–7', () => {
    expect(suggestedDays([])).toBe(1);
    expect(suggestedDays(Array(12).fill({ rating: 4.5, userRatingCount: 900 }))).toBe(2);
    expect(suggestedDays(Array(80).fill({ rating: 4.5, userRatingCount: 900 }))).toBe(7);
    expect(suggestedDays(Array(30).fill({ rating: 3.9, userRatingCount: 900 }))).toBe(1);
  });
});

describe('generator for a non-curated destination', () => {
  const r = jodhpur();
  const t = buildTrip({ dests: [r.key], days: 3, start: '2026-12-16', travelers: ['A', 'B'], pace: 'balanced', prefs: DEFAULT_PREFS, destRecords: { [r.key]: r },
    pools: { [r.key]: poolFromLive(r.key, live('famous')) }, lunchPools: { [r.key]: live('restaurants') } });
  const items = t.plan.flatMap((d) => d.items);

  it('uses live attractions, stores IDs and coordinates but never names', () => {
    const g = items.filter((x) => x.gid);
    expect(g.length).toBeGreaterThan(0);
    for (const x of [...g, ...t.wish.filter((w) => w.gid)]) {
      expect(x.t).toBe('');
      expect(x.area).toBe('');
      expect(typeof x.coordsFetchedAt).toBe('number');
    }
    expect(JSON.stringify(t)).not.toContain('Mehrangarh');
    expect(t.plan.map((d) => d.label).join(' ')).not.toMatch(/Old City|Fort Area/);
  });
  it('keeps the arrival-day rules and picks a nearby top-rated restaurant for lunch', () => {
    expect(t.plan[0].items[0]).toMatchObject({ t: 'Arrive and check in', s: 720 });
    const lunches = items.filter((x) => x.cat === 'meal' && x.gid);
    expect(lunches.length).toBeGreaterThan(0);
    expect([IDS.thali, IDS.cafe]).toContain(lunches[0].gid);
    expect(new Set(lunches.map((x) => x.gid)).size).toBe(lunches.length);
  });
  it('produces a budget from the cost table and season checks from climate', () => {
    expect(estBudget(t).food).toBeGreaterThan(0);
    const t2 = { ...t, start: '2027-05-10' };
    expect(analyzeTrip(t2).trip.some((w) => w.k === 'season' && /May is off-season for Jodhpur/.test(w.title))).toBe(true);
    expect(analyzeTrip(t).trip.some((w) => w.k === 'short')).toBe(false); // recommended days unknown
  });
  it('packs for the climate of the travel month', () => {
    const may = genPack({ ...t, start: '2027-05-10' }).map((p) => p.name);
    expect(may).toContain('Cap or sun hat');
    const jan = genPack({ ...t, start: '2027-01-10' }).map((p) => p.name);
    expect(jan).not.toContain('Cap or sun hat');
  });
});

describe('destination operations', () => {
  const base = () => buildTrip({ dests: ['jaipur', 'udaipur'], days: 6, start: '2026-12-16', travelers: ['A', 'B'], pace: 'balanced', prefs: DEFAULT_PREFS });
  const spiti = () => ({ ...recordFromGoogle({ placeId: IDS.spiti, name: 'Spiti Valley', countryCode: 'IN', country: 'India', center: { lat: 32.246, lng: 78.035 }, types: ['natural_feature'] }), type: 'hill' as const });

  it('inserts a destination mid-trip, adding days, with a preview', () => {
    const t = base(), s = spiti();
    const p = previewInsertDest(t, s.key, { days: 2, afterIndex: 0, mode: 'add', record: s });
    expect(p.trip.dests).toEqual(['jaipur', s.key, 'udaipur']);
    expect(p.trip.plan.map((d) => d.dest)).toEqual(['jaipur', 'jaipur', 'jaipur', s.key, s.key, 'udaipur', 'udaipur', 'udaipur']);
    expect(p.trip.plan[3].items[0]).toMatchObject({ t: 'Travel to Spiti Valley', cat: 'transit' });
    expect(p.changes.filter((c) => c.newDay).map((c) => c.day)).toEqual([4, 5]);
    expect(p.changes[5]).toMatchObject({ day: 6, was: 'udaipur', now: 'udaipur' });
    expect(p.summary).toMatch(/Adds 2 days for Spiti Valley after Jaipur\. The trip becomes 8 days/);
    expect(t.plan).toHaveLength(6); // original untouched
    expect(p.trip.destRecords![s.key].name).toBe('Spiti Valley');
  });

  it('reassigns existing days, sending their activities to the wishlist', () => {
    const t = base(), s = spiti();
    const acts = t.plan[3].items.filter((x) => !['meal', 'transit', 'rest'].includes(x.cat)).length;
    const p = previewInsertDest(t, s.key, { days: 1, afterIndex: 0, mode: 'reassign', record: s });
    expect(p.trip.plan).toHaveLength(6);
    expect(p.trip.plan[3].dest).toBe(s.key);
    expect(p.displaced).toHaveLength(acts);
    expect(p.trip.wish.length).toBe(t.wish.length + acts);
  });

  it('removes a destination and moves one in the route', () => {
    const t = base();
    const r = previewRemoveDest(t, 'udaipur');
    expect(r.trip.dests).toEqual(['jaipur']);
    expect(r.trip.plan.every((d) => d.dest === 'jaipur')).toBe(true);
    expect(() => previewRemoveDest(r.trip, 'jaipur')).toThrow();
    const m = moveDest(t, 1, 0);
    expect(m.dests).toEqual(['udaipur', 'jaipur']);
    expect(m.plan.map((d) => d.dest)).toEqual(['udaipur', 'udaipur', 'udaipur', 'jaipur', 'jaipur', 'jaipur']);
  });
});

describe('Google coordinates (30-day limit)', () => {
  const r = jodhpur();
  const mk = (): Trip => buildTrip({ dests: [r.key], days: 2, travelers: ['A'], pace: 'balanced', prefs: DEFAULT_PREFS, destRecords: { [r.key]: { ...r, coordsFetchedAt: Date.now() } }, pools: { [r.key]: poolFromLive(r.key, live('famous')) } });
  it('refreshes after 25 days and deletes after 30', () => {
    const t = mk();
    expect(coordsToRefresh(t).items).toEqual([]);
    const later = Date.now() + 26 * 864e5;
    expect(coordsToRefresh(t, later).items.length).toBeGreaterThan(0);
    expect(purgeExpiredCoords(t, later)).toBe(t);
    const expired = purgeExpiredCoords(t, Date.now() + COORD_TTL_MS);
    expect(expired.plan.flatMap((d) => d.items).filter((x) => x.gid).every((x) => x.lat == null && x.coordsFetchedAt == null)).toBe(true);
    expect(expired.destRecords![r.key].center).toBeNull();
    // curated and custom coordinates are ours and stay
    expect(expired.plan[0].items.find((x) => !x.gid && x.lat != null) ?? null).toBeNull();
  });
  it('share links and exports carry place IDs but no Google coordinates', () => {
    const t = mk();
    const back = decodeShare(encodeShare(t));
    expect(back.plan.flatMap((d) => d.items).filter((x) => x.gid).every((x) => x.lat == null)).toBe(true);
    expect(back.destRecords![r.key]).toMatchObject({ placeId: IDS.jodhpur, name: 'Jodhpur', center: null });
    expect(back).toEqual(JSON.parse(JSON.stringify(stripGoogleCoords(t))));
    const imported = normaliseTrip(exportJSON(t));
    expect(imported.destRecords![r.key].placeId).toBe(IDS.jodhpur);
    expect(imported.dests).toEqual([r.key]);
  });
});

describe('storage migration v1 → v2', () => {
  it('adds destination records, currency and INR values without losing expenses', () => {
    const t = buildTrip({ dests: ['goa'], days: 3, travelers: ['A', 'B'], pace: 'balanced', prefs: DEFAULT_PREFS });
    const v1 = { ...t, expenses: [{ id: 'e1', amt: 1200, cat: 'food', date: '2026-12-01', paid: 1, among: [0, 1], note: 'Dinner' }] } as unknown as Trip;
    delete (v1 as Partial<Trip>).destRecords;
    delete (v1 as Partial<Trip>).currency;
    const m = migrate({ trips: { [t.id]: v1 } }, 1);
    expect(m.trips[t.id].expenses[0]).toEqual({ id: 'e1', amt: 1200, cat: 'food', date: '2026-12-01', paid: 1, among: [0, 1], note: 'Dinner', cur: 'INR', inr: 1200 });
    expect(m.trips[t.id]).toMatchObject({ destRecords: {}, currency: 'INR' });
    expect(upgradeTripV2(m.trips[t.id])).toEqual(m.trips[t.id]);
  });
});
