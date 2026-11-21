// @vitest-environment node
// Phase 6: stays with night ranges, locked check-in/check-out, "Check prices" links and the Auto budget lines.
import { describe, expect, it } from 'vitest';
import { migrate } from '../store/trips';
import { autoAct, autoStay, effectiveBudget, estBudget, plannedTotal } from './budget';
import { analyzeTrip } from './checks';
import { buildTrip, DEFAULT_PREFS } from './generate';
import { cascade, routeOrder, tidy } from './schedule';
import { decodeShare, encodeShare, exportJSON, normaliseTrip } from './share';
import { clearStayNights, dayEndpoint, priceLinks, removeStay, setStayNights, stayForDay } from './stays';
import type { Stay, Trip } from './types';
import { uid } from './util';

const trip = (o: Partial<Parameters<typeof buildTrip>[0]> = {}) =>
  buildTrip({ dests: ['jaipur'], days: 5, start: '2026-12-16', travelers: ['A', 'B', 'C'], pace: 'balanced', prefs: DEFAULT_PREFS, ...o });
const stay = (t: Trip, o: Partial<Stay> = {}): Stay => {
  const s: Stay = { id: uid(), name: 'Haveli', area: 'Old City', dest: 'jaipur', lat: 26.92, lng: 75.82, price: 3000, nights: 1, checkin: '', checkout: '', rating: 0, link: '', notes: '', status: 'shortlisted', ...o };
  t.stays.push(s);
  return s;
};
const blocks = (t: Trip, id: string) => t.plan.flatMap((d, di) => d.items.filter((x) => x.stayRef?.id === id).map((x) => ({ di, kind: x.stayRef!.kind, s: x.s, locked: x.locked, t: x.t })));

describe('Set as my stay for nights X–Y', () => {
  it('sets nights and dates and adds locked check-in (the arrival block on Day 1) and check-out (Day 4, 11 AM)', () => {
    const t = trip();
    const s = stay(t);
    const r = setStayNights(t, s.id, 0, 2);
    expect(s).toMatchObject({ from: 0, to: 2, nights: 3, checkin: '2026-12-16', checkout: '2026-12-19' });
    expect(r.in?.t).toBe('Arrive and check in'); // the generator's block became the check-in, keeping its time
    expect(blocks(t, s.id)).toEqual([
      { di: 0, kind: 'in', s: 720, locked: true, t: 'Arrive and check in' },
      { di: 3, kind: 'out', s: 660, locked: true, t: 'Check out' },
    ]);
    expect(t.plan[3].items.find((x) => x.stayRef)?.lat).toBe(26.92);
  });

  it('check-in on a later day is a new 2 PM block; the blocks survive cascade, Tidy and Optimise route', () => {
    const t = trip();
    const s = stay(t);
    setStayNights(t, s.id, 1, 3);
    expect(blocks(t, s.id).map((b) => [b.di, b.kind, b.s])).toEqual([[1, 'in', 840], [4, 'out', 660]]);
    for (const di of [1, 4]) {
      cascade(t.plan[di]);
      tidy(t.plan[di], 8 * 60);
      routeOrder(t.plan[di]);
    }
    expect(blocks(t, s.id).map((b) => [b.di, b.kind, b.s])).toEqual([[1, 'in', 840], [4, 'out', 660]]);
  });

  it('changing the nights moves the blocks (no duplicates); clearing restores the arrival block', () => {
    const t = trip();
    const s = stay(t);
    setStayNights(t, s.id, 0, 3);
    setStayNights(t, s.id, 0, 1);
    expect(blocks(t, s.id).map((b) => [b.di, b.kind])).toEqual([[0, 'in'], [2, 'out']]);
    clearStayNights(t, s.id);
    expect(blocks(t, s.id)).toEqual([]);
    const arrive = t.plan[0].items.find((x) => x.t === 'Arrive and check in')!;
    expect(arrive.locked).toBe(false);
    expect(arrive.stayRef).toBeUndefined();
    expect(s.from).toBeUndefined();
  });

  it('a second stay for overlapping nights replaces the first (booked stays are left alone); deleting removes its blocks', () => {
    const t = trip();
    const a = stay(t, { name: 'A' }), b = stay(t, { name: 'B' }), c = stay(t, { name: 'C', status: 'booked' });
    setStayNights(t, a.id, 0, 3);
    setStayNights(t, c.id, 3, 3);
    setStayNights(t, b.id, 2, 3);
    expect(a.from).toBeUndefined();
    expect(blocks(t, a.id)).toEqual([]);
    expect(c.from).toBe(3);
    removeStay(t, b.id);
    expect(blocks(t, b.id)).toEqual([]);
    expect(t.stays.map((x) => x.name)).toEqual(['A', 'C']);
  });

  it('the hotel becomes each day’s start and end point; on a change-over day you start at one and end at the next', () => {
    const t = trip();
    const a = stay(t, { name: 'A', lat: 26.92, lng: 75.82 }), b = stay(t, { name: 'B', lat: 26.85, lng: 75.8 });
    setStayNights(t, a.id, 0, 1);
    setStayNights(t, b.id, 2, 3);
    expect(dayEndpoint(t, 1, 'start')?.label).toBe('A');
    expect(dayEndpoint(t, 1, 'end')?.label).toBe('A');
    expect(dayEndpoint(t, 2, 'start')?.label).toBe('A');
    expect(dayEndpoint(t, 2, 'end')?.label).toBe('B');
    expect(dayEndpoint(t, 4, 'start')?.label).toBe('B');
    expect(stayForDay(t, 3)?.name).toBe('B');
  });

  it('keeps the Phase 4 behaviour for dated stays without a night range', () => {
    const t = trip();
    stay(t, { name: 'Dated', checkin: '2026-12-16', nights: 4 });
    expect(stayForDay(t, 1)?.name).toBe('Dated');
    expect(dayEndpoint(t, 4, 'start')?.label).toBe('Dated');
  });
});

describe('Check prices links', () => {
  it('fill in the hotel, city, dates and guests; no prices anywhere', () => {
    const l = priceLinks({ hotel: 'Raas & Co', city: 'Jodhpur', checkin: '2026-12-16', checkout: '2026-12-19', adults: 3, rooms: 2 });
    expect(l.map((x) => x.site)).toEqual(['Google Hotels', 'Booking.com', 'Agoda', 'Expedia']);
    const b = new URL(l[1].url);
    expect(b.hostname).toBe('www.booking.com');
    expect(b.searchParams.get('ss')).toBe('Raas & Co, Jodhpur');
    expect(b.searchParams.get('checkin')).toBe('2026-12-16');
    expect(b.searchParams.get('checkout')).toBe('2026-12-19');
    expect(b.searchParams.get('group_adults')).toBe('3');
    expect(b.searchParams.get('no_rooms')).toBe('2');
    expect(new URL(l[0].url).searchParams.get('q')).toContain('Raas & Co, Jodhpur');
    expect(new URL(l[3].url).searchParams.get('startDate')).toBe('2026-12-16');
  });
  it('leave the dates out when they are missing or backwards', () => {
    const l = priceLinks({ hotel: 'X', city: 'Y', checkin: '2026-12-19', checkout: '2026-12-16', adults: 2, rooms: 1 });
    expect(new URL(l[1].url).searchParams.get('checkin')).toBeNull();
  });
});

describe('Auto budget lines', () => {
  it('new trips are Auto for Stay and Activities; with no stays the Stay line is the estimate', () => {
    const t = trip();
    expect(t.budgetMode).toEqual({ stay: 'auto', act: 'auto' });
    expect(effectiveBudget(t).stay).toBe(estBudget(t).stay);
    expect(autoStay(t).lines.every((l) => l.basis === 'estimate')).toBe(true);
  });

  it('Booked stays first; else your stay; else the cheapest priced Shortlisted; else the estimate, night by night', () => {
    const t = trip(); // 5 days = 4 nights, 3 travellers = 2 rooms
    stay(t, { name: 'Cheap', price: 2000, checkin: '2026-12-16', nights: 4 });
    stay(t, { name: 'Dear', price: 5000, checkin: '2026-12-16', nights: 4 });
    stay(t, { name: 'Idea', price: 500, checkin: '2026-12-16', nights: 4, status: 'idea' });
    let a = autoStay(t);
    expect(a.lines.map((l) => [l.stay?.name, l.basis, l.nights.length])).toEqual([['Cheap', 'shortlisted', 4]]);
    expect(a.total).toBe(2000 * 2 * 4);

    const mine = stay(t, { name: 'Mine', price: 3000 });
    setStayNights(t, mine.id, 0, 1);
    const booked = stay(t, { name: 'Booked', price: 4000, status: 'booked', rooms: 1 });
    setStayNights(t, booked.id, 3, 3);
    a = autoStay(t);
    expect(a.lines.map((l) => [l.stay?.name, l.basis, l.nights])).toEqual([['Mine', 'chosen', [0, 1]], ['Cheap', 'shortlisted', [2]], ['Booked', 'booked', [3]]]);
    expect(a.total).toBe(3000 * 2 * 2 + 2000 * 2 + 4000);
    expect(effectiveBudget(t).stay).toBe(a.total);
  });

  it('flags stays without a price and falls back to the estimate for those nights', () => {
    const t = trip();
    const s = stay(t, { name: 'No price', price: 0 });
    setStayNights(t, s.id, 0, 0);
    const a = autoStay(t);
    expect(a.missingPrice.map((x) => x.name)).toEqual(['No price']);
    expect(a.lines[0].basis).toBe('estimate');
  });

  it('Activities follow entry fees × travellers, and the "costs more than the activities budget" check stays quiet', () => {
    const t = trip();
    t.plan[1].items[0].c = 700;
    expect(effectiveBudget(t).act).toBe(autoAct(t));
    expect(analyzeTrip(t).trip.some((w) => w.k === 'actcost')).toBe(false);
    t.budgetMode = { ...t.budgetMode, act: 'manual' };
    t.budget.act = 0;
    expect(analyzeTrip(t).trip.some((w) => w.k === 'actcost')).toBe(true);
  });

  it('Manual keeps the typed figure; plannedTotal and the budget check use the effective lines', () => {
    const t = trip({ budgetTotal: 1000 });
    t.budgetMode = { stay: 'manual', act: 'auto' };
    t.budget.stay = 12345;
    expect(effectiveBudget(t).stay).toBe(12345);
    stay(t, { price: 99999, status: 'booked', checkin: '2026-12-16', nights: 4 });
    expect(effectiveBudget(t).stay).toBe(12345);
    t.budgetMode.stay = 'auto';
    expect(effectiveBudget(t).stay).toBe(99999 * 2 * 4);
    expect(plannedTotal(t)).toBeGreaterThan(99999 * 8);
    expect(analyzeTrip(t).trip.find((w) => w.k === 'budget')?.body).toContain('₹');
  });
});

describe('migration v3 and portability', () => {
  it('existing trips keep their typed Stay and Activities figures (Manual); nothing is lost', () => {
    const t = trip();
    delete t.budgetMode;
    t.budget.stay = 7777;
    t.stays.push({ id: 's1', name: 'Kept', area: '', dest: 'jaipur', lat: null, lng: null, price: 1, nights: 2, checkin: '', checkout: '', rating: 0, link: '', notes: 'n', status: 'booked' });
    const out = migrate({ trips: { [t.id]: t } }, 2).trips[t.id];
    expect(out.budgetMode).toEqual({ stay: 'manual', act: 'manual' });
    expect(effectiveBudget(out).stay).toBe(7777);
    expect(out.stays).toEqual(t.stays);
    expect(out.plan).toEqual(t.plan);
  });

  it('night ranges, linked blocks and budget modes survive export/import and share links', () => {
    const t = trip();
    const s = stay(t, { lat: null, lng: null });
    setStayNights(t, s.id, 1, 2);
    t.budgetMode = { stay: 'manual', act: 'auto' };
    const back = normaliseTrip(exportJSON(t));
    expect(back.budgetMode).toEqual({ stay: 'manual', act: 'auto' });
    expect(back.stays[0]).toMatchObject({ from: 1, to: 2 });
    expect(blocks(back, s.id).map((b) => b.kind)).toEqual(['in', 'out']);
    expect(decodeShare(encodeShare(t)).stays[0].from).toBe(1);
  });
});
