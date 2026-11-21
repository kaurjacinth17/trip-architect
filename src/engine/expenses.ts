// Group expenses, Splitwise-style. All money maths is in integer paise, so every split adds up to the paisa and
// balances always sum to exactly zero. Rounding remainders go to the payer. The app records payments; it never
// moves money.
import { BCATS } from '../data/constants';
import type { Expense, ExpenseChange, Payer, PayMethod, Payment, Split, SplitKind, Trip } from './types';
import { inr, uid } from './util';

export const SPLIT_KINDS: [SplitKind, string][] = [['equal', 'Equally'], ['exact', 'Exact amounts'], ['percent', 'Percentages'], ['shares', 'Shares'], ['adjust', 'Adjustments']];
export const METHODS: [PayMethod, string][] = [['upi', 'UPI'], ['cash', 'Cash'], ['bank', 'Bank transfer'], ['other', 'Other']];

const P = (x: number) => Math.round((Number(x) || 0) * 100); // to paise / minor units
export const rupees = (p: number) => p / 100;
const everyone = (n: number) => Array.from({ length: n }, (_, i) => i);
const sumI = (a: number[]) => a.reduce((s, x) => s + x, 0);

/* ------------------------------------------------------------------------------------------- reading */

export const live = <T extends { deleted?: number }>(xs: T[] | undefined) => (xs || []).filter((x) => !x.deleted);
export const liveExpenses = (t: Pick<Trip, 'expenses'>) => live(t.expenses);
export const livePayments = (t: Pick<Trip, 'payments'>) => live(t.payments);

/** Payers: several, or (older expenses) `paid` paid the whole amount. */
export function payersOf(e: Expense): Payer[] {
  return e.payers?.length ? e.payers : [{ who: e.paid, amt: e.amt }];
}
/** Split: as saved, or (older expenses) equal among `among` (everyone when empty). */
export function splitOf(e: Expense, n: number): Split {
  if (e.split) return e.split;
  return { kind: 'equal', among: e.among?.length ? e.among.filter((i) => i < n) : everyone(n) };
}
/** The payer who receives rounding remainders: the largest payer (first on a tie). */
export function mainPayer(payers: Payer[]): number {
  return [...payers].sort((a, b) => b.amt - a.amt)[0]?.who ?? 0;
}

/* -------------------------------------------------------------------------------------------- maths */

/** Share each person's part of `total` minor units by weights, rounding down; returns the shares and the remainder. */
function byWeight(total: number, among: number[], w: (i: number) => number, n: number) {
  const W = among.reduce((s, i) => s + Math.max(0, w(i)), 0);
  const out = new Array(n).fill(0);
  if (!(W > 0)) return { out, rem: total };
  for (const i of among) out[i] = Math.floor((total * Math.max(0, w(i))) / W);
  return { out, rem: total - sumI(out) };
}

export interface Allocation {
  /** Minor units of the expense currency */
  total: number;
  paidMinor: number[];
  shareMinor: number[];
  /** INR paise, each array summing exactly to `inrTotal` */
  inrTotal: number;
  paid: number[];
  share: number[];
  /** Rounding remainder (minor units) and who took it */
  remainder: number;
  remainderTo: number | null;
}

/** Scale integer parts to a new total with the largest-remainder method, so they still sum exactly. */
export function rescale(parts: number[], to: number): number[] {
  const from = sumI(parts);
  if (from === to) return [...parts];
  if (!from) return parts.map(() => 0);
  const raw = parts.map((x) => (x * to) / from);
  const out = raw.map(Math.floor);
  let left = to - sumI(out);
  const order = raw.map((x, i) => ({ i, f: x - Math.floor(x) })).sort((a, b) => b.f - a.f || a.i - b.i);
  for (let k = 0; left > 0 && order.length; k = (k + 1) % order.length, left--) out[order[k].i]++;
  return out;
}

/** Who paid and who owes what for one expense, in minor units and in INR paise. */
export function allocate(e: Expense, n: number): Allocation {
  const total = P(e.amt);
  const payers = payersOf(e);
  const sp = splitOf(e, n);
  const among = [...new Set(sp.among.filter((i) => i >= 0 && i < n))];
  const v = (i: number) => Number(sp.values?.[i]) || 0;
  const paidMinor = new Array(n).fill(0);
  for (const p of payers) if (p.who < n) paidMinor[p.who] += P(p.amt);

  let share = new Array(n).fill(0), rem = 0;
  if (among.length) {
    if (sp.kind === 'equal') ({ out: share, rem } = byWeight(total, among, () => 1, n));
    else if (sp.kind === 'shares') ({ out: share, rem } = byWeight(total, among, v, n));
    else if (sp.kind === 'percent') {
      for (const i of among) share[i] = Math.floor((total * v(i)) / 100);
      rem = total - sumI(share);
    } else if (sp.kind === 'exact') {
      for (const i of among) share[i] = P(v(i));
      rem = total - sumI(share);
    } else {
      const adj = among.map((i) => P(v(i)));
      const pool = total - sumI(adj);
      const each = Math.floor(pool / among.length);
      among.forEach((i, k) => { share[i] = each + adj[k]; });
      rem = total - sumI(share);
    }
  } else rem = total;
  const main = mainPayer(payers);
  const remainderTo = rem ? (among.includes(main) ? main : among[0] ?? main) : null;
  if (remainderTo != null) share[remainderTo] += rem;

  const inrTotal = P(e.inr ?? e.amt);
  return {
    total, paidMinor, shareMinor: share, inrTotal,
    paid: rescale(paidMinor, inrTotal), share: rescale(share, inrTotal),
    remainder: rem, remainderTo,
  };
}

/** Problems that stop an expense being saved (amounts must add up to the paisa). */
export function validate(e: Pick<Expense, 'amt' | 'payers' | 'split' | 'paid' | 'among'>, n: number): string[] {
  const out: string[] = [];
  const total = P(e.amt);
  if (!(total > 0)) out.push('Enter an amount.');
  const payers = e.payers?.length ? e.payers : [{ who: e.paid, amt: e.amt }];
  const paid = sumI(payers.map((p) => P(p.amt)));
  if (payers.length > 1 && paid !== total) out.push(`Payers add up to ${fmt(paid)}, not ${fmt(total)} (${paid < total ? fmt(total - paid) + ' left' : fmt(paid - total) + ' too much'}).`);
  if (payers.some((p) => P(p.amt) < 0)) out.push('A payer amount is negative.');
  const sp = e.split || { kind: 'equal' as const, among: e.among };
  const among = sp.among.filter((i) => i < n);
  if (!among.length) out.push('Choose at least one person to split with.');
  const v = (i: number) => Number(sp.values?.[i]) || 0;
  if (sp.kind === 'exact') {
    const s = sumI(among.map((i) => P(v(i))));
    if (s !== total) out.push(`Exact amounts add up to ${fmt(s)}, not ${fmt(total)} (${s < total ? fmt(total - s) + ' left' : fmt(s - total) + ' too much'}).`);
  }
  if (sp.kind === 'percent') {
    const s = among.reduce((a, i) => a + v(i), 0);
    if (Math.abs(s - 100) > 0.001) out.push(`Percentages add up to ${+s.toFixed(3)}%, not 100%.`);
  }
  if (sp.kind === 'shares' && !(among.reduce((a, i) => a + Math.max(0, v(i)), 0) > 0)) out.push('Give at least one person a share.');
  if ((sp.kind === 'percent' || sp.kind === 'shares' || sp.kind === 'exact') && among.some((i) => v(i) < 0)) out.push('Values can’t be negative.');
  if (sp.kind === 'adjust' && sumI(among.map((i) => P(v(i)))) > total) out.push('Adjustments are more than the total.');
  if (!out.length && allocate({ ...e, id: '', cat: 'misc', date: '', note: '' } as Expense, n).shareMinor.some((x) => x < 0)) out.push('An adjustment makes someone’s share negative.');
  return out;
}
const fmt = (minor: number) => (minor / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ----------------------------------------------------------------------------------------- balances */

export interface BalanceEntry { kind: 'expense' | 'payment'; id: string; date: string; label: string; amount: number }
export interface Balances {
  /** Net per traveller in paise: positive = is owed money. Sums to exactly 0. */
  net: number[];
  paid: number[];
  share: number[];
  /** Drill-down: what makes up each person's balance (paise; + raises it) */
  entries: BalanceEntry[][];
}

export function tripBalances(t: Pick<Trip, 'travelers' | 'expenses' | 'payments'>): Balances {
  const n = Math.max(1, t.travelers.length);
  const net = new Array(n).fill(0), paid = new Array(n).fill(0), share = new Array(n).fill(0);
  const entries: BalanceEntry[][] = Array.from({ length: n }, () => []);
  for (const e of liveExpenses(t)) {
    const a = allocate(e, n);
    for (let i = 0; i < n; i++) {
      const d = a.paid[i] - a.share[i];
      paid[i] += a.paid[i];
      share[i] += a.share[i];
      net[i] += d;
      if (a.paid[i] || a.share[i]) entries[i].push({ kind: 'expense', id: e.id, date: e.date, label: e.note || 'Expense', amount: d });
    }
  }
  for (const p of livePayments(t)) {
    if (p.from >= n || p.to >= n) continue;
    const amt = P(p.amt);
    net[p.from] += amt;
    net[p.to] -= amt;
    entries[p.from].push({ kind: 'payment', id: p.id, date: p.date, label: `Paid ${t.travelers[p.to]}`, amount: amt });
    entries[p.to].push({ kind: 'payment', id: p.id, date: p.date, label: `Received from ${t.travelers[p.from]}`, amount: -amt });
  }
  return { net, paid, share, entries };
}

/**
 * For one expense: what each debtor owes each creditor (paise). With one payer everyone owes the payer; with several,
 * debtors are matched to creditors largest first, so every amount is exact to the paisa on both sides.
 */
export function expenseDebts(e: Expense, n: number): [number, number, number][] {
  const a = allocate(e, n);
  return simplify(a.paid.map((x, i) => x - a.share[i]));
}

/** Who owes whom without simplifying: debts per pair from every expense, less payments between them. */
export function pairDebts(t: Pick<Trip, 'travelers' | 'expenses' | 'payments'>): [number, number, number][] {
  const n = Math.max(1, t.travelers.length);
  const m = Array.from({ length: n }, () => new Array(n).fill(0));
  for (const e of liveExpenses(t)) for (const [d, c, x] of expenseDebts(e, n)) m[d][c] += x;
  for (const p of livePayments(t)) if (p.from < n && p.to < n) m[p.from][p.to] -= P(p.amt);
  const out: [number, number, number][] = [];
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
    const x = m[a][b] - m[b][a];
    if (x > 0) out.push([a, b, x]);
    else if (x < 0) out.push([b, a, -x]);
  }
  return out.sort((x, y) => y[2] - x[2]);
}

/** Simplify debts: the fewest payments that clear every balance (largest debtor pays largest creditor). Paise. */
export function simplify(net: number[]): [number, number, number][] {
  const cr = net.map((b, i) => ({ i, b })).filter((x) => x.b > 0).sort((a, b) => b.b - a.b || a.i - b.i);
  const db = net.map((b, i) => ({ i, b: -b })).filter((x) => x.b > 0).sort((a, b) => b.b - a.b || a.i - b.i);
  const out: [number, number, number][] = [];
  while (cr.length && db.length) {
    const c = cr[0], d = db[0], m = Math.min(c.b, d.b);
    out.push([d.i, c.i, m]);
    c.b -= m;
    d.b -= m;
    if (!c.b) cr.shift();
    if (!d.b) db.shift();
  }
  return out;
}

/* --------------------------------------------------------------------------------------- settling */

export const linkedPayments = (t: Pick<Trip, 'payments'>, expenseId: string) => livePayments(t).filter((p) => p.expenseId === expenseId);

export interface SettleState { debtors: number[]; settled: number[]; done: boolean; last?: Payment }
/** Which of an expense's debtors have settled it (via linked payments). */
export function settleState(t: Pick<Trip, 'travelers' | 'payments'>, e: Expense): SettleState {
  const n = Math.max(1, t.travelers.length);
  const debtors = [...new Set(expenseDebts(e, n).map(([d]) => d))];
  const links = linkedPayments(t, e.id);
  const settled = debtors.filter((d) => links.some((p) => p.from === d));
  const last = [...links].sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  return { debtors, settled, done: debtors.length > 0 && settled.length === debtors.length, last };
}

/** Mark an expense settled for `who` (debtors; default everyone): adds linked payments for what they owe. Mutates. */
export function settleExpense(t: Trip, expenseId: string, o: { who?: number[]; date: string; method: PayMethod; note?: string }): Payment[] {
  const e = t.expenses.find((x) => x.id === expenseId && !x.deleted);
  if (!e) return [];
  const n = Math.max(1, t.travelers.length);
  const done = new Set(linkedPayments(t, e.id).map((p) => p.from));
  const who = new Set(o.who ?? everyone(n));
  const now = Date.now();
  const add = expenseDebts(e, n).filter(([d]) => who.has(d) && !done.has(d)).map(([from, to, x]): Payment => ({
    id: uid(), from, to, amt: rupees(x), date: o.date, method: o.method, note: o.note || `Settled “${e.note || 'expense'}”`, expenseId: e.id, created: now,
  }));
  t.payments = [...(t.payments || []), ...add];
  return add;
}

/** Un-settle: remove the payments linked to this expense (for `who`, or everyone). Mutates. */
export function unsettleExpense(t: Trip, expenseId: string, who?: number[]) {
  const now = Date.now();
  for (const p of t.payments || []) if (p.expenseId === expenseId && !p.deleted && (!who || who.includes(p.from))) p.deleted = now;
}

/** After editing a settled expense: settle again with the new amounts, for the same people. Mutates. */
export function resettleExpense(t: Trip, expenseId: string) {
  const links = linkedPayments(t, expenseId);
  if (!links.length) return [];
  const who = [...new Set(links.map((p) => p.from))];
  const { date, method } = links[0];
  unsettleExpense(t, expenseId);
  return settleExpense(t, expenseId, { who, date, method });
}

/** Record a payment between two people (INR). Mutates. */
export function recordPayment(t: Trip, p: Omit<Payment, 'id' | 'created'>): Payment {
  const x: Payment = { ...p, amt: Math.round(p.amt * 100) / 100, id: uid(), created: Date.now() };
  t.payments = [...(t.payments || []), x];
  return x;
}

/* ------------------------------------------------------------------------------------- edit history */

const who = (t: Pick<Trip, 'travelers'>, i: number) => t.travelers[i] ?? '?';
const payStr = (t: Pick<Trip, 'travelers'>, e: Expense) => payersOf(e).map((p) => (payersOf(e).length > 1 ? `${who(t, p.who)} ${money(p.amt, e.cur)}` : who(t, p.who))).join(', ');
const money = (x: number, cur = 'INR') => (cur === 'INR' ? inr(x) : `${cur} ${x.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`);
const kindName = (k: SplitKind) => k === 'adjust' ? 'adjusted' : k;

/** "₹1,200 → ₹1,450; split equal → exact" */
export function describeChange(t: Pick<Trip, 'travelers'>, a: Expense, b: Expense): string {
  const n = Math.max(1, t.travelers.length);
  const out: string[] = [];
  if (a.note !== b.note) out.push(`“${a.note || '—'}” → “${b.note || '—'}”`);
  if (a.amt !== b.amt || (a.cur || 'INR') !== (b.cur || 'INR')) out.push(`${money(a.amt, a.cur)} → ${money(b.amt, b.cur)}`);
  if (a.cat !== b.cat) out.push(`category ${BCATS.find((c) => c[0] === a.cat)?.[1]} → ${BCATS.find((c) => c[0] === b.cat)?.[1]}`);
  if (a.date !== b.date || (a.time || '') !== (b.time || '')) out.push(`date ${a.date}${a.time ? ' ' + a.time : ''} → ${b.date}${b.time ? ' ' + b.time : ''}`);
  if (payStr(t, a) !== payStr(t, b)) out.push(`paid by ${payStr(t, a)} → ${payStr(t, b)}`);
  const sa = splitOf(a, n), sb = splitOf(b, n);
  if (sa.kind !== sb.kind) out.push(`split ${kindName(sa.kind)} → ${kindName(sb.kind)}`);
  else if (JSON.stringify(allocate(a, n).share) !== JSON.stringify(allocate(b, n).share)) out.push('shares changed');
  const am = (s: Split) => [...s.among].sort().map((i) => who(t, i)).join(', ');
  if (am(sa) !== am(sb)) out.push(`between ${am(sa)} → ${am(sb)}`);
  if ((a.notes || '') !== (b.notes || '')) out.push('notes edited');
  if ((a.itemId || '') !== (b.itemId || '')) out.push('linked activity changed');
  return out.join('; ');
}

/** The traveller name to credit edits to on this device. */
export const editor = (t: Pick<Trip, 'travelers' | 'me'>) => (t.me != null && t.travelers[t.me] ? t.travelers[t.me] : 'You');

/** Keep the compatibility fields (`paid`, `among`) in step with `payers`/`split`. */
export function syncCompat(e: Expense) {
  if (e.payers?.length) e.paid = mainPayer(e.payers);
  if (e.split) e.among = [...e.split.among];
}

/** Add an expense. Mutates. */
export function addExpense(t: Trip, e: Omit<Expense, 'id' | 'created' | 'updated' | 'history'>): Expense {
  const now = Date.now();
  const x: Expense = { ...e, id: uid(), created: now, updated: now, history: [{ at: now, by: editor(t), text: 'added it' }] };
  syncCompat(x);
  t.expenses.push(x);
  return x;
}

/** Save an edited expense, logging what changed. Returns the change text ('' when nothing changed). Mutates. */
export function editExpense(t: Trip, id: string, next: Expense): string {
  const i = t.expenses.findIndex((x) => x.id === id);
  if (i < 0) return '';
  const prev = t.expenses[i];
  const x: Expense = { ...next, id, created: prev.created, history: [...(prev.history || [])] };
  syncCompat(x);
  const text = describeChange(t, prev, x);
  if (!text) return '';
  const now = Date.now();
  x.updated = now;
  x.history!.push({ at: now, by: editor(t), text });
  t.expenses[i] = x;
  return text;
}

export const isEdited = (e: Expense) => (e.history || []).some((h: ExpenseChange) => h.text !== 'added it');

/** Soft delete (restorable). Linked settlements are set aside too. Mutates. */
export function deleteExpense(t: Trip, id: string) {
  const e = t.expenses.find((x) => x.id === id);
  if (!e || e.deleted) return;
  e.deleted = Date.now();
  for (const p of t.payments || []) if (p.expenseId === id && !p.deleted) p.deleted = e.deleted;
  (e.history ||= []).push({ at: e.deleted, by: editor(t), text: 'deleted it' });
}
export function restoreExpense(t: Trip, id: string) {
  const e = t.expenses.find((x) => x.id === id);
  if (!e?.deleted) return;
  for (const p of t.payments || []) if (p.expenseId === id && p.deleted === e.deleted) delete p.deleted;
  delete e.deleted;
  (e.history ||= []).push({ at: Date.now(), by: editor(t), text: 'restored it' });
}

/* ------------------------------------------------------------------------------------- travellers */

/** Is traveller `i` part of any live expense or payment? (They can't be removed until that's sorted.) */
export function involved(t: Trip, i: number): number {
  const n = Math.max(1, t.travelers.length);
  return liveExpenses(t).filter((e) => { const a = allocate(e, n); return a.paid[i] || a.share[i]; }).length
    + livePayments(t).filter((p) => p.from === i || p.to === i).length;
}

/** Remove traveller `i` and renumber everyone after them. Returns false when they're still involved. Mutates. */
export function removeTraveller(t: Trip, i: number): boolean {
  if (t.travelers.length < 2 || involved(t, i)) return false;
  const re = (k: number) => (k > i ? k - 1 : k);
  t.travelers.splice(i, 1);
  t.travelerUpi?.splice(i, 1);
  if (t.me != null) t.me = t.me === i ? undefined : re(t.me);
  // Deleted expenses and payments that mention them are dropped; the rest are renumbered.
  t.expenses = t.expenses.filter((e) => !(e.deleted && (payersOf(e).some((p) => p.who === i) || e.among.includes(i))));
  for (const e of t.expenses) {
    e.paid = re(e.paid === i ? 0 : e.paid);
    e.among = e.among.filter((k) => k !== i).map(re);
    if (e.payers) e.payers = e.payers.filter((p) => p.who !== i).map((p) => ({ ...p, who: re(p.who) }));
    if (e.split) e.split = { ...e.split, among: e.split.among.filter((k) => k !== i).map(re), ...(e.split.values ? { values: e.split.values.filter((_, k) => k !== i) } : {}) };
  }
  t.payments = (t.payments || []).filter((p) => p.from !== i && p.to !== i).map((p) => ({ ...p, from: re(p.from), to: re(p.to) }));
  return true;
}

/* ------------------------------------------------------------------------------------------- views */

/** INR paise of one person's share of an expense */
export const shareOf = (t: Pick<Trip, 'travelers'>, e: Expense, i: number) => allocate(e, Math.max(1, t.travelers.length)).share[i] || 0;

export type ExpenseView = 'all' | 'person' | 'day' | 'category' | 'unsettled';
export function filterExpenses(t: Trip, view: ExpenseView, person?: number): Expense[] {
  const list = [...liveExpenses(t)].sort((a, b) => (a.date + (a.time || '') < b.date + (b.time || '') ? 1 : -1));
  const n = Math.max(1, t.travelers.length);
  if (view === 'person' && person != null) return list.filter((e) => { const a = allocate(e, n); return a.paid[person] || a.share[person]; });
  if (view === 'unsettled') return list.filter((e) => { const s = settleState(t, e); return s.debtors.length > 0 && !s.done; });
  return list;
}
export function groupExpenses(list: Expense[], by: 'day' | 'category'): [string, Expense[]][] {
  const m = new Map<string, Expense[]>();
  for (const e of list) {
    const k = by === 'day' ? e.date || 'No date' : e.cat;
    m.set(k, [...(m.get(k) || []), e]);
  }
  return [...m.entries()];
}

/* -------------------------------------------------------------------------------------------- export */

const csvCell = (v: string | number) => {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) || /^[=+\-@]/.test(s) ? `"${(/^[=+\-@]/.test(s) ? "'" : '') + s.replace(/"/g, '""')}"` : s;
};

/** CSV of expenses and payments (INR shares per person). Cells that look like formulas are neutralised. */
export function expensesCSV(t: Trip): string {
  const n = Math.max(1, t.travelers.length);
  const head = ['Type', 'Date', 'Time', 'Description', 'Category', 'Amount', 'Currency', 'Amount (INR)', 'Paid by', 'Split', ...t.travelers.map((x) => `${x} share (INR)`), 'Settled', 'Notes'];
  const rows: (string | number)[][] = [head];
  for (const e of [...liveExpenses(t)].sort((a, b) => (a.date < b.date ? -1 : 1))) {
    const a = allocate(e, n);
    const s = settleState(t, e);
    rows.push(['Expense', e.date, e.time || '', e.note, BCATS.find((c) => c[0] === e.cat)?.[1] || e.cat, e.amt.toFixed(2), e.cur || 'INR', rupees(a.inrTotal).toFixed(2),
      payersOf(e).map((p) => `${who(t, p.who)}${payersOf(e).length > 1 ? ' ' + p.amt.toFixed(2) : ''}`).join('; '), splitOf(e, n).kind,
      ...a.share.map((x) => rupees(x).toFixed(2)), s.done ? 'yes' : s.settled.length ? 'partly' : s.debtors.length ? 'no' : '', e.notes || '']);
  }
  for (const p of [...livePayments(t)].sort((a, b) => (a.date < b.date ? -1 : 1))) {
    rows.push(['Payment', p.date, '', `${who(t, p.from)} paid ${who(t, p.to)}`, '', p.amt.toFixed(2), 'INR', p.amt.toFixed(2), who(t, p.from), METHODS.find((m) => m[0] === p.method)?.[1] || p.method, ...new Array(n).fill(''), '', p.note]);
  }
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/** Trip spend summary for Share and Print. */
export function spendSummary(t: Trip) {
  const b = tripBalances(t);
  const list = liveExpenses(t);
  const n = Math.max(1, t.travelers.length);
  const total = list.reduce((s, e) => s + allocate(e, n).inrTotal, 0);
  const byCat = BCATS.map(([k, l]) => [l, list.filter((e) => e.cat === k).reduce((s, e) => s + allocate(e, n).inrTotal, 0)] as const).filter(([, v]) => v > 0);
  return { total, count: list.length, byCat, people: t.travelers.map((name, i) => ({ name, paid: b.paid[i], share: b.share[i], net: b.net[i] })), settle: simplify(b.net) };
}

/* ------------------------------------------------------------------------------------------------ UPI */

/** UPI ID shape (handle@bank); the app never checks it with a bank. */
export const UPI_RE = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9.-]{1,63}$/;

/** `upi://pay` deep link (opens a UPI app on a phone). The app never processes the payment. */
export function upiLink(o: { pa: string; pn: string; am: number; tn: string }): string {
  const q = new URLSearchParams({ pa: o.pa, pn: o.pn, am: o.am.toFixed(2), cu: 'INR', tn: o.tn.slice(0, 80) });
  return `upi://pay?${q.toString()}`;
}
