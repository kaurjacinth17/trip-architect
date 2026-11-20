import { useState } from 'react';
import { destName } from '../../engine/dest';
import { CommitInput } from '../../components/Inputs';
import { PACK_CATS } from '../../data/constants';
import { rebuildPack } from '../../engine/packing';
import { uid } from '../../engine/util';
import { mut } from '../../lib/actions';
import type { TabProps } from './TripPage';

export function Packing({ t }: TabProps) {
  const cats = [...new Set(t.pack.map((x) => x.cat))];
  const done = t.pack.filter((x) => x.done).length;
  const pct = t.pack.length ? Math.round((done / t.pack.length) * 100) : 0;
  const [f, setF] = useState({ name: '', cat: cats[0] || PACK_CATS[0], qty: '1' });

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
      <div className="meter" style={{ margin: '14px 0 22px', height: 10 }} role="img" aria-label={`${pct}% packed`}><i style={{ width: pct + '%' }} /></div>
      <div className="grid g2" style={{ alignItems: 'start' }}>
        {cats.map((c) => {
          const list = t.pack.filter((x) => x.cat === c);
          return (
            <div className="card" key={c}>
              <div className="row between"><h3>{c}</h3><span className="tiny muted">{list.filter((x) => x.done).length}/{list.length}</span></div>
              <div style={{ marginTop: 6 }}>
                {list.map((x) => (
                  <div className={'check' + (x.done ? ' done' : '')} key={x.id}>
                    <input type="checkbox" id={'pk' + x.id} checked={x.done} onChange={(e) => mut(t.id, (tt) => { const y = tt.pack.find((p) => p.id === x.id); if (!y) return false; y.done = e.target.checked; })} />
                    <label htmlFor={'pk' + x.id} style={{ flex: 1 }}><span>{x.name}</span></label>
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
