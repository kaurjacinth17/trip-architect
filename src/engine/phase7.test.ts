// @vitest-environment node
// Phase 7: Splitwise-grade expenses. Every split type, several payers, paisa rounding, settle and un-settle,
// simplify debts, balances summing to zero, edit history, soft delete, migration and CSV.
import { describe, expect, it } from 'vitest';
import { migrate } from '../store/trips';
import {
  addExpense, allocate, deleteExpense, describeChange, editExpense, expensesCSV, filterExpenses, isEdited, pairDebts,
  recordPayment, removeTraveller, rescale, resettleExpense, restoreExpense, settleExpense, settleState, simplify,
  spendSummary, tripBalances, unsettleExpense, upiLink, validate,
} from './expenses';
import { buildTrip, DEFAULT_PREFS } from './generate';
import { decodeShare, encodeShare } from './share';
import type { Expense, Trip } from './types';

const trip = (names = ['Aman', 'Riya', 'Kabir']) => buildTrip({ dests: ['goa'], days: 3, start: '2026-12-20', travelers: names, pace: 'balanced', prefs: DEFAULT_PREFS });
const ex = (o: Partial<Expense>): Expense => ({ id: 'e', amt: 0, cat: 'food', date: '2026-12-20', paid: 0, among: [], note: 'x', ...o });
const sumOf = (a: number[]) => a.reduce((s, x) => s + x, 0);

describe('split types (paise, remainders to the payer)', () => {
  it('equal: ₹100 three ways → 33.34 for the payer, 33.33 each for the others', () => {
    const a = allocate(ex({ amt: 100, paid: 1, among: [0, 1, 2] }), 3);
    expect(a.share).toEqual([3333, 3334, 3333]);
    expect(a.remainder).toBe(1);
    expect(a.remainderTo).toBe(1);
    expect(sumOf(a.share)).toBe(10000);
  });
  it('equal, payer not in the split: the remainder goes to the first person sharing it', () => {
    const a = allocate(ex({ amt: 10, paid: 2, among: [0, 1] , split: { kind: 'equal', among: [0, 1] } }), 3);
    expect(a.share).toEqual([500, 500, 0]);
    const b = allocate(ex({ amt: 0.01, paid: 2, split: { kind: 'equal', among: [0, 1] } }), 3);
    expect(b.share).toEqual([1, 0, 0]);
    expect(b.remainderTo).toBe(0);
  });
  it('exact amounts must add up to the paisa', () => {
    const e = ex({ amt: 1450, paid: 0, split: { kind: 'exact', among: [0, 1, 2], values: [500, 450.5, 499.5] } });
    expect(allocate(e, 3).share).toEqual([50000, 45050, 49950]);
    expect(validate(e, 3)).toEqual([]);
    expect(validate({ ...e, split: { kind: 'exact', among: [0, 1, 2], values: [500, 450, 499.99] } }, 3)[0]).toMatch(/add up to 1,449\.99, not 1,450\.00 \(0\.01 left\)/);
  });
  it('percentages: must total 100; rounding remainder to the payer', () => {
    const e = ex({ amt: 999.99, paid: 2, split: { kind: 'percent', among: [0, 1, 2], values: [50, 25, 25] } });
    const a = allocate(e, 3);
    expect(sumOf(a.share)).toBe(99999);
    expect(a.share).toEqual([49999, 24999, 25001]);
    expect(validate({ ...e, split: { kind: 'percent', among: [0, 1, 2], values: [50, 25, 20] } }, 3)[0]).toMatch(/95%/);
  });
  it('shares 2:1:1', () => {
    const a = allocate(ex({ amt: 1000, paid: 0, split: { kind: 'shares', among: [0, 1, 2], values: [2, 1, 1] } }), 3);
    expect(a.share).toEqual([50000, 25000, 25000]);
  });
  it('adjustments: +/− on top of an equal split of the rest', () => {
    // ₹1,000; Riya +₹100 (had an extra drink), Kabir −₹40 → the remaining ₹940 split three ways
    const a = allocate(ex({ amt: 1000, paid: 0, split: { kind: 'adjust', among: [0, 1, 2], values: [0, 100, -40] } }), 3);
    expect(a.share).toEqual([31334, 41333, 27333]);
    expect(sumOf(a.share)).toBe(100000);
    expect(validate(ex({ amt: 100, paid: 0, split: { kind: 'adjust', among: [0, 1], values: [-300, 0] } }), 2)[0]).toMatch(/negative/);
  });
});

describe('several payers', () => {
  it('amounts must add up to the total; balances reflect each payer', () => {
    const e = ex({ amt: 3000, payers: [{ who: 0, amt: 2000 }, { who: 1, amt: 1000 }], split: { kind: 'equal', among: [0, 1, 2] } });
    expect(validate(e, 3)).toEqual([]);
    expect(validate({ ...e, payers: [{ who: 0, amt: 2000 }, { who: 1, amt: 900 }] }, 3)[0]).toMatch(/100\.00 left/);
    const a = allocate(e, 3);
    expect(a.paid).toEqual([200000, 100000, 0]);
    expect(a.paid.map((p, i) => p - a.share[i])).toEqual([100000, 0, -100000]);
  });
  it('foreign currency: INR shares are rescaled to the fixed INR total, still exact', () => {
    const a = allocate(ex({ amt: 10, cur: 'USD', inr: 834.17, payers: [{ who: 0, amt: 10 }], split: { kind: 'equal', among: [0, 1, 2] } }), 3);
    expect(sumOf(a.share)).toBe(83417);
    expect(sumOf(a.paid)).toBe(83417);
  });
  it('rescale keeps sums exact', () => {
    expect(sumOf(rescale([333, 333, 334], 83417))).toBe(83417);
  });
});

describe('balances, settling and simplify', () => {
  const setup = () => {
    const t = trip(['Aman', 'Riya', 'Kabir', 'Dia']);
    addExpense(t, ex({ amt: 1200, paid: 0, among: [0, 1, 2, 3], note: 'Dinner' }));
    addExpense(t, ex({ amt: 899.99, payers: [{ who: 1, amt: 500 }, { who: 2, amt: 399.99 }], split: { kind: 'shares', among: [0, 1, 2, 3], values: [1, 2, 1, 3] }, note: 'Boat' }));
    addExpense(t, ex({ amt: 47, cur: 'USD', inr: 3921.11, paid: 3, split: { kind: 'percent', among: [0, 3], values: [33.3, 66.7] }, note: 'Club' }));
    return t;
  };
  it('balances sum to exactly zero (paise), with and without payments', () => {
    const t = setup();
    expect(sumOf(tripBalances(t).net)).toBe(0);
    recordPayment(t, { from: 1, to: 0, amt: 123.45, date: '2026-12-21', method: 'cash', note: '' });
    expect(sumOf(tripBalances(t).net)).toBe(0);
    // the drill-down adds up to each balance
    const b = tripBalances(t);
    b.entries.forEach((list, i) => expect(sumOf(list.map((x) => x.amount))).toBe(b.net[i]));
  });
  it('simplify debts: fewest payments; pair view nets each pair; both clear every balance', () => {
    const t = setup();
    const b = tripBalances(t);
    for (const plan of [simplify(b.net), pairDebts(t)]) {
      const after = [...b.net];
      for (const [f, to, x] of plan) { after[f] += x; after[to] -= x; }
      expect(after).toEqual([0, 0, 0, 0]);
    }
    expect(simplify(b.net).length).toBeLessThanOrEqual(3);
  });
  it('settle one expense for one person, then everyone; un-settle; re-settle after an edit', () => {
    const t = setup();
    const dinner = t.expenses[0];
    const p1 = settleExpense(t, dinner.id, { who: [1], date: '2026-12-22', method: 'upi' });
    expect(p1).toHaveLength(1);
    expect(p1[0]).toMatchObject({ from: 1, to: 0, amt: 300, method: 'upi', expenseId: dinner.id });
    expect(settleState(t, dinner)).toMatchObject({ debtors: [1, 2, 3], settled: [1], done: false });
    settleExpense(t, dinner.id, { date: '2026-12-22', method: 'cash' });
    expect(settleState(t, dinner).done).toBe(true);
    expect(filterExpenses(t, 'unsettled').map((e) => e.note)).not.toContain('Dinner');
    unsettleExpense(t, dinner.id, [2]);
    expect(settleState(t, dinner).settled).toEqual([1, 3]);
    unsettleExpense(t, dinner.id);
    expect(settleState(t, dinner).settled).toEqual([]);
    // settle, edit the amount, re-settle with the new amounts
    settleExpense(t, dinner.id, { date: '2026-12-22', method: 'upi' });
    editExpense(t, dinner.id, { ...dinner, amt: 1600 });
    resettleExpense(t, dinner.id);
    expect(settleState(t, t.expenses[0]).done).toBe(true);
    expect((t.payments || []).filter((p) => !p.deleted && p.expenseId === dinner.id).map((p) => p.amt)).toEqual([400, 400, 400]);
    expect(sumOf(tripBalances(t).net)).toBe(0);
  });
});

describe('edit history, soft delete and travellers', () => {
  it('logs “₹1,200 → ₹1,450; split equal → exact” with who made the change', () => {
    const t = trip();
    t.me = 0;
    const e = addExpense(t, ex({ amt: 1200, paid: 0, among: [0, 1, 2], note: 'Dinner' }));
    expect(isEdited(e)).toBe(false);
    const text = editExpense(t, e.id, { ...e, amt: 1450, split: { kind: 'exact', among: [0, 1, 2], values: [450, 500, 500] } });
    expect(text).toBe('₹1,200 → ₹1,450; split equal → exact');
    expect(t.expenses[0].history!.at(-1)).toMatchObject({ by: 'Aman', text });
    expect(isEdited(t.expenses[0])).toBe(true);
    expect(editExpense(t, e.id, { ...t.expenses[0] })).toBe(''); // no change, no entry
    expect(describeChange(t, e, { ...e, payers: [{ who: 1, amt: 1200 }] })).toBe('paid by Aman → Riya');
  });
  it('delete is soft and restorable; deleted expenses leave balances and spending', () => {
    const t = trip();
    const e = addExpense(t, ex({ amt: 900, paid: 0, among: [0, 1, 2] }));
    settleExpense(t, e.id, { date: '2026-12-21', method: 'cash' });
    deleteExpense(t, e.id);
    expect(tripBalances(t).net).toEqual([0, 0, 0]);
    expect(t.expenses).toHaveLength(1);
    restoreExpense(t, e.id);
    expect(settleState(t, t.expenses[0]).done).toBe(true);
    expect(tripBalances(t).net).toEqual([0, 0, 0]);
    unsettleExpense(t, e.id);
    expect(tripBalances(t).net).toEqual([60000, -30000, -30000]);
  });
  it('a traveller with expenses can’t be removed; one without can, and everyone is renumbered', () => {
    const t = trip(['A', 'B', 'C']);
    addExpense(t, ex({ amt: 100, paid: 2, split: { kind: 'equal', among: [0, 2] } }));
    expect(removeTraveller(t, 0)).toBe(false);
    expect(removeTraveller(t, 1)).toBe(true);
    expect(t.travelers).toEqual(['A', 'C']);
    expect(t.expenses[0]).toMatchObject({ paid: 1, among: [0, 1], split: { among: [0, 1] } });
  });
});

describe('migration v4, CSV, UPI and share links', () => {
  it('existing expenses read as single payer, equal split, unsettled, with no field changed', () => {
    const t = trip(['A', 'B']);
    const old = { id: 'e1', amt: 1200, cat: 'food', date: '2026-12-01', paid: 1, among: [0, 1], note: 'Dinner', cur: 'INR', inr: 1200 } as Expense;
    t.expenses = [old];
    delete t.payments;
    const m = migrate({ trips: { [t.id]: t } }, 3).trips[t.id];
    expect(m.expenses[0]).toEqual(old);
    expect(m.payments).toEqual([]);
    expect(tripBalances(m).net).toEqual([-60000, 60000]);
    expect(settleState(m, m.expenses[0])).toMatchObject({ debtors: [0], settled: [], done: false });
  });
  it('CSV has one row per expense and payment, per-person shares, and neutralises formulas', () => {
    const t = trip(['A', 'B']);
    addExpense(t, ex({ amt: 100, paid: 0, among: [0, 1], note: '=HYPERLINK("x")' }));
    recordPayment(t, { from: 1, to: 0, amt: 50, date: '2026-12-21', method: 'upi', note: '' });
    const lines = expensesCSV(t).trim().split('\r\n');
    expect(lines[0]).toBe('Type,Date,Time,Description,Category,Amount,Currency,Amount (INR),Paid by,Split,A share (INR),B share (INR),Settled,Notes');
    expect(lines[1]).toContain(`"'=HYPERLINK(""x"")"`);
    expect(lines[1]).toContain('50.00,50.00');
    expect(lines[2]).toMatch(/^Payment,2026-12-21,,B paid A/);
  });
  it('UPI link has the payee, amount in rupees to 2 places, INR and a note', () => {
    const u = upiLink({ pa: 'riya@okaxis', pn: 'Riya', am: 300, tn: 'Goa trip: Dinner' });
    expect(u.startsWith('upi://pay?')).toBe(true);
    const q = new URLSearchParams(u.slice('upi://pay?'.length));
    expect(Object.fromEntries(q)).toEqual({ pa: 'riya@okaxis', pn: 'Riya', am: '300.00', cu: 'INR', tn: 'Goa trip: Dinner' });
  });
  it('spend summary totals; share links keep payments but not UPI IDs', () => {
    const t: Trip = trip(['A', 'B']);
    addExpense(t, ex({ amt: 100, paid: 0, among: [0, 1] }));
    t.travelerUpi = ['a@okicici', null];
    recordPayment(t, { from: 1, to: 0, amt: 50, date: '2026-12-21', method: 'upi', note: '' });
    const s = spendSummary(t);
    expect(s.total).toBe(10000);
    expect(s.settle).toEqual([]);
    const back = decodeShare(encodeShare(t));
    expect(back.payments).toHaveLength(1);
    expect(back.travelerUpi).toBeUndefined();
  });
});
