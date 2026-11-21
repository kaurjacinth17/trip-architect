// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PL } from '../data/destinations';
import { balances, settleUp } from './budget';
import { analyzeDay, analyzeTrip } from './checks';
import { applyFix } from './fixes';
import { buildSampleTrip, buildTrip, DEFAULT_PREFS } from './generate';
import { km, mode, travelMin } from './geo';
import { cascade, customItem, itemFromPlace, sortDay } from './schedule';
import { decodeShare, encodeShare, exportJSON, normaliseTrip } from './share';
import { dayDate } from './time';
import type { Fix, Trip, TripFix } from './types';

const TODAY = new Date('2026-11-20T10:00:00');

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(TODAY);
});
afterAll(() => vi.useRealTimers());

const titles = (ws: { title: string }[]) => ws.map((w) => w.title);
const tripFix = (f: Fix | null | undefined): TripFix => {
  if (!f || f.a === 'ptab') throw new Error('expected a trip fix');
  return f;
};

describe('1. sample trip', () => {
  const t = buildSampleTrip(TODAY); // built at collection time, before the clock is mocked, so pass the date explicitly

  it('matches the reference set-up', () => {
    expect(t.name).toBe('Jaipur getaway');
    expect(t.dests).toEqual(['jaipur']);
    expect(t.plan).toHaveLength(4);
    expect(t.travelers).toHaveLength(2);
    expect(t.pace).toBe('balanced');
    expect(t.prefs.tier).toBe(1);
    expect(t.budgetTotal).toBe(25000);
    expect(t.start).toBe('2026-12-11'); // 21 days from the mocked today
    expect(t.sample).toBe(true);
    const chokhi = t.plan[2].items.find((x) => x.pid === 'jaipur:chokhi');
    expect(chokhi?.s).toBe(18 * 60);
  });

  it('flags Day 3 as overloaded with a tight transfer to Chokhi Dhani', () => {
    const w = analyzeDay(t, 2);
    expect(titles(w)).toContain('Day 3 looks overloaded');
    expect(titles(w)).toContain('Tight transfer to Chokhi Dhani');
    expect(w.find((x) => x.k === 'over')?.lvl).toBe('alert');
    expect(w.find((x) => x.k === 'transfer')?.lvl).toBe('alert');
  });

  it('flags the trip budget', () => {
    expect(titles(analyzeTrip(t).trip)).toContain('Planned costs exceed your budget');
  });

  it('moveOut removes the overload alert', () => {
    const over = analyzeDay(t, 2).find((x) => x.k === 'over')!;
    const r = applyFix(t, tripFix(over.fix));
    expect(r.message).toMatch(/^Moved /);
    expect(titles(analyzeDay(r.trip, 2))).not.toContain('Day 3 looks overloaded');
    // the original is untouched (fixes are pure)
    expect(titles(analyzeDay(t, 2))).toContain('Day 3 looks overloaded');
  });
});

describe('2. arrival day', () => {
  for (const [dest, days] of [['jaipur', 4], ['goa', 5], ['udaipur', 3], ['varanasi', 3], ['kerala', 6]] as const) {
    it(`Day 1 in ${dest} starts with check-in at noon then lunch, no morning or food stops`, () => {
      const t = buildTrip({ dests: [dest], days, travelers: ['A', 'B'], pace: 'balanced', prefs: DEFAULT_PREFS });
      const d1 = t.plan[0].items;
      expect(d1[0].t).toBe('Arrive and check in');
      expect(d1[0].s).toBe(720);
      expect(d1[1].t).toBe('Lunch');
      for (const x of d1.filter((x) => x.pid)) {
        expect(PL[x.pid!].best).not.toBe('am');
        expect(['food', 'cafe']).not.toContain(x.cat);
      }
    });
  }
});

describe('3. two-stop trip', () => {
  const t = buildTrip({ dests: ['jaipur', 'udaipur'], days: 6, start: '2026-12-16', travelers: ['A', 'B'], pace: 'balanced', prefs: DEFAULT_PREFS });
  const d4 = t.plan[3];

  it('Day 4 is in Udaipur and starts with a long transit block', () => {
    expect(d4.dest).toBe('udaipur');
    const first = d4.items[0];
    expect(first.t).toBe('Travel to Udaipur');
    expect(first.cat).toBe('transit');
    expect(first.d).toBe(405);
    expect(first.d).toBeGreaterThanOrEqual(360);
    expect(first.d).toBeLessThanOrEqual(420);
  });

  it('Day 4 has no lunch warning because the transit covers midday', () => {
    expect(analyzeDay(t, 3).some((w) => w.k === 'lunch')).toBe(false);
  });
});

describe('4. weekday-only market', () => {
  // 2026-12-14 is a Monday, so Day 3 (2026-12-16) is a Wednesday.
  const base = (): Trip => {
    const t = buildTrip({ dests: ['goa'], days: 5, start: '2026-12-14', travelers: ['A'], pace: 'balanced', prefs: DEFAULT_PREFS });
    for (const d of t.plan) d.items = d.items.filter((x) => x.pid !== 'goa:anjuna');
    t.wish = t.wish.filter((x) => x.pid !== 'goa:anjuna');
    return t;
  };

  it('raises an alert off-Wednesday and the fix moves it to the Wednesday', () => {
    const t = base();
    expect(dayDate(t, 1)!.getDay()).toBe(2); // Tuesday
    const x = itemFromPlace(PL['goa:anjuna'], 15 * 60);
    t.plan[1].items.push(x);
    sortDay(t.plan[1]);
    const w = analyzeDay(t, 1).find((w) => w.k === 'weekday');
    expect(w?.lvl).toBe('alert');
    expect(w?.title).toBe('Anjuna Flea Market runs on Wednesdays');
    const f = tripFix(w!.fix);
    expect(f.a).toBe('moveTo');
    const r = applyFix(t, f);
    const moved = r.trip.plan.findIndex((d) => d.items.some((i) => i.id === x.id));
    expect(dayDate(r.trip, moved)!.getDay()).toBe(3);
    expect(analyzeDay(r.trip, moved).some((w) => w.k === 'weekday')).toBe(false);
  });

  it('has no fix when no trip day is a Wednesday', () => {
    const t = base();
    t.plan = t.plan.slice(0, 2); // Mon, Tue
    t.plan[1].items.push(itemFromPlace(PL['goa:anjuna'], 15 * 60));
    const w = analyzeDay(t, 1).find((w) => w.k === 'weekday');
    expect(w?.body).toContain('None of your trip days match');
    expect(w?.fix).toBeNull();
  });
});

function bare(items: ReturnType<typeof customItem>[]): Trip {
  const t = buildTrip({ dests: ['jaipur'], days: 3, travelers: ['A'], pace: 'balanced', prefs: DEFAULT_PREFS });
  t.plan[1].items = items;
  return t;
}

describe('5. transfers', () => {
  it('flags a 10 km hop with a 5 minute gap, and cascade resolves it', () => {
    const a = customItem({ t: 'A', cat: 'sight', s: 600, d: 60, lat: 26.9, lng: 75.8 });
    // ~10 km due north
    const b = customItem({ t: 'B', cat: 'sight', s: 665, d: 60, lat: 26.9 + 10 / 110.57, lng: 75.8 });
    expect(km(a, b)).toBeCloseTo(10, 0);
    const t = bare([a, b]);
    const w = analyzeDay(t, 1).find((w) => w.k === 'transfer');
    expect(w?.title).toBe('Tight transfer to B');
    const r = applyFix(t, tripFix(w!.fix));
    expect(analyzeDay(r.trip, 1).some((w) => w.k === 'transfer')).toBe(false);
    expect(r.trip.plan[1].items[1].s).toBeGreaterThanOrEqual(660 + travelMin(km(a, b)));
  });
});

describe('6. overlaps', () => {
  it('flags overlapping items, and cascade resolves it', () => {
    const t = bare([customItem({ t: 'Long lunch', cat: 'custom', s: 720, d: 120 }), customItem({ t: 'Museum', cat: 'custom', s: 780, d: 60 })]);
    const w = analyzeDay(t, 1).find((w) => w.k === 'overlap');
    expect(w?.lvl).toBe('alert');
    expect(w?.title).toBe('Museum overlaps Long lunch');
    const r = applyFix(t, tripFix(w!.fix));
    expect(analyzeDay(r.trip, 1).some((w) => w.k === 'overlap')).toBe(false);
    expect(r.trip.plan[1].items[1].s).toBe(840);
  });

  it('cascade never moves anything earlier', () => {
    const day = { dest: 'jaipur', label: '', items: [customItem({ s: 600, d: 30 }), customItem({ s: 900, d: 30 })] };
    cascade(day);
    expect(day.items.map((x) => x.s)).toEqual([600, 900]);
  });
});

describe('7. travel time', () => {
  it('uses the reference speed bands', () => {
    expect(travelMin(0.3)).toBe(5);
    expect(travelMin(null)).toBe(0);
    expect(mode(1.4)).toBe('walk');
    expect(mode(1.6)).toBe('ride');
    expect(travelMin(1)).toBe(15); // walking, 14 min/km rounded up to 5
    expect(travelMin(5)).toBe(35); // 6.5 km road at 18 km/h + 10
    expect(travelMin(200)).toBe(up5(((200 * 1.15) / 60) * 60 + 10)); // highway band
    expect(travelMin(200)).toBe(240);
  });
});
const up5 = (m: number) => Math.ceil(m / 5) * 5;

describe('8. settle-up', () => {
  it('A owes B ₹600 for a ₹1,200 expense paid by B and split two ways', () => {
    const bal = balances(['A', 'B'], [{ id: 'e', amt: 1200, cat: 'food', date: '', paid: 1, among: [0, 1], note: '' }]);
    expect(bal).toEqual([-600, 600]);
    expect(settleUp(bal)).toEqual([[0, 1, 600]]);
  });
});

describe('9. persistence', () => {
  it('export then import gives an equivalent trip with a new id', () => {
    const t = buildTrip({ dests: ['goa'], days: 4, start: '2026-12-01', travelers: ['A', 'B', 'C'], pace: 'relaxed', prefs: DEFAULT_PREFS, budgetTotal: 40000, name: 'Goa' });
    t.notes = 'PNR 123';
    const back = normaliseTrip(exportJSON(t));
    expect(back.id).not.toBe(t.id);
    const { id: _a, ...x } = back;
    const { id: _b, ...y } = t;
    expect(x).toEqual(y);
  });

  it('rejects files that are not trips', () => {
    expect(() => normaliseTrip('{"hello":1}')).toThrow();
    expect(() => normaliseTrip('nope')).toThrow();
  });
});

describe('10. share link', () => {
  it('round-trips a trip', () => {
    const t = buildTrip({ dests: ['kerala'], days: 6, start: '2027-01-10', travelers: ['A', 'B'], pace: 'packed', prefs: DEFAULT_PREFS });
    const data = encodeShare(t);
    expect(data).toMatch(/^[A-Za-z0-9+\-$]+$/);
    expect(decodeShare(data)).toEqual(t);
    expect(decodeShare('#' + data)).toEqual(t);
  });

  it('rejects damaged links', () => {
    expect(() => decodeShare('garbage')).toThrow();
  });
});
