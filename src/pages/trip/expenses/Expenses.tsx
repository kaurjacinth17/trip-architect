// Expenses tab: add/edit with several payers and five split types, edit history, soft delete with Undo, settle an
// expense or record a payment, balances with a drill-down, Simplify debts, UPI links, views and CSV export.
import { useState } from 'react';
import { Modal } from '../../../components/Modal';
import { BCATS } from '../../../data/constants';
import { money } from '../../../engine/currency';
import {
  addExpense, allocate, deleteExpense, editExpense, expensesCSV, filterExpenses, groupExpenses, isEdited, liveExpenses, livePayments, METHODS, pairDebts,
  payersOf, recordPayment, resettleExpense, restoreExpense, rupees, settleExpense, settleState, simplify, splitOf, tripBalances, unsettleExpense, upiLink, UPI_RE,
  type ExpenseView,
} from '../../../engine/expenses';
import { fmtD } from '../../../engine/time';
import type { Expense, PayMethod, Trip } from '../../../engine/types';
import { inr, todayISO } from '../../../engine/util';
import { mut } from '../../../lib/actions';
import { downloadFile } from '../../../lib/browser';
import { CommitInput } from '../../../components/Inputs';
import { toast } from '../../../store/toast';
import type { TabProps } from '../TripPage';
import { ExpenseForm } from './ExpenseForm';
import { CommentsButton } from '../../../components/cloud/Social';

const P = (paise: number) => inr(rupees(paise));
const exact = (paise: number) => '₹' + rupees(paise).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (iso: string) => (iso ? fmtD(new Date(iso + 'T00:00:00')) : '');
const VIEWS: [ExpenseView, string][] = [['all', 'All'], ['person', 'By person'], ['day', 'By day'], ['category', 'By category'], ['unsettled', 'Unsettled']];

export function Expenses({ t }: TabProps) {
  const n = t.travelers.length;
  const [form, setForm] = useState<{ e?: Expense } | null>(null);
  const [view, setView] = useState<ExpenseView>('all');
  const [person, setPerson] = useState(t.me ?? 0);
  const [hist, setHist] = useState<Expense | null>(null);
  const [settle, setSettle] = useState<Expense | null>(null);
  const [pay, setPay] = useState<{ from: number; to: number; amt: number } | null>(null);
  const [simple, setSimple] = useState(true);
  const b = tripBalances(t);
  const plan = simple ? simplify(b.net) : pairDebts(t);
  const list = filterExpenses(t, view, person);
  const total = liveExpenses(t).reduce((s, e) => s + allocate(e, n).inrTotal, 0);
  const deleted = t.expenses.filter((e) => e.deleted).sort((a, c) => (c.deleted || 0) - (a.deleted || 0));
  const pays = [...livePayments(t)].sort((a, c) => (a.date < c.date ? 1 : -1));

  const save = (id: string | undefined, d: { e: Omit<Expense, 'id'>; resettle: boolean }) => mut(t.id, (tt) => {
    if (!id) { addExpense(tt, d.e); return; }
    const text = editExpense(tt, id, { ...d.e, id });
    if (!text) return false;
    if (d.resettle) resettleExpense(tt, id);
  }, id ? 'Expense updated' : 'Expense added', true);

  const rows = (xs: Expense[]) => xs.map((e) => <Row key={e.id} t={t} e={e} person={view === 'person' ? person : undefined} onEdit={() => setForm({ e })} onHist={() => setHist(e)} onSettle={() => setSettle(e)} />);

  return (
    <>
      <div className="grid g4">
        <div className="card stat"><span>Spent</span><b>{P(total)}</b><span>{liveExpenses(t).length} expenses</span></div>
        {t.travelers.slice(0, 3).map((x, i) => (
          <div className="card stat" key={i}><span>{x}</span><b style={{ color: b.net[i] < 0 ? 'var(--alert)' : 'var(--forest)' }}>{b.net[i] === 0 ? 'Settled up' : b.net[i] > 0 ? `gets back ${P(b.net[i])}` : `owes ${P(-b.net[i])}`}</b><span>paid {P(b.paid[i])} · share {P(b.share[i])}</span></div>
        ))}
      </div>

      <section className="sec">
        <div className="row between">
          <h2>Expenses</h2>
          <div className="row" style={{ gap: 6 }}>
            <label className="row small" style={{ gap: 6, fontWeight: 600 }}>I am
              <select value={t.me ?? ''} style={{ width: 'auto' }} onChange={(e) => mut(t.id, (tt) => { tt.me = e.target.value === '' ? undefined : +e.target.value; })}>
                <option value="">Not set</option>{t.travelers.map((x, i) => <option key={i} value={i}>{x}</option>)}
              </select>
            </label>
            <button type="button" className="btn sm" disabled={!liveExpenses(t).length && !pays.length} onClick={() => downloadFile(`${t.name.replace(/[^\w-]+/g, '-')}-expenses.csv`, expensesCSV(t), 'text/csv;charset=utf-8')}>Export CSV</button>
            <button type="button" className="btn pri" onClick={() => setForm({})}>Add expense</button>
          </div>
        </div>
        <div className="seg" role="tablist" aria-label="Expense views" style={{ marginTop: 12 }}>
          {VIEWS.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={view === k} className={view === k ? 'on' : ''} onClick={() => setView(k)}>{l}</button>)}
        </div>
        {view === 'person' && (
          <label className="row small" style={{ gap: 6, marginTop: 8, fontWeight: 600 }}>Person
            <select value={person} style={{ width: 'auto' }} onChange={(e) => setPerson(+e.target.value)}>{t.travelers.map((x, i) => <option key={i} value={i}>{x}</option>)}</select>
          </label>
        )}
        {!list.length ? <p className="muted small" style={{ marginTop: 10 }}>{view === 'unsettled' ? 'Nothing left to settle.' : 'No expenses yet. Add them as you go; actuals fill in your budget automatically.'}</p>
          : view === 'day' || view === 'category' ? groupExpenses(list, view).map(([k, xs]) => (
            <div key={k} style={{ marginTop: 14 }}>
              <h3 className="small">{view === 'day' ? day(k) || k : BCATS.find((c) => c[0] === k)?.[1]} · {P(xs.reduce((s, e) => s + allocate(e, n).inrTotal, 0))}</h3>
              <ul className="xlist">{rows(xs)}</ul>
            </div>
          )) : <ul className="xlist" style={{ marginTop: 10 }}>{rows(list)}</ul>}
        {deleted.length > 0 && (
          <details style={{ marginTop: 12 }}>
            <summary className="small">Recently deleted ({deleted.length})</summary>
            <ul className="xlist">{deleted.map((e) => (
              <li key={e.id} className="xrow muted"><span>{e.note || 'Expense'} · {inr(rupees(allocate(e, n).inrTotal))}</span>
                <button type="button" className="btn sm" onClick={() => mut(t.id, (tt) => { restoreExpense(tt, e.id); }, 'Expense restored', true)}>Restore</button></li>
            ))}</ul>
          </details>
        )}
      </section>

      {n > 1 && (
        <section className="sec grid g2" style={{ alignItems: 'start' }}>
          <div className="card grid" style={{ gap: 8 }}>
            <h3>Balances</h3>
            {t.travelers.map((x, i) => (
              <details key={i} className="bal">
                <summary className="row between small">
                  <span>{x}</span>
                  <b style={{ color: b.net[i] < 0 ? 'var(--alert)' : b.net[i] > 0 ? 'var(--forest)' : undefined }}>{b.net[i] === 0 ? 'settled up' : b.net[i] > 0 ? `gets back ${exact(b.net[i])}` : `owes ${exact(-b.net[i])}`}</b>
                </summary>
                <ul className="tiny" style={{ margin: '6px 0 0', paddingLeft: 16 }}>
                  {b.entries[i].length ? b.entries[i].map((en, k) => <li key={k}>{day(en.date)} · {en.label}: <b>{en.amount >= 0 ? '+' : '−'}{exact(Math.abs(en.amount))}</b></li>) : <li>Nothing yet</li>}
                </ul>
              </details>
            ))}
            <p className="tiny muted">Tap a name to see the expenses and payments behind the balance. Balances always add up to zero.</p>
          </div>
          <div className="card grid" style={{ gap: 8 }}>
            <div className="row between">
              <h3>Settle up</h3>
              <label className="row small" style={{ gap: 6 }}><input type="checkbox" role="switch" checked={simple} onChange={(e) => setSimple(e.target.checked)} />Simplify debts</label>
            </div>
            {plan.length ? plan.map(([a, c, x]) => {
              const upi = t.travelerUpi?.[c];
              const amt = rupees(x);
              return (
                <div key={`${a}-${c}`} className="grid" style={{ gap: 6, borderBottom: '1px solid var(--line)', paddingBottom: 8 }}>
                  <span>{t.travelers[a]} pays {t.travelers[c]} <b>{exact(x)}</b></span>
                  <div className="row" style={{ gap: 6 }}>
                    {upi && <a className="btn sm pri" href={upiLink({ pa: upi, pn: t.travelers[c], am: amt, tn: `${t.name}: settle up` })}>Pay {exact(x)} via UPI</a>}
                    {upi && <button type="button" className="btn sm" onClick={() => mut(t.id, (tt) => { recordPayment(tt, { from: a, to: c, amt, date: todayISO(), method: 'upi', note: 'Paid via UPI' }); }, `Recorded: ${t.travelers[a]} paid ${t.travelers[c]} ${exact(x)}`, true)}>I’ve paid</button>}
                    <button type="button" className="btn sm" onClick={() => setPay({ from: a, to: c, amt })}>Record a payment</button>
                  </div>
                </div>
              );
            }) : <p className="small muted">All square.</p>}
            <p className="tiny muted">{simple ? 'Simplified: the fewest payments that clear every balance.' : 'Not simplified: what each pair owes from their shared expenses.'} Trip Architect never moves money; UPI links open your UPI app on a phone, and you record what you paid.</p>
            <button type="button" className="btn sm ghost" onClick={() => setPay({ from: 0, to: Math.min(1, n - 1), amt: 0 })}>Record another payment</button>
          </div>
        </section>
      )}

      {pays.length > 0 && (
        <section className="sec">
          <h2>Payments</h2>
          <ul className="xlist" style={{ marginTop: 10 }}>
            {pays.map((p) => {
              const ex = p.expenseId ? t.expenses.find((e) => e.id === p.expenseId) : null;
              return (
                <li key={p.id} className="xrow">
                  <span><b>{t.travelers[p.from]} paid {t.travelers[p.to]} {exact(Math.round(p.amt * 100))}</b> <span className="tiny muted">· {day(p.date)} · {METHODS.find((m) => m[0] === p.method)?.[1]}{ex ? ` · for “${ex.note || 'expense'}”` : ''}{p.note && !ex ? ` · ${p.note}` : ''}</span></span>
                  <button type="button" className="btn sm ghost" aria-label={`Delete payment from ${t.travelers[p.from]} to ${t.travelers[p.to]}`} onClick={() => mut(t.id, (tt) => { const x = tt.payments?.find((y) => y.id === p.id); if (!x) return false; x.deleted = Date.now(); }, 'Payment deleted', true)}>Delete</button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {n > 1 && <UpiIds t={t} />}

      {form && <ExpenseForm t={t} initial={form.e} onClose={() => setForm(null)} onSave={(d) => save(form.e?.id, d)} />}
      {hist && <History t={t} e={hist} onClose={() => setHist(null)} />}
      {settle && <SettleDialog t={t} e={settle} onClose={() => setSettle(null)} />}
      {pay && <PaymentDialog t={t} init={pay} onClose={() => setPay(null)} />}
    </>
  );
}

function Row({ t, e, person, onEdit, onHist, onSettle }: { t: Trip; e: Expense; person?: number; onEdit: () => void; onHist: () => void; onSettle: () => void }) {
  const n = t.travelers.length;
  const a = allocate(e, n);
  const s = settleState(t, e);
  const ps = payersOf(e);
  const sp = splitOf(e, n);
  const item = e.itemId ? t.plan.flatMap((d) => d.items).find((x) => x.id === e.itemId) : null;
  return (
    <li className="xrow">
      <div style={{ minWidth: 0 }}>
        <b>{e.note || 'Expense'}</b>
        {isEdited(e) && <> <button type="button" className="tag linkish" onClick={onHist} aria-label={`Edit history of ${e.note || 'expense'}`}>edited</button></>}
        {s.done && s.last && <> <span className="tag f">✓ Settled {day(s.last.date)} via {METHODS.find((m) => m[0] === s.last!.method)?.[1]}</span></>}
        {!s.done && s.settled.length > 0 && <> <span className="tag">Partly settled ({s.settled.length} of {s.debtors.length})</span></>}
        <div className="tiny muted">
          {day(e.date)}{e.time ? ` · ${e.time}` : ''} · {BCATS.find((c) => c[0] === e.cat)?.[1]} · paid by {ps.map((p) => t.travelers[p.who] + (ps.length > 1 ? ` ${money(p.amt, e.cur || 'INR')}` : '')).join(', ')}
          {' '}· {sp.kind === 'equal' ? `split equally between ${sp.among.length}` : `split by ${sp.kind === 'adjust' ? 'adjustments' : sp.kind}`}
          {item && ` · ${item.t}`}
        </div>
        {person != null && <div className="tiny">{t.travelers[person]}: paid {exact(a.paid[person])}, share {exact(a.share[person])}</div>}
        {e.notes && <div className="tiny muted">{e.notes}</div>}
      </div>
      <div className="row" style={{ gap: 4, flexWrap: 'nowrap', alignItems: 'start' }}>
        <span className="n" style={{ textAlign: 'right' }}><b>{exact(a.inrTotal)}</b>{e.cur && e.cur !== 'INR' && <><br /><span className="tiny muted">{money(e.amt, e.cur)}</span></>}</span>
        <button type="button" className="btn sm" onClick={onEdit} aria-label={`Edit ${e.note || 'expense'}`}>Edit</button>
        <CommentsButton t={t} kind="expense" id={e.id} label={e.note || 'expense'} />
        {s.debtors.length > 0 && <button type="button" className="btn sm" onClick={onSettle} aria-label={`Settle ${e.note || 'expense'}`}>{s.done ? 'Settled' : 'Settle'}</button>}
        <button type="button" className="btn sm ghost" aria-label={`Delete expense ${e.note || inr(e.amt)}`} onClick={() => mut(t.id, (tt) => { deleteExpense(tt, e.id); }, 'Expense deleted', true)}>Delete</button>
      </div>
    </li>
  );
}

function History({ t, e, onClose }: { t: Trip; e: Expense; onClose: () => void }) {
  return (
    <Modal title={`History of ${e.note || 'expense'}`} onClose={onClose}>
      <h2>History</h2>
      <p className="small">{e.note || 'Expense'}</p>
      <ol className="small" style={{ paddingLeft: 18 }}>
        {(e.history || []).map((h, i) => <li key={i}><b>{h.by}</b> {h.text} <span className="tiny muted">· {new Date(h.at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span></li>)}
        {!(e.history || []).length && <li>Added before edit history existed.</li>}
      </ol>
      <p className="tiny muted">{t.me == null ? 'Changes on this device are credited to “You”. Choose who you are next to Add expense.' : ''}</p>
      <div className="row"><button type="button" className="btn" onClick={onClose}>Close</button></div>
    </Modal>
  );
}

function SettleDialog({ t, e, onClose }: { t: Trip; e: Expense; onClose: () => void }) {
  const n = t.travelers.length;
  const s = settleState(t, e);
  const a = allocate(e, n);
  const open = s.debtors.filter((d) => !s.settled.includes(d));
  const [who, setWho] = useState<number[]>(open);
  const [date, setDate] = useState(todayISO());
  const [method, setMethod] = useState<PayMethod>('upi');
  const owe = (d: number) => a.share[d] - a.paid[d];
  return (
    <Modal title={`Settle ${e.note || 'expense'}`} onClose={onClose}>
      <h2>Settle “{e.note || 'expense'}”</h2>
      <p className="small">Records that these people have paid their share. It doesn’t move any money.</p>
      {open.length > 0 && (
        <>
          <fieldset className="grid" style={{ gap: 6, border: 0, padding: 0, margin: '8px 0' }}>
            <legend className="small" style={{ fontWeight: 700 }}>Who has paid</legend>
            {open.map((d) => (
              <label key={d} className="row small" style={{ gap: 6 }}><input type="checkbox" checked={who.includes(d)} onChange={(x) => setWho(x.target.checked ? [...who, d] : who.filter((k) => k !== d))} />{t.travelers[d]} · {exact(owe(d))}</label>
            ))}
            <button type="button" className="linkish tiny" style={{ justifySelf: 'start' }} onClick={() => setWho(open)}>Everyone</button>
          </fieldset>
          <div className="grid g2">
            <label className="f">Date<input type="date" value={date} onChange={(x) => setDate(x.target.value)} /></label>
            <label className="f">How<select value={method} onChange={(x) => setMethod(x.target.value as PayMethod)}>{METHODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          </div>
        </>
      )}
      {s.settled.length > 0 && (
        <div className="grid" style={{ gap: 6, marginTop: 10 }}>
          <b className="small">Already settled</b>
          {s.settled.map((d) => (
            <div key={d} className="row between small"><span>{t.travelers[d]}</span>
              <button type="button" className="btn sm ghost" onClick={() => { mut(t.id, (tt) => { unsettleExpense(tt, e.id, [d]); }, `Un-settled for ${t.travelers[d]}`, true); onClose(); }}>Un-settle</button></div>
          ))}
        </div>
      )}
      <div className="row" style={{ marginTop: 12 }}>
        <button type="button" className="btn" onClick={onClose}>Close</button>
        {open.length > 0 && <button type="button" className="btn pri" disabled={!who.length} onClick={() => { mut(t.id, (tt) => { settleExpense(tt, e.id, { who, date, method }); }, `Settled for ${who.map((d) => t.travelers[d]).join(', ')}`, true); onClose(); }}>Mark settled</button>}
      </div>
    </Modal>
  );
}

function PaymentDialog({ t, init, onClose }: { t: Trip; init: { from: number; to: number; amt: number }; onClose: () => void }) {
  const [f, setF] = useState({ from: init.from, to: init.to, amt: init.amt ? String(init.amt) : '', date: todayISO(), method: 'upi' as PayMethod, note: '' });
  const ok = f.from !== f.to && +f.amt > 0;
  return (
    <Modal title="Record a payment" onClose={onClose}>
      <form className="grid" style={{ gap: 10 }} onSubmit={(e) => {
        e.preventDefault();
        if (!ok) return;
        mut(t.id, (tt) => { recordPayment(tt, { from: f.from, to: f.to, amt: +f.amt, date: f.date, method: f.method, note: f.note.trim() }); }, 'Payment recorded', true);
        onClose();
      }}>
        <h2>Record a payment</h2>
        <div className="grid g2">
          <label className="f">From<select value={f.from} onChange={(e) => setF({ ...f, from: +e.target.value })}>{t.travelers.map((x, i) => <option key={i} value={i}>{x}</option>)}</select></label>
          <label className="f">To<select value={f.to} onChange={(e) => setF({ ...f, to: +e.target.value })}>{t.travelers.map((x, i) => <option key={i} value={i}>{x}</option>)}</select></label>
          <label className="f">Amount (₹)<input type="number" inputMode="decimal" min={0} step={0.01} value={f.amt} onChange={(e) => setF({ ...f, amt: e.target.value })} /></label>
          <label className="f">Date<input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></label>
          <label className="f">How<select value={f.method} onChange={(e) => setF({ ...f, method: e.target.value as PayMethod })}>{METHODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          <label className="f">Note<input type="text" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></label>
        </div>
        {f.from === f.to && <p className="small" style={{ color: 'var(--alert)' }}>Choose two different people.</p>}
        <div className="row"><button type="button" className="btn" onClick={onClose}>Cancel</button><button type="submit" className="btn pri" disabled={!ok}>Record payment</button></div>
      </form>
    </Modal>
  );
}

function UpiIds({ t }: { t: Trip }) {
  return (
    <details className="sec card">
      <summary><b>UPI IDs for “Pay via UPI”</b> <span className="tiny muted">(optional)</span></summary>
      <p className="tiny muted" style={{ marginTop: 6 }}>Only add a UPI ID someone has chosen to share. It stays with this trip on this device (and in trip files), never in read-only share links. Trip Architect never processes payments.</p>
      <div className="grid g3" style={{ marginTop: 8, gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))' }}>
        {t.travelers.map((x, i) => (
          <label className="f" key={i}>{x}<CommitInput type="text" value={t.travelerUpi?.[i] || ''} placeholder="name@bank" aria-label={`UPI ID for ${x}`}
            onCommit={(v) => {
              const id = v.trim();
              if (id && !UPI_RE.test(id)) { toast('That doesn’t look like a UPI ID (name@bank)'); return; }
              mut(t.id, (tt) => { const a = [...(tt.travelerUpi || [])]; while (a.length < tt.travelers.length) a.push(null); a[i] = id || null; tt.travelerUpi = a; });
            }} /></label>
        ))}
      </div>
    </details>
  );
}
