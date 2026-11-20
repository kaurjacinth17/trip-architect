import { useState } from 'react';
import { Modal } from '../../components/Modal';
import { CATS } from '../../data/constants';
import { D, PL } from '../../data/destinations';
import { cascade, cascadeOrdered, findItem, pullItem } from '../../engine/schedule';
import { fromHHMM, toHHMM } from '../../engine/time';
import type { Cat, Item, Trip } from '../../engine/types';
import { clone, uid } from '../../engine/util';
import { mut } from '../../lib/actions';
import { useUI } from '../../store/ui';

/** Add/edit an activity (reference `itemForm` + `saveItem`/`saveNew`/`dupItem`/`toWish`/`delItem`). */
export function ItemDialog({ t, x, di, isNew, onClose }: { t: Trip; x: Item; di: number; isNew: boolean; onClose: () => void }) {
  const [f, setF] = useState({ t: x.t, day: di, cat: x.cat, s: toHHMM(x.s), d: String(x.d), c: String(x.c || 0), pri: x.pri, n: x.n });
  const upd = (p: Partial<typeof f>) => setF({ ...f, ...p });
  const fields = (base: Item): Item => ({
    ...base,
    t: f.t.trim() || (isNew ? 'Custom activity' : base.t),
    cat: f.cat,
    d: Math.max(5, +f.d || (isNew ? 60 : base.d)),
    c: Math.max(0, +f.c || 0),
    pri: f.pri,
    n: f.n.trim(),
    s: fromHHMM(f.s),
  });

  const save = () => {
    onClose();
    if (isNew) {
      useUI.getState().set({ slot: null });
      mut(t.id, (tt) => { tt.plan[f.day].items.push(fields(x)); cascade(tt.plan[f.day]); }, 'Added to Day ' + (f.day + 1), true);
      return;
    }
    mut(t.id, (tt) => {
      const g = findItem(tt, x.id);
      if (!g) return false;
      Object.assign(g.x, fields(g.x));
      if (f.day !== g.di) {
        pullItem(tt, x.id);
        tt.plan[f.day].items.push(g.x);
        cascade(tt.plan[f.day]);
      } else cascade(g.day);
    }, 'Saved');
  };
  const del = () => {
    onClose();
    mut(t.id, (tt) => { if (!pullItem(tt, x.id)) tt.wish = tt.wish.filter((w) => w.id !== x.id); }, 'Activity deleted', true);
  };
  const dup = () => {
    onClose();
    mut(t.id, (tt) => {
      const g = findItem(tt, x.id);
      if (!g) return false;
      g.day.items.splice(g.j + 1, 0, { ...clone(g.x), id: uid(), s: g.x.s + g.x.d });
      cascadeOrdered(g.day);
    }, 'Duplicated', true);
  };
  const toWish = () => {
    onClose();
    mut(t.id, (tt) => { const g = pullItem(tt, x.id); if (!g) return false; tt.wish.push(g.x); }, 'Moved to wishlist', true);
  };

  const title = isNew ? 'Add a custom activity' : 'Edit activity';
  return (
    <Modal title={title} onClose={onClose}>
      <form className="grid" style={{ gap: 14 }} onSubmit={(e) => { e.preventDefault(); save(); }}>
        <h2>{title}</h2>
        <label className="f">Title<input type="text" value={f.t} onChange={(e) => upd({ t: e.target.value })} /></label>
        <div className="grid g2">
          <label className="f">Day
            <select value={f.day} onChange={(e) => upd({ day: +e.target.value })}>
              {t.plan.map((d, i) => <option key={i} value={i}>Day {i + 1}{d.label ? ' · ' + d.label : ''}</option>)}
            </select>
          </label>
          <label className="f">Type
            <select value={f.cat} onChange={(e) => upd({ cat: e.target.value as Cat })}>
              {Object.entries(CATS).map(([k, c]) => <option key={k} value={k}>{c[0]}</option>)}
            </select>
          </label>
          <label className="f">Start time<input type="time" step={300} value={f.s} onChange={(e) => upd({ s: e.target.value })} /></label>
          <label className="f">Duration (minutes)<input type="number" min={5} step={15} value={f.d} onChange={(e) => upd({ d: e.target.value })} /></label>
          <label className="f">Cost per person (₹)<input type="number" min={0} step={50} value={f.c} onChange={(e) => upd({ c: e.target.value })} /></label>
          <label className="f">Priority
            <select value={f.pri} onChange={(e) => upd({ pri: e.target.value as Item['pri'] })}>
              <option value="must">Must-do</option>
              <option value="nice">Nice to have</option>
            </select>
          </label>
        </div>
        <label className="f">Notes<textarea value={f.n} placeholder="Tickets, meeting point, booking reference" onChange={(e) => upd({ n: e.target.value })} /></label>
        {x.pid && <p className="tiny muted">From the {x.dest ? D[x.dest]?.name : ''} library · {PL[x.pid]?.desc || ''}</p>}
        <div className="row between">
          <div className="row">
            {!isNew && <>
              <button type="button" className="btn" style={{ color: 'var(--alert)' }} onClick={del}>Delete</button>
              <button type="button" className="btn" onClick={dup}>Duplicate</button>
              <button type="button" className="btn" onClick={toWish}>Move to wishlist</button>
            </>}
          </div>
          <div className="row">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn pri">{isNew ? 'Add to plan' : 'Save'}</button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
