import { useState } from 'react';
import { CommitInput } from '../../components/Inputs';
import { BCATS } from '../../data/constants';
import { balances, estBudget, plannedTotal, settleUp, spentBy } from '../../engine/budget';
import { isAct, travellers } from '../../engine/schedule';
import type { BudgetKey } from '../../engine/types';
import { inr, plural, sum, todayISO, uid } from '../../engine/util';
import { mut } from '../../lib/actions';
import { toast } from '../../store/toast';
import type { TabProps } from './TripPage';

export function Budget({ t }: TabProps) {
  const n = travellers(t), days = t.plan.length;
  const planned = plannedTotal(t);
  const spent = sum(t.expenses, (e) => e.amt);
  const total = t.budgetTotal || planned;
  const by = (k: BudgetKey) => spentBy(t, k);
  const pct = total ? Math.round((spent / total) * 100) : 0;
  const bal = balances(t.travelers, t.expenses);
  const settle = settleUp(bal);
  const actCost = sum(t.plan.flatMap((d) => d.items.filter(isAct)), (x) => x.c) * n;
  const today = todayISO();
  const [ex, setEx] = useState({ amt: '', cat: 'travel' as BudgetKey, date: t.start && today < t.start ? t.start : today, paid: 0, among: t.travelers.map((_, i) => i), note: '' });
  const among = ex.among.filter((i) => i < t.travelers.length);

  const addExp = () => {
    const amt = +ex.amt;
    if (!(amt > 0)) { toast('Enter an amount'); return; }
    mut(t.id, (tt) => { tt.expenses.push({ id: uid(), amt, cat: ex.cat, date: ex.date, paid: Math.min(ex.paid, tt.travelers.length - 1), among, note: ex.note.trim() }); }, 'Expense added', true);
    setEx({ ...ex, amt: '', note: '' });
  };
  const stats: [string, string, string][] = [
    ['Budget', t.budgetTotal ? inr(t.budgetTotal) : 'Not set', t.budgetTotal ? `${inr(t.budgetTotal / n)} per person` : 'Set it in Overview'],
    ['Planned', inr(planned), `${inr(planned / n)} pp · ${inr(planned / days)} a day`],
    ['Spent', inr(spent), `${pct}% of ${t.budgetTotal ? 'budget' : 'plan'}`],
    ['Left', inr(total - spent), t.budgetTotal && planned < t.budgetTotal ? `${inr(t.budgetTotal - planned)} not yet allocated` : t.budgetTotal && planned > t.budgetTotal ? `Plan is ${inr(planned - t.budgetTotal)} over budget` : 'of the plan'],
  ];
  const mx = Math.max(1, ...BCATS.map(([k]) => Math.max(by(k), t.budget[k] || 0)));

  return (
    <>
      <div className="grid g4">
        {stats.map(([l, v, s]) => (
          <div className="card stat" key={l}><span>{l}</span><b style={l === 'Left' && total - spent < 0 ? { color: 'var(--alert)' } : undefined}>{v}</b><span>{s}</span></div>
        ))}
      </div>
      <div className={'meter' + (pct > 100 ? ' bad' : pct > 85 ? ' warn' : '')} style={{ marginTop: 14, height: 10 }} role="img" aria-label={`${pct}% spent`}><i style={{ width: Math.min(100, pct) + '%' }} /></div>

      <section className="sec">
        <div className="row between">
          <h2>Categories</h2>
          <button type="button" className="btn sm" onClick={() => mut(t.id, (tt) => { const e = estBudget(tt); for (const [k] of BCATS) if (k !== 'travel') tt.budget[k] = e[k]; }, 'Categories re-estimated (travel kept)', true)}>Re-estimate from itinerary</button>
        </div>
        <p className="tiny muted" style={{ margin: '6px 0 12px' }}>Starting figures are planning estimates for {plural(n, 'traveller')}; replace them with your real quotes. The itinerary’s entry fees and experiences come to {inr(actCost)}.</p>
        <div className="scroll">
          <table className="stack">
            <thead><tr><th>Category</th><th className="n">Planned (₹)</th><th className="n">Spent</th><th className="n">Left</th><th style={{ width: '30%' }}>Used</th></tr></thead>
            <tbody>
              {BCATS.map(([k, l]) => {
                const s = by(k), p = t.budget[k] || 0;
                const r = p ? s / p : s ? 2 : 0;
                return (
                  <tr key={k}>
                    <td><b>{l}</b></td>
                    <td className="n"><CommitInput type="number" min={0} step={100} value={p || ''} placeholder="0" style={{ maxWidth: 130, textAlign: 'right' }} aria-label={`${l} planned`}
                      onCommit={(v) => mut(t.id, (tt) => { tt.budget[k] = Math.max(0, +v || 0); })} /></td>
                    <td className="n">{inr(s)}</td>
                    <td className="n" style={p - s < 0 ? { color: 'var(--alert)', fontWeight: 700 } : undefined}>{inr(p - s)}</td>
                    <td><div className={'meter' + (r > 1 ? ' bad' : r > 0.85 ? ' warn' : '')}><i style={{ width: Math.min(100, r * 100) + '%' }} /></div></td>
                  </tr>
                );
              })}
              <tr><td><b>Total</b></td><td className="n"><b>{inr(planned)}</b></td><td className="n"><b>{inr(spent)}</b></td><td className="n"><b>{inr(planned - spent)}</b></td><td /></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="sec grid g2" style={{ alignItems: 'start' }}>
        <div>
          <h2>Spending by category</h2>
          <div className="grid" style={{ gap: 10, marginTop: 14 }}>
            {BCATS.map(([k, l]) => (
              <div className="bar" key={k}>
                <span>{l}</span>
                <div className="tr"><i style={{ width: (by(k) / mx) * 100 + '%', ...(by(k) > (t.budget[k] || 0) ? { background: 'var(--alert)' } : {}) }} />{t.budget[k] > 0 && <u style={{ left: (t.budget[k] / mx) * 100 + '%' }} />}</div>
                <span className="n" style={{ textAlign: 'right' }}>{inr(by(k))}</span>
              </div>
            ))}
            <p className="tiny muted">Bar: spent. Terracotta tick: planned.</p>
          </div>
        </div>
        <form className="card grid" style={{ gap: 10 }} onSubmit={(e) => { e.preventDefault(); addExp(); }}>
          <h3>Add an expense</h3>
          <div className="grid g2">
            <label className="f">Amount (₹)<input type="number" min={0} step={10} value={ex.amt} onChange={(e) => setEx({ ...ex, amt: e.target.value })} /></label>
            <label className="f">Category<select value={ex.cat} onChange={(e) => setEx({ ...ex, cat: e.target.value as BudgetKey })}>{BCATS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
            <label className="f">Date<input type="date" value={ex.date} onChange={(e) => setEx({ ...ex, date: e.target.value })} /></label>
            <label className="f">Paid by<select value={ex.paid} onChange={(e) => setEx({ ...ex, paid: +e.target.value })}>{t.travelers.map((x, i) => <option key={i} value={i}>{x}</option>)}</select></label>
          </div>
          <fieldset className="grid" style={{ gap: 6, border: 0, padding: 0, margin: 0 }}>
            <legend className="small" style={{ fontWeight: 700, marginBottom: 6 }}>Split equally between</legend>
            <div className="row">
              {t.travelers.map((x, i) => (
                <label className="row small" style={{ gap: 6, fontWeight: 600 }} key={i}>
                  <input type="checkbox" checked={among.includes(i)} onChange={(e) => setEx({ ...ex, among: e.target.checked ? [...among, i].sort() : among.filter((k) => k !== i) })} />{x}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="f">Note<input type="text" placeholder="e.g. Amber Fort tickets" value={ex.note} onChange={(e) => setEx({ ...ex, note: e.target.value })} /></label>
          <button type="submit" className="btn pri">Add expense</button>
        </form>
      </section>

      <section className="sec">
        <h2>Expenses</h2>
        {t.expenses.length ? (
          <div className="scroll" style={{ marginTop: 12 }}>
            <table className="stack">
              <thead><tr><th>Date</th><th>Note</th><th>Category</th><th>Paid by</th><th>Split</th><th className="n">Amount</th><th><span className="vh">Actions</span></th></tr></thead>
              <tbody>
                {[...t.expenses].sort((a, b) => (a.date < b.date ? 1 : -1)).map((e) => (
                  <tr key={e.id}>
                    <td>{e.date}</td><td>{e.note || '—'}</td><td>{BCATS.find((b) => b[0] === e.cat)?.[1]}</td><td>{t.travelers[e.paid] || '?'}</td>
                    <td>{(e.among?.length ? e.among : t.travelers.map((_, i) => i)).length} people</td>
                    <td className="n"><b>{inr(e.amt)}</b></td>
                    <td><button type="button" className="btn sm ghost" aria-label={`Delete expense ${e.note || inr(e.amt)}`} onClick={() => mut(t.id, (tt) => { tt.expenses = tt.expenses.filter((x) => x.id !== e.id); }, 'Expense deleted', true)}>Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="muted small" style={{ marginTop: 8 }}>No expenses yet. Add them as you go; actuals fill in automatically.</p>}
      </section>

      {n > 1 && (
        <section className="sec">
          <h2>Who owes whom</h2>
          <div className="grid g2" style={{ marginTop: 12 }}>
            <div className="card grid" style={{ gap: 6 }}>
              {t.travelers.map((x, i) => (
                <div className="row between small" key={i}><span>{x}</span><b style={{ color: bal[i] >= 0 ? 'var(--forest)' : 'var(--alert)' }}>{bal[i] >= 0 ? 'gets back ' + inr(bal[i]) : 'owes ' + inr(-bal[i])}</b></div>
              ))}
            </div>
            <div className="card grid" style={{ gap: 6 }}>
              <b className="small">To settle up</b>
              {settle.length ? settle.map(([a, b, m], i) => <span key={i}>{t.travelers[a]} pays {t.travelers[b]} <b>{inr(m)}</b></span>) : <span className="small muted">All square.</span>}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
