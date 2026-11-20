// Day options (start/end time and place, pace, duplicate, insert, move, swap, delete) and the bulk-action bar.
import { lazy, Suspense, useState } from 'react';
import { CommitInput } from '../../components/Inputs';
import { Modal } from '../../components/Modal';
import { PACE } from '../../data/constants';
import { bulkDelete, bulkMoveToDay, bulkShift, bulkToWishlist, type BulkResult } from '../../engine/bulk';
import { deleteDay, duplicateDay, insertDay, moveDay, swapDays } from '../../engine/days';
import { destView } from '../../engine/dest';
import { stayForDay } from '../../engine/stays';
import { dayDate, fmtD, fromHHMM, toHHMM } from '../../engine/time';
import type { DayLoc, PaceKey, Trip } from '../../engine/types';
import { isAct } from '../../engine/schedule';
import { mut } from '../../lib/actions';
import { toast } from '../../store/toast';
import { useUI } from '../../store/ui';

const PinPicker = lazy(() => import('../../components/PinPicker'));

const dayName = (t: Trip, i: number) => `Day ${i + 1}${dayDate(t, i) ? ' · ' + fmtD(dayDate(t, i)) : ''}`;

function LocSelect({ t, di, which }: { t: Trip; di: number; which: 'start' | 'end' }) {
  const day = t.plan[di];
  const loc = (which === 'start' ? day.startLoc : day.endLoc) || { kind: 'hotel' };
  const [pin, setPin] = useState(false);
  const stay = stayForDay(t, di);
  const set = (l: DayLoc) => mut(t.id, (tt) => { if (which === 'start') tt.plan[di].startLoc = l; else tt.plan[di].endLoc = l; });
  return (
    <div className="grid" style={{ gap: 6 }}>
      <label className="f">{which === 'start' ? 'Day starts from' : 'Day ends at'}
        <select value={loc.kind} onChange={(e) => {
          const k = e.target.value;
          if (k === 'point') { setPin(true); return; }
          set({ kind: k as 'hotel' | 'none' });
        }}>
          <option value="hotel">The stay for that night{stay ? ` (${stay.name || 'your hotel'})` : ' (none saved yet)'}</option>
          <option value="none">Nowhere in particular</option>
          <option value="point">{loc.kind === 'point' ? `Pin: ${loc.label}` : 'A place I pin on the map…'}</option>
        </select>
      </label>
      {pin && (
        <Modal title="Pin a start or end point" onClose={() => setPin(false)} wide>
          <h2>{which === 'start' ? 'Where does the day start?' : 'Where does the day end?'}</h2>
          <PinDialog centre={destView(t, day.dest)?.center || null} onSave={(p) => { set({ kind: 'point', label: p.label, lat: p.lat, lng: p.lng }); setPin(false); }} onCancel={() => setPin(false)} />
        </Modal>
      )}
    </div>
  );
}

function PinDialog({ centre, onSave, onCancel }: { centre: { lat: number; lng: number } | null; onSave: (p: { label: string; lat: number; lng: number }) => void; onCancel: () => void }) {
  const [p, setP] = useState<{ lat: number; lng: number } | null>(null);
  const [label, setLabel] = useState('');
  return (
    <div className="grid" style={{ gap: 10 }}>
      <label className="f">Name<input type="text" value={label} placeholder="e.g. Friend’s flat, station" onChange={(e) => setLabel(e.target.value)} /></label>
      <Suspense fallback={null}><PinPicker value={p} centre={centre} onChange={setP} /></Suspense>
      <div className="row"><button type="button" className="btn" onClick={onCancel}>Cancel</button><button type="button" className="btn pri" disabled={!p || !label.trim()} onClick={() => onSave({ label: label.trim(), ...p! })}>Save point</button></div>
    </div>
  );
}

export function DayOptions({ t, di }: { t: Trip; di: number }) {
  const day = t.plan[di];
  const setUI = useUI((s) => s.set);
  const [confirmDel, setConfirmDel] = useState(false);
  const [swap, setSwap] = useState('');
  const go = (fn: (t: Trip) => Trip, msg: string, toDay?: number) => {
    mut(t.id, (tt) => { Object.assign(tt, fn(tt)); }, msg, true);
    if (toDay != null) setUI({ day: toDay, selected: [] });
  };
  const n = t.plan.length;
  const acts = day.items.filter(isAct).length;
  return (
    <details className="dayopts">
      <summary className="btn sm">Day options</summary>
      <div className="card grid" style={{ gap: 12, marginTop: 8 }}>
        <div className="grid g3" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(170px,1fr))' }}>
          <label className="f">Day starts at
            <CommitInput type="time" value={day.start != null ? toHHMM(day.start) : ''} onCommit={(v) => mut(t.id, (tt) => { tt.plan[di].start = v ? fromHHMM(v) : undefined; })} />
          </label>
          <label className="f">Day ends by
            <CommitInput type="time" value={day.end != null ? toHHMM(day.end) : ''} onCommit={(v) => mut(t.id, (tt) => { tt.plan[di].end = v ? fromHHMM(v) : undefined; })} />
          </label>
          <label className="f">Pace for this day
            <select value={day.pace || ''} onChange={(e) => mut(t.id, (tt) => { tt.plan[di].pace = (e.target.value || undefined) as PaceKey | undefined; })}>
              <option value="">Trip pace ({PACE[t.pace].l})</option>
              {Object.entries(PACE).map(([k, p]) => <option key={k} value={k}>{p.l}</option>)}
            </select>
          </label>
        </div>
        <div className="grid g2">
          <LocSelect t={t} di={di} which="start" />
          <LocSelect t={t} di={di} which="end" />
        </div>
        <div className="row" style={{ gap: 6 }}>
          <button type="button" className="btn sm" onClick={() => go((x) => duplicateDay(x, di), `Day ${di + 1} duplicated`, di + 1)}>Duplicate day</button>
          <button type="button" className="btn sm" onClick={() => go((x) => insertDay(x, di), `New day inserted before Day ${di + 2}`, di)}>Insert a day before</button>
          <button type="button" className="btn sm" onClick={() => go((x) => insertDay(x, di + 1), `New day inserted after Day ${di + 1}`, di + 1)}>Insert a day after</button>
          <button type="button" className="btn sm" disabled={di === 0} onClick={() => go((x) => moveDay(x, di, di - 1), `Day moved earlier`, di - 1)}>Move day earlier</button>
          <button type="button" className="btn sm" disabled={di === n - 1} onClick={() => go((x) => moveDay(x, di, di + 1), `Day moved later`, di + 1)}>Move day later</button>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <label className="row small" style={{ gap: 6, fontWeight: 600 }}>Swap with
            <select value={swap} style={{ width: 'auto' }} onChange={(e) => setSwap(e.target.value)}>
              <option value="">choose a day</option>
              {t.plan.map((_, i) => i !== di && <option key={i} value={i}>{dayName(t, i)}</option>)}
            </select>
          </label>
          <button type="button" className="btn sm" disabled={swap === ''} onClick={() => { go((x) => swapDays(x, di, +swap), `Swapped Day ${di + 1} and Day ${+swap + 1}`, +swap); setSwap(''); }}>Swap</button>
          <button type="button" className="btn sm" style={{ color: 'var(--alert)' }} disabled={n < 2} onClick={() => setConfirmDel(true)}>Delete this day</button>
        </div>
      </div>
      {confirmDel && (
        <Modal title={`Delete Day ${di + 1}?`} onClose={() => setConfirmDel(false)}>
          <h2>Delete Day {di + 1}?</h2>
          <p>{acts ? `Its ${acts} activit${acts > 1 ? 'ies go' : 'y goes'} to the wishlist. ` : ''}Later days move one day earlier. You can undo this.</p>
          <div className="row">
            <button type="button" className="btn" onClick={() => setConfirmDel(false)}>Keep it</button>
            <button type="button" className="btn acc" onClick={() => { setConfirmDel(false); go((x) => deleteDay(x, di), `Day ${di + 1} deleted${acts ? '; its activities are in the wishlist' : ''}`, Math.max(0, di - 1)); }}>Delete day</button>
          </div>
        </Modal>
      )}
    </details>
  );
}

export function BulkBar({ t, di, ids }: { t: Trip; di: number; ids: string[] }) {
  const setUI = useUI((s) => s.set);
  const [to, setTo] = useState(String(di === 0 ? Math.min(1, t.plan.length - 1) : 0));
  const [mins, setMins] = useState(30);
  const live = ids.filter((id) => t.plan.some((d) => d.items.some((x) => x.id === id)));
  const run = (fn: (t: Trip) => BulkResult, verb: string, clear = true) => {
    let r: BulkResult | null = null;
    mut(t.id, (tt) => { r = fn(tt); if (!r.changed) return false; Object.assign(tt, r.trip); });
    const res = r as BulkResult | null;
    if (res) toast(`${verb} ${res.changed} block${res.changed === 1 ? '' : 's'}${res.skipped ? `; ${res.skipped} skipped (${verb.startsWith('Shift') ? 'locked' : 'not activities'})` : ''}`, t.id);
    if (clear) setUI({ selected: [] });
  };
  return (
    <div className="bulkbar" role="region" aria-label="Bulk actions">
      <b className="small">{live.length} selected</b>
      <span className="row" style={{ gap: 4 }}>
        <select value={to} style={{ width: 'auto' }} aria-label="Move selected to day" onChange={(e) => setTo(e.target.value)}>{t.plan.map((_, i) => <option key={i} value={i}>{dayName(t, i)}</option>)}</select>
        <button type="button" className="btn sm" onClick={() => run((x) => bulkMoveToDay(x, live, +to), 'Moved')}>Move</button>
      </span>
      <span className="row" style={{ gap: 4 }}>
        <button type="button" className="btn sm" onClick={() => run((x) => bulkShift(x, live, -mins), 'Shifted', false)} aria-label={`Shift selected ${mins} minutes earlier`}>−</button>
        <input type="number" min={5} step={5} value={mins} onChange={(e) => setMins(Math.max(5, +e.target.value || 5))} style={{ width: 80 }} aria-label="Minutes to shift" />
        <span className="small">min</span>
        <button type="button" className="btn sm" onClick={() => run((x) => bulkShift(x, live, mins), 'Shifted', false)} aria-label={`Shift selected ${mins} minutes later`}>+</button>
      </span>
      <button type="button" className="btn sm" onClick={() => run((x) => bulkToWishlist(x, live), 'Sent to the wishlist:')}>To wishlist</button>
      <button type="button" className="btn sm" style={{ color: 'var(--alert)' }} onClick={() => run((x) => bulkDelete(x, live), 'Deleted')}>Delete</button>
      <button type="button" className="btn sm ghost" onClick={() => setUI({ selected: [] })}>Clear</button>
    </div>
  );
}
