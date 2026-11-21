import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { destView, routeName } from '../engine/dest';
import { sceneFor } from '../lib/destScene';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Scene } from '../components/Scene';
import { BCATS, CATS, DAYC, paceOf } from '../data/constants';
import { effectiveBudget, plannedTotal } from '../engine/budget';
import { geo } from '../engine/geo';
import { travellers } from '../engine/schedule';
import { decodeShare, normaliseTrip } from '../engine/share';
import { dayDate, fmtD, fmtT, hm } from '../engine/time';
import type { Trip } from '../engine/types';
import { inr, plural } from '../engine/util';
import { useTitle } from '../lib/hooks';
import { useTripView } from '../lib/useTripView';
import { toast } from '../store/toast';
import { useTrips } from '../store/trips';
import { hasGoogleMaps, MapFallback, type GPin, type GRoute } from '../components/GMap';

const GMapLazy = lazy(() => import('../components/GMap').then((m) => ({ default: m.GMap })));

export default function Shared() {
  const { hash } = useLocation();
  const nav = useNavigate();
  const [state, setState] = useState<{ t: Trip | null; err: string | null }>({ t: null, err: null });
  useEffect(() => {
    if (!hash || hash.length < 2) { setState({ t: null, err: 'This link has no trip in it.' }); return; }
    try { setState({ t: decodeShare(hash), err: null }); }
    catch (e) { setState({ t: null, err: (e as Error).message }); }
  }, [hash]);
  const t = useTripView(state.t || undefined) || null;
  useTitle(t ? `${t.name} (shared)` : 'Shared trip');

  const map = useMemo(() => {
    if (!t) return null;
    const pts: GPin[] = [], routes: GRoute[] = [];
    t.plan.forEach((d, i) => {
      const col = DAYC[i % DAYC.length];
      const g = [...d.items].sort((a, b) => a.s - b.s).filter(geo) as (typeof d.items[number] & { lat: number; lng: number })[];
      g.forEach((x, k) => pts.push({ id: x.id, lat: x.lat, lng: x.lng, label: k + 1, col, title: x.t || 'Saved place', kind: 'place' }));
      routes.push({ col, pts: g });
    });
    const areas = t.dests.flatMap((id) => destView(t, id)?.areas.map((a) => ({ name: a[0], lat: a[2], lng: a[3] })) || []);
    return { pts, routes, areas };
  }, [t]);

  if (state.err) {
    return (
      <div className="empty" style={{ marginTop: 40 }}>
        <h2>We couldn’t open this shared trip</h2>
        <p>{state.err} Ask for the link again, or for the trip file instead.</p>
        <Link className="btn pri" to="/">Go home</Link>
      </div>
    );
  }
  if (!t || !map) return <p className="muted" role="status">Opening shared trip…</p>;

  const n = travellers(t);
  const planned = plannedTotal(t);
  const save = () => {
    try {
      const copy = useTrips.getState().importTrip(normaliseTrip(t));
      nav(`/trips/${copy.id}/overview`);
      toast('Saved to your trips. This copy is yours to edit.');
    } catch {
      toast('That doesn’t look like a Trip Architect trip');
    }
  };
  const d0 = sceneFor(t, t.dests[0]);

  return (
    <div className="ro">
      <div className="banner noprint">
        <span className="small"><b>Read-only shared trip.</b> Nothing here is stored until you save a copy.</span>
        <button type="button" className="btn pri" onClick={save}>Save a copy to my trips</button>
      </div>
      <section className="hero">
        <div className="txt">
          <span className="kicker">{routeName(t)}</span>
          <h1>{t.name}</h1>
          <p className="muted">{t.start ? fmtD(dayDate(t, 0)) + ' – ' + fmtD(dayDate(t, t.plan.length - 1)) + ' · ' : 'Flexible dates · '}{plural(t.plan.length, 'day')} · {plural(n, 'traveller')} · {paceOf(t.pace).l} pace</p>
        </div>
        <div className="art">{d0 && <Scene d={d0} h={300} />}</div>
      </section>

      <section className="sec">
        <h2>Itinerary</h2>
        <div className="grid auto" style={{ marginTop: 14 }}>
          {t.plan.map((day, i) => (
            <div className="card" key={i}>
              <b><i className="dot" style={{ color: DAYC[i % DAYC.length], opacity: 1, display: 'inline-block', marginRight: 6 }} />Day {i + 1}{dayDate(t, i) ? ' · ' + fmtD(dayDate(t, i)) : ''}</b>
              <p className="small muted">{day.label}</p>
              <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                {[...day.items].sort((a, b) => a.s - b.s).map((x) => (
                  <div className="small" key={x.id} style={{ display: 'grid', gridTemplateColumns: '72px minmax(0,1fr)', gap: 6 }}>
                    <b>{fmtT(x.s)}</b>
                    <span>{x.t}<span className="muted"> · {(CATS[x.cat] || CATS.custom)[0]} · {hm(x.d)}</span>{x.n && <><br /><span className="tiny muted">{x.n}</span></>}</span>
                  </div>
                ))}
                {!day.items.length && <span className="small muted">Free day</span>}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="sec">
        <h2>Map</h2>
        <div style={{ marginTop: 14 }}>
          <Suspense fallback={<div className="map" />}>
            {hasGoogleMaps() ? <GMapLazy label={`Map of ${t.name}`} pins={map.pts} routes={map.routes} areas={map.areas} fitTo={map.pts.length ? map.pts : null} /> : <MapFallback pins={map.pts} />}
          </Suspense>
        </div>
      </section>

      <section className="sec">
        <h2>Budget summary</h2>
        <div className="grid g4" style={{ marginTop: 14 }}>
          <div className="card stat"><span>Planned</span><b>{inr(planned)}</b><span>{inr(planned / n)} per person</span></div>
          <div className="card stat"><span>Budget</span><b>{t.budgetTotal ? inr(t.budgetTotal) : 'Not set'}</b><span>{t.budgetTotal ? `${inr(t.budgetTotal / n)} per person` : '—'}</span></div>
        </div>
        <div className="scroll" style={{ marginTop: 14 }}>
          <table>
            <thead><tr><th>Category</th><th className="n">Planned</th></tr></thead>
            <tbody>
              {BCATS.map(([k, l]) => <tr key={k}><td>{l}</td><td className="n">{inr(effectiveBudget(t)[k])}</td></tr>)}
              <tr><td><b>Total</b></td><td className="n"><b>{inr(planned)}</b></td></tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
