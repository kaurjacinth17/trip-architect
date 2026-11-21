import { useState } from 'react';
import { destName } from '../../engine/dest';
import { CommitInput } from '../../components/Inputs';
import { PACK_CATS } from '../../data/constants';
import { rebuildPack } from '../../engine/packing';
import { uid } from '../../engine/util';
import { mut } from '../../lib/actions';
import type { TabProps } from './TripPage';
import type { PackItem, Trip } from '../../engine/types';
import { useTripWeather } from '../../lib/checkCtx';

export function Packing({ t }: TabProps) {
  const cats = [...new Set(t.pack.map((x) => x.cat))];
  const done = t.pack.filter((x) => x.done).length;
  const pct = t.pack.length ? Math.round((done / t.pack.length) * 100) : 0;
  const [f, setF] = useState({ name: '', cat: cats[0] || PACK_CATS[0], qty: '1' });
  const [who, setWho] = useState<'all' | 'shared' | number>('all');
  const shown = (x: PackItem) => who === 'all' || (who === 'shared' ? !!x.shared : !x.shared && (x.assignedTo == null || x.assignedTo === who));

  const add = () => {
    const name = f.name.trim();
    if (!name) return;
    mut(t.id, (tt) => { tt.pack.push({ id: uid(), cat: f.cat, name, qty: Math.max(1, +f.qty || 1), done: false, custom: true }); });
    setF({ ...f, name: '', qty: '1' });
  };

  return (
    <>
      <div className="row between">
        <div>
          <h2>{t.dests.map((id) => destName(t, id)).join(' + ')} packing list</h2>
          <p className="muted small" style={{ marginTop: 6 }}>{done} of {t.pack.length} items packed · built from your destinations{t.start ? ', dates' : ''} and trip length</p>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <button type="button" className="btn sm" onClick={() => mut(t.id, (tt) => { tt.pack.forEach((x) => { x.done = false; }); }, 'All items unchecked', true)}>Uncheck all</button>
          <button type="button" className="btn sm" onClick={() => mut(t.id, (tt) => { tt.pack = rebuildPack(tt); }, 'Suggestions rebuilt; your own items kept', true)}>Rebuild suggestions</button>
        </div>
      </div>
      {t.travelers.length > 1 && (
        <div className="seg" role="tablist" aria-label="Whose list" style={{ marginTop: 12 }}>
          <button type="button" role="tab" aria-selected={who === 'all'} className={who === 'all' ? 'on' : ''} onClick={() => setWho('all')}>Everything</button>
          <button type="button" role="tab" aria-selected={who === 'shared'} className={who === 'shared' ? 'on' : ''} onClick={() => setWho('shared')}>Shared items</button>
          {t.travelers.map((n, i) => <button key={i} type="button" role="tab" aria-selected={who === i} className={who === i ? 'on' : ''} onClick={() => setWho(i)}>{n}’s list</button>)}
        </div>
      )}
      <WeatherPack t={t} />
      <div className="meter" style={{ margin: '14px 0 22px', height: 10 }} role="img" aria-label={`${pct}% packed`}><i style={{ width: pct + '%' }} /></div>
      <div className="grid g2" style={{ alignItems: 'start' }}>
        {cats.map((c) => {
          const list = t.pack.filter((x) => x.cat === c && shown(x));
          if (!list.length) return null;
          return (
            <div className="card" key={c}>
              <div className="row between"><h3>{c}</h3><span className="tiny muted">{list.filter((x) => x.done).length}/{list.length}</span></div>
              <div style={{ marginTop: 6 }}>
                {list.map((x) => (
                  <div className={'check' + (x.done ? ' done' : '')} key={x.id}>
                    <input type="checkbox" id={'pk' + x.id} checked={x.done} onChange={(e) => mut(t.id, (tt) => { const y = tt.pack.find((p) => p.id === x.id); if (!y) return false; y.done = e.target.checked; })} />
                    <label htmlFor={'pk' + x.id} style={{ flex: 1 }}><span>{x.name}</span></label>
                    {t.travelers.length > 1 && (
                      <select className="who" aria-label={`Who packs ${x.name}`} value={x.shared ? 'shared' : x.assignedTo ?? ''} onChange={(e) => mut(t.id, (tt) => { const y = tt.pack.find((p) => p.id === x.id); if (!y) return false; const v = e.target.value; y.shared = v === 'shared' || undefined; y.assignedTo = v === '' || v === 'shared' ? undefined : +v; })}>
                        <option value="">Everyone</option><option value="shared">Shared (one for the group)</option>{t.travelers.map((n, i) => <option key={i} value={i}>{n}</option>)}
                      </select>
                    )}
                    <CommitInput className="q" type="number" min={1} value={x.qty} aria-label={`Quantity of ${x.name}`} onCommit={(v) => mut(t.id, (tt) => { const y = tt.pack.find((p) => p.id === x.id); if (!y) return false; y.qty = Math.max(1, +v || 1); })} />
                    <button type="button" className="btn sm ghost icon" aria-label={`Remove ${x.name}`} onClick={() => mut(t.id, (tt) => { tt.pack = tt.pack.filter((p) => p.id !== x.id); }, 'Item removed', true)}>×</button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <form className="card row sec" style={{ gap: 10 }} onSubmit={(e) => { e.preventDefault(); add(); }}>
        <input type="text" placeholder="Add an item" style={{ flex: 2, minWidth: 180 }} aria-label="Item name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <select style={{ flex: 1, minWidth: 150 }} aria-label="Category" value={f.cat} onChange={(e) => setF({ ...f, cat: e.target.value })}>
          {[...new Set([...cats, ...PACK_CATS])].map((c) => <option key={c}>{c}</option>)}
        </select>
        <input type="number" min={1} style={{ width: 80 }} aria-label="Quantity" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} />
        <button type="submit" className="btn pri">Add item</button>
      </form>
    </>
  );
}

/** Packing that follows the forecast: rain gear and sun protection when the next 16 days call for it. */
function WeatherPack({ t }: { t: Trip }) {
  const w = Object.values(useTripWeather(t)).filter(Boolean);
  if (!w.length) return null;
  const rain = w.some((d) => (d!.rainProb ?? 0) >= 50), hot = w.some((d) => d!.tmax >= 33), cold = w.some((d) => d!.tmin <= 8);
  const want: [string, string][] = [...(rain ? [['Umbrella or rain jacket', 'Clothing'] as [string, string]] : []), ...(hot ? [['Sunscreen and a cap', 'Toiletries'] as [string, string]] : []), ...(cold ? [['Warm layers', 'Clothing'] as [string, string]] : [])]
    .filter(([n]) => !t.pack.some((p) => p.name.toLowerCase() === n.toLowerCase()));
  if (!want.length) return null;
  return (
    <div className="banner" style={{ marginTop: 12 }}>
      <span className="small"><b>From the forecast:</b> {[rain && 'rain likely', hot && 'hot afternoons', cold && 'cold nights'].filter(Boolean).join(', ')}.</span>
      <button type="button" className="btn sm" onClick={() => mut(t.id, (tt) => { for (const [name, cat] of want) tt.pack.push({ id: uid(), cat, name, qty: 1, done: false, custom: true }); }, 'Added to the packing list', true)}>Add {want.map((x) => x[0].toLowerCase()).join(', ')}</button>
    </div>
  );
}
