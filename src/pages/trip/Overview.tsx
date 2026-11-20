import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { WarningCard } from '../../components/Cards';
import { CommitInput, CommitTextarea, Stepper } from '../../components/Inputs';
import { Modal } from '../../components/Modal';
import { PACE } from '../../data/constants';
import { destName, destView } from '../../engine/dest';
import { moveDest, previewRemoveDest } from '../../engine/destOps';
import type { Trip } from '../../engine/types';
import { DestinationSearch, type PickedDest } from '../../components/DestinationSearch';
import { InsertDestDialog } from '../../components/InsertDestDialog';
import { FX_SUPPORTED } from '../../data/currencies';
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
          <label className="f">Currency for new expenses
            <select value={t.currency || 'INR'} onChange={(e) => set((x) => { x.currency = e.target.value; })}>
              {[...new Set(['INR', t.currency || 'INR', ...t.dests.map((k) => destView(t, k)?.currency || 'INR'), ...FX_SUPPORTED])].map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
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

      <DestinationsManager t={t} />
      <section className="sec grid g2">
        {t.dests.map((id) => {
          const v = destView(t, id);
          if (!v) return null;
          return (
            <div className="card grid" style={{ gap: 8 }} key={id}>
              <div className="row between"><h3>{v.name}</h3><Link className="small" to={`/destinations/${id}`}>{v.curated ? 'Full guide' : 'Destination page'}</Link></div>
              <p className="small"><b>Best time:</b> {v.bestTime}</p>
              {v.curated && <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{v.curated.tips.slice(0, 3).map((x) => <li key={x}>{x}</li>)}</ul>}
              {!v.cost && <p className="small muted">No cost basis for {v.name} yet: <Link to={`/destinations/${id}`}>add your own daily figures</Link> to include it in budget estimates.</p>}
            </div>
          );
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


/** Route: reorder, remove (with preview) and add destinations anywhere in the trip. */
function DestinationsManager({ t }: { t: Trip }) {
  const [adding, setAdding] = useState<PickedDest | null>(null);
  const [search, setSearch] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const rm = removing ? (() => { try { return previewRemoveDest(t, removing); } catch (e) { return { err: (e as Error).message } as const; } })() : null;
  return (
    <section className="sec card grid" style={{ gap: 10 }}>
      <div className="row between"><h3>Destinations</h3><button type="button" className="btn sm pri" onClick={() => setSearch(true)}>Add destination</button></div>
      <ol className="stops" aria-label="Route">
        {t.dests.map((k, i) => (
          <li key={k}>
            <span className="tag f">Stop {i + 1}</span> <b>{destName(t, k)}</b>
            <span className="small muted">{plural(t.plan.filter((d) => d.dest === k).length, 'day')}</span>
            <span className="row" style={{ gap: 2, marginLeft: 'auto' }}>
              <button type="button" className="btn sm icon" aria-label={`Move ${destName(t, k)} earlier`} disabled={i === 0} onClick={() => mut(t.id, (x) => { Object.assign(x, moveDest(x, i, i - 1)); }, 'Route reordered; days moved with it', true)}>↑</button>
              <button type="button" className="btn sm icon" aria-label={`Move ${destName(t, k)} later`} disabled={i === t.dests.length - 1} onClick={() => mut(t.id, (x) => { Object.assign(x, moveDest(x, i, i + 1)); }, 'Route reordered; days moved with it', true)}>↓</button>
              <button type="button" className="btn sm icon" aria-label={`Remove ${destName(t, k)}`} disabled={t.dests.length < 2} onClick={() => setRemoving(k)}>×</button>
            </span>
          </li>
        ))}
      </ol>
      {search && (
        <Modal title="Add a destination" onClose={() => setSearch(false)}>
          <h2>Add a destination</h2>
          <DestinationSearch autoFocus exclude={t.dests} onPick={(d) => { setSearch(false); setAdding(d); }} />
        </Modal>
      )}
      {adding && <InsertDestDialog t={t} destKey={adding.key} record={adding.record} onClose={() => setAdding(null)} />}
      {removing && rm && (
        <Modal title={`Remove ${destName(t, removing)}?`} onClose={() => setRemoving(null)}>
          <h2>Remove {destName(t, removing)}?</h2>
          {'err' in rm ? <p>{rm.err}</p> : <p>{rm.summary}</p>}
          <div className="row">
            <button type="button" className="btn" onClick={() => setRemoving(null)}>Keep it</button>
            {!('err' in rm) && <button type="button" className="btn acc" onClick={() => { mut(t.id, (x) => { Object.assign(x, rm.trip); }, `${destName(t, removing)} removed`, true); setRemoving(null); }}>Remove</button>}
          </div>
        </Modal>
      )}
    </section>
  );
}
