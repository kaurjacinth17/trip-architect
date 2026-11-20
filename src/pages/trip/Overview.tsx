import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { WarningCard } from '../../components/Cards';
import { CommitInput, CommitTextarea, Stepper } from '../../components/Inputs';
import { Modal } from '../../components/Modal';
import { PACE } from '../../data/constants';
import { D } from '../../data/destinations';
import { byLevel } from '../../engine/checks';
import { readiness } from '../../engine/readiness';
import { isAct } from '../../engine/schedule';
import type { PaceKey, Warning } from '../../engine/types';
import { plural } from '../../engine/util';
import { mut } from '../../lib/actions';
import { toast } from '../../store/toast';
import { useTrips } from '../../store/trips';
import { useUI } from '../../store/ui';
import type { TabProps } from './TripPage';

/** Add or remove the last day (reference `dayCount`). */
export function changeDays(id: string, v: number) {
  mut(id, (t) => {
    if (v > 0) {
      const last = t.plan[t.plan.length - 1];
      t.plan.push({ dest: last?.dest || t.dests[0], label: '', items: [] });
    } else {
      if (t.plan.length < 2) return false;
      const d = t.plan.pop()!;
      t.wish.push(...d.items.filter(isAct));
      const ui = useUI.getState();
      if (ui.day >= t.plan.length) ui.set({ day: t.plan.length - 1 });
    }
    t.days = t.plan.length;
  }, v > 0 ? 'Day added' : 'Last day removed; its activities are in the wishlist', true);
}

export function Overview({ t, A, fix, goDay }: TabProps) {
  const r = readiness(t, A);
  const nav = useNavigate();
  const [confirmDel, setConfirmDel] = useState(false);
  const all: [Warning, number | null][] = [...A.trip.map((w) => [w, null] as [Warning, null]), ...A.days.flatMap((d, i) => d.map((w) => [w, i] as [Warning, number]))]
    .sort((a, b) => byLevel(a[0], b[0]));
  const attention = all.filter(([w]) => w.lvl !== 'tip').slice(0, 6);
  const tile = (l: string, v: string, s: string, to: string) => (
    <Link className="card stat" to={`/trips/${t.id}/${to}`} style={{ textDecoration: 'none', color: 'inherit' }}><span>{l}</span><b>{v}</b><span>{s}</span></Link>
  );
  const set = (fn: Parameters<typeof mut>[1]) => mut(t.id, fn);

  return (
    <>
      <div className="row" style={{ gap: 24, alignItems: 'center' }}>
        <div className="ring" style={{ '--p': r.all } as React.CSSProperties} role="img" aria-label={`Travel readiness ${r.all}%`}><b>{r.all}%</b></div>
        <div style={{ flex: 1, minWidth: 240 }}>
          <h2>Travel readiness</h2>
          <p className="muted small" style={{ marginTop: 6 }}>Itinerary days without blocking issues, core budget lines filled, nights booked and bags packed.</p>
        </div>
      </div>
      <div className="grid g4" style={{ marginTop: 18 }}>
        {tile('Itinerary', r.it + '%', `${plural(t.plan.filter((d) => d.items.some(isAct)).length, 'day')} planned, ${plural(A.count.alert, 'issue')}`, 'itinerary')}
        {tile('Budget', r.core.length ? plural(r.core.length, 'gap') : 'Ready', r.core.length ? 'Core categories to fill' : 'All core lines allocated', 'budget')}
        {tile('Accommodation', r.booked >= r.nights ? 'Booked' : r.pending ? `${r.pending} pending` : 'Not chosen', `${r.booked} of ${plural(r.nights, 'night')} booked`, 'stays')}
        {tile('Packing', r.pk + '%', `${t.pack.filter((x) => x.done).length} of ${t.pack.length} items`, 'packing')}
      </div>

      <div className="grid g2 sec" style={{ alignItems: 'start' }}>
        <div className="grid" style={{ gap: 10 }}>
          <h2>Needs attention</h2>
          {attention.length ? attention.map(([w, i], k) => <WarningCard key={k} w={w} tripId={t.id} showDay={i} onFix={fix} onGoDay={goDay} />)
            : <div className="warn tip"><b>Nothing blocking</b><p>The plan looks realistic. Tips appear on each day in the Itinerary tab.</p></div>}
        </div>
        <div className="card grid" style={{ gap: 12 }}>
          <h3>Trip settings</h3>
          <label className="f">Trip name<CommitInput type="text" value={t.name} onCommit={(v) => set((x) => { x.name = v.trim() || x.name; })} /></label>
          <div className="grid g2">
            <label className="f">Start date<input type="date" value={t.start} onChange={(e) => set((x) => { x.start = e.target.value; })} /></label>
            <label className="f">Pace
              <select value={t.pace} onChange={(e) => set((x) => { x.pace = e.target.value as PaceKey; })}>
                {Object.entries(PACE).map(([k, p]) => <option key={k} value={k}>{p.l}</option>)}
              </select>
            </label>
          </div>
          <div className="row between"><b className="small">Days</b><Stepper value={t.plan.length} onStep={(v) => changeDays(t.id, v)} less="Remove last day" more="Add a day" /></div>
          <label className="f">Total budget (₹)<CommitInput type="number" min={0} step={500} value={t.budgetTotal || ''} onCommit={(v) => set((x) => { x.budgetTotal = Math.max(0, +v || 0); })} /></label>
          <div className="grid" style={{ gap: 6 }}>
            <b className="small">Travellers</b>
            {t.travelers.map((n, i) => (
              <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }} key={i}>
                <CommitInput type="text" value={n} aria-label={`Traveller ${i + 1}`} onCommit={(v) => set((x) => { x.travelers[i] = v.trim() || `Traveller ${i + 1}`; })} />
                <button type="button" className="btn icon" disabled={t.travelers.length < 2} aria-label={`Remove ${n}`} onClick={() => mut(t.id, (x) => {
                  if (x.travelers.length < 2) return false;
                  x.travelers.splice(i, 1);
                  for (const e of x.expenses) {
                    if (e.paid === i) e.paid = 0; else if (e.paid > i) e.paid--;
                    e.among = (e.among || []).filter((k) => k !== i).map((k) => (k > i ? k - 1 : k));
                  }
                }, 'Traveller removed', true)}>×</button>
              </div>
            ))}
            <button type="button" className="btn sm" onClick={() => set((x) => { x.travelers.push('Traveller ' + (x.travelers.length + 1)); })}>Add traveller</button>
          </div>
        </div>
      </div>

      <section className="sec grid g2">
        {t.dests.map((id) => {
          const d = D[id];
          return d ? (
            <div className="card grid" style={{ gap: 8 }} key={id}>
              <div className="row between"><h3>{d.name}</h3><Link className="small" to={`/destinations/${id}`}>Full guide</Link></div>
              <p className="small"><b>Best time:</b> {d.bestTime}</p>
              <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{d.tips.slice(0, 3).map((x) => <li key={x}>{x}</li>)}</ul>
            </div>
          ) : null;
        })}
      </section>
      <section className="sec">
        <h2><label htmlFor="trip-notes">Notes</label></h2>
        <CommitTextarea id="trip-notes" value={t.notes} placeholder="Booking references, ideas, things to remember" style={{ marginTop: 12 }} onCommit={(v) => set((x) => { x.notes = v; })} />
      </section>
      <section className="sec row">
        <button type="button" className="btn" onClick={() => { const c = useTrips.getState().duplicate(t.id); if (c) { nav(`/trips/${c.id}/overview`); toast('Trip duplicated'); } }}>Duplicate trip</button>
        <button type="button" className="btn" style={{ color: 'var(--alert)' }} onClick={() => setConfirmDel(true)}>Delete trip</button>
      </section>
      {confirmDel && (
        <Modal title={`Delete ${t.name}?`} onClose={() => setConfirmDel(false)}>
          <h2>Delete “{t.name}”?</h2>
          <p>This removes the itinerary, budget, stays and packing list. Export it from Share first if you might want it back.</p>
          <div className="row">
            <button type="button" className="btn" onClick={() => setConfirmDel(false)}>Keep trip</button>
            <button type="button" className="btn acc" onClick={() => {
              const gone = useTrips.getState().remove(t.id);
              setConfirmDel(false);
              nav('/trips');
              if (gone) toast('Trip deleted', () => { useTrips.getState().restore(gone); toast('Trip restored'); });
            }}>Delete trip</button>
          </div>
        </Modal>
      )}
    </>
  );
}

