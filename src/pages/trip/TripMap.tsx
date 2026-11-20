import { useMemo } from 'react';
import { destView } from '../../engine/dest';
import MapView, { type LL, type Pin } from '../../components/MapView';
import { CATS, DAYC } from '../../data/constants';
import { D, PL } from '../../data/destinations';
import { geo } from '../../engine/geo';
import { itemFromPlace, placeOnDay } from '../../engine/schedule';
import { fmtT, hm } from '../../engine/time';
import { inr } from '../../engine/util';
import { mut } from '../../lib/actions';
import { useUI, type MapLayers } from '../../store/ui';
import { mapsLink } from '../Destination';
import type { TabProps } from './TripPage';

const LAYERS: [keyof MapLayers, string][] = [['plan', 'Planned'], ['wish', 'Wishlist'], ['lib', 'All library places'], ['stay', 'Stays'], ['area', 'Areas']];

export default function TripMap({ t, goDay }: TabProps) {
  const { mapLayers: L, mapDay: fd, pin, day, set } = useUI();
  const di = Math.min(day, t.plan.length - 1);

  const data = useMemo(() => {
    const pts: Pin[] = [], routes: { col: string; pts: LL[] }[] = [], fitTo: LL[] = [];
    t.plan.forEach((d, i) => {
      if (fd !== 'all' && fd !== i) return;
      const col = DAYC[i % DAYC.length];
      const g = [...d.items].sort((a, b) => a.s - b.s).filter(geo) as (typeof d.items[number] & LL)[];
      if (L.plan) {
        g.forEach((x, k) => pts.push({ id: x.id, lat: x.lat, lng: x.lng, num: k + 1, col, lab: x.t, kind: 'plan' }));
        routes.push({ col, pts: g });
        fitTo.push(...g);
      }
    });
    if (L.wish) t.wish.filter(geo).forEach((x) => pts.push({ id: x.id, lat: x.lat!, lng: x.lng!, col: '#8a5fb0', lab: x.t, kind: 'idea' }));
    const inPlan = new Set(t.plan.flatMap((d) => d.items.map((x) => x.pid)));
    if (L.lib) t.dests.forEach((id) => D[id]?.pl.filter((p) => !inPlan.has(p.pid)).forEach((p) => pts.push({ id: p.pid, lat: p.lat, lng: p.lng, col: '#6b7a70', lab: p.n, kind: 'idea' })));
    if (L.stay) t.stays.filter(geo).forEach((s) => pts.push({ id: s.id, lat: s.lat!, lng: s.lng!, kind: 'stay', lab: s.name }));
    const focus = fd !== 'all' ? t.plan[fd]?.dest : null;
    const areas = t.dests.filter((id) => !focus || id === focus).flatMap((id) => destView(t, id)?.areas.map((a) => ({ name: a[0], lat: a[2], lng: a[3] })) || []);
    if (!fitTo.length) fitTo.push(...areas);
    return { pts, routes, areas, fitTo: fd === 'all' && t.dests.length > 1 ? null : fitTo };
  }, [t, L, fd]);

  const sel = pin ? data.pts.find((p) => p.id === pin) : undefined;
  let card = <div className="card small muted">Tap a pin to see the place. Numbers show the order within each day.</div>;
  if (sel) {
    const item = t.plan.flatMap((d, i) => d.items.map((x) => ({ x, i }))).find((o) => o.x.id === sel.id);
    const wi = t.wish.find((x) => x.id === sel.id);
    const p = PL[sel.id] || (item?.x.pid ? PL[item.x.pid] : undefined) || (wi?.pid ? PL[wi.pid] : undefined);
    const st = t.stays.find((s) => s.id === sel.id);
    const addLib = () => mut(t.id, (tt) => { placeOnDay(tt, di, itemFromPlace(p!)); }, `${p!.n} added to Day ${di + 1}`, true);
    const addWish = () => mut(t.id, (tt) => {
      const i = tt.wish.findIndex((w) => w.id === wi!.id);
      if (i < 0) return false;
      placeOnDay(tt, di, tt.wish.splice(i, 1)[0]);
    }, `Added to Day ${di + 1}`, true);
    card = (
      <div className="card grid" style={{ gap: 8 }} aria-live="polite">
        <h3>{sel.lab}</h3>
        {item ? <span className="small"><b>Day {item.i + 1}</b> · {fmtT(item.x.s)}–{fmtT(item.x.s + item.x.d)}</span>
          : wi ? <span className="tag">In wishlist</span>
          : st ? <span className="small">{st.area} · {inr(st.price)}/night</span>
          : <span className="tag">Not in your plan</span>}
        {p && <><p className="small">{p.desc}</p><span className="tiny muted">{CATS[p.cat][0]} · {hm(p.d)} · {p.c ? inr(p.c) + ' pp' : 'Free'}</span></>}
        <div className="row" style={{ gap: 6 }}>
          <a className="btn sm" href={mapsLink(sel.lat, sel.lng)} target="_blank" rel="noopener noreferrer">Open in Google Maps</a>
          {wi && <button type="button" className="btn sm pri" onClick={addWish}>Add to Day {di + 1}</button>}
          {!item && !st && !wi && p && <button type="button" className="btn sm pri" onClick={addLib}>Add to Day {di + 1}</button>}
          {item && <button type="button" className="btn sm" onClick={() => goDay(item.i)}>Open day</button>}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="row" style={{ gap: 6, marginBottom: 10 }} role="group" aria-label="Day filter">
        <button type="button" className={'chip' + (fd === 'all' ? ' on' : '')} aria-pressed={fd === 'all'} onClick={() => set({ mapDay: 'all', pin: null })}>All days</button>
        {t.plan.map((_, i) => (
          <button type="button" key={i} className={'chip' + (fd === i ? ' on' : '')} aria-pressed={fd === i} onClick={() => set({ mapDay: i, pin: null })}>
            <i className="dot" style={{ color: DAYC[i % DAYC.length], opacity: 1 }} />Day {i + 1}
          </button>
        ))}
      </div>
      <div className="row" style={{ gap: 12, marginBottom: 14 }} role="group" aria-label="Map layers">
        {LAYERS.map(([k, l]) => (
          <label className="row small" style={{ gap: 6, fontWeight: 600 }} key={k}>
            <input type="checkbox" checked={L[k]} onChange={(e) => set({ mapLayers: { ...L, [k]: e.target.checked } })} />{l}
          </label>
        ))}
      </div>
      <div className="mapwrap">
        <MapView label={`Map of ${t.name}`} pts={data.pts} routes={data.routes} areas={data.areas} fitTo={data.fitTo} showAreas={L.area} labels={fd !== 'all'} sel={pin} onPick={(id) => set({ pin: id })} />
        <div className="grid" style={{ gap: 12, alignContent: 'start' }}>
          {card}
          <div className="card small">
            <b>Reading the map</b>
            <p className="muted" style={{ marginTop: 6 }}>Dashed lines join each day’s stops in order. Shaded circles are neighbourhoods from the stay guide. Pins use stored coordinates, and travel times are estimates.</p>
          </div>
        </div>
      </div>
    </>
  );
}
