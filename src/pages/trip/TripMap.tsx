// Trip map on Google Maps: numbered pins coloured by day, a dashed route per day, the hotel, area circles, nearby
// layers (searched only when switched on or on "Search this area") and "Navigate this day" links.
import { useQueries } from '@tanstack/react-query';
import { lazy, Suspense, useMemo, useState } from 'react';
import { GMap, hasGoogleMaps, MapFallback, type GPin, type GRoute, type MapView } from '../../components/GMap';
import { CATS, DAYC } from '../../data/constants';
import { D, PL } from '../../data/destinations';
import { destView } from '../../engine/dest';
import { fmtDist, geo, km } from '../../engine/geo';
import { itemFromLive, type LivePlace } from '../../engine/livePool';
import { navLinks, navPlatform, type TravelMode } from '../../engine/navigate';
import { dayCentre, itemFromPlace, placeOnDay } from '../../engine/schedule';
import { dayEndpoint } from '../../engine/stays';
import { fmtT, hm } from '../../engine/time';
import type { Trip } from '../../engine/types';
import { inr } from '../../engine/util';
import { mut } from '../../lib/actions';
import { apiPost } from '../../lib/api';
import type { LiveListPlace } from '../../lib/live';
import { useLiveStatus } from '../../lib/liveStatus';
import { useUI, type MapLayers } from '../../store/ui';
import { mapsLink } from '../Destination';
import { GoogleAttribution } from '../LiveDestination';
import type { TabProps } from './TripPage';
import { toast } from '../../store/toast';
import { addLiveToDay } from '../../engine/livePool';
import { toGuidePlace, type ApiPlace } from '../../lib/guide';
import { StayPrompt } from './StayPrompt';

const DetailDrawer = lazy(() => import('../guide/CityGuide').then((m) => ({ default: m.DetailDrawer })));
const OverviewMap = lazy(() => import('../../components/OverviewMap'));

const LAYERS: [keyof MapLayers, string][] = [['plan', 'Planned'], ['wish', 'Wishlist'], ['lib', 'All guide places'], ['stay', 'Stays'], ['area', 'Areas']];
type Nearby = 'restaurants' | 'cafes' | 'attractions' | 'atms' | 'pharmacies';
const NEARBY: [Nearby, string, string, boolean][] = [
  ['restaurants', 'Restaurants', '#c9612c', true], ['cafes', 'Cafés', '#93663f', true], ['attractions', 'Attractions', '#2b6f9b', true],
  ['atms', 'ATMs', '#5a4fb0', false], ['pharmacies', 'Pharmacies', '#2f7d5b', false],
];
const MODES: [TravelMode, string][] = [['driving', 'Drive'], ['two-wheeler', 'Two-wheeler'], ['walking', 'Walk'], ['transit', 'Transit']];

export default function TripMap({ t, goDay }: TabProps) {
  const { mapLayers: L, mapDay: fd, pin, day, set } = useUI();
  const di = fd === 'all' ? Math.min(day, t.plan.length - 1) : fd;
  const live = useLiveStatus((s) => s.state === 'live');
  const [layers, setLayers] = useState<Nearby[]>([]);
  const [open, setOpen] = useState<(LiveListPlace & { layer: Nearby }) | null>(null);
  const [view, setView] = useState<MapView | null>(null);
  const [area, setArea] = useState<MapView | null>(null);
  const [minRating, setMinRating] = useState(0);
  const [openNow, setOpenNow] = useState(false);
  const [price, setPrice] = useState<number[]>([]);
  const [mode, setMode] = useState<TravelMode>('driving');

  const data = useMemo(() => {
    const pts: GPin[] = [], routes: GRoute[] = [], fitTo: { lat: number; lng: number }[] = [];
    t.plan.forEach((d, i) => {
      if (fd !== 'all' && fd !== i) return;
      const col = DAYC[i % DAYC.length];
      const g = [...d.items].sort((a, b) => a.s - b.s).filter(geo) as (typeof d.items[number] & { lat: number; lng: number })[];
      if (L.plan) {
        g.forEach((x, k) => pts.push({ id: x.id, lat: x.lat, lng: x.lng, label: k + 1, col, title: x.t || 'Saved place', kind: 'place', showTitle: fd !== 'all' }));
        routes.push({ col, pts: g });
        fitTo.push(...g);
      }
    });
    if (L.wish) t.wish.filter(geo).forEach((x) => pts.push({ id: x.id, lat: x.lat!, lng: x.lng!, col: '#8a5fb0', title: x.t || 'Saved place', kind: 'idea' }));
    const inPlan = new Set(t.plan.flatMap((d) => d.items.map((x) => x.pid)));
    if (L.lib) t.dests.forEach((id) => D[id]?.pl.filter((p) => !inPlan.has(p.pid)).forEach((p) => pts.push({ id: p.pid, lat: p.lat, lng: p.lng, col: '#6b7a70', title: p.n, kind: 'idea' })));
    if (L.stay) t.stays.filter(geo).forEach((s) => pts.push({ id: s.id, lat: s.lat!, lng: s.lng!, kind: 'stay', title: s.name || 'Your stay' }));
    const focus = fd !== 'all' ? t.plan[fd]?.dest : null;
    const areas = L.area ? t.dests.filter((id) => !focus || id === focus).flatMap((id) => destView(t, id)?.areas.map((a) => ({ name: a[0], lat: a[2], lng: a[3] })) || []) : [];
    if (!fitTo.length) fitTo.push(...areas, ...t.dests.map((id) => destView(t, id)?.center).filter((c): c is { lat: number; lng: number } => !!c));
    return { pts, routes, areas, fitTo: fd === 'all' && t.dests.length > 1 ? null : fitTo };
  }, [t, L, fd]);

  // Nearby layers: one search per switched-on layer for the area last searched
  const fallbackArea: MapView | null = useMemo(() => {
    const c = dayCentre(t.plan[di], t) || destView(t, t.plan[di]?.dest)?.center || null;
    return c ? { center: c, radius: 2000 } : null;
  }, [t, di]);
  const searchArea = area || fallbackArea;
  const nearbyQ = useQueries({
    queries: layers.map((layer) => ({
      queryKey: ['nearby', layer, searchArea?.center.lat.toFixed(3), searchArea?.center.lng.toFixed(3), Math.round((searchArea?.radius || 0) / 100)],
      enabled: live && !!searchArea,
      queryFn: ({ signal }: { signal: AbortSignal }) => apiPost<{ places: LiveListPlace[] }>('/api/places/nearby', { layer, center: searchArea!.center, radius: Math.min(10_000, Math.max(100, searchArea!.radius)) }, signal),
      staleTime: 30 * 60_000,
    })),
  });
  const nearby = layers.flatMap((layer, i) => (nearbyQ[i].data?.places || []).map((p) => ({ ...p, layer })))
    .filter((p) => !p.closed && (!minRating || (p.rating ?? 0) >= minRating) && (!openNow || p.openNow === true) && (!price.length || (p.priceLevel != null && price.includes(p.priceLevel))));
  const nearbyPins: GPin[] = nearby.filter((p) => p.location).map((p) => ({ id: 'n:' + p.id, lat: p.location!.lat, lng: p.location!.lng, title: p.name, kind: 'nearby', col: NEARBY.find((n) => n[0] === p.layer)![2] }));
  const moved = !!view && !!searchArea && (km(view.center, searchArea.center)! > searchArea.radius / 2000 || Math.abs(view.radius - searchArea.radius) > searchArea.radius * 0.5);
  const toggleLayer = (l: Nearby) => {
    if (!layers.includes(l) && view) setArea(view);
    setLayers(layers.includes(l) ? layers.filter((x) => x !== l) : [...layers, l]);
  };

  const allPins = [...data.pts, ...nearbyPins];
  const sel = pin ? allPins.find((p) => p.id === pin) : undefined;
  const ref = dayCentre(t.plan[di], t);

  return (
    <>
      <div className="row" style={{ gap: 6, marginBottom: 10 }} role="group" aria-label="Day filter">
        <button type="button" className={'chip' + (fd === 'all' ? ' on' : '')} aria-pressed={fd === 'all'} onClick={() => set({ mapDay: 'all', pin: null })}>All days</button>
        {t.plan.map((_, i) => (
          <button type="button" key={i} className={'chip' + (fd === i ? ' on' : '')} aria-pressed={fd === i} onClick={() => set({ mapDay: i, pin: null, day: i })}>
            <i className="dot" style={{ color: DAYC[i % DAYC.length], opacity: 1 }} />Day {i + 1}
          </button>
        ))}
      </div>
      <div className="row" style={{ gap: 12, marginBottom: 10 }} role="group" aria-label="Map layers">
        {LAYERS.map(([k, l]) => (
          <label className="row small" style={{ gap: 6, fontWeight: 600 }} key={k}>
            <input type="checkbox" checked={L[k]} onChange={(e) => set({ mapLayers: { ...L, [k]: e.target.checked } })} />{l}
          </label>
        ))}
      </div>
      <div className="row" style={{ gap: 6, marginBottom: 10 }} role="group" aria-label="Nearby">
        <span className="small muted">Nearby</span>
        {NEARBY.map(([k, l, col]) => (
          <button key={k} type="button" className={'chip' + (layers.includes(k) ? ' on' : '')} aria-pressed={layers.includes(k)} onClick={() => (live ? toggleLayer(k) : toast('Live places aren’t available on this site right now (Google key missing or today’s free limit reached). The rest of the map still works.'))}>
            <i className="dot" style={{ color: col, opacity: 1 }} />{l}
          </button>
        ))}
        {!live && <span className="tiny muted">Live places aren’t available right now (check the Google key in Vercel).</span>}
      </div>
      {layers.some((l) => NEARBY.find((n) => n[0] === l)![3]) && (
        <div className="row" style={{ gap: 6, marginBottom: 10 }} role="group" aria-label="Nearby filters">
          <span className="small muted">Rating</span>
          {[0, 4, 4.5].map((r) => <button key={r} type="button" className={'chip' + (minRating === r ? ' on' : '')} aria-pressed={minRating === r} onClick={() => setMinRating(r)}>{r ? `${r}+ ★` : 'Any'}</button>)}
          <button type="button" className={'chip' + (openNow ? ' on' : '')} aria-pressed={openNow} onClick={() => setOpenNow(!openNow)}>Open now</button>
          {[1, 2, 3, 4].map((x) => <button key={x} type="button" className={'chip' + (price.includes(x) ? ' on' : '')} aria-pressed={price.includes(x)} onClick={() => setPrice(price.includes(x) ? price.filter((y) => y !== x) : [...price, x])}>{['', 'Inexpensive', 'Moderate', 'Expensive', 'Very expensive'][x]}</button>)}
        </div>
      )}
      <StayPrompt t={t} di={di} />
      <div className="mapwrap">
        <div style={{ position: 'relative' }}>
          {hasGoogleMaps()
            ? <GMap label={`Map of ${t.name}`} pins={allPins} routes={L.plan ? data.routes : []} areas={data.areas} fitTo={data.fitTo} active={pin} onPick={(id) => set({ pin: id })} onView={setView}>
                {layers.length > 0 && moved && <button type="button" className="btn sm pri searcharea" onClick={() => setArea(view)}>Search this area</button>}
              </GMap>
            : <MapFallback pins={data.pts} onPick={(id) => set({ pin: id })} note="Maps need a Google Maps key on this site. Here are the day’s stops instead." />}
        </div>
        <div className="grid" style={{ gap: 12, alignContent: 'start' }}>
          <Navigate t={t} di={di} mode={mode} setMode={setMode} />
          <SelectedCard t={t} sel={sel} di={di} goDay={goDay} nearby={nearby} />
          {layers.length > 0 && <NearbyList t={t} di={di} list={nearby} loading={nearbyQ.some((q) => q.isLoading)} ref0={ref} onShow={(id) => set({ pin: 'n:' + id })} onOpen={setOpen} />}
          <div className="card small">
            <b>Reading the map</b>
            <p className="muted" style={{ marginTop: 6 }}>Dashed lines join each day’s stops in order. Shaded circles are neighbourhoods. Nearby places are searched only when you switch a layer on or tap “Search this area”.</p>
          </div>
        </div>
      </div>
      <section className="sec">
        <h2>Overview map</h2>
        <p className="tiny muted" style={{ marginTop: 4 }}>A quick picture of the whole trip on OpenStreetMap: hand-picked guide places, your own pins and hotels you typed in, coloured by day. Places added from Google appear only on the Google map above, as Google’s terms require.</p>
        <Suspense fallback={<p className="small muted">Loading map…</p>}><OverviewMap t={t} /></Suspense>
      </section>
      {open && (
        <Suspense fallback={null}>
          <DetailDrawer p={toGuidePlace(open as unknown as ApiPlace, 0)} tab={open.layer === 'restaurants' ? 'restaurants' : open.layer === 'cafes' ? 'cafes' : 'famous'} badges={{ mustSee: false, hiddenGem: false, editorsPick: false }} trip={t}
            onClose={() => setOpen(null)} onVeg={() => {}}
            onAction={(meal) => { const p = open; setOpen(null); mut(t.id, (tt) => { addLiveToDay(tt, p as LivePlace, { destKey: tt.plan[di].dest, di, meal }); }, `${p.name} added to Day ${di + 1}${meal ? ' as ' + meal : ''}`, true); }} />
        </Suspense>
      )}
    </>
  );
}

function Navigate({ t, di, mode, setMode }: { t: Trip; di: number; mode: TravelMode; setMode: (m: TravelMode) => void }) {
  const day = t.plan[di];
  const stops = [...day.items].sort((a, b) => a.s - b.s).filter(geo).map((x) => ({ lat: x.lat!, lng: x.lng!, placeId: x.gid, label: x.t }));
  const start = dayEndpoint(t, di, 'start'), end = dayEndpoint(t, di, 'end');
  const all = [...(start ? [{ lat: start.lat, lng: start.lng, label: start.label }] : []), ...stops, ...(end ? [{ lat: end.lat, lng: end.lng, label: end.label }] : [])];
  const links = navLinks(all, mode, navPlatform());
  return (
    <div className="card grid" style={{ gap: 8 }}>
      <b>Navigate Day {di + 1} in Google Maps</b>
      <div className="row" style={{ gap: 4 }} role="group" aria-label="Travel mode">
        {MODES.map(([k, l]) => <button key={k} type="button" className={'chip' + (mode === k ? ' on' : '')} aria-pressed={mode === k} onClick={() => setMode(k)}>{l}</button>)}
      </div>
      {links.length ? (
        <div className="row" style={{ gap: 6 }}>
          {links.map((l, i) => (
            <a key={l.url} className={'btn sm' + (i === 0 ? ' pri' : '')} href={l.url} target="_blank" rel="noopener noreferrer">
              {links.length > 1 ? `Part ${i + 1}: stops ${l.from + 1}–${l.to + 1}` : 'Navigate this day'}
            </a>
          ))}
        </div>
      ) : <p className="small muted">Add at least two places with a location to this day.</p>}
      <p className="tiny muted">{start ? `Starts from ${start.label}` : 'Starts at the first stop'}{end ? ` and ends at ${end.label}` : ''}. Opens the Google Maps app on phones.{links.length > 1 ? ' Google Maps limits stops per link, so the day is split.' : ''}</p>
    </div>
  );
}

function SelectedCard({ t, sel, di, goDay, nearby }: { t: Trip; sel: GPin | undefined; di: number; goDay: (i: number) => void; nearby: (LiveListPlace & { layer: Nearby })[] }) {
  if (!sel) return <div className="card small muted">Tap a pin to see the place. Numbers show the order within each day.</div>;
  if (sel.kind === 'nearby') {
    const p = nearby.find((x) => 'n:' + x.id === sel.id);
    return p ? <NearbyCard t={t} di={di} p={p} /> : null;
  }
  const item = t.plan.flatMap((d, i) => d.items.map((x) => ({ x, i }))).find((o) => o.x.id === sel.id);
  const wi = t.wish.find((x) => x.id === sel.id);
  const p = PL[sel.id] || (item?.x.pid ? PL[item.x.pid] : undefined) || (wi?.pid ? PL[wi.pid] : undefined);
  const st = t.stays.find((s) => s.id === sel.id);
  const gid = item?.x.gid || wi?.gid || st?.gid;
  const addLib = () => mut(t.id, (tt) => { placeOnDay(tt, di, itemFromPlace(p!)); }, `${p!.n} added to Day ${di + 1}`, true);
  const addWish = () => mut(t.id, (tt) => { const i = tt.wish.findIndex((w) => w.id === wi!.id); if (i < 0) return false; placeOnDay(tt, di, tt.wish.splice(i, 1)[0]); }, `Added to Day ${di + 1}`, true);
  return (
    <div className="card grid" style={{ gap: 8 }} aria-live="polite">
      <h3>{sel.title}</h3>
      {item ? <span className="small"><b>Day {item.i + 1}</b> · {fmtT(item.x.s)}–{fmtT(item.x.s + item.x.d)}</span>
        : wi ? <span className="tag">In wishlist</span>
        : st ? <span className="small">{st.area}{st.price ? ` · ${inr(st.price)}/night` : ''}</span>
        : <span className="tag">Not in your plan</span>}
      {p && <><p className="small">{p.desc}</p><span className="tiny muted">{CATS[p.cat][0]} · {hm(p.d)} · {p.c ? inr(p.c) + ' pp' : 'Free'}</span></>}
      <div className="row" style={{ gap: 6 }}>
        <a className="btn sm" href={mapsLink(sel.lat, sel.lng, gid)} target="_blank" rel="noopener noreferrer">Open in Google Maps</a>
        {wi && <button type="button" className="btn sm pri" onClick={addWish}>Add to Day {di + 1}</button>}
        {!item && !st && !wi && p && <button type="button" className="btn sm pri" onClick={addLib}>Add to Day {di + 1}</button>}
        {item && <button type="button" className="btn sm" onClick={() => goDay(item.i)}>Open day</button>}
      </div>
    </div>
  );
}

function NearbyCard({ t, di, p }: { t: Trip; di: number; p: LiveListPlace & { layer: Nearby } }) {
  const add = () => mut(t.id, (tt) => { placeOnDay(tt, di, itemFromLive(p as LivePlace, tt.plan[di].dest)); }, `${p.name} added to Day ${di + 1}`, true);
  return (
    <div className="card grid gbox" style={{ gap: 8 }} aria-live="polite">
      <div className="row between"><h3>{p.name}</h3><GoogleAttribution /></div>
      <span className="small">{NEARBY.find((n) => n[0] === p.layer)![1]}{p.rating != null ? ` · ★ ${p.rating.toFixed(1)} (${(p.userRatingCount || 0).toLocaleString('en-IN')})` : ''}{p.openNow != null ? ` · ${p.openNow ? 'Open now' : 'Closed now'}` : ''}</span>
      {p.address && <span className="tiny muted">{p.address}</span>}
      <div className="row" style={{ gap: 6 }}>
        {p.layer !== 'atms' && p.layer !== 'pharmacies' && <button type="button" className="btn sm pri" onClick={add}>Add to Day {di + 1}</button>}
        {p.googleMapsUri && <a className="btn sm" href={p.googleMapsUri} target="_blank" rel="noopener noreferrer">Open in Google Maps</a>}
      </div>
    </div>
  );
}

function NearbyList({ t, di, list, loading, ref0, onShow, onOpen }: { t: Trip; di: number; list: (LiveListPlace & { layer: Nearby })[]; loading: boolean; ref0: { lat: number; lng: number } | null; onShow: (id: string) => void; onOpen: (p: LiveListPlace & { layer: Nearby }) => void }) {
  const sorted = [...list].sort((a, b) => (ref0 && a.location && b.location ? km(ref0, a.location)! - km(ref0, b.location)! : 0));
  return (
    <div className="card grid gbox" style={{ gap: 6 }}>
      <div className="row between"><b className="small">Nearby ({sorted.length})</b><GoogleAttribution /></div>
      {loading && <p className="small muted">Searching…</p>}
      <div className="lib nearbylist">
        {sorted.slice(0, 40).map((p) => (
          <div className="li clickable" key={p.layer + p.id} role="button" tabIndex={0} aria-label={`Details of ${p.name}`}
            onClick={(e) => { if (!(e.target as HTMLElement).closest('button,a')) { onShow(p.id); onOpen(p); } }}
            onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); onShow(p.id); onOpen(p); } }}>
            <div>
              <div className="nm"><button type="button" className="linkish" onClick={() => { onShow(p.id); onOpen(p); }}>{p.name}</button></div>
              <div className="mt">{NEARBY.find((n) => n[0] === p.layer)![1]}{p.rating != null ? ` · ★ ${p.rating.toFixed(1)}` : ''}{ref0 && p.location ? ` · ${fmtDist(km(ref0, p.location)!)} from Day ${di + 1}` : ''}</div>
            </div>
            {p.layer !== 'atms' && p.layer !== 'pharmacies'
              ? <button type="button" className="btn sm pri" aria-label={`Add ${p.name} to Day ${di + 1}`} onClick={() => mut(t.id, (tt) => { placeOnDay(tt, di, itemFromLive(p as LivePlace, tt.plan[di].dest)); }, `${p.name} added to Day ${di + 1}`, true)}>Add</button>
              : p.googleMapsUri ? <a className="btn sm" href={p.googleMapsUri} target="_blank" rel="noopener noreferrer">Maps</a> : null}
          </div>
        ))}
      </div>
    </div>
  );
}
