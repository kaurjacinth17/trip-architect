// The per-day Add bar: search places in this destination (live, with ratings), Famous picks, wishlist, Meal,
// Travel, Free time and Custom (optional dropped pin). Every insert goes at the end, at an exact time, after a
// chosen block, or into a highlighted free slot.
import { lazy, Suspense, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CATS } from '../../data/constants';
import { PL } from '../../data/destinations';
import { destView, type DestView } from '../../engine/dest';
import { fmtDist, geo, km, trm } from '../../engine/geo';
import { itemFromLive, MEALS, type MealKind, type LivePlace } from '../../engine/livePool';
import { categorise, isLodging } from '../../engine/placeTypes';
import { PRIOR, bayesScores } from '../../engine/ranking';
import { customItem, itemFromPlace, nextSlot, placeAfter, placeAtExact, placeOnDay } from '../../engine/schedule';
import { fmtT, fromHHMM, hm, toHHMM } from '../../engine/time';
import type { Cat, Item, Place, Trip } from '../../engine/types';
import { up5 } from '../../engine/util';
import { useDebounced } from '../../hooks/useDebounced';
import { mut } from '../../lib/actions';
import { apiPost } from '../../lib/api';
import { searchBody, usePlaceList, type LiveListPlace } from '../../lib/live';
import { useLiveStatus } from '../../lib/liveStatus';
import { useUI } from '../../store/ui';

const PinPicker = lazy(() => import('../../components/PinPicker'));

type Mode = 'search' | 'famous' | 'wish' | 'meal' | 'travel' | 'free' | 'custom';
const MODES: [Mode, string][] = [['search', 'Search places'], ['famous', 'Famous picks'], ['wish', 'Wishlist'], ['meal', 'Meal'], ['travel', 'Travel'], ['free', 'Free time'], ['custom', 'Custom']];

export type InsertAt = { mode: 'end' } | { mode: 'time'; time: string } | { mode: 'after'; id: string };

/** Minute at which to insert, or null for "next free slot at the end". */
export function insertMinute(t: Trip, di: number, at: InsertAt, x?: Partial<Item>): number | null {
  const day = t.plan[di];
  if (at.mode === 'time') return fromHHMM(at.time);
  if (at.mode === 'after') {
    const ref = day.items.find((y) => y.id === at.id);
    return ref ? up5(ref.s + ref.d + (x ? trm(ref, x) : 0)) : null;
  }
  return null;
}

/** Insert into the trip at the chosen position: exact times hold (later items move), "end" uses the next slot. */
export function insertItem(t: Trip, di: number, x: Item, at: InsertAt) {
  if (at.mode === 'after') { placeAfter(t, di, x, at.id); return; }
  const m = insertMinute(t, di, at, x);
  if (m == null) placeOnDay(t, di, x);
  else placeAtExact(t, di, x, m);
}

function PositionPicker({ t, di, at, setAt }: { t: Trip; di: number; at: InsertAt; setAt: (a: InsertAt) => void }) {
  const day = t.plan[di];
  const items = [...day.items].sort((a, b) => a.s - b.s);
  const val = at.mode === 'after' ? 'after:' + at.id : at.mode;
  return (
    <div className="row" style={{ gap: 8 }}>
      <label className="row small" style={{ gap: 6, fontWeight: 600 }}>Insert
        <select value={val} aria-label="Insert position" style={{ width: 'auto', maxWidth: 260 }} onChange={(e) => {
          const v = e.target.value;
          if (v === 'end') setAt({ mode: 'end' });
          else if (v === 'time') setAt({ mode: 'time', time: toHHMM(nextSlot(structuredClone(day), customItem({})) ?? day.start ?? 540) });
          else setAt({ mode: 'after', id: v.slice(6) });
        }}>
          <option value="end">at the end of the day</option>
          <option value="time">at a time…</option>
          {items.map((x) => <option key={x.id} value={'after:' + x.id}>after {x.t || 'block'} ({fmtT(x.s + x.d)})</option>)}
        </select>
      </label>
      {at.mode === 'time' && <input type="time" step={300} value={at.time} style={{ width: 'auto' }} aria-label="Insert at time" onChange={(e) => setAt({ mode: 'time', time: e.target.value })} />}
    </div>
  );
}

interface Row { key: string; name: string; meta: string; dist: number | null; make: () => Item; fromWish?: string }

function curatedRows(v: DestView, filter: (p: Place) => boolean, ref: { lat: number; lng: number } | null, mealKind?: MealKind): Row[] {
  if (!v.curated) return [];
  return v.curated.pl.filter(filter).map((p) => ({
    key: p.pid, name: p.n, meta: `${CATS[p.cat][0]} · ${hm(p.d)}${p.must ? ' · Must-see' : ''}`,
    dist: ref ? km(ref, p) : null,
    make: () => (mealKind ? { ...itemFromPlace(p), cat: 'meal' as Cat, d: MEALS[mealKind].dur } : itemFromPlace(p)),
  }));
}

function liveRows(v: DestView, list: LiveListPlace[], ref: { lat: number; lng: number } | null, mealKind?: MealKind): Row[] {
  return list.filter((p) => !p.closed && !isLodging(p.types)).map((p) => ({
    key: p.id, name: p.name,
    meta: `${CATS[categorise(p.primaryType, p.types).cat][0]}${p.rating != null ? ` · ★ ${p.rating.toFixed(1)} (${(p.userRatingCount || 0).toLocaleString('en-IN')})` : ''}${p.areaHint ? ' · ' + p.areaHint : ''}`,
    dist: ref && p.location ? km(ref, p.location) : null,
    make: () => itemFromLive(p as LivePlace, v.key, mealKind),
  }));
}

export function AddBar({ t, di }: { t: Trip; di: number }) {
  const [mode, setMode] = useState<Mode | null>(null);
  const slot = useUI((s) => s.slot);
  const setUI = useUI((s) => s.set);
  const [at, setAt] = useState<InsertAt>({ mode: 'end' });
  const effectiveAt: InsertAt = slot != null && at.mode === 'end' ? { mode: 'time', time: toHHMM(slot) } : at;
  const day = t.plan[di];
  const v = destView(t, day.dest);

  const add = (x: Item, fromWish?: string, pos?: InsertAt, name?: string) => {
    const label = name || x.t || 'Place';
    mut(t.id, (tt) => {
      if (fromWish) { const i = tt.wish.findIndex((w) => w.id === fromWish); if (i < 0) return false; tt.wish.splice(i, 1); }
      insertItem(tt, di, x, pos ?? effectiveAt);
    }, `${label} added to Day ${di + 1}`, true);
    setUI({ slot: null });
  };

  return (
    <div className="addbar card">
      <div className="row" style={{ gap: 6 }} role="toolbar" aria-label={`Add to Day ${di + 1}`}>
        <b className="small">Add</b>
        {MODES.map(([k, l]) => (
          <button key={k} type="button" className={'chip' + (mode === k ? ' on' : '')} aria-pressed={mode === k} onClick={() => setMode(mode === k ? null : k)}>{l}</button>
        ))}
      </div>
      {slot != null && (
        <div className="warn tip" style={{ marginTop: 10 }}>
          <b>Adding into the free slot at {fmtT(slot)}</b>
          <div><button type="button" className="btn sm ghost" onClick={() => setUI({ slot: null })}>Cancel</button></div>
        </div>
      )}
      {mode && v && (
        <div className="grid" style={{ gap: 10, marginTop: 12 }}>
          {slot == null && <PositionPicker t={t} di={di} at={at} setAt={setAt} />}
          {(mode === 'search' || mode === 'famous' || mode === 'meal') && <PlacePicker key={mode} mode={mode} t={t} di={di} v={v} at={effectiveAt} onAdd={add} />}
          {mode === 'wish' && <WishPicker t={t} di={di} onAdd={add} />}
          {(mode === 'travel' || mode === 'free' || mode === 'custom') && <BlockForm key={mode} mode={mode} v={v} onAdd={(x) => add(x)} />}
        </div>
      )}
    </div>
  );
}

function PlacePicker({ mode, t, di, v, at, onAdd }: { mode: 'search' | 'famous' | 'meal'; t: Trip; di: number; v: DestView; at: InsertAt; onAdd: (x: Item, fromWish?: string, pos?: InsertAt, name?: string) => void }) {
  const [q, setQ] = useState('');
  const [meal, setMeal] = useState<MealKind>('lunch');
  const [minRating, setMinRating] = useState(4);
  const live = useLiveStatus((s) => s.state === 'live');
  const dq = useDebounced(q.trim(), 400);
  // reference point: the block before the insert position (for distances), else the destination centre
  const ref = useMemo(() => {
    const items = [...t.plan[di].items].sort((a, b) => a.s - b.s);
    const m = insertMinute(t, di, at) ?? Infinity;
    const prev = [...items].reverse().find((x) => x.s < m && geo(x));
    return prev ? { lat: prev.lat!, lng: prev.lng! } : v.center;
  }, [t, di, at, v.center]);
  const searchQ = useQuery({
    queryKey: ['addsearch', v.key, dq],
    enabled: live && mode === 'search' && dq.length >= 2 && !!v.center,
    queryFn: ({ signal }) => apiPost<{ places: LiveListPlace[] }>('/api/places/search', searchBody(v, 'todo', { text: dq }), signal),
  });
  const famous = usePlaceList(v, 'famous', mode === 'famous');
  const restaurants = usePlaceList(v, 'restaurants', mode === 'meal');

  let rows: Row[] = [];
  if (mode === 'search') {
    const ql = q.trim().toLowerCase();
    rows = [
      ...curatedRows(v, (p) => !!ql && (p.n + ' ' + p.desc + ' ' + p.area).toLowerCase().includes(ql), ref),
      ...liveRows(v, searchQ.data?.places || [], ref),
    ];
  } else if (mode === 'famous') {
    const list = famous.data?.places || [];
    const s = bayesScores(list, PRIOR.attractions);
    const ranked = list.map((p, i) => ({ p, s: s[i] })).sort((a, b) => b.s - a.s).map((x) => x.p).slice(0, 15);
    rows = [...curatedRows(v, (p) => p.must, ref), ...liveRows(v, ranked, ref)];
  } else {
    const list = (restaurants.data?.places || []).filter((p) => (p.rating ?? 0) >= minRating);
    rows = [
      ...curatedRows(v, (p) => p.cat === 'food' || p.cat === 'cafe', ref, meal),
      ...liveRows(v, list, ref, meal),
    ].sort((a, b) => (a.dist ?? 1e9) - (b.dist ?? 1e9));
  }
  const loading = (mode === 'search' && searchQ.isFetching) || (mode === 'famous' && famous.isLoading) || (mode === 'meal' && restaurants.isLoading);
  const hasLive = rows.some((r) => !PL[r.key]);
  const atMeal: InsertAt = at.mode === 'end' ? { mode: 'time', time: toHHMM(MEALS[meal].start) } : at;

  return (
    <>
      {mode === 'search' && <input type="search" autoFocus placeholder={`Search places in ${v.name}`} value={q} onChange={(e) => setQ(e.target.value)} aria-label={`Search places in ${v.name}`} />}
      {mode === 'meal' && (
        <div className="row" style={{ gap: 6 }}>
          {(['breakfast', 'lunch', 'dinner'] as MealKind[]).map((m) => <button key={m} type="button" className={'chip' + (meal === m ? ' on' : '')} aria-pressed={meal === m} onClick={() => setMeal(m)}>{MEALS[m].label}</button>)}
          <span className="small muted">Rating</span>
          {[0, 4, 4.5].map((r) => <button key={r} type="button" className={'chip' + (minRating === r ? ' on' : '')} aria-pressed={minRating === r} onClick={() => setMinRating(r)}>{r ? `${r}+ ★` : 'Any'}</button>)}
          <span className="tiny muted">Nearest to your previous stop first{at.mode === 'end' ? ` · at ${fmtT(MEALS[meal].start)} unless you pick a time` : ''}</span>
        </div>
      )}
      <div className={'lib' + (hasLive ? ' gbox' : '')}>
        {hasLive && <div style={{ textAlign: 'right' }}><span className="gmaps-attr" translate="no">Google Maps</span></div>}
        {loading && <p className="small muted">Loading…</p>}
        {!loading && !rows.length && <p className="small muted">{mode === 'search' && q.trim().length < 2 ? 'Type at least 2 letters.' : !live && !v.curated ? 'Live places aren’t available right now; add a custom block instead.' : 'Nothing found.'}</p>}
        {rows.slice(0, 25).map((r) => (
          <div className="li" key={r.key}>
            <div><div className="nm">{r.name}</div><div className="mt">{r.meta}{r.dist != null ? ` · ${fmtDist(r.dist)} away` : ''}</div></div>
            <button type="button" className="btn sm pri" aria-label={`Add ${r.name}`} onClick={() => onAdd(r.make(), undefined, mode === 'meal' ? atMeal : undefined, r.name)}>Add</button>
          </div>
        ))}
      </div>
    </>
  );

}

function WishPicker({ t, di, onAdd }: { t: Trip; di: number; onAdd: (x: Item, fromWish?: string) => void }) {
  const list = t.wish;
  if (!list.length) return <p className="small muted">Your wishlist is empty.</p>;
  return (
    <div className="lib">
      {list.map((x) => (
        <div className="li" key={x.id}>
          <div><div className="nm">{x.t || 'Saved place'}</div><div className="mt">{CATS[x.cat]?.[0] || 'Custom'} · {hm(x.d)}{x.dest && x.dest !== t.plan[di].dest ? ` · ${destView(t, x.dest)?.name || ''}` : ''}</div></div>
          <button type="button" className="btn sm pri" aria-label={`Add ${x.t || 'saved place'} from wishlist`} onClick={() => onAdd({ ...x, t: x.nameLive ? '' : x.t, nameLive: undefined }, x.id)}>Add</button>
        </div>
      ))}
    </div>
  );
}

function BlockForm({ mode, v, onAdd }: { mode: 'travel' | 'free' | 'custom'; v: DestView; onAdd: (x: Item) => void }) {
  const [title, setTitle] = useState(mode === 'travel' ? 'Travel' : mode === 'free' ? 'Free time' : '');
  const [dur, setDur] = useState(mode === 'travel' ? 60 : mode === 'free' ? 60 : 60);
  const [cat, setCat] = useState<Cat>('custom');
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const [showPin, setShowPin] = useState(false);
  return (
    <form className="grid" style={{ gap: 10 }} onSubmit={(e) => {
      e.preventDefault();
      onAdd(customItem({ t: title.trim() || (mode === 'custom' ? 'Custom activity' : title), cat: mode === 'travel' ? 'transit' : mode === 'free' ? 'rest' : cat, d: Math.max(5, dur), lat: pin?.lat ?? null, lng: pin?.lng ?? null, dest: v.key }));
    }}>
      <div className="grid g3" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))' }}>
        <label className="f">Title<input type="text" value={title} placeholder={mode === 'custom' ? 'e.g. Spa, meet friends' : ''} onChange={(e) => setTitle(e.target.value)} /></label>
        <label className="f">Duration (minutes)<input type="number" min={5} step={15} value={dur} onChange={(e) => setDur(+e.target.value || 60)} /></label>
        {mode === 'custom' && <label className="f">Type<select value={cat} onChange={(e) => setCat(e.target.value as Cat)}>{Object.entries(CATS).map(([k, c]) => <option key={k} value={k}>{c[0]}</option>)}</select></label>}
      </div>
      {mode === 'travel' && <p className="tiny muted">For trains, flights and buses with tickets and times, full travel legs arrive in a later update; this adds a travel block.</p>}
      {mode === 'custom' && (
        showPin ? <Suspense fallback={null}><PinPicker value={pin} centre={v.center} onChange={setPin} /></Suspense>
          : <button type="button" className="btn sm" onClick={() => setShowPin(true)}>Drop a pin (optional)</button>
      )}
      <div><button type="submit" className="btn pri">Add {mode === 'travel' ? 'travel' : mode === 'free' ? 'free time' : 'block'}</button></div>
    </form>
  );
}

