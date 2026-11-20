// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { closedAllDay, is24h, isOpenAt, visitFits, type Period } from './hours';
import { applyFilters, badgesFor, mergeResults, sortPlaces, type GuidePlace } from './placeFilters';

const at = (day: number, h: number, m = 0) => day * 1440 + h * 60 + m;
// Mon–Sat 10:00–18:00, closed Sunday
const shop: Period[] = [1, 2, 3, 4, 5, 6].map((d) => ({ open: at(d, 10), close: at(d, 18) }));
// Bar: every day 18:00 → 02:00 next day; Saturday wraps into Sunday
const bar: Period[] = [0, 1, 2, 3, 4, 5, 6].map((d) => ({ open: at(d, 18), close: at((d + 1) % 7, 2) }));
const always: Period[] = [{ open: 0, close: null }];

describe('opening hours', () => {
  it('handles weekday closures', () => {
    expect(isOpenAt(shop, 1, 11 * 60)).toBe(true);
    expect(isOpenAt(shop, 0, 11 * 60)).toBe(false);
    expect(closedAllDay(shop, 0)).toBe(true);
    expect(closedAllDay(shop, 3)).toBe(false);
    expect(visitFits(shop, 0, 11 * 60, 60)).toEqual({ ok: false, reason: 'closed-day', weekday: 'Sunday' });
  });
  it('handles hours past midnight, including Saturday night into Sunday', () => {
    expect(isOpenAt(bar, 2, 23 * 60)).toBe(true);
    expect(isOpenAt(bar, 3, 60)).toBe(true); // Wednesday 01:00 is Tuesday night
    expect(isOpenAt(bar, 0, 60)).toBe(true); // Sunday 01:00 is Saturday night (wraps the week)
    expect(isOpenAt(bar, 3, 3 * 60)).toBe(false);
    expect(visitFits(bar, 5, 23 * 60, 120)).toEqual({ ok: true });
    expect(visitFits(bar, 5, 23 * 60 + 30, 180)).toEqual({ ok: false, reason: 'closes-early', closesAt: 120 });
    expect(closedAllDay(bar, 0)).toBe(false);
  });
  it('handles 24-hour places', () => {
    expect(is24h(always)).toBe(true);
    expect(isOpenAt(always, 0, 3 * 60)).toBe(true);
    expect(visitFits(always, 6, 22 * 60, 600)).toEqual({ ok: true });
  });
  it('reports a visit that ends after closing, and one that starts before opening', () => {
    expect(visitFits(shop, 2, 17 * 60, 90)).toEqual({ ok: false, reason: 'closes-early', closesAt: 18 * 60 });
    expect(visitFits(shop, 2, 8 * 60, 60)).toEqual({ ok: false, reason: 'closed-at-start', opensAt: 10 * 60 });
  });
});

const P = (id: string, o: Partial<GuidePlace> = {}): GuidePlace => ({ id, name: id, types: [], rank: 0, ...o });
const list: GuidePlace[] = [
  P('a', { rating: 4.7, userRatingCount: 61000, priceLevel: 2, openNow: true, hours: shop, wheelchair: true, areaHint: 'Old City', rank: 0, location: { lat: 26.29, lng: 73.02 } }),
  P('b', { rating: 4.6, userRatingCount: 300, priceLevel: 1, openNow: false, hours: bar, areaHint: 'Sardarpura', rank: 1, location: { lat: 26.27, lng: 73.0 } }),
  P('c', { rating: 4.1, userRatingCount: 9000, priceLevel: 3, openNow: true, hours: always, foundIn: 'Cantonment', rank: 2, location: { lat: 26.28, lng: 73.05 } }),
  P('d', { rating: 3.4, userRatingCount: 40, rank: 3, closed: 'permanently' }),
  P('e', { rating: 5, userRatingCount: 4, rank: 4 }),
];
const ids = (l: GuidePlace[]) => l.map((p) => p.id);

describe('guide filters', () => {
  it('rating, reviews and price', () => {
    expect(ids(applyFilters(list, { minRating: 4.5 }))).toEqual(['a', 'b', 'e']);
    expect(ids(applyFilters(list, { minRating: 4, minReviews: 500 }))).toEqual(['a', 'c']);
    expect(ids(applyFilters(list, { minReviews: 5000 }))).toEqual(['a', 'c']);
    expect(ids(applyFilters(list, { price: [1, 2] }))).toEqual(['a', 'b']);
  });
  it('drops permanently closed places always', () => {
    expect(ids(applyFilters(list, {}))).not.toContain('d');
  });
  it('area: by the area that found it, or Google’s own neighbourhood', () => {
    expect(ids(applyFilters(list, { areas: ['Cantonment', 'Old City'] }))).toEqual(['a', 'c']);
  });
  it('open now and open at a chosen trip day and time', () => {
    expect(ids(applyFilters(list, { open: 'now' }))).toEqual(['a', 'c']);
    expect(ids(applyFilters(list, { open: { weekday: 0, minute: 60 } }))).toEqual(['b', 'c']); // Sunday 1 AM
    expect(ids(applyFilters(list, { open: { weekday: 3, minute: 12 * 60 } }))).toEqual(['a', 'c']);
  });
  it('veg-friendly only once details are known, wheelchair and text', () => {
    expect(ids(applyFilters(list, { veg: true }, { veg: { b: true, c: false } }))).toEqual(['b']);
    expect(ids(applyFilters(list, { wheelchair: true }))).toEqual(['a']);
    expect(ids(applyFilters(list, { q: 'sardar' }))).toEqual(['b']);
  });
});

describe('guide sorting and badges', () => {
  it('sorts by famous (Bayesian), rating, reviews, price and distance', () => {
    // C = 4.36 (mean rating). b: 300/600·4.6 + 300/600·4.36 ≈ 4.48 beats c: 9000/9300·4.1 + 300/9300·4.36 ≈ 4.11;
    // few-review ratings (e: 5.0 from 4) are pulled to the mean (≈ 4.37), so they don't top the list.
    const famous = ids(sortPlaces(list, 'famous', { attractions: true }));
    expect(famous.slice(0, 2)).toEqual(['a', 'b']);
    expect(famous.indexOf('e')).toBeGreaterThan(famous.indexOf('b'));
    expect(ids(sortPlaces(list, 'rating', { attractions: true }))[0]).toBe('e'); // raw rating sort, by contrast
    expect(ids(sortPlaces(list, 'reviews', { attractions: true }))[0]).toBe('a');
    expect(ids(sortPlaces(list, 'price', { attractions: true })).slice(0, 3)).toEqual(['b', 'a', 'c']);
    expect(ids(sortPlaces(list, 'nearHotel', { attractions: true, hotel: { lat: 26.27, lng: 73.0 } }))[0]).toBe('b');
    expect(ids(sortPlaces(list, 'nearDay', { attractions: true, dayCentre: { lat: 26.28, lng: 73.05 } }))[0]).toBe('c');
  });
  it('badges: top 10 must-see for attractions, hidden gems, editor’s picks', () => {
    const b = badgesFor(list, true, { c: { must: false } });
    expect(b.get('a')).toEqual({ mustSee: true, hiddenGem: false, editorsPick: false });
    expect(b.get('b')?.hiddenGem).toBe(true);
    expect(b.get('c')?.editorsPick).toBe(true);
    expect(badgesFor(list, false).get('a')?.mustSee).toBe(false);
  });
  it('merges pages and area runs without duplicates, remembering where each was found', () => {
    const m = mergeResults([{ area: 'Old City', places: [list[0], list[1]] }, { area: 'Cantonment', places: [list[1], list[2]] }]);
    expect(ids(m)).toEqual(['a', 'b', 'c']);
    expect(m.map((p) => p.foundIn)).toEqual(['Old City', 'Old City', 'Cantonment']);
    expect(m.map((p) => p.rank)).toEqual([0, 1, 2]);
  });
});

import { analyzeDay } from './checks';
import { buildTrip, DEFAULT_PREFS } from './generate';
import { addLiveToDay, stayFromLive } from './livePool';
import { stripLiveNames } from './coords';

describe('adding guide places to a trip', () => {
  const cafe = { id: 'ChIJTESTcafeone000000001', name: 'Rooftop Café', types: ['cafe'], primaryType: 'cafe', location: { lat: 26.92, lng: 75.82 }, rating: 4.2, userRatingCount: 640 };
  it('adds a place as lunch on Day 2 at 1:00 PM, storing only its ID and coordinates', () => {
    const t = buildTrip({ dests: ['jaipur'], days: 3, travelers: ['A'], pace: 'balanced', prefs: DEFAULT_PREFS });
    t.plan[1].items = t.plan[1].items.filter((x) => x.cat !== 'meal');
    const x = addLiveToDay(t, cafe, { destKey: 'jaipur', di: 1, start: 780, meal: 'lunch' });
    expect(x).toMatchObject({ gid: cafe.id, t: '', cat: 'meal', s: 780, d: 60, dest: 'jaipur' });
    expect(JSON.stringify(t)).not.toContain('Rooftop');
    expect(analyzeDay(t, 1).some((w) => w.k === 'lunch')).toBe(false);
  });
  it('adds a non-curated destination to the route when needed, and sets a hotel as a stay without a price', () => {
    const t = buildTrip({ dests: ['jaipur'], days: 3, travelers: ['A', 'B'], pace: 'balanced', prefs: DEFAULT_PREFS });
    const rec = { key: 'g:ChIJTESTjodhpur0000000001', kind: 'google' as const, name: 'Jodhpur', center: { lat: 26.24, lng: 73.02 }, type: 'tier2' as const, currency: 'INR' };
    addLiveToDay(t, { ...cafe, types: ['tourist_attraction'], primaryType: 'tourist_attraction' }, { destKey: rec.key, record: rec, di: 2 });
    expect(t.dests).toEqual(['jaipur', rec.key]);
    expect(t.plan.map((d) => d.dest)).toEqual(['jaipur', 'jaipur', 'jaipur']);
    const s = stayFromLive(t, { ...cafe, types: ['lodging'] }, rec.key, rec);
    expect(s).toMatchObject({ name: '', gid: cafe.id, price: 0, status: 'shortlisted', nights: 2 });
    expect(stripLiveNames({ ...t, stays: [{ ...s, name: 'Live name', nameLive: true }] }).stays[0].name).toBe('');
  });
});
