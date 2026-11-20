import { Link } from 'react-router-dom';
import { useCompareToggle } from '../components/Cards';
import { Scene } from '../components/Scene';
import { FACTORS, MONTHS } from '../data/constants';
import { D, DESTS } from '../data/destinations';
import { estRange, seasonOf } from '../engine/season';
import type { Dest } from '../engine/types';
import { inr, sum } from '../engine/util';
import { useTitle } from '../lib/hooks';
import { useTrips, type Weights } from '../store/trips';
import { useUI } from '../store/ui';

const FACTS = [...FACTORS, ['season', 'Season fit']] as [keyof Weights, string][];

/** Weighted score out of 10 (reference `vCompare` score). */
export function compareScore(d: Dest, w: Weights, month: number) {
  const wsum = sum(FACTS, ([k]) => w[k]) || 1;
  return sum(FACTS, ([k]) => w[k] * (k === 'season' ? (month ? { good: 10, ok: 6, poor: 2 }[seasonOf(d, month)] : 7) : d.scores[k])) / wsum;
}

export function Compare() {
  useTitle('Compare destinations');
  const { cmp, toggle } = useCompareToggle();
  const w = useTrips((s) => s.compare.w);
  const setCompare = useTrips((s) => s.setCompare);
  const m = useUI((s) => s.cmpMonth);
  const setUI = useUI((s) => s.set);
  const sel = cmp.map((id) => D[id]).filter(Boolean);
  const wsum = sum(FACTS, ([k]) => w[k]) || 1;
  const ranked = sel.map((d) => ({ d, s: compareScore(d, w, m) })).sort((a, b) => b.s - a.s);

  return (
    <>
      <h1>Where should I go?</h1>
      <p className="muted" style={{ marginTop: 8 }}>Pick up to four places, say what matters to you, and get a weighted score. Ratings are editorial scores out of 10, not live rankings.</p>
      <div className="row" style={{ marginTop: 18 }} role="group" aria-label="Destinations to compare">
        {DESTS.map((d) => (
          <button type="button" key={d.id} className={'chip' + (cmp.includes(d.id) ? ' on' : '')} aria-pressed={cmp.includes(d.id)} onClick={() => toggle(d.id)}>{d.name}</button>
        ))}
      </div>
      <div className="grid cmpgrid" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.3fr)', gap: 24, marginTop: 22 }}>
        <div className="card grid" style={{ gap: 12 }}>
          <h3>What matters to you</h3>
          <label className="f">Travel month
            <select value={m} onChange={(e) => setUI({ cmpMonth: +e.target.value })}>
              <option value={0}>Not decided</option>
              {MONTHS.map((x, i) => <option key={x} value={i + 1}>{x}</option>)}
            </select>
          </label>
          {FACTS.map(([k, l]) => (
            <label className="f" key={k}>
              <span className="row between"><span>{l}</span><span className="muted">{Math.round((w[k] / wsum) * 100)}%</span></span>
              <input type="range" min={0} max={10} value={w[k]} aria-label={`${l} weight`}
                onChange={(e) => setCompare((c) => ({ ...c, w: { ...c.w, [k]: +e.target.value } }))} />
            </label>
          ))}
        </div>
        <div className="grid" style={{ gap: 12, alignContent: 'start' }}>
          {ranked.length ? ranked.map(({ d, s }, i) => (
            <div key={d.id} className="card cmprow" style={{ display: 'grid', gridTemplateColumns: '96px minmax(0,1fr) auto', gap: 14, alignItems: 'center', padding: 12 }}>
              <div style={{ height: 72, borderRadius: 10, overflow: 'hidden' }}><Scene d={d} h={120} /></div>
              <div>
                <div className="row" style={{ gap: 8 }}>
                  <h3>{d.name}</h3>
                  {i === 0 && <span className="tag f">Best match</span>}
                  {m > 0 && seasonOf(d, m) === 'poor' && <span className="tag t">Off-season</span>}
                </div>
                <div className="meter" style={{ marginTop: 8 }}><i style={{ width: s * 10 + '%' }} /></div>
                <p className="tiny muted" style={{ marginTop: 6 }}>{d.days[0]}–{d.days[1]} days · {inr(estRange(d)[0])}–{inr(estRange(d)[1])} pp</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <b style={{ fontFamily: 'var(--serif)', fontSize: 30 }}>{s.toFixed(1)}</b>
                <div className="tiny muted">out of 10</div>
              </div>
            </div>
          )) : <div className="empty">Pick at least two destinations above.</div>}
          {ranked.length > 0 && <div className="row"><Link className="btn pri" to={`/new?dest=${ranked[0].d.id}`}>Plan {ranked[0].d.name}</Link></div>}
        </div>
      </div>
      {sel.length > 0 && (
        <section className="sec">
          <h2>Side by side</h2>
          <div className="scroll">
            <table>
              <thead><tr><th>Factor</th>{sel.map((d) => <th key={d.id} className="n">{d.name}</th>)}</tr></thead>
              <tbody>
                {FACTORS.map(([k, l]) => {
                  const mx = Math.max(...sel.map((d) => d.scores[k]));
                  return (
                    <tr key={k}><td>{l}</td>{sel.map((d) => <td key={d.id} className="n" style={d.scores[k] === mx ? { fontWeight: 800, color: 'var(--forest)' } : undefined}>{d.scores[k]}</td>)}</tr>
                  );
                })}
                <tr><td>Best months</td>{sel.map((d) => <td key={d.id} className="n">{d.good.map((x) => MONTHS[x - 1]).join(' ')}</td>)}</tr>
                <tr><td>Ideal stay</td>{sel.map((d) => <td key={d.id} className="n">{d.days[0]}–{d.days[1]} days</td>)}</tr>
                <tr><td>Est. per person</td>{sel.map((d) => <td key={d.id} className="n">{inr(estRange(d)[0])}–{inr(estRange(d)[1])}</td>)}</tr>
              </tbody>
            </table>
          </div>
          <p className="tiny muted" style={{ marginTop: 6 }}>Illustrative comparison, not current travel pricing or live rankings.</p>
        </section>
      )}
    </>
  );
}
