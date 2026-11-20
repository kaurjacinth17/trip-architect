// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PL } from '../data/destinations';
import { bulkDelete, bulkMoveToDay, bulkShift, bulkToWishlist, shiftRestOfDay } from './bulk';
import { analyzeDay, analyzeTrip } from './checks';
import { deleteDay, duplicateDay, insertDay, moveDay, swapDays } from './days';
import { FIXES, applyFix } from './fixes';
import { buildSampleTrip, buildTrip, DEFAULT_PREFS } from './generate';
import type { Period } from './hours';
import { cascade, customItem, itemFromPlace, routeOrder, sortDay, tidy } from './schedule';
import { dayEndpoint, stayForDay } from './stays';
import type { Item, Trip, TripFix } from './types';
import { clone } from './util';

beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-20T10:00:00')); });
afterAll(() => vi.useRealTimers());

const jaipur = (days = 4, start = '2026-12-14'): Trip => buildTrip({ dests: ['jaipur'], days, start, travelers: ['A', 'B'], pace: 'balanced', prefs: DEFAULT_PREFS });
const place = (pid: string, s: number, o: Partial<Item> = {}) => ({ ...itemFromPlace(PL[pid], s), ...o });

describe('locked blocks survive every automatic operation', () => {
  // Day: Hawa Mahal 9:00, LOCKED Jantar Mantar 9:30 (overlaps), City Palace 10:00, Amber Fort 15:00, Nahargarh 18:00
  const day = () => {
    const t = jaipur(3);
    t.plan[1].items = [
      place('jaipur:hawa', 540),
      place('jaipur:jantar', 570, { locked: true, id: 'LOCK' }),
      place('jaipur:citypalace', 600),
      place('jaipur:amber', 900),
      place('jaipur:nahargarh', 1080),
    ];
    return t;
  };
  const lockOf = (t: Trip) => t.plan.flatMap((d) => d.items).find((x) => x.id === 'LOCK')!;

  it('cascade', () => { const t = day(); cascade(t.plan[1]); expect(lockOf(t).s).toBe(570); });
  it('tidy', () => { const t = day(); tidy(t.plan[1], 480); expect(lockOf(t).s).toBe(570); expect(t.plan[1].items[0].s).toBe(480); });
  it('optimise route (reorders only between locks)', () => {
    const t = day();
    expect(routeOrder(t.plan[1])).toBe(true);
    expect(lockOf(t).s).toBe(570);
    const idx = t.plan[1].items.findIndex((x) => x.id === 'LOCK');
    expect(t.plan[1].items.slice(0, idx).map((x) => x.pid)).toEqual(['jaipur:hawa']);
  });
  it('every one-click fix', () => {
    const t = day();
    const fixes: TripFix[] = [
      { l: '', a: 'moveOut', di: 1, v: 5 }, { l: '', a: 'cascade', di: 1 }, { l: '', a: 'addLunch', di: 1 },
      { l: '', a: 'route', di: 1 }, { l: '', a: 'toEvening', di: 1, id: 'LOCK' }, { l: '', a: 'moveTo', di: 1, id: 'LOCK', v: 2 },
      { l: '', a: 'breakAfter', di: 1, id: t.plan[1].items[0].id }, { l: '', a: 'addTransit', di: 1, id: t.plan[1].items[2].id, v: 30 },
    ];
    for (const f of fixes) {
      const r = applyFix(t, f);
      const l = r.trip.plan.flatMap((d, di) => d.items.map((x) => ({ x, di }))).find((o) => o.x.id === 'LOCK')!;
      expect([f.a, l.di, l.x.s]).toEqual([f.a, 1, 570]);
    }
    expect(Object.keys(FIXES)).toContain('afterLock');
  });
  it('“running late” shifts and bulk shifts', () => {
    const t = day();
    const r = shiftRestOfDay(t, 1, 540, 30);
    expect(lockOf(r.trip).s).toBe(570);
    expect(r.skipped).toBe(1);
    expect(r.trip.plan[1].items.find((x) => x.pid === 'jaipur:hawa')!.s).toBe(570);
  });
  it('conflicts with a locked block are alerts, with a fix that moves the other block', () => {
    const t = day();
    const w = analyzeDay(t, 1).find((x) => x.k === 'lock')!;
    expect(w.lvl).toBe('alert');
    expect(w.title).toBe('Hawa Mahal clashes with locked Jantar Mantar');
    const r = applyFix(t, w.fix as TripFix);
    expect(lockOf(r.trip).s).toBe(570);
    expect(analyzeDay(r.trip, 1).some((x) => x.k === 'lock' && x.title.startsWith('Hawa'))).toBe(false);
  });
  it('fixes are not offered for locked blocks', () => {
    const t = jaipur(5);
    const x = place('jaipur:nahargarh', 600, { locked: true });
    t.plan[2].items = [x];
    expect(analyzeDay(t, 2).find((w) => w.k === 'time' && w.id === x.id)?.fix).toBeNull();
  });
});

describe('inserting', () => {
  it('“after block X” goes directly after X even if the next block starts sooner; later blocks move, locked ones don’t', async () => {
    const { placeAfter, placeAtExact } = await import('./schedule');
    const t = jaipur(3);
    t.plan[1].items = [place('jaipur:hawa', 540), place('jaipur:jantar', 605), place('jaipur:citypalace', 900, { locked: true })];
    const x = customItem({ t: 'Stepwell', cat: 'sight', d: 60, lat: 26.9154, lng: 75.817 });
    placeAfter(t, 1, x, t.plan[1].items[0].id);
    expect(t.plan[1].items.map((i) => i.t)).toEqual(['Hawa Mahal', 'Stepwell', 'Jantar Mantar', 'City Palace']);
    expect(t.plan[1].items[1].s).toBeGreaterThanOrEqual(600);
    expect(t.plan[1].items[2].s).toBeGreaterThanOrEqual(t.plan[1].items[1].s + 60);
    expect(t.plan[1].items[3].s).toBe(900);
    const y = customItem({ t: 'Lunch', cat: 'meal', d: 60 });
    placeAtExact(t, 1, y, 870); // runs into the locked City Palace: the lock holds, the clash is flagged
    expect(t.plan[1].items.find((i) => i.t === 'City Palace')!.s).toBe(900);
    expect(analyzeDay(t, 1).some((w) => w.k === 'lock')).toBe(true);
  });
});

describe('day operations', () => {
  it('insert, delete (to wishlist), duplicate, swap and reorder', () => {
    const t = jaipur(3);
    const ins = insertDay(t, 1);
    expect(ins.plan).toHaveLength(4);
    expect(ins.plan[1]).toMatchObject({ dest: 'jaipur', items: [] });
    expect(ins.days).toBe(4);

    const acts = t.plan[1].items.filter((x) => !['meal', 'transit', 'rest'].includes(x.cat));
    const del = deleteDay(t, 1);
    expect(del.plan).toHaveLength(2);
    expect(del.wish.slice(-acts.length).map((x) => x.id)).toEqual(acts.map((x) => x.id));
    expect(() => deleteDay(jaipur(1), 0)).toThrow();

    const dup = duplicateDay(t, 0);
    expect(dup.plan[1].items.map((x) => x.t)).toEqual(t.plan[0].items.map((x) => x.t));
    expect(dup.plan[1].items[0].id).not.toBe(t.plan[0].items[0].id);

    const sw = swapDays(t, 0, 2);
    expect(sw.plan[0].label).toBe(t.plan[2].label);
    expect(sw.plan[2].label).toBe(t.plan[0].label);

    // drag Day 3 above Day 2
    const mv = moveDay(t, 2, 1);
    expect(mv.plan.map((d) => d.label)).toEqual([t.plan[0].label, t.plan[2].label, t.plan[1].label]);
    expect(t.plan).toHaveLength(3); // original untouched
  });
});

describe('bulk actions', () => {
  it('move to a day keeping times, shift, delete and send to wishlist', () => {
    const t = jaipur(3);
    const ids = t.plan[1].items.filter((x) => x.pid).slice(0, 2).map((x) => x.id);
    const times = t.plan[1].items.filter((x) => ids.includes(x.id)).map((x) => x.s);
    const m = bulkMoveToDay(t, ids, 2);
    expect(m.changed).toBe(2);
    const moved = m.trip.plan[2].items.filter((x) => ids.includes(x.id));
    expect(moved).toHaveLength(2);
    // kept their times, or moved later only if they clashed with Day 3's plan (never earlier)
    for (const x of moved) expect(x.s).toBeGreaterThanOrEqual(times[ids.indexOf(x.id)]);
    expect(m.trip.plan[1].items.some((x) => ids.includes(x.id))).toBe(false);
    const sh = bulkShift(t, ids, -15);
    expect(sh.trip.plan[1].items.filter((x) => ids.includes(x.id)).map((x) => x.s)).toEqual(times.map((s) => s - 15));
    expect(bulkDelete(t, ids).trip.plan[1].items.some((x) => ids.includes(x.id))).toBe(false);
    const meal = t.plan[1].items.find((x) => x.cat === 'meal');
    const w = bulkToWishlist(t, [...ids, ...(meal ? [meal.id] : [])]);
    expect(w.changed).toBe(2);
    expect(w.skipped).toBe(meal ? 1 : 0);
  });
});

describe('new realism checks', () => {
  const D = (day: number, h: number) => day * 1440 + h * 60;
  const gidItem = (o: Partial<Item>) => customItem({ gid: 'ChIJTESTplace0000000001', t: 'Test place', cat: 'sight', lat: 26.92, lng: 75.82, ...o });

  it('opening hours: closed that weekday, not open yet, closes before the visit ends; meals too', () => {
    const t = jaipur(3, '2026-12-14'); // Day 1 Monday, Day 2 Tuesday
    const monToSat10to18: Period[] = [1, 2, 3, 4, 5, 6].map((d) => ({ open: D(d, 10), close: D(d, 18) }));
    const closedTuesday: Period[] = [0, 1, 3, 4, 5, 6].map((d) => ({ open: D(d, 10), close: D(d, 18) }));
    t.plan[1].items = [gidItem({ s: 1020, d: 120 })];
    const ctx = (p: Period[]) => ({ hours: { ChIJTESTplace0000000001: p } });
    expect(analyzeDay(t, 1, ctx(monToSat10to18)).find((w) => w.k === 'hours')?.title).toBe('Test place closes at 6:00 PM');
    expect(analyzeDay(t, 1, ctx(closedTuesday)).find((w) => w.k === 'hours')).toMatchObject({ lvl: 'alert', title: 'Test place is closed on Tuesdays' });
    t.plan[1].items = [gidItem({ s: 540, d: 60, cat: 'meal', t: 'Thali House' })];
    expect(analyzeDay(t, 1, ctx(monToSat10to18)).find((w) => w.k === 'hours')?.title).toBe('Meal at Thali House isn’t open at 9:00 AM');
    expect(analyzeDay(t, 1, { closed: { ChIJTESTplace0000000001: 'permanently' } }).find((w) => w.k === 'closed')?.title).toBe('Thali House is permanently closed');
    expect(analyzeDay(t, 1).some((w) => w.k === 'hours')).toBe(false); // no hours loaded → no guess
  });

  it('first stop / day end far from the hotel', () => {
    const t = buildSampleTrip(new Date());
    t.plan[1].items = [place('jaipur:amber', 600), place('jaipur:jaigarh', 800)];
    const w = analyzeDay(t, 1);
    expect(stayForDay(t, 1)?.name).toBe('Old City haveli (sample)');
    expect(w.find((x) => x.k === 'hotelfar')?.title).toMatch(/^\d+ min from Old City haveli \(sample\) to the first stop$/);
    expect(w.find((x) => x.k === 'hotelback')?.title).toMatch(/min back to Old City haveli \(sample\)$/);
    t.plan[1].startLoc = { kind: 'none' };
    expect(dayEndpoint(t, 1, 'start')).toBeNull();
    expect(analyzeDay(t, 1).some((x) => x.k === 'hotelfar')).toBe(false);
  });

  it('busy mornings on check-in and check-out days', () => {
    const t = buildTrip({ dests: ['jaipur', 'udaipur'], days: 4, start: '2026-12-14', travelers: ['A'], pace: 'packed', prefs: DEFAULT_PREFS });
    const firstUdaipur = t.plan.findIndex((d) => d.dest === 'udaipur');
    t.plan[firstUdaipur].items = [customItem({ t: 'Long walk', cat: 'sight', s: 540, d: 150 })];
    expect(analyzeDay(t, firstUdaipur).some((w) => w.k === 'checkin')).toBe(true);
    t.plan[firstUdaipur - 1].items = [customItem({ t: 'Fort', cat: 'sight', s: 480, d: 210 })];
    expect(analyzeDay(t, firstUdaipur - 1).some((w) => w.k === 'checkout')).toBe(true);
  });

  it('per-day pace and day start/end', () => {
    const t = jaipur(4);
    const base = analyzeDay(t, 1).some((w) => w.k === 'over' || w.k === 'heavy');
    const relaxed = clone(t);
    relaxed.plan[1].pace = 'relaxed';
    relaxed.plan[1].items.push(customItem({ t: 'Extra', cat: 'sight', s: 1200, d: 90 }));
    sortDay(relaxed.plan[1]);
    expect(base).toBe(false);
    expect(analyzeDay(relaxed, 1).some((w) => w.k === 'over' || w.k === 'heavy')).toBe(true);
    relaxed.plan[1].start = 600;
    relaxed.plan[1].end = 1200;
    const w = analyzeDay(relaxed, 1).map((x) => x.k);
    expect(w).toContain('daystart');
    expect(w).toContain('dayend');
  });

  it('legacy mode runs exactly the reference rules', () => {
    const t = buildSampleTrip(new Date());
    expect(analyzeTrip(t, { legacyOnly: true }).days.flat().some((w) => ['hotelfar', 'hotelback', 'checkin', 'checkout'].includes(w.k))).toBe(false);
  });
});
