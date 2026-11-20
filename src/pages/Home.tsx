import { Link, useNavigate } from 'react-router-dom';
import { routeName } from '../engine/dest';
import { sceneFor } from '../lib/destScene';
import { DestCard, TripCard } from '../components/Cards';
import { Scene } from '../components/Scene';
import { MOODS } from '../data/constants';
import { D } from '../data/destinations';
import { byLevel } from '../engine/checks';
import { readiness } from '../engine/readiness';
import { travellers } from '../engine/schedule';
import { dayDate, fmtD } from '../engine/time';
import type { Trip } from '../engine/types';
import { daysUntil, plural, todayISO } from '../engine/util';
import { useTitle } from '../lib/hooks';
import { tripList, useTrips } from '../store/trips';
import { useUI } from '../store/ui';

function nextTrip(ts: Trip[]) {
  const today = todayISO();
  return ts.find((t) => t.start && t.start >= today) || ts[0];
}

function TripHero({ t }: { t: Trip }) {
  const r = readiness(t);
  const d = sceneFor(t, t.dests[0]);
  const until = daysUntil(t.start);
  const top = [...r.A.trip, ...r.A.days.flat()].sort(byLevel).slice(0, 3);
  return (
    <section className="hero">
      <div className="txt">
        <span className="kicker">
          {until != null ? (until > 0 ? `In ${plural(until, 'day')}` : until === 0 ? 'Starts today' : 'Underway') : 'Next up'}
          {t.sample ? ' · sample trip' : ''}
        </span>
        <h1>{t.name}</h1>
        <p className="muted">
          {routeName(t)} · {plural(t.plan.length, 'day')} · {plural(travellers(t), 'traveller')}
          {t.start ? ' · from ' + fmtD(dayDate(t, 0)) : ''}
        </p>
        <div className="row" style={{ gap: 18 }}>
          <div className="ring" style={{ '--p': r.all } as React.CSSProperties} role="img" aria-label={`Trip readiness ${r.all}%`}><b>{r.all}%</b></div>
          <div className="grid" style={{ gap: 6, flex: 1, minWidth: 200 }}>
            <b>Trip readiness</b>
            {top.length ? top.map((w, i) => (
              <span className="small" key={i}>
                <span className={'tag' + (w.lvl === 'alert' ? ' t' : '')}>{w.lvl === 'alert' ? 'Fix' : w.lvl === 'caution' ? 'Check' : 'Tip'}</span> {w.title}
              </span>
            )) : <span className="small muted">No issues found in the plan.</span>}
          </div>
        </div>
        <div className="row">
          <Link className="btn pri" to={`/trips/${t.id}/itinerary`}>Open itinerary</Link>
          <Link className="btn" to={`/trips/${t.id}/overview`}>Trip overview</Link>
        </div>
      </div>
      <div className="art">{d && <Scene d={d} h={300} />}</div>
    </section>
  );
}

export function Home() {
  useTitle('');
  const trips = useTrips((s) => s.trips);
  const nav = useNavigate();
  const ts = tripList(trips);
  const t = nextTrip(ts);
  return (
    <>
      {t ? <TripHero t={t} /> : (
        <section className="hero">
          <div className="txt">
            <span className="kicker">Travel planning studio</span>
            <h1>Turn “I want to go somewhere” into a plan that actually works</h1>
            <p className="muted">Tell us where, when, with whom and for how much. You get an editable day-by-day plan that flags overloaded days, tight transfers and budget gaps.</p>
            <div className="row"><Link className="btn pri" to="/new">Create a new trip</Link><Link className="btn" to="/explore">Explore destinations</Link></div>
          </div>
          <div className="art"><Scene d={D.udaipur} h={300} /></div>
        </section>
      )}
      <section className="sec">
        <h2>What kind of trip are you in the mood for?</h2>
        <div className="row">
          {MOODS.map(([k, l]) => (
            <Link key={k} className="chip" to={`/explore?mood=${k}`} onClick={() => { useUI.getState().set({ mood: k }); }}>{l}</Link>
          ))}
        </div>
      </section>
      <section className="sec">
        <div className="row between"><h2>My trips</h2><Link className="btn sm" to="/trips">All trips</Link></div>
        <div className="grid auto" style={{ marginTop: 14 }}>
          {ts.slice(0, 3).map((x) => <TripCard key={x.id} t={x} />)}
          <Link className="card empty" to="/new" style={{ textDecoration: 'none' }}>
            <b style={{ color: 'var(--ink)' }}>Plan a new trip</b>
            <span className="small">Six quick steps to a starter itinerary, budget and packing list.</span>
            <span className="btn pri sm">Create a new trip</span>
          </Link>
        </div>
      </section>
      <section className="sec">
        <div className="row between"><h2>Popular right now</h2><button type="button" className="btn sm" onClick={() => nav('/explore')}>Explore all</button></div>
        <div className="grid auto" style={{ marginTop: 14 }}>
          {['jaipur', 'goa', 'kerala', 'rishikesh'].map((id) => <DestCard key={id} d={D[id]} />)}
        </div>
      </section>
    </>
  );
}
