import { useState } from 'react';
import { D } from '../../data/destinations';
import { km } from '../../engine/geo';
import { isAct, travellers } from '../../engine/schedule';
import type { Item, LatLng, StayStatus } from '../../engine/types';
import { inr, plural, sum, uid } from '../../engine/util';
import { mut } from '../../lib/actions';
import { toast } from '../../store/toast';
import type { TabProps } from './TripPage';

export function Stays({ t }: TabProps) {
  const items = t.plan.flatMap((d) => d.items).filter((x) => x.lat != null && x.lng != null && isAct(x));
  const avg = (o: LatLng, dest: string | null) => {
    const g = items.filter((x: Item) => x.dest === dest || !dest);
    if (!g.length || o.lat == null) return null;
    return sum(g, (x) => km(o, x)) / g.length;
  };
  const areaOpts = t.dests.flatMap((id) => D[id]?.areas.map((a): [string, string] => [`${id}|${a[0]}`, `${a[0]}, ${D[id].name}`]) || []);
  const rooms = Math.ceil(travellers(t) / 2);
  const blank = { name: '', area: areaOpts[0]?.[0] || '', price: '', nights: String(Math.max(1, t.plan.length - 1)), checkin: t.start, checkout: '', rating: '', link: '', notes: '' };
  const [f, setF] = useState(blank);
  const upd = (p: Partial<typeof f>) => setF({ ...f, ...p });

  const addStay = () => {
    const name = f.name.trim();
    if (!name) { toast('Give the stay a name'); return; }
    const [dest, area] = f.area.split('|');
    const a = D[dest]?.areas.find((x) => x[0] === area);
    const link = f.link.trim();
    mut(t.id, (tt) => {
      tt.stays.push({ id: uid(), name, area, dest, lat: a?.[2] ?? null, lng: a?.[3] ?? null, price: +f.price || 0, nights: Math.max(1, +f.nights || 1), checkin: f.checkin, checkout: f.checkout, rating: +f.rating || 0, link: /^https?:\/\//i.test(link) ? link : '', notes: f.notes.trim(), status: 'shortlisted' });
    }, 'Stay saved', true);
    setF({ ...blank, area: f.area });
  };

  return (
    <>
      <div className="grid" style={{ gap: 16 }}>
        {t.dests.map((id) => {
          const d = D[id];
          if (!d) return null;
          const rows = d.areas.map((a) => ({ a, v: avg({ lat: a[2], lng: a[3] }, id) }));
          const best = rows.filter((r) => r.v != null).sort((x, y) => x.v! - y.v!)[0];
          return (
            <div className="card" key={id}>
              <h3>Where to stay in {d.name}</h3>
              <div className="scroll" style={{ marginTop: 10 }}>
                <table className="stack">
                  <thead><tr><th>Area</th><th>Best for</th><th className="n">Avg. distance to your plans</th></tr></thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.a[0]}>
                        <td><b>{r.a[0]}</b>{r === best && <> <span className="tag f">Closest to your plan</span></>}</td>
                        <td>{r.a[1]}</td>
                        <td className="n">{r.v != null ? r.v.toFixed(1) + ' km' : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>

      <section className="sec">
        <h2>Saved stays</h2>
        <p className="tiny muted" style={{ marginTop: 6 }}>Trip Architect doesn’t show live hotel inventory or prices. Save options you find on booking sites and compare them here.</p>
        {t.stays.length ? (
          <div className="scroll" style={{ marginTop: 12 }}>
            <table className="stack">
              <thead><tr><th>Stay</th><th>Area</th><th className="n">Per night</th><th className="n">Nights</th><th className="n">Total ({plural(rooms, 'room')})</th><th className="n">To your plans</th><th className="n">Rating</th><th>Status</th><th><span className="vh">Actions</span></th></tr></thead>
              <tbody>
                {t.stays.map((s) => {
                  const v = avg(s, s.dest);
                  return (
                    <tr key={s.id}>
                      <td>
                        <b>{s.name}</b>
                        {s.link && <><br /><a className="small" href={s.link} target="_blank" rel="noopener noreferrer">Booking link</a></>}
                        {s.notes && <><br /><span className="tiny muted">{s.notes}</span></>}
                        {s.checkin && <><br /><span className="tiny muted">{s.checkin} → {s.checkout || ''}</span></>}
                      </td>
                      <td>{s.area}</td>
                      <td className="n">{inr(s.price)}</td>
                      <td className="n">{s.nights}</td>
                      <td className="n"><b>{inr(s.price * s.nights * rooms)}</b></td>
                      <td className="n">{v != null ? v.toFixed(1) + ' km' : '—'}</td>
                      <td className="n">{s.rating ? s.rating + '/5' : '—'}</td>
                      <td>
                        <select value={s.status} aria-label={`Booking status for ${s.name}`} style={{ minWidth: 130 }} onChange={(e) => mut(t.id, (tt) => { const x = tt.stays.find((y) => y.id === s.id); if (!x) return false; x.status = e.target.value as StayStatus; })}>
                          {(['idea', 'shortlisted', 'booked'] as const).map((x) => <option key={x} value={x}>{x[0].toUpperCase() + x.slice(1)}</option>)}
                        </select>
                      </td>
                      <td>
                        <div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
                          <button type="button" className="btn sm" onClick={() => mut(t.id, (tt) => { tt.budget.stay = s.price * s.nights * Math.ceil(travellers(tt) / 2); }, 'Stay budget updated', true)}>Use in budget</button>
                          <button type="button" className="btn sm ghost" aria-label={`Delete ${s.name}`} onClick={() => mut(t.id, (tt) => { tt.stays = tt.stays.filter((x) => x.id !== s.id); }, 'Stay deleted', true)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <p className="small muted" style={{ marginTop: 10 }}>No stays saved yet.</p>}
      </section>

      <form className="sec card grid" style={{ gap: 12 }} onSubmit={(e) => { e.preventDefault(); addStay(); }}>
        <h3>Add a stay you’re considering</h3>
        <div className="grid g3" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))' }}>
          <label className="f">Name<input type="text" placeholder="Hotel or homestay" value={f.name} onChange={(e) => upd({ name: e.target.value })} /></label>
          <label className="f">Area<select value={f.area} onChange={(e) => upd({ area: e.target.value })}>{areaOpts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <label className="f">Price per night per room (₹)<input type="number" min={0} step={100} value={f.price} onChange={(e) => upd({ price: e.target.value })} /></label>
          <label className="f">Nights<input type="number" min={1} value={f.nights} onChange={(e) => upd({ nights: e.target.value })} /></label>
          <label className="f">Check-in<input type="date" value={f.checkin} onChange={(e) => upd({ checkin: e.target.value })} /></label>
          <label className="f">Check-out<input type="date" value={f.checkout} onChange={(e) => upd({ checkout: e.target.value })} /></label>
          <label className="f">Your rating (1–5)<input type="number" min={1} max={5} step={0.5} value={f.rating} onChange={(e) => upd({ rating: e.target.value })} /></label>
          <label className="f">Booking link<input type="url" placeholder="https://" value={f.link} onChange={(e) => upd({ link: e.target.value })} /></label>
        </div>
        <label className="f">Notes<input type="text" placeholder="Breakfast included, free cancellation till…" value={f.notes} onChange={(e) => upd({ notes: e.target.value })} /></label>
        <div><button type="submit" className="btn pri">Save stay</button></div>
      </form>
    </>
  );
}
