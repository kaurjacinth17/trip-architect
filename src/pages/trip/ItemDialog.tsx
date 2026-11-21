// Add or edit a block. Every field is editable: title, linked place (re-link or unlink), day, start with end or
// duration, category, priority, cost, booking status and reference, link, tags, notes, done and lock.
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Modal } from '../../components/Modal';
import { CATS } from '../../data/constants';
import { PL } from '../../data/destinations';
import { destName, destView } from '../../engine/dest';
import { categorise } from '../../engine/placeTypes';
import { cascade, cascadeOrdered, findItem, placeAtExact, pullItem } from '../../engine/schedule';
import { fromHHMM, hm, toHHMM } from '../../engine/time';
import type { Cat, Item, Trip } from '../../engine/types';
import { clone, uid } from '../../engine/util';
import { useDebounced } from '../../hooks/useDebounced';
import { mut } from '../../lib/actions';
import { apiPost } from '../../lib/api';
import { searchBody, type LiveListPlace } from '../../lib/live';
import { useLiveStatus } from '../../lib/liveStatus';
import { useUI } from '../../store/ui';
import { useEditingBy } from '../../components/cloud/Social';
import { track } from '../../lib/cloud/sync';
import { useEffect } from 'react';

type Link = { pid: string | null; gid?: string; lat: number | null; lng: number | null; name: string };

function RelinkPicker({ t, dest, onPick }: { t: Trip; dest: string | null; onPick: (l: Link) => void }) {
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim(), 400);
  const v = destView(t, dest);
  const live = useLiveStatus((s) => s.state === 'live');
  const res = useQuery({
    queryKey: ['relink', v?.key, dq],
    enabled: live && !!v?.center && dq.length >= 2,
    queryFn: ({ signal }) => apiPost<{ places: LiveListPlace[] }>('/api/places/search', searchBody(v!, 'todo', { text: dq }), signal),
  });
  const curated = v?.curated && dq ? v.curated.pl.filter((p) => p.n.toLowerCase().includes(dq.toLowerCase())) : [];
  return (
    <div className="grid" style={{ gap: 6 }}>
      <input type="search" autoFocus placeholder={`Find a place in ${v?.name || 'this destination'}`} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a place to link" />
      <div className="lib">
        {curated.map((p) => <button type="button" key={p.pid} className="li" style={{ textAlign: 'left' }} onClick={() => onPick({ pid: p.pid, lat: p.lat, lng: p.lng, name: p.n })}><span className="nm">{p.n}</span></button>)}
        {(res.data?.places || []).map((p) => (
          <button type="button" key={p.id} className="li" style={{ textAlign: 'left' }} onClick={() => onPick({ pid: null, gid: p.id, lat: p.location?.lat ?? null, lng: p.location?.lng ?? null, name: p.name })}>
            <span><span className="nm">{p.name}</span><br /><span className="mt">{CATS[categorise(p.primaryType, p.types).cat][0]}{p.rating != null ? ` · ★ ${p.rating.toFixed(1)}` : ''}</span></span>
          </button>
        ))}
        {res.data?.places.length ? <span className="gmaps-attr" translate="no" style={{ textAlign: 'right' }}>Google Maps</span> : null}
      </div>
    </div>
  );
}

export function ItemDialog({ t, x, di, isNew, onClose }: { t: Trip; x: Item; di: number; isNew: boolean; onClose: () => void }) {
  const [f, setF] = useState({
    t: x.nameLive ? '' : x.t, day: di, cat: x.cat, s: toHHMM(x.s), d: String(x.d), e: toHHMM(x.s + x.d), useEnd: false,
    c: String(x.c || 0), pri: x.pri, n: x.n, done: x.done, locked: !!x.locked,
    bstatus: x.booking?.status || 'none', bref: x.booking?.ref || '', link: x.link || '', tags: (x.tags || []).join(', '),
  });
  const [link, setLink] = useState<Link>({ pid: x.pid, gid: x.gid, lat: x.lat, lng: x.lng, name: x.nameLive ? x.t : x.pid ? PL[x.pid]?.n || '' : '' });
  const [relink, setRelink] = useState(false);
  const upd = (p: Partial<typeof f>) => setF({ ...f, ...p });
  const start = fromHHMM(f.s);
  const dur = f.useEnd ? Math.max(5, ((fromHHMM(f.e) - start + 1440) % 1440) || 5) : Math.max(5, +f.d || (isNew ? 60 : x.d));
  const linkChanged = link.pid !== x.pid || link.gid !== x.gid;

  const fields = (base: Item): Item => {
    const url = f.link.trim();
    const out: Item = {
      ...base,
      t: f.t.trim() || (link.gid ? '' : isNew ? 'Custom activity' : link.pid ? PL[link.pid]?.n || base.t : base.gid ? 'Activity' : base.t),
      cat: f.cat, d: dur, c: Math.max(0, +f.c || 0), pri: f.pri, n: f.n.trim(), s: start, done: f.done,
      locked: f.locked || undefined,
      booking: f.bstatus === 'none' && !f.bref.trim() ? undefined : { status: f.bstatus as 'none' | 'needed' | 'booked', ref: f.bref.trim() || undefined },
      link: /^https?:\/\//i.test(url) ? url : undefined,
      tags: f.tags.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 12),
    };
    if (!out.tags?.length) delete out.tags;
    if (linkChanged) {
      out.pid = link.pid;
      out.gid = link.gid;
      out.lat = link.lat;
      out.lng = link.lng;
      out.coordsFetchedAt = link.gid && link.lat != null ? Date.now() : undefined;
      if (!link.gid) delete out.gid;
      if (!link.pid && !link.gid) out.area = '';
    }
    delete out.nameLive;
    return out;
  };

  const save = () => {
    onClose();
    if (isNew) {
      useUI.getState().set({ slot: null });
      mut(t.id, (tt) => { placeAtExact(tt, f.day, fields(x), start); }, 'Added to Day ' + (f.day + 1), true);
      return;
    }
    mut(t.id, (tt) => {
      const g = findItem(tt, x.id);
      if (!g) return false;
      const next = fields(g.x);
      const moved = start !== g.x.s || f.day !== g.di;
      if (moved) {
        // An explicitly chosen time holds; later items move if needed.
        pullItem(tt, x.id);
        placeAtExact(tt, f.day, next, start);
      } else {
        Object.assign(g.x, next);
        cascade(g.day);
      }
    }, 'Saved', true);
  };
  const del = () => { onClose(); mut(t.id, (tt) => { if (!pullItem(tt, x.id)) tt.wish = tt.wish.filter((w) => w.id !== x.id); }, 'Activity deleted', true); };
  const dup = () => {
    onClose();
    mut(t.id, (tt) => {
      const g = findItem(tt, x.id);
      if (!g) return false;
      g.day.items.splice(g.j + 1, 0, { ...clone(g.x), id: uid(), s: g.x.s + g.x.d, locked: undefined });
      cascadeOrdered(g.day);
    }, 'Duplicated', true);
  };
  const toWish = () => { onClose(); mut(t.id, (tt) => { const g = pullItem(tt, x.id); if (!g) return false; tt.wish.push({ ...g.x, locked: undefined }); }, 'Moved to wishlist', true); };

  const other = useEditingBy(t.id, x.id);
  useEffect(() => {
    if (!t.cloud || isNew) return;
    void track(t.id, { editing: x.id });
    return () => { void track(t.id, { editing: null }); };
  }, [t.cloud, t.id, x.id, isNew]);
  const title = isNew ? 'Add a custom activity' : 'Edit activity';
  return (
    <Modal title={title} onClose={onClose} wide>
      <form className="grid" style={{ gap: 14 }} onSubmit={(e) => { e.preventDefault(); save(); }}>
        <h2>{title}</h2>
        {other && <div className="warn caution" role="status"><b>{other.name} is editing this block right now</b><p>If you both save, you’ll be asked which changes to keep.</p></div>}
        <label className="f">Title<input type="text" value={f.t} placeholder={link.gid ? link.name || 'Shows the place’s current name' : ''} onChange={(e) => upd({ t: e.target.value })} /></label>

        <div className="card grid" style={{ gap: 6, padding: 12 }}>
          <b className="small">Linked place</b>
          {link.gid ? <p className="small">{link.name || 'A place on Google Maps'} · <span className="gmaps-attr" translate="no">Google Maps</span>{!f.t && <span className="tiny muted"> · the title shows its current name</span>}</p>
            : link.pid ? <p className="small">{PL[link.pid]?.n} · from the {destName(t, x.dest)} guide</p>
            : <p className="small muted">Not linked to a place{link.lat != null ? ' (has a dropped pin)' : ''}.</p>}
          <div className="row" style={{ gap: 6 }}>
            <button type="button" className="btn sm" onClick={() => setRelink(!relink)}>{link.pid || link.gid ? 'Re-link' : 'Link to a place'}</button>
            {(link.pid || link.gid) && <button type="button" className="btn sm ghost" onClick={() => { setLink({ pid: null, lat: null, lng: null, name: '' }); setRelink(false); }}>Unlink</button>}
          </div>
          {relink && <RelinkPicker t={t} dest={x.dest || t.plan[di]?.dest} onPick={(l) => { setLink(l); setRelink(false); }} />}
          {linkChanged && !link.pid && !link.gid && !f.t.trim() && <p className="tiny" style={{ color: 'var(--alert)' }}>Give it a title.</p>}
        </div>

        <div className="grid g3" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))' }}>
          <label className="f">Day<select value={f.day} onChange={(e) => upd({ day: +e.target.value })}>{t.plan.map((d, i) => <option key={i} value={i}>Day {i + 1}{d.label ? ' · ' + d.label : ''}</option>)}</select></label>
          <label className="f">Type<select value={f.cat} onChange={(e) => upd({ cat: e.target.value as Cat })}>{Object.entries(CATS).map(([k, c]) => <option key={k} value={k}>{c[0]}</option>)}</select></label>
          <label className="f">Start time<input type="time" step={300} value={f.s} onChange={(e) => upd({ s: e.target.value, e: toHHMM(fromHHMM(e.target.value) + dur) })} /></label>
          {f.useEnd
            ? <label className="f">End time<input type="time" step={300} value={f.e} onChange={(e) => upd({ e: e.target.value })} /></label>
            : <label className="f">Duration (minutes)<input type="number" min={5} step={15} value={f.d} onChange={(e) => upd({ d: e.target.value, e: toHHMM(start + (+e.target.value || 0)) })} /></label>}
          <label className="row small" style={{ gap: 6, fontWeight: 600, alignSelf: 'end', minHeight: 44 }}><input type="checkbox" checked={f.useEnd} onChange={(e) => upd({ useEnd: e.target.checked, d: String(dur) })} />Set an end time ({hm(dur)})</label>
          <label className="f">Cost per person (₹)<input type="number" min={0} step={50} value={f.c} onChange={(e) => upd({ c: e.target.value })} /></label>
          <label className="f">Priority<select value={f.pri} onChange={(e) => upd({ pri: e.target.value as Item['pri'] })}><option value="must">Must-do</option><option value="nice">Nice to have</option></select></label>
          <label className="f">Booking<select value={f.bstatus} onChange={(e) => upd({ bstatus: e.target.value as typeof f.bstatus })}><option value="none">No booking needed</option><option value="needed">Needs booking</option><option value="booked">Booked</option></select></label>
          <label className="f">Booking reference<input type="text" value={f.bref} placeholder="PNR, ticket or confirmation no." onChange={(e) => upd({ bref: e.target.value })} /></label>
          <label className="f">Link<input type="url" value={f.link} placeholder="https://" onChange={(e) => upd({ link: e.target.value })} /></label>
          <label className="f">Tags<input type="text" value={f.tags} placeholder="e.g. kids, rainy-day" onChange={(e) => upd({ tags: e.target.value })} /></label>
        </div>
        <div className="row" style={{ gap: 18 }}>
          <label className="row small" style={{ gap: 6, fontWeight: 600 }}><input type="checkbox" checked={f.locked} onChange={(e) => upd({ locked: e.target.checked })} />🔒 Lock time (never moved automatically)</label>
          <label className="row small" style={{ gap: 6, fontWeight: 600 }}><input type="checkbox" checked={f.done} onChange={(e) => upd({ done: e.target.checked })} />Done</label>
        </div>
        <label className="f">Notes<textarea value={f.n} placeholder="Tickets, meeting point, anything to remember" onChange={(e) => upd({ n: e.target.value })} /></label>
        {link.pid && <p className="tiny muted">{PL[link.pid]?.desc || ''}</p>}
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
