// Phase 10 pieces: travel legs, the bookings vault, Today mode, personal needs, and the emergency card.
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Modal } from '../../components/Modal';
import { destName, destView } from '../../engine/dest';
import { addLeg, gcalLink, LEG_MODES, legLinks } from '../../engine/extras';
import { km, travelMin } from '../../engine/geo';
import { navLinks, navPlatform } from '../../engine/navigate';
import { shiftRestOfDay } from '../../engine/bulk';
import { dayEndpoint, stayForDay } from '../../engine/stays';
import { dayDate, fmtT, fromHHMM, toHHMM } from '../../engine/time';
import type { Booking, Item, LegMode, Needs, Trip } from '../../engine/types';
import { uid } from '../../engine/util';
import { mut } from '../../lib/actions';
import { apiGet, apiPost } from '../../lib/api';
import { deleteFile, MAX_FILE, openFile, putFile } from '../../lib/files';
import { useLiveStatus } from '../../lib/liveStatus';
import { toast } from '../../store/toast';
import { useCloud, NONE } from '../../lib/cloud/sync';
import { GoogleAttribution } from '../LiveDestination';

/* ------------------------------------------------------------------------------------------ travel legs */

export function LegDialog({ t, di, onClose }: { t: Trip; di: number; onClose: () => void }) {
  const [f, setF] = useState({ mode: 'train' as LegMode, from: '', to: destName(t, t.plan[di].dest), dep: '07:00', arr: '13:00', nextDay: false, ref: '', seat: '', cost: '' });
  const up = (p: Partial<typeof f>) => setF({ ...f, ...p });
  const dep = fromHHMM(f.dep), arr = fromHHMM(f.arr) + (f.nextDay ? 1440 : 0);
  const mins = arr - dep;
  return (
    <Modal title="Add a travel leg" onClose={onClose}>
      <form className="grid" style={{ gap: 10 }} onSubmit={(e) => {
        e.preventDefault();
        if (!f.from.trim() || !f.to.trim()) { toast('Add where you travel from and to'); return; }
        if (mins <= 0) { toast('Arrival must be after departure (tick “next day” for overnight journeys)'); return; }
        mut(t.id, (tt) => { addLeg(tt, di, { mode: f.mode, from: f.from.trim(), to: f.to.trim(), ...(f.ref.trim() ? { ref: f.ref.trim() } : {}), ...(f.seat.trim() ? { seat: f.seat.trim() } : {}) }, dep, mins, Math.max(0, +f.cost || 0)); },
          `Leg added to Day ${di + 1} and locked${arr > 1440 ? '; the next day now starts after you arrive' : ''}`, true);
        onClose();
      }}>
        <h2>Add a travel leg to Day {di + 1}</h2>
        <div className="seg" role="radiogroup" aria-label="How">{LEG_MODES.map(([k, l, i]) => <button key={k} type="button" role="radio" aria-checked={f.mode === k} className={f.mode === k ? 'on' : ''} onClick={() => up({ mode: k })}>{i} {l}</button>)}</div>
        <div className="grid g2">
          <label className="f">From<input type="text" value={f.from} onChange={(e) => up({ from: e.target.value })} placeholder="e.g. New Delhi" /></label>
          <label className="f">To<input type="text" value={f.to} onChange={(e) => up({ to: e.target.value })} /></label>
          <label className="f">Departs<input type="time" value={f.dep} onChange={(e) => up({ dep: e.target.value })} /></label>
          <label className="f">Arrives<input type="time" value={f.arr} onChange={(e) => up({ arr: e.target.value })} /></label>
          <label className="f">PNR or booking reference<input type="text" value={f.ref} onChange={(e) => up({ ref: e.target.value })} /></label>
          <label className="f">Seat or berth<input type="text" value={f.seat} onChange={(e) => up({ seat: e.target.value })} /></label>
          <label className="f">Cost per person (₹)<input type="number" min={0} value={f.cost} onChange={(e) => up({ cost: e.target.value })} /></label>
          <label className="row small" style={{ gap: 6, alignSelf: 'end' }}><input type="checkbox" checked={f.nextDay} onChange={(e) => up({ nextDay: e.target.checked })} />Arrives the next day</label>
        </div>
        <p className="tiny muted">{mins > 0 ? `${Math.floor(mins / 60)} h ${mins % 60} min journey.` : ''} Upload the ticket in Bookings.</p>
        <div className="row" style={{ gap: 6 }}>{legLinks({ mode: f.mode, from: f.from || '…', to: f.to || '…' }, dayDate(t, di)).map((l) => <a key={l.label} className="btn sm ghost" href={l.url} target="_blank" rel="noopener noreferrer">{l.label}</a>)}</div>
        <div className="row"><button type="button" className="btn" onClick={onClose}>Cancel</button><button type="submit" className="btn pri">Add leg</button></div>
      </form>
    </Modal>
  );
}

/** Small details under a leg or any block: PNR, seat, helper links, Google Calendar. */
export function BlockExtras({ t, di, x }: { t: Trip; di: number; x: Item }) {
  const cal = gcalLink(t, di, x);
  return (
    <span className="tiny muted">
      {x.leg?.ref && <> · PNR {x.leg.ref}</>}{x.leg?.seat && <> · Seat {x.leg.seat}</>}
      {x.leg && legLinks(x.leg, dayDate(t, di)).map((l) => <> · <a key={l.label} href={l.url} target="_blank" rel="noopener noreferrer">{l.label}</a></>)}
      {cal && <> · <a href={cal} target="_blank" rel="noopener noreferrer">Add to Google Calendar</a></>}
    </span>
  );
}

/* ---------------------------------------------------------------------------------------- bookings vault */

export function Bookings({ t }: { t: Trip }) {
  const [filter, setFilter] = useState<'all' | 'booked' | 'pending'>('all');
  const [f, setF] = useState({ kind: 'ticket' as Booking['kind'], title: '', ref: '', status: 'booked' as Booking['status'], link: '', notes: '' });
  const [file, setFile] = useState<File | null>(null);
  const items = t.plan.flatMap((d, di) => d.items.map((x) => ({ x, di })));
  const list = (t.bookings || []).filter((b) => filter === 'all' || b.status === filter);
  const needed = items.filter(({ x }) => x.booking?.status === 'needed' && !(t.bookings || []).some((b) => b.itemId === x.id && b.status === 'booked'));
  const unbookedStays = t.stays.filter((s) => s.status !== 'booked' && (s.from != null));
  const label = (b: Booking) => (b.itemId ? items.find((i) => i.x.id === b.itemId)?.x.t : b.stayId ? t.stays.find((s) => s.id === b.stayId)?.name : '') || '';
  const add = async () => {
    if (!f.title.trim()) { toast('Give it a title'); return; }
    let fileId: string | undefined;
    if (file) {
      if (file.size > MAX_FILE) { toast('Files can be up to 5 MB'); return; }
      fileId = uid();
      try { await putFile(fileId, file); } catch { toast('Couldn’t save the file on this device'); return; }
    }
    const [k, id] = f.link.split(':');
    mut(t.id, (tt) => { tt.bookings = [...(tt.bookings || []), { id: uid(), kind: f.kind, title: f.title.trim(), ref: f.ref.trim(), status: f.status, ...(k === 'item' ? { itemId: id } : k === 'stay' ? { stayId: id } : {}), ...(fileId ? { fileId, fileName: file!.name } : {}), ...(f.notes.trim() ? { notes: f.notes.trim() } : {}) }];
      if (k === 'item' && f.status === 'booked') { const x = tt.plan.flatMap((d) => d.items).find((y) => y.id === id); if (x) x.booking = { status: 'booked', ref: f.ref.trim() || undefined }; }
      if (k === 'stay' && f.status === 'booked') { const s = tt.stays.find((y) => y.id === id); if (s) s.status = 'booked'; } }, 'Saved to Bookings', true);
    setF({ ...f, title: '', ref: '', notes: '' });
    setFile(null);
  };
  return (
    <>
      <div className="grid g3">
        <div className="card stat"><span>Booked</span><b>{(t.bookings || []).filter((b) => b.status === 'booked').length}</b><span>confirmations saved</span></div>
        <div className="card stat"><span>Still to book</span><b style={{ color: needed.length + unbookedStays.length ? 'var(--alert)' : undefined }}>{needed.length + unbookedStays.length}</b><span>{needed.length} activities · {unbookedStays.length} stays</span></div>
        <div className="card stat"><span>Pending</span><b>{(t.bookings || []).filter((b) => b.status === 'pending').length}</b><span>awaiting confirmation</span></div>
      </div>
      {(needed.length > 0 || unbookedStays.length > 0) && (
        <section className="sec"><h2>Still to book</h2><ul className="xlist" style={{ marginTop: 8 }}>
          {needed.map(({ x, di }) => <li key={x.id} className="xrow"><span>{x.t} <span className="tiny muted">· Day {di + 1}</span></span></li>)}
          {unbookedStays.map((s) => <li key={s.id} className="xrow"><span>{s.name || 'Your stay'} <span className="tiny muted">· nights {(s.from ?? 0) + 1}–{(s.to ?? 0) + 1}</span></span><Link className="btn sm" to={`/trips/${t.id}/stays`}>Stays</Link></li>)}
        </ul></section>
      )}
      <section className="sec">
        <div className="row between"><h2>Confirmations</h2>
          <div className="seg" role="tablist" aria-label="Filter bookings">{(['all', 'booked', 'pending'] as const).map((k) => <button key={k} type="button" role="tab" aria-selected={filter === k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{k === 'all' ? 'All' : k === 'booked' ? 'Booked' : 'Pending'}</button>)}</div>
        </div>
        <ul className="xlist" style={{ marginTop: 8 }}>
          {list.map((b) => (
            <li key={b.id} className="xrow">
              <span><b>{b.title}</b> <span className={'tag' + (b.status === 'booked' ? ' f' : ' t')}>{b.status === 'booked' ? 'Booked' : 'Pending'}</span><br />
                <span className="tiny muted">{b.kind}{b.ref ? ` · Ref ${b.ref}` : ''}{label(b) ? ` · for ${label(b)}` : ''}{b.notes ? ` · ${b.notes}` : ''}</span></span>
              <span className="row" style={{ gap: 4 }}>
                {b.fileId && <button type="button" className="btn sm" onClick={() => void openFile(b.fileId!).then((ok) => { if (!ok) toast('That file is on another device'); })}>Open {b.fileName?.split('.').pop()?.toUpperCase() || 'file'}</button>}
                <button type="button" className="btn sm" onClick={() => mut(t.id, (tt) => { const x = tt.bookings?.find((y) => y.id === b.id); if (!x) return false; x.status = x.status === 'booked' ? 'pending' : 'booked'; })}>{b.status === 'booked' ? 'Mark pending' : 'Mark booked'}</button>
                <button type="button" className="btn sm ghost" aria-label={`Delete ${b.title}`} onClick={() => { if (b.fileId) void deleteFile(b.fileId); mut(t.id, (tt) => { tt.bookings = (tt.bookings || []).filter((y) => y.id !== b.id); }, 'Deleted', true); }}>Delete</button>
              </span>
            </li>
          ))}
          {!list.length && <li className="small muted">Nothing here yet.</li>}
        </ul>
      </section>
      <form className="sec card grid" style={{ gap: 10 }} onSubmit={(e) => { e.preventDefault(); void add(); }}>
        <h3>Add a confirmation</h3>
        <div className="grid g3" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))' }}>
          <label className="f">What<select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as Booking['kind'] })}><option value="ticket">Ticket (train, flight, bus)</option><option value="stay">Stay</option><option value="activity">Activity</option><option value="other">Other</option></select></label>
          <label className="f">Title<input type="text" value={f.title} placeholder="e.g. Shatabdi to Jaipur" onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
          <label className="f">Reference / PNR<input type="text" value={f.ref} onChange={(e) => setF({ ...f, ref: e.target.value })} /></label>
          <label className="f">Status<select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as Booking['status'] })}><option value="booked">Booked</option><option value="pending">Pending</option></select></label>
          <label className="f">For<select value={f.link} onChange={(e) => setF({ ...f, link: e.target.value })}><option value="">Nothing specific</option>
            {items.map(({ x, di }) => <option key={x.id} value={'item:' + x.id}>Day {di + 1} · {x.t}</option>)}
            {t.stays.map((s) => <option key={s.id} value={'stay:' + s.id}>Stay · {s.name}</option>)}</select></label>
          <label className="f">File (PDF or image, ≤5 MB)<input type="file" accept="application/pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} /></label>
        </div>
        <label className="f">Notes<input type="text" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></label>
        <p className="tiny muted">Files stay on this device only. References and notes travel with the trip.</p>
        <div><button type="submit" className="btn pri">Save</button></div>
      </form>
    </>
  );
}

/* ------------------------------------------------------------------------------------------ Today mode */

export function todayIndex(t: Trip, now = new Date()): number {
  if (!t.start) return -1;
  const s = new Date(t.start + 'T00:00:00');
  const i = Math.floor((new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - s.getTime()) / 86_400_000);
  return i >= 0 && i < t.plan.length ? i : -1;
}

export function TodayCard({ t }: { t: Trip }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(id); }, []);
  const di = todayIndex(t, now);
  if (di < 0) return null;
  const min = now.getHours() * 60 + now.getMinutes();
  const items = [...t.plan[di].items].sort((a, b) => a.s - b.s);
  const cur = items.find((x) => x.s <= min && min < x.s + x.d && !x.done);
  const next = items.find((x) => x.s > min && !x.done);
  const prevPt = cur && cur.lat != null ? cur : [...items].reverse().find((x) => x.s + x.d <= min && x.lat != null) || null;
  const from = prevPt && prevPt.lat != null ? { lat: prevPt.lat, lng: prevPt.lng! } : dayEndpoint(t, di, 'start');
  const leaveBy = next && from && next.lat != null ? next.s - travelMin(km(from, next)) : null;
  const rest = items.filter((x) => x.s + x.d > min && x.lat != null && x.lng != null && !x.done);
  const home = dayEndpoint(t, di, 'end');
  const stops = [...rest.map((x) => ({ lat: x.lat!, lng: x.lng!, placeId: x.gid })), ...(home ? [home] : [])];
  const nav = navLinks(stops, 'driving', navPlatform())[0];
  const late = (m: number) => mut(t.id, (tt) => { const r = shiftRestOfDay(tt, di, min, m); if (!r.changed) return false; Object.assign(tt, r.trip); }, `Rest of today moved ${m} min later (locked blocks stay put)`, true);
  return (
    <section className="card today" aria-label="Today">
      <div className="row between"><b>Today · Day {di + 1}</b><span className="tiny muted">{fmtT(min)}</span></div>
      <div className="grid g2" style={{ marginTop: 8 }}>
        <div><span className="tiny muted">Now</span><p style={{ margin: 0 }}><b>{cur ? cur.t : 'Free time'}</b>{cur && <span className="small muted"> until {fmtT(cur.s + cur.d)}</span>}</p>
          {cur && <button type="button" className="btn sm" style={{ marginTop: 6 }} onClick={() => mut(t.id, (tt) => { const x = tt.plan[di].items.find((y) => y.id === cur.id); if (!x) return false; x.done = true; }, `${cur.t} done`, true)}>Mark done</button>}</div>
        <div><span className="tiny muted">Next</span><p style={{ margin: 0 }}><b>{next ? next.t : 'Nothing else planned'}</b>{next && <span className="small muted"> at {fmtT(next.s)}</span>}</p>
          {leaveBy != null && <p className="small" style={{ margin: '4px 0 0', color: leaveBy < min ? 'var(--alert)' : undefined }}>{leaveBy < min ? `Leave now (you’re ${min - leaveBy} min behind)` : `Leave by ${fmtT(leaveBy)}`}</p>}</div>
      </div>
      <div className="row" style={{ marginTop: 10, gap: 6 }}>
        {nav && <a className="btn pri big" href={nav.url} target="_blank" rel="noopener noreferrer">Navigate</a>}
        <Link className="btn" to={`/trips/${t.id}/expenses`}>Add expense</Link>
        <span className="small muted">Running late?</span>
        <button type="button" className="btn sm" onClick={() => late(30)}>+30 min</button>
        <button type="button" className="btn sm" onClick={() => late(60)}>+60 min</button>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------------------------------ needs */

const NEEDS: [keyof Needs, string][] = [['veg', 'Vegetarian'], ['jain', 'Jain food'], ['wheelchair', 'Wheelchair access'], ['kids', 'Travelling with children'], ['senior', 'Senior travellers (gentle pace)']];
export function NeedsCard({ t }: { t: Trip }) {
  const n = t.needs || {};
  return (
    <div className="card grid" style={{ gap: 8 }}>
      <h3>Personal needs</h3>
      <div className="row" style={{ gap: 6 }} role="group" aria-label="Personal needs">
        {NEEDS.map(([k, l]) => <button key={k} type="button" className={'chip' + (n[k] ? ' on' : '')} aria-pressed={!!n[k]} onClick={() => mut(t.id, (tt) => { tt.needs = { ...(tt.needs || {}), [k]: !n[k] || undefined }; })}>{l}</button>)}
      </div>
      <p className="tiny muted">These shape the City Guide’s default filters (vegetarian, wheelchair entrance) and add gentle checks (late nights with children, long days for seniors, access at activities).</p>
    </div>
  );
}

/* ---------------------------------------------------------------------------------------- emergency */

const LANG: Record<string, string> = { 'Tamil Nadu': 'ta', Puducherry: 'ta', Kerala: 'ml', Karnataka: 'kn', 'Andhra Pradesh': 'te', Telangana: 'te', 'West Bengal': 'bn', Maharashtra: 'mr', Goa: 'hi', Gujarat: 'gu', Punjab: 'pa', Odisha: 'or', Assam: 'as' };
const LANG_NAME: Record<string, string> = { hi: 'Hindi', ta: 'Tamil', ml: 'Malayalam', kn: 'Kannada', te: 'Telugu', bn: 'Bengali', mr: 'Marathi', gu: 'Gujarati', pa: 'Punjabi', or: 'Odia', as: 'Assamese' };

export function EmergencyCard({ t, di = 0 }: { t: Trip; di?: number }) {
  const live = useLiveStatus((s) => s.state === 'live');
  const v = destView(t, t.plan[di]?.dest || t.dests[0]);
  const stay = stayForDay(t, di);
  const state = v?.curated?.state || v?.region || '';
  const india = v?.inIndia !== false;
  const lang = india ? LANG[state] || 'hi' : 'en';
  const [show, setShow] = useState(false);
  const [near, setNear] = useState<'hospitals' | 'pharmacies' | null>(null);
  const addr = (l: string) => ({ queryKey: ['addr', stay?.gid, l], enabled: live && show && !!stay?.gid, queryFn: ({ signal }: { signal: AbortSignal }) => apiGet<{ address: string | null }>(`/api/places/address?id=${stay!.gid}&lang=${l}`, signal), staleTime: Infinity });
  const en = useQuery(addr('en')), local = useQuery({ ...addr(lang), enabled: live && show && !!stay?.gid && lang !== 'en' });
  const at = stay?.lat != null ? { lat: stay.lat, lng: stay.lng! } : v?.center || null;
  const nq = useQuery({ queryKey: ['near', near, at?.lat, at?.lng], enabled: live && !!near && !!at, staleTime: 30 * 60_000,
    queryFn: ({ signal }) => apiPost<{ places: { id: string; name: string; location?: { lat: number; lng: number }; googleMapsUri?: string }[] }>('/api/places/nearby', { layer: near, center: at, radius: 5000 }, signal) });
  const people = useCloud((s) => s.members[t.id] || NONE);
  const phones = [...people.filter((p) => p.phone).map((p) => ({ name: p.display_name, phone: p.phone! })), ...(t.contacts || [])];
  const [c, setC] = useState({ name: '', phone: '' });
  return (
    <div className="card grid" style={{ gap: 10 }}>
      <h3>Emergency and practical</h3>
      <div className="row" style={{ gap: 8 }}>
        {india ? <a className="btn pri" href="tel:112">Call 112 (all emergencies)</a> : <span className="small">Check the local emergency number for {v?.name}.</span>}
        {india && <a className="btn" href="tel:108">108 Ambulance</a>}
      </div>
      {stay ? (
        <div>
          <button type="button" className="btn sm" onClick={() => setShow(!show)} aria-expanded={show}>{show ? 'Hide' : 'Show'} hotel address for the driver</button>
          {show && (
            <div className="drivercard" role="region" aria-label="Hotel address for the driver">
              <b className="big">{stay.name}</b>
              {stay.gid ? <>
                <p>{en.data?.address || (en.isLoading ? 'Loading…' : 'Address unavailable')}</p>
                {lang !== 'en' && <p lang={lang}>{local.data?.address || (local.isLoading ? 'Loading…' : '')}</p>}
                <span className="tiny muted">Address from OpenStreetMap{lang !== 'en' ? `, in English and ${LANG_NAME[lang]}` : ''}.</span>
              </> : <p>{stay.area}{stay.notes ? ` · ${stay.notes}` : ''}</p>}
            </div>
          )}
        </div>
      ) : <p className="small muted">Add your hotel in Stays to get a “show to driver” address card.</p>}
      <div className="row" style={{ gap: 6 }}>
        <button type="button" className="btn sm" disabled={!live} onClick={() => setNear('hospitals')}>Nearest hospitals</button>
        <button type="button" className="btn sm" disabled={!live} onClick={() => setNear('pharmacies')}>Nearest pharmacies</button>
      </div>
      {near && (
        <div className="gbox">
          {nq.isLoading ? <p className="small muted">Searching…</p> : (
            <ul className="xlist">{(nq.data?.places || []).filter((p) => p.location && at).map((p) => ({ p, d: km(at!, p.location!)! })).sort((a, b) => a.d - b.d).slice(0, 4).map(({ p, d }) => (
              <li key={p.id} className="xrow"><span>{p.name} <span className="tiny muted">· {d.toFixed(1)} km</span></span>{p.googleMapsUri && <a className="btn sm" href={p.googleMapsUri} target="_blank" rel="noopener noreferrer">Directions</a>}</li>
            ))}</ul>
          )}
          <GoogleAttribution />
        </div>
      )}
      <div>
        <b className="small">Emergency contacts</b>
        <ul className="xlist">{phones.map((p, i) => <li key={i} className="xrow"><span>{p.name}</span><a href={`tel:${p.phone.replace(/\s/g, '')}`}>{p.phone}</a></li>)}</ul>
        <form className="row" style={{ gap: 6, marginTop: 6 }} onSubmit={(e) => { e.preventDefault(); if (!c.name.trim() || !/^\+?[0-9 ()-]{6,20}$/.test(c.phone.trim())) { toast('Add a name and a phone number'); return; } mut(t.id, (tt) => { tt.contacts = [...(tt.contacts || []), { name: c.name.trim(), phone: c.phone.trim() }]; }, 'Contact added', true); setC({ name: '', phone: '' }); }}>
          <input type="text" aria-label="Contact name" placeholder="Name" value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} style={{ flex: '1 1 120px' }} />
          <input type="tel" aria-label="Contact phone" placeholder="Phone" value={c.phone} onChange={(e) => setC({ ...c, phone: e.target.value })} style={{ flex: '1 1 120px' }} />
          <button type="submit" className="btn sm">Add</button>
        </form>
        <p className="tiny muted">Members of a shared trip appear here if they chose to share their phone number.</p>
      </div>
    </div>
  );
}

export { toHHMM };
