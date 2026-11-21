// Add or edit an expense: description, amount, currency, category, date and time, linked activity, notes,
// one or several payers, and an equal / exact / percentage / shares / adjustment split checked to the paisa.
import { useState } from 'react';
import { Modal } from '../../../components/Modal';
import { BCATS } from '../../../data/constants';
import { FX_SUPPORTED } from '../../../data/currencies';
import { toINR } from '../../../engine/currency';
import { allocate, linkedPayments, payersOf, splitOf, SPLIT_KINDS, validate } from '../../../engine/expenses';
import { fmtT } from '../../../engine/time';
import type { BudgetKey, Expense, SplitKind, Trip } from '../../../engine/types';
import { todayISO } from '../../../engine/util';
import { useRates } from '../../../lib/live';

const HINT: Record<SplitKind, string> = {
  equal: 'Split equally between the people ticked.',
  exact: 'Type what each person owes. It must add up to the total.',
  percent: 'Type each person’s percentage. It must add up to 100%.',
  shares: 'Type shares, e.g. 2 for a couple and 1 each for the others.',
  adjust: 'Type an extra (+) or a discount (−) for anyone; the rest is split equally.',
};

export interface ExpenseDraft { e: Omit<Expense, 'id'>; resettle: boolean }

export function ExpenseForm({ t, initial, onSave, onClose }: { t: Trip; initial?: Expense; onSave: (d: ExpenseDraft) => void; onClose: () => void }) {
  const n = t.travelers.length;
  const all = t.travelers.map((_, i) => i);
  const today = todayISO();
  const sp0 = initial ? splitOf(initial, n) : { kind: 'equal' as SplitKind, among: all };
  const pay0 = initial ? payersOf(initial) : [{ who: t.me ?? 0, amt: 0 }];
  const [f, setF] = useState({
    note: initial?.note || '', amt: initial ? String(initial.amt) : '', cur: initial?.cur || t.currency || 'INR', cat: (initial?.cat || 'food') as BudgetKey,
    date: initial?.date || (t.start && today < t.start ? t.start : today), time: initial?.time || '', itemId: initial?.itemId || '', notes: initial?.notes || '',
    many: pay0.length > 1, payer: pay0[0]?.who ?? 0, payers: Object.fromEntries(pay0.map((p) => [p.who, String(p.amt)])) as Record<number, string>,
    kind: sp0.kind, among: sp0.among, values: Object.fromEntries((sp0.values || []).map((v, i) => [i, v == null ? '' : String(v)])) as Record<number, string>,
  });
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const settledLinks = initial ? linkedPayments(t, initial.id) : [];
  const [resettle, setResettle] = useState(true);

  const fx = useRates(f.cur !== 'INR');
  const amt = Math.round((+f.amt || 0) * 100) / 100;
  const sameMoney = initial && initial.amt === amt && (initial.cur || 'INR') === f.cur;
  const inrValue = f.cur === 'INR' ? amt : sameMoney && initial?.inr != null ? initial.inr : toINR(amt, f.cur, fx.data);
  const draft: Omit<Expense, 'id'> = {
    ...(initial ? { created: initial.created, history: initial.history } : {}),
    note: f.note.trim(), amt, cur: f.cur, inr: inrValue ?? undefined, cat: f.cat, date: f.date, ...(f.time ? { time: f.time } : {}),
    ...(f.itemId ? { itemId: f.itemId } : {}), ...(f.notes.trim() ? { notes: f.notes.trim() } : {}),
    ...(f.cur !== 'INR' ? { fxDate: sameMoney && initial?.fxDate ? initial.fxDate : fx.data?.date } : {}),
    payers: f.many ? all.filter((i) => +f.payers[i] > 0).map((i) => ({ who: i, amt: Math.round(+f.payers[i] * 100) / 100 })) : [{ who: f.payer, amt }],
    paid: f.payer, among: f.among,
    split: { kind: f.kind, among: f.among, ...(f.kind !== 'equal' ? { values: all.map((i) => (f.among.includes(i) && f.values[i] !== '' && f.values[i] != null ? +f.values[i] : null)) } : {}) },
  };
  const errors = validate(draft, n);
  if (f.cur !== 'INR' && inrValue == null) errors.push(fx.isLoading ? 'Loading the exchange rate…' : 'Exchange rates aren’t available right now; enter the amount in ₹.');
  if (f.many && !draft.payers!.length && amt > 0) errors.push('Enter what each payer paid.');
  const alloc = !errors.length ? allocate({ ...draft, id: 'draft' } as Expense, n) : null;
  const curSym = f.cur === 'INR' ? '₹' : f.cur + ' ';
  const m = (minor: number) => curSym + (minor / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const paidLeft = f.many ? Math.round(amt * 100) - all.reduce((s, i) => s + Math.round((+f.payers[i] || 0) * 100), 0) : 0;
  const items = t.plan.flatMap((d, di) => [...d.items].sort((a, b) => a.s - b.s).map((x) => ({ id: x.id, label: `Day ${di + 1} · ${fmtT(x.s)} · ${x.t}` })));
  const unit = f.kind === 'percent' ? '%' : f.kind === 'shares' ? 'shares' : curSym.trim();

  return (
    <Modal title={initial ? 'Edit expense' : 'Add an expense'} onClose={onClose} wide>
      <form className="grid" style={{ gap: 12 }} onSubmit={(e) => { e.preventDefault(); if (!errors.length) { onSave({ e: draft, resettle: settledLinks.length > 0 && resettle }); onClose(); } }}>
        <h2>{initial ? 'Edit expense' : 'Add an expense'}</h2>
        <div className="grid g3" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))' }}>
          <label className="f" style={{ gridColumn: '1 / -1' }}>Description<input type="text" value={f.note} placeholder="e.g. Dinner at the fort" onChange={(e) => set({ note: e.target.value })} /></label>
          <label className="f">Amount ({f.cur})<input type="number" inputMode="decimal" min={0} step={0.01} value={f.amt} onChange={(e) => set({ amt: e.target.value })} /></label>
          <label className="f">Currency<select value={f.cur} onChange={(e) => set({ cur: e.target.value })}>{[...new Set(['INR', t.currency || 'INR', ...FX_SUPPORTED])].map((c) => <option key={c}>{c}</option>)}</select></label>
          <label className="f">Category<select value={f.cat} onChange={(e) => set({ cat: e.target.value as BudgetKey })}>{BCATS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          <label className="f">Date<input type="date" value={f.date} onChange={(e) => set({ date: e.target.value })} /></label>
          <label className="f">Time (optional)<input type="time" value={f.time} onChange={(e) => set({ time: e.target.value })} /></label>
          <label className="f">Linked activity<select value={f.itemId} onChange={(e) => set({ itemId: e.target.value })}><option value="">None</option>{items.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></label>
        </div>
        {f.cur !== 'INR' && inrValue != null && <p className="tiny muted">≈ ₹{inrValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })} at the {draft.fxDate} rate (European Central Bank, via Frankfurter). The ₹ value is fixed when you save.</p>}

        <fieldset className="grid" style={{ gap: 8, border: 0, padding: 0, margin: 0 }}>
          <legend className="small" style={{ fontWeight: 700, marginBottom: 6 }}>Paid by</legend>
          <div className="row" role="radiogroup" aria-label="Paid by">
            <label className="row small" style={{ gap: 6 }}><input type="radio" checked={!f.many} onChange={() => set({ many: false })} />One person</label>
            <label className="row small" style={{ gap: 6 }}><input type="radio" checked={f.many} onChange={() => set({ many: true, payers: { [f.payer]: f.amt } })} />Several people</label>
          </div>
          {!f.many ? (
            <select aria-label="Payer" value={f.payer} style={{ maxWidth: 260 }} onChange={(e) => set({ payer: +e.target.value })}>{t.travelers.map((x, i) => <option key={i} value={i}>{x}</option>)}</select>
          ) : (
            <div className="grid g3" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))' }}>
              {t.travelers.map((x, i) => <label className="f" key={i}>{x} paid ({curSym.trim()})<input type="number" inputMode="decimal" min={0} step={0.01} value={f.payers[i] || ''} onChange={(e) => set({ payers: { ...f.payers, [i]: e.target.value } })} /></label>)}
              <p className="tiny" style={{ alignSelf: 'end', color: paidLeft ? 'var(--alert)' : 'var(--forest)' }} aria-live="polite">{paidLeft ? `${m(Math.abs(paidLeft))} ${paidLeft > 0 ? 'left to assign' : 'too much'}` : 'Payers add up ✓'}</p>
            </div>
          )}
        </fieldset>

        <fieldset className="grid" style={{ gap: 8, border: 0, padding: 0, margin: 0 }}>
          <legend className="small" style={{ fontWeight: 700, marginBottom: 6 }}>Split</legend>
          <div className="seg" role="radiogroup" aria-label="Split type">
            {SPLIT_KINDS.map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={f.kind === k} className={f.kind === k ? 'on' : ''} onClick={() => set({ kind: k, values: k === 'shares' ? Object.fromEntries(all.map((i) => [i, '1'])) : {} })}>{l}</button>)}
          </div>
          <p className="tiny muted">{HINT[f.kind]}</p>
          <div className="grid" style={{ gap: 6 }}>
            {t.travelers.map((x, i) => {
              const on = f.among.includes(i);
              return (
                <div className="row splitrow" key={i}>
                  <label className="row small" style={{ gap: 6, fontWeight: 600, minWidth: 140 }}>
                    <input type="checkbox" checked={on} onChange={(e) => set({ among: e.target.checked ? [...f.among, i].sort((a, b) => a - b) : f.among.filter((k) => k !== i) })} />{x}
                  </label>
                  {f.kind !== 'equal' && on && (
                    <input type="number" inputMode="decimal" step={f.kind === 'shares' ? 1 : 0.01} aria-label={`${x} ${f.kind === 'exact' ? 'amount' : f.kind === 'percent' ? 'percentage' : f.kind === 'shares' ? 'shares' : 'adjustment'}`}
                      value={f.values[i] ?? ''} placeholder={f.kind === 'adjust' ? '0' : ''} style={{ maxWidth: 120 }} onChange={(e) => set({ values: { ...f.values, [i]: e.target.value } })} />
                  )}
                  {f.kind !== 'equal' && on && <span className="tiny muted">{unit}</span>}
                  <span className="small n" style={{ marginLeft: 'auto' }}>{alloc && on ? m(alloc.shareMinor[i]) : ''}</span>
                </div>
              );
            })}
          </div>
          {alloc && alloc.remainder > 0 && alloc.remainderTo != null && (
            <p className="tiny muted" aria-live="polite">Includes {m(alloc.remainder)} of rounding, given to {t.travelers[alloc.remainderTo]}{draft.payers!.some((p) => p.who === alloc.remainderTo) ? ' (who paid)' : ''}, so it adds up to the paisa.</p>
          )}
        </fieldset>

        <label className="f">Notes<textarea rows={2} value={f.notes} onChange={(e) => set({ notes: e.target.value })} /></label>
        <p className="tiny muted">Receipt photos: available once you sign in (accounts are coming next).</p>

        {settledLinks.length > 0 && (
          <div className="warn caution">
            <b>This expense has been settled{settledLinks.length ? ` (${settledLinks.length} payment${settledLinks.length === 1 ? '' : 's'})` : ''}</b>
            <p><label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={resettle} onChange={(e) => setResettle(e.target.checked)} />Settle it again with the new amounts</label></p>
          </div>
        )}
        {errors.length > 0 && amt > 0 && <ul className="small" role="alert" style={{ color: 'var(--alert)', margin: 0, paddingLeft: 18 }}>{errors.map((x) => <li key={x}>{x}</li>)}</ul>}
        <div className="row">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn pri" disabled={errors.length > 0}>{initial ? 'Save changes' : 'Add expense'}</button>
        </div>
      </form>
    </Modal>
  );
}
