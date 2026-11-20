// Two aligned single-series bar charts (no dual axis): average daily high, and rainfall, per month, with the
// best/avoid verdict as a text row under both. Hover or focus a bar for its values; the table is a <details>.
import { MONTHS } from '../data/constants';
import { BEST_MONTHS_RULE, bestMonths } from '../engine/bestMonths';
import type { MonthClimate } from '../engine/types';

export function BestMonthsChart({ normals, period }: { normals: (MonthClimate | null)[]; period?: string }) {
  const { ratings } = bestMonths(normals);
  const hiMax = Math.max(1, ...normals.map((m) => m?.tmax ?? 0));
  const hiMin = Math.min(0, ...normals.map((m) => m?.tmax ?? 0));
  const rainMax = Math.max(50, ...normals.map((m) => m?.rainMm ?? 0));
  const tag = (v: string) => (v === 'good' ? 'Best' : v === 'poor' ? 'Avoid' : '·');
  const verdictRow = (
    <>
      <div className="bm-verdict" aria-hidden="true">{ratings.map((r) => (
        <span key={r.month} className={r.verdict}><span className="wide">{tag(r.verdict)}</span><span className="narrow">{r.verdict === 'good' ? '✓' : r.verdict === 'poor' ? '✕' : '·'}</span></span>
      ))}</div>
      <p className="tiny muted narrow-key" aria-hidden="true">✓ best month · ✕ month to avoid</p>
    </>
  );
  return (
    <div className="grid" style={{ gap: 14 }}>
      <div>
        <b className="small">Average daily high (°C)</b>
        <div className="bm-chart" role="list" aria-label="Average daily high by month">
          {normals.map((m, i) => (
            <div key={i} className="bm-col" role="listitem" tabIndex={0} aria-label={m ? `${MONTHS[i]}: high ${m.tmax} °C, low ${m.tmin} °C. ${ratings[i].reason}` : `${MONTHS[i]}: no data`}>
              <i style={{ height: m ? `${((m.tmax - hiMin) / (hiMax - hiMin)) * 100}%` : 0 }} />
              <span className="tip">{MONTHS[i]}: {m ? `${Math.round(m.tmin)}–${Math.round(m.tmax)} °C` : 'no data'}</span>
            </div>
          ))}
        </div>
        <div className="bm-months" aria-hidden="true">{MONTHS.map((m) => <span key={m}>{m[0]}</span>)}</div>
      </div>
      <div>
        <b className="small">Rainfall (mm per month)</b>
        <div className="bm-chart" role="list" aria-label="Rainfall by month">
          {normals.map((m, i) => (
            <div key={i} className="bm-col rain" role="listitem" tabIndex={0} aria-label={m ? `${MONTHS[i]}: ${m.rainMm} mm over ${m.rainDays} days` : `${MONTHS[i]}: no data`}>
              <i style={{ height: m ? `${(m.rainMm / rainMax) * 100}%` : 0 }} />
              <span className="tip">{MONTHS[i]}: {m ? `${m.rainMm} mm, ${m.rainDays} rainy days` : 'no data'}</span>
            </div>
          ))}
        </div>
        <div className="bm-months" aria-hidden="true">{MONTHS.map((m) => <span key={m}>{m[0]}</span>)}</div>
        {verdictRow}
      </div>
      <details>
        <summary className="small" style={{ cursor: 'pointer', fontWeight: 700 }}>Show as a table</summary>
        <div className="scroll" style={{ marginTop: 8 }}>
          <table className="stack">
            <thead><tr><th>Month</th><th className="n">High °C</th><th className="n">Low °C</th><th className="n">Rain mm</th><th className="n">Rainy days</th><th>Verdict</th></tr></thead>
            <tbody>{normals.map((m, i) => (
              <tr key={i}><td>{MONTHS[i]}</td><td className="n">{m?.tmax ?? '—'}</td><td className="n">{m?.tmin ?? '—'}</td><td className="n">{m?.rainMm ?? '—'}</td><td className="n">{m?.rainDays ?? '—'}</td><td>{tag(ratings[i].verdict).replace('·', 'OK')} · {ratings[i].reason}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </details>
      <p className="tiny muted">{BEST_MONTHS_RULE}</p>
      <p className="src">Climate averages {period || ''} from <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo</a> (CC BY 4.0).</p>
    </div>
  );
}
