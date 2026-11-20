// Add a destination to an existing trip, mid-trip if you like, with a preview of how days are reassigned.
import { useMemo, useState } from 'react';
import { destName } from '../engine/dest';
import { defaultDaysFor, previewInsertDest } from '../engine/destOps';
import { dayDate, fmtD } from '../engine/time';
import type { DestRecord, Trip } from '../engine/types';
import { useTrips } from '../store/trips';
import { toast } from '../store/toast';
import { Stepper } from './Inputs';
import { Modal } from './Modal';

export function InsertDestDialog({ t, destKey, record, onClose, onDone }: { t: Trip; destKey: string; record?: DestRecord; onClose: () => void; onDone?: () => void }) {
  const [days, setDays] = useState(() => defaultDaysFor(t, destKey, record));
  const [after, setAfter] = useState(t.dests.length - 1);
  const [mode, setMode] = useState<'add' | 'reassign'>('add');
  const preview = useMemo(() => {
    try { return { p: previewInsertDest(t, destKey, { days, afterIndex: after, mode, record }), err: null }; }
    catch (e) { return { p: null, err: (e as Error).message }; }
  }, [t, destKey, days, after, mode, record]);
  const name = record?.name || destName(t, destKey);
  const p = preview.p;
  const nameOf = (k: string | null) => (k ? destName(p?.trip || t, k) : 'New day');

  const apply = () => {
    if (!p) return;
    useTrips.getState().mutate(t.id, (x) => { Object.assign(x, p.trip); });
    toast(`${name} added to ${t.name}`, t.id);
    onClose();
    onDone?.();
  };

  return (
    <Modal title={`Add ${name} to ${t.name}`} onClose={onClose} wide>
      <h2>Add {name} to “{t.name}”</h2>
      <div className="grid g3" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))' }}>
        <label className="f">Where in the route
          <select value={after} onChange={(e) => setAfter(+e.target.value)}>
            <option value={-1}>At the start</option>
            {t.dests.map((k, i) => <option key={k} value={i}>After {destName(t, k)}</option>)}
          </select>
        </label>
        <div className="f" style={{ display: 'grid', gap: 6 }}><b className="small">Days in {name}</b><Stepper value={days} onStep={(v) => setDays(Math.max(1, Math.min(14, days + v)))} less="Fewer days" more="More days" /></div>
        <div className="f" style={{ display: 'grid', gap: 6 }}>
          <b className="small">How</b>
          <div className="row" role="group" aria-label="Insert mode">
            <button type="button" className={'chip' + (mode === 'add' ? ' on' : '')} aria-pressed={mode === 'add'} onClick={() => setMode('add')}>Add new days</button>
            <button type="button" className={'chip' + (mode === 'reassign' ? ' on' : '')} aria-pressed={mode === 'reassign'} onClick={() => setMode('reassign')}>Use existing days</button>
          </div>
        </div>
      </div>
      {preview.err && <div className="warn alert"><b>Can’t add it</b><p>{preview.err}</p></div>}
      {p && (
        <>
          <div className="warn tip"><b>Preview</b><p>{p.summary}</p></div>
          <div className="scroll">
            <table className="stack">
              <thead><tr><th>Day</th><th>Date</th><th>Before</th><th>After</th></tr></thead>
              <tbody>
                {p.changes.map((c) => {
                  const changed = c.newDay || c.was !== c.now;
                  return (
                    <tr key={c.day} style={changed ? { background: 'var(--forest-soft)' } : undefined}>
                      <td><b>Day {c.day}</b></td>
                      <td>{fmtD(dayDate(p.trip, c.day - 1)) || '—'}</td>
                      <td>{c.newDay ? '—' : nameOf(c.was)}</td>
                      <td>{nameOf(c.now)}{changed && <span className="tag f" style={{ marginLeft: 6 }}>{c.newDay ? 'New' : 'Changed'}</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      <div className="row">
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="button" className="btn pri" disabled={!p} onClick={apply}>Apply</button>
      </div>
    </Modal>
  );
}
