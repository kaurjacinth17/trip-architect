import { CommitInput } from '../../components/Inputs';
import { BCATS } from '../../data/constants';
import { autoAct, autoStay, effectiveBudget, estBudget, isAuto, plannedTotal, spentBy, totalSpent, type StayLine } from '../../engine/budget';
import { liveExpenses } from '../../engine/expenses';
import { Link } from 'react-router-dom';
import { destName } from '../../engine/dest';
import { isAct, travellers } from '../../engine/schedule';
import type { AutoKey, BudgetKey, Trip } from '../../engine/types';
import { inr, plural, sum } from '../../engine/util';
import { mut } from '../../lib/actions';
import type { TabProps } from './TripPage';

export function Budget({ t }: TabProps) {
  const n = travellers(t), days = t.plan.length;
  const planned = plannedTotal(t);
  const B = effectiveBudget(t);
  const spent = totalSpent(t);
  const total = t.budgetTotal || planned;
  const by = (k: BudgetKey) => spentBy(t, k);
  const pct = total ? Math.round((spent / total) * 100) : 0;
  const actCost = sum(t.plan.flatMap((d) => d.items.filter(isAct)), (x) => x.c) * n;
  const stats: [string, string, string][] = [
    ['Budget', t.budgetTotal ? inr(t.budgetTotal) : 'Not set', t.budgetTotal ? `${inr(t.budgetTotal / n)} per person` : 'Set it in Overview'],
    ['Planned', inr(planned), `${inr(planned / n)} pp · ${inr(planned / days)} a day`],
    ['Spent', inr(spent), `${pct}% of ${t.budgetTotal ? 'budget' : 'plan'}`],
    ['Left', inr(total - spent), t.budgetTotal && planned < t.budgetTotal ? `${inr(t.budgetTotal - planned)} not yet allocated` : t.budgetTotal && planned > t.budgetTotal ? `Plan is ${inr(planned - t.budgetTotal)} over budget` : 'of the plan'],
  ];
  const mx = Math.max(1, ...BCATS.map(([k]) => Math.max(by(k), B[k] || 0)));

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
          <button type="button" className="btn sm" onClick={() => mut(t.id, (tt) => { const e = estBudget(tt); for (const [k] of BCATS) if (k !== 'travel' && !((k === 'stay' || k === 'act') && isAuto(tt, k))) tt.budget[k] = e[k]; }, 'Manual categories re-estimated (travel kept)', true)}>Re-estimate from itinerary</button>
        </div>
        <p className="tiny muted" style={{ margin: '6px 0 12px' }}>Starting figures are planning estimates for {plural(n, 'traveller')}; replace them with your real quotes. <b>Auto</b> lines follow your plan: Stay from the stays you save, Activities from the itinerary’s entry fees and experiences ({inr(actCost)}). Tap ✎ to type your own figure.</p>
        <div className="scroll">
          <table className="stack">
            <thead><tr><th>Category</th><th className="n">Planned (₹)</th><th className="n">Spent</th><th className="n">Left</th><th style={{ width: '30%' }}>Used</th></tr></thead>
            <tbody>
              {BCATS.map(([k, l]) => {
                const s = by(k), p = B[k] || 0;
                const r = p ? s / p : s ? 2 : 0;
                const ak = k === 'stay' || k === 'act' ? (k as AutoKey) : null;
                const auto = ak && isAuto(t, ak);
                return (
                  <tr key={k}>
                    <td><b>{l}</b>{auto && <> <span className="tag f">Auto</span></>}{ak && <AutoNote t={t} k={ak} />}</td>
                    <td className="n">
                      {auto ? (
                        <span className="row" style={{ gap: 6, justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                          <b>{inr(p)}</b>
                          <button type="button" className="btn sm icon" aria-label={`Type my own ${l.toLowerCase()} figure`} title="Type my own figure" onClick={() => mut(t.id, (tt) => { tt.budget[ak] = p; tt.budgetMode = { ...(tt.budgetMode || {}), [ak]: 'manual' }; }, `${l} is now manual`)}>✎</button>
                        </span>
                      ) : (
                        <span className="row" style={{ gap: 6, justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                          <CommitInput type="number" min={0} step={100} value={p || ''} placeholder="0" style={{ maxWidth: 130, textAlign: 'right' }} aria-label={`${l} planned`}
                            onCommit={(v) => mut(t.id, (tt) => { tt.budget[k] = Math.max(0, +v || 0); })} />
                          {ak && <button type="button" className="btn sm ghost" onClick={() => mut(t.id, (tt) => { tt.budgetMode = { ...(tt.budgetMode || {}), [ak]: 'auto' }; }, `${l} follows the plan again`)}>Back to auto</button>}
                        </span>
                      )}
                    </td>
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
                <div className="tr"><i style={{ width: (by(k) / mx) * 100 + '%', ...(by(k) > (B[k] || 0) ? { background: 'var(--alert)' } : {}) }} />{B[k] > 0 && <u style={{ left: (B[k] / mx) * 100 + '%' }} />}</div>
                <span className="n" style={{ textAlign: 'right' }}>{inr(by(k))}</span>
              </div>
            ))}
            <p className="tiny muted">Bar: spent. Terracotta tick: planned.</p>
          </div>
        </div>
        <div className="card grid" style={{ gap: 8 }}>
          <h3>Expenses</h3>
          <p className="small">{inr(spent)} spent across {plural(liveExpenses(t).length, 'expense')}.{n > 1 ? ' Add, split and settle them in Expenses.' : ''}</p>
          <div><Link className="btn pri" to={`/trips/${t.id}/expenses`}>Open Expenses</Link></div>
        </div>
      </section>

    </>
  );
}

const BASIS: Record<StayLine['basis'], string> = { booked: 'booked', chosen: 'your stay', shortlisted: 'cheapest shortlisted', estimate: 'estimate, no stay saved', none: 'no stay saved' };

/** The breakdown behind an Auto line (shown on demand, works on touch). */
function AutoNote({ t, k }: { t: Trip; k: AutoKey }) {
  const n = travellers(t);
  if (!isAuto(t, k)) return null;
  if (k === 'act') {
    const total = autoAct(t);
    return (
      <details className="bdown"><summary className="tiny">How it’s worked out</summary>
        <p className="tiny">Entry fees and experiences in the itinerary: {inr(total / n)} per person × {plural(n, 'traveller')} = {inr(total)}.</p>
      </details>
    );
  }
  const a = autoStay(t);
  const nightList = (ks: number[]) => ks.length === 1 ? `night ${ks[0] + 1}` : `nights ${ks.map((x) => x + 1).join(', ')}`;
  return (
    <details className="bdown"><summary className="tiny">How it’s worked out</summary>
      <ul className="tiny" style={{ margin: '4px 0 0', paddingLeft: 16 }}>
        {a.lines.map((l, i) => (
          <li key={i}>
            {l.stay ? <b>{l.stay.name || 'Saved hotel'}</b> : <b>{destName(t, l.dest)}</b>} ({BASIS[l.basis]}): {nightList(l.nights)}
            {l.basis !== 'none' ? ` × ${inr(l.perNight)} × ${plural(l.rooms, 'room')} = ${inr(l.total)}` : ''}
          </li>
        ))}
      </ul>
      {!a.lines.some((l) => l.stay) && <p className="tiny muted">No stays saved yet, so this is the planning estimate. Save stays in the Stays tab and it updates.</p>}
      {a.missingPrice.length > 0 && <p className="tiny" style={{ color: 'var(--alert)' }}>Enter the price you found for {a.missingPrice.map((s) => s.name || 'a saved hotel').join(', ')} in the Stays tab.</p>}
    </details>
  );
}
