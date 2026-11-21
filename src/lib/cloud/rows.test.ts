// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { addExpense, recordPayment, settleExpense } from '../../engine/expenses';
import { buildTrip, DEFAULT_PREFS } from '../../engine/generate';
import { customItem } from '../../engine/schedule';
import { setStayNights } from '../../engine/stays';
import type { Trip } from '../../engine/types';
import { diffRows, mergeRow, patchRows, rowsToTrip, tripToRows } from './rows';

const ID = '11111111-1111-1111-1111-111111111111', OWNER = '00000000-0000-0000-0000-00000000000a';
function rich(): Trip {
  const t = buildTrip({ dests: ['jaipur'], days: 4, start: '2026-12-16', travelers: ['Aman', 'Riya', 'Kabir'], pace: 'balanced', prefs: DEFAULT_PREFS, budgetTotal: 30000 });
  t.dests.push('g:ChIJTESTjodhpur0000000001');
  t.destRecords = { 'g:ChIJTESTjodhpur0000000001': { key: 'g:ChIJTESTjodhpur0000000001', kind: 'google', placeId: 'ChIJTESTjodhpur0000000001', name: 'Jodhpur', region: 'Rajasthan', country: 'India', countryCode: 'IN', center: { lat: 26.29, lng: 73.02 }, coordsFetchedAt: 1_790_000_000_000, type: 'tier2', currency: 'INR' } };
  t.plan[1].items[0].locked = true;
  t.plan[1].start = 480;
  t.plan[2].endLoc = { kind: 'none' };
  t.stays.push({ id: 'st1', name: '', gid: 'ChIJTESThotelalpha00001', nameLive: true, area: '', dest: 'jaipur', lat: 26.9, lng: 75.8, coordsFetchedAt: 1_790_000_000_000, price: 4200, nights: 1, checkin: '', checkout: '', rating: 0, link: '', notes: 'rooftop', status: 'shortlisted' } as Trip['stays'][number]);
  setStayNights(t, 'st1', 0, 2);
  t.stays[0].name = 'Haveli Alpha (live name)';
  const e = addExpense(t, { amt: 1200, cat: 'food', date: '2026-12-16', paid: 0, among: [0, 1, 2], note: 'Dinner', payers: [{ who: 0, amt: 800 }, { who: 1, amt: 400 }], split: { kind: 'shares', among: [0, 1, 2], values: [2, 1, 1] } });
  addExpense(t, { amt: 30, cur: 'USD', inr: 2502.6, fxDate: '2026-12-15', cat: 'act', date: '2026-12-17', time: '18:30', paid: 2, among: [1, 2], note: 'Show', notes: 'n', itemId: t.plan[1].items[0].id, split: { kind: 'equal', among: [1, 2] } });
  settleExpense(t, e.id, { who: [2], date: '2026-12-18', method: 'upi' });
  recordPayment(t, { from: 1, to: 0, amt: 99.5, date: '2026-12-18', method: 'cash', note: 'snacks' });
  t.pack[0].assignedTo = 1;
  t.pack[1].shared = true;
  t.wish.push(customItem({ id: 'w-live', gid: 'ChIJTESTplace0000000009', t: 'Live name', nameLive: true, cat: 'sight', lat: 26.9, lng: 75.8, coordsFetchedAt: 1_790_000_000_000 }));
  return t;
}

describe('Trip ⇄ rows', () => {
  it('round-trips a full trip (plan, wishlist, stays with nights, expenses with payers and splits, settlements, destinations)', () => {
    const t = rich();
    const back = rowsToTrip(tripToRows(t, ID, OWNER), 'editor', 1);
    const { id: _a, cloud, created: _c, updated: _u, me, ...b } = back;
    expect(cloud).toEqual({ role: 'editor' });
    expect(me).toBe(1);
    const strip = (x: Trip) => JSON.parse(JSON.stringify({ ...x, id: undefined, created: undefined, updated: undefined, sample: undefined, touched: undefined }));
    const want = strip(t);
    // live Google names are never written
    want.stays[0].name = '';
    delete want.stays[0].nameLive;
    const w = want.wish.find((x: { id: string }) => x.id === 'w-live');
    w.t = '';
    delete w.nameLive;
    // normalised on the way through: currency and INR value explicit, payers explicit; the server owns `updated`
    for (const e of want.expenses) {
      e.cur ??= 'INR';
      e.inr ??= e.amt;
      e.payers ??= [{ who: e.paid, amt: e.amt }];
      delete e.updated;
    }
    const got = strip(b as Trip);
    for (const x of [got, want]) for (const k of ['expenses', 'payments']) x[k].sort((p: { id: string }, q: { id: string }) => p.id.localeCompare(q.id));
    expect(got).toEqual(want);
  });
  it('is stable: rows → trip → rows gives the same rows (so syncing never sends phantom changes)', () => {
    const r1 = tripToRows(rich(), ID, OWNER);
    const r2 = tripToRows(rowsToTrip(r1, 'owner'), ID, OWNER);
    expect(diffRows(r1, r2)).toEqual({ trip: null, destinations: [], changes: [] });
  });
  it('never writes Google names; writes coordinates with their fetched-at time', () => {
    const r = tripToRows(rich(), ID, OWNER);
    expect(JSON.stringify(r)).not.toContain('Live name');
    expect(JSON.stringify(r)).not.toContain('Haveli Alpha');
    expect(r.stays[0]).toMatchObject({ gid: 'ChIJTESThotelalpha00001', name: '', coords_fetched_at: new Date(1_790_000_000_000).toISOString() });
    expect(r.destinations.find((d) => d.key === 'jaipur')).toMatchObject({ kind: 'curated' });
  });
});

describe('diff, patch and merge', () => {
  it('diff finds exactly the changed rows; patch re-applies pending edits on fresh server rows', () => {
    const t = rich();
    const base = tripToRows(t, ID, OWNER);
    const mine = structuredClone(t);
    mine.plan[0].items[1].s += 30;
    mine.plan[3].items.pop();
    mine.name = 'Renamed';
    const d = diffRows(base, tripToRows(mine, ID, OWNER));
    expect(d.trip?.name).toBe('Renamed');
    expect(d.changes.map((c) => [c.table, c.upserts.length, c.deletes.length])).toEqual([['items', 1, 1]]);
    // meanwhile someone else ticked a packing item
    const theirs = structuredClone(t);
    theirs.pack[2].done = !theirs.pack[2].done;
    const server = tripToRows(theirs, ID, OWNER);
    const merged = rowsToTrip(patchRows(server, d), 'owner');
    expect(merged.name).toBe('Renamed');
    expect(merged.plan[0].items[1].s).toBe(t.plan[0].items[1].s + 30);
    expect(merged.plan[3].items).toHaveLength(t.plan[3].items.length - 1);
    expect(merged.pack[2].done).toBe(theirs.pack[2].done);
  });
  it('merge: fields only one side changed merge cleanly; both changed differently is a conflict', () => {
    const base = { id: 'i1', title: 'Fort', start_min: 600, note: '', version: 3 };
    const r = mergeRow(base, { ...base, start_min: 660 }, { ...base, note: 'Book ahead', version: 4 });
    expect(r.conflicts).toEqual([]);
    expect(r.merged).toMatchObject({ start_min: 660, note: 'Book ahead', version: 4 });
    const c = mergeRow(base, { ...base, title: 'Fort (am)' }, { ...base, title: 'Amber Fort', version: 4 });
    expect(c.conflicts).toEqual([{ field: 'title', base: 'Fort', mine: 'Fort (am)', theirs: 'Amber Fort' }]);
    expect(c.merged.title).toBe('Amber Fort');
  });
});
