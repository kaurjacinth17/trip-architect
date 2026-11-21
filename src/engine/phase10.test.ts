// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { addExpense } from './expenses';
import { addLeg, extraDayChecks, fromTemplate, gcalLink, toICS, toTemplate } from './extras';
import { buildTrip, DEFAULT_PREFS } from './generate';
import { customItem } from './schedule';
import { tidy } from './schedule';

const trip = () => buildTrip({ dests: ['jaipur'], days: 4, start: '2026-12-16', travelers: ['Aman', 'Riya'], pace: 'balanced', prefs: DEFAULT_PREFS, name: 'Jaipur; with friends, 2026' });

describe('calendar export', () => {
  it('one VEVENT per block with local times, escaped text and folded lines', () => {
    const t = trip();
    t.plan[0].items[0].n = 'Bring ID; passport, tickets\nand cash';
    const ics = toICS(t)!;
    const events = ics.match(/BEGIN:VEVENT/g)!.length;
    expect(events).toBe(t.plan.reduce((s, d) => s + d.items.length, 0));
    expect(ics).toContain('X-WR-CALNAME:Jaipur\\; with friends\\, 2026');
    expect(ics).toContain('DTSTART:20261216T120000');
    expect(ics).toContain('Bring ID\\; passport\\, tickets\\nand cash');
    for (const line of ics.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(toICS(t, 1)!.match(/BEGIN:VEVENT/g)!.length).toBe(t.plan[1].items.length);
    expect(toICS({ ...t, start: '' })).toBeNull();
  });
  it('Google Calendar link with dates and title', () => {
    const t = trip();
    const u = new URL(gcalLink(t, 0, t.plan[0].items[0])!);
    expect(u.searchParams.get('action')).toBe('TEMPLATE');
    expect(u.searchParams.get('dates')).toBe('20261216T120000/20261216T130000');
  });
});

describe('templates', () => {
  it('strip expenses, names, notes, stays, bookings and booking refs; using one gives your own dates and ids', () => {
    const t = trip();
    addExpense(t, { amt: 500, cat: 'food', date: '2026-12-16', paid: 0, among: [0, 1], note: 'Dinner at Suvarna' });
    t.notes = 'PNR 123';
    t.contacts = [{ name: 'Mum', phone: '+91 98765 43210' }];
    t.plan[1].items[0].booking = { status: 'booked', ref: 'ABC' };
    const tpl = toTemplate(t);
    const j = JSON.stringify(tpl);
    for (const s of ['Aman', 'Riya', 'PNR 123', 'Suvarna', 'Mum', 'ABC', '98765']) expect(j).not.toContain(s);
    expect(tpl.start).toBe('');
    expect(tpl.plan.map((d) => d.items.length)).toEqual(t.plan.map((d) => d.items.length));
    const mine = fromTemplate(tpl, { start: '2027-01-05', travelers: ['Me', 'You'] });
    expect(mine.start).toBe('2027-01-05');
    expect(mine.id).not.toBe(tpl.id);
    expect(mine.plan[0].items[0].id).not.toBe(tpl.plan[0].items[0].id);
  });
});

describe('travel legs', () => {
  it('locked transit block; an overnight leg moves the next day’s start after arrival; tidy keeps it', () => {
    const t = trip();
    const x = addLeg(t, 1, { mode: 'train', from: 'Delhi', to: 'Jaipur', ref: '4512345678' }, 22 * 60, 8 * 60);
    expect(x).toMatchObject({ cat: 'transit', locked: true, s: 1320, d: 480, leg: { mode: 'train', ref: '4512345678' } });
    expect(t.plan[2].start).toBe(6 * 60 + 60);
    tidy(t.plan[1], 8 * 60);
    expect(t.plan[1].items.find((y) => y.id === x.id)!.s).toBe(1320);
  });
  it('checks: late arrival before an early start', () => {
    const t = trip();
    addLeg(t, 0, { mode: 'train', from: 'Delhi', to: 'Jaipur' }, 17 * 60, 400); // arrives 11:40 PM
    t.plan[1].items.sort((a, b) => a.s - b.s)[0].s = 8 * 60;
    const w = extraDayChecks(t, 1);
    expect(w.find((x) => x.k === 'lateleg')?.title).toBe('Train arrives 11:40 PM; Day 2 starts at 8:00 AM');
  });
});

describe('needs and weather checks', () => {
  it('children, seniors, rain on an outdoor day and midday heat', () => {
    const t = trip();
    t.needs = { kids: true, senior: true };
    t.plan[1].items = [customItem({ t: 'Night market', cat: 'night', s: 21 * 60, d: 120 }), customItem({ t: 'Fort', cat: 'heritage', s: 9 * 60, d: 240 }), customItem({ t: 'Garden', cat: 'nature', s: 13 * 60, d: 120 })];
    const w = extraDayChecks(t, 1, { tmax: 37, tmin: 22, rainProb: 70, rainMm: 12 });
    expect(w.map((x) => x.k).sort()).toEqual(['heat', 'kids', 'rain', 'senior']);
    expect(extraDayChecks({ ...t, needs: {} }, 1, { tmax: 28, tmin: 18, rainProb: 10, rainMm: 0 })).toEqual([]);
  });
});
