import { lazy, Suspense, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useCompareToggle } from '../components/Cards';
import { Modal } from '../components/Modal';
import { Scene } from '../components/Scene';
import { Missing } from '../components/Shell';
import { BEST, CATS, MONTHS, WDL } from '../data/constants';
import { D, PL } from '../data/destinations';
import { buildTrip, DEFAULT_PREFS } from '../engine/generate';
import { itemFromPlace } from '../engine/schedule';
import { estRange, seasonOf } from '../engine/season';
import { fmtT, hm } from '../engine/time';
import type { Place } from '../engine/types';
import { inr } from '../engine/util';
import { useTitle } from '../lib/hooks';
import { toast } from '../store/toast';
import { tripList, useTrips } from '../store/trips';
import type { Pin } from '../components/MapView';
import LiveDestination from './LiveDestination';
import { CURATED_PLACE_IDS } from '../data/curatedPlaceIds';

const MapView = lazy(() => import('../components/MapView'));

/** Google Maps link; uses the place ID when the curated place has been linked (scripts/link-curated.ts). */
export function mapsLink(lat: number, lng: number, placeId?: string) {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}${placeId ? `&query_place_id=${placeId}` : ''}`;
}

/** "Add to my trip": choose a trip (adds to its wishlist) or start a new one. Reference `addToTrip`. */
export function AddToTripDialog({ pid, onClose }: { pid: string; onClose: () => void }) {
  const p = PL[pid];
  const trips = useTrips((s) => s.trips);
  const ts = tripList(trips);
  const add = (id: string) => {
    let name = '';
    useTrips.getState().mutate(id, (t) => {
      name = t.name;
      if (!t.dests.includes(p.dest)) t.dests.push(p.dest);
      if (!t.wish.some((w) => w.pid === p.pid)) t.wish.push(itemFromPlace(p));
    });
    onClose();
    toast(`Saved to the wishlist in ${name}`, id);
  };
  return (
    <Modal title={`Add ${p.n}`} onClose={onClose}>
      <h2>Add {p.n}</h2>
      <p className="small muted">It goes into the trip’s wishlist, ready to drop onto a day.</p>
      <div className="grid" style={{ gap: 8 }}>
        {ts.map((t) => (
          <button type="button" key={t.id} className="opt" onClick={() => add(t.id)}>
            <b>{t.name}</b>
            <span className="small muted">{t.dests.map((id) => D[id]?.name).join(' → ')}{t.dests.includes(p.dest) ? '' : ' · will add ' + D[p.dest].name}</span>
          </button>
        ))}
        <Link className="btn pri" to={`/new?dest=${p.dest}`} onClick={onClose}>Start a new {D[p.dest].name} trip</Link>
      </div>
    </Modal>
  );
}

function PlaceDialog({ p, onClose, onAdd }: { p: Place; onClose: () => void; onAdd: () => void }) {
  return (
    <Modal title={p.n} onClose={onClose}>
      <h2>{p.n}</h2>
      <p className="small muted">{CATS[p.cat][0]} · {p.area} · {hm(p.d)} · {p.c ? inr(p.c) + ' pp' : 'Free'}</p>
      <p>{p.desc}</p>
      <div className="row">
        <a className="btn" href={mapsLink(p.lat, p.lng, CURATED_PLACE_IDS[p.pid])} target="_blank" rel="noopener noreferrer">Open in Google Maps</a>
        <button type="button" className="btn pri" onClick={onAdd}>Add to my trip</button>
        <button type="button" className="btn ghost" onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
}

export default function Destination() {
  const { id = '' } = useParams();
  if (!D[id] && /^[gc]:/.test(id)) return <LiveDestination destKey={id} />;
  return <CuratedDestination id={id} />;
}

function CuratedDestination({ id }: { id: string }) {
  const d = D[id];
  useTitle(d ? d.name : 'Not found');
  const { cmp, toggle } = useCompareToggle();
  const [adding, setAdding] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const sample = useMemo(() => (d ? buildTrip({ dests: [d.id], days: d.days[0], travelers: ['A', 'B'], pace: 'balanced', prefs: DEFAULT_PREFS }) : null), [d]);
  const pins = useMemo<Pin[]>(() => (d ? d.pl.map((p) => ({ id: p.pid, lat: p.lat, lng: p.lng, col: CATS[p.cat][1], lab: p.n, kind: 'idea' as const })) : []), [d]);
  const areas = useMemo(() => (d ? d.areas.map((a) => ({ name: a[0], lat: a[2], lng: a[3] })) : []), [d]);
  if (!d || !sample) return <Missing />;
  const [lo, hi] = estRange(d);
  const m = new Date().getMonth() + 1;
  const ss = seasonOf(d, m);

  const plist = (arr: Place[]) => arr.map((p) => (
    <div className="li" key={p.pid}>
      <div>
        <div className="nm">{p.n}</div>
        <div className="mt">{CATS[p.cat][0]} · {hm(p.d)} · {p.c ? inr(p.c) + ' pp' : 'Free'} · {BEST[p.best]}{p.wd != null ? ' · ' + WDL[p.wd] + ' only' : ''}</div>
        <p className="small" style={{ marginTop: 4 }}>{p.desc}</p>
      </div>
      <button type="button" className="btn sm" onClick={() => setAdding(p.pid)} aria-label={`Add ${p.n} to my trip`}>Add to my trip</button>
    </div>
  ));

  return (
    <>
      <section className="hero">
        <div className="txt">
          <Link className="small" to="/explore">← Explore</Link>
          <span className="kicker">{d.state}</span>
          <h1>{d.name}</h1>
          <p className="muted">{d.tag}</p>
          <dl className="kv">
            <dt>Best for</dt><dd>{d.bestFor}</dd>
            <dt>Recommended</dt><dd>{d.days[0]}–{d.days[1]} days · {d.pace} pace</dd>
            <dt>Estimated cost</dt><dd>{inr(lo)}–{inr(hi)} per person</dd>
            <dt>This month</dt><dd>{ss === 'good' ? 'Great time to go' : ss === 'poor' ? 'Off-season' : 'Shoulder season'}</dd>
          </dl>
          <div className="row">
            <Link className="btn pri" to={`/new?dest=${d.id}`}>Plan a trip here</Link>
            <button type="button" className="btn" aria-pressed={cmp.includes(d.id)} onClick={() => toggle(d.id)}>{cmp.includes(d.id) ? 'In comparison' : 'Add to compare'}</button>
          </div>
        </div>
        <div className="art"><Scene d={d} h={320} /></div>
      </section>

      <div className="grid g2 sec">
        <div className="grid" style={{ gap: 14 }}>
          <h2>Why visit</h2>
          <p>{d.overview}</p>
          <ul style={{ margin: 0, paddingLeft: 20 }}>{d.why.map((x) => <li key={x}>{x}</li>)}</ul>
        </div>
        <div className="card grid" style={{ gap: 10 }}>
          <h3>Best time and getting there</h3>
          <p className="small">{d.bestTime}</p>
          <div className="row" style={{ gap: 4 }} role="list" aria-label="Season by month">
            {MONTHS.map((x, i) => {
              const s = seasonOf(d, i + 1);
              const lab = s === 'good' ? 'best' : s === 'poor' ? 'avoid' : 'shoulder';
              return <span role="listitem" key={x} className={'tag' + (s === 'good' ? ' f' : s === 'poor' ? ' t' : '')} title={s} aria-label={`${x}: ${lab}`}>{x}</span>;
            })}
          </div>
          <p className="tiny muted">Green: best months. Terracotta: avoid if you can.</p>
          <p className="small">{d.getThere}</p>
        </div>
      </div>

      <section className="sec">
        <h2>Where to stay</h2>
        <div className="scroll">
          <table className="stack">
            <thead><tr><th>Area</th><th>Best for</th></tr></thead>
            <tbody>{d.areas.map((a) => <tr key={a[0]}><td><b>{a[0]}</b></td><td>{a[1]}</td></tr>)}</tbody>
          </table>
        </div>
      </section>

      <section className="sec">
        <h2>Places on the map</h2>
        <Suspense fallback={<div className="map" />}>
          <MapView label={`Map of places in ${d.name}`} pts={pins} areas={areas} labels sel={picked} onPick={setPicked} />
        </Suspense>
        <p className="tiny muted" style={{ marginTop: 6 }}>Pins come from stored coordinates and may be approximate; open any place in Google Maps for streets and directions.</p>
      </section>

      <section className="sec grid g2">
        <div>
          <h2>Major attractions</h2>
          <div className="lib" style={{ marginTop: 12 }}>{plist(d.pl.filter((p) => p.must))}</div>
        </div>
        <div>
          <h2>Lesser-known places</h2>
          <div className="lib" style={{ marginTop: 12 }}>{plist(d.pl.filter((p) => p.hidden))}</div>
          <h2 style={{ marginTop: 28 }}>Also worth it</h2>
          <div className="lib" style={{ marginTop: 12 }}>{plist(d.pl.filter((p) => !p.must && !p.hidden))}</div>
        </div>
      </section>

      <section className="sec grid g2">
        <div className="card"><h3>Food to try</h3><div className="row" style={{ marginTop: 10 }}>{d.foods.map((f) => <span key={f} className="tag">{f}</span>)}</div></div>
        <div className="card"><h3>Travel tips</h3><ul style={{ margin: '10px 0 0', paddingLeft: 20 }} className="small">{d.tips.map((x) => <li key={x}>{x}</li>)}</ul></div>
      </section>

      <section className="sec">
        <h2>Estimated daily cost</h2>
        <div className="scroll">
          <table>
            <thead><tr><th>Per person, per day</th><th className="n">Budget</th><th className="n">Mid-range</th><th className="n">Luxury</th></tr></thead>
            <tbody>
              <tr><td>Stay (twin share)</td>{d.cost.stay.map((x, i) => <td key={i} className="n">{inr(x / 2)}</td>)}</tr>
              <tr><td>Food</td>{d.cost.food.map((x, i) => <td key={i} className="n">{inr(x)}</td>)}</tr>
              <tr><td>Local transport</td>{d.cost.local.map((x, i) => <td key={i} className="n">{inr(x)}</td>)}</tr>
              <tr><td><b>Total</b></td>{[0, 1, 2].map((i) => <td key={i} className="n"><b>{inr(d.cost.stay[i] / 2 + d.cost.food[i] + d.cost.local[i])}</b></td>)}</tr>
            </tbody>
          </table>
        </div>
        <p className="tiny muted" style={{ marginTop: 6 }}>Illustrative estimates for planning, not live prices. Entry fees and experiences are listed per place.</p>
      </section>

      <section className="sec">
        <h2>Sample {d.days[0]}-day itinerary</h2>
        <p className="muted small" style={{ margin: '6px 0 14px' }}>Generated with the same planner your trips use, at a balanced pace. Start a trip to edit it.</p>
        <div className="grid auto">
          {sample.plan.map((day, i) => (
            <div className="card" key={i}>
              <b>Day {i + 1}</b>
              <p className="small muted">{day.label}</p>
              <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
                {day.items.map((x) => <div className="small" key={x.id}><b style={{ display: 'inline-block', width: 72 }}>{fmtT(x.s)}</b>{x.t}</div>)}
              </div>
            </div>
          ))}
        </div>
        <div className="row" style={{ marginTop: 14 }}><Link className="btn pri" to={`/new?dest=${d.id}`}>Use this as a starting point</Link></div>
      </section>

      {picked && PL[picked] && <PlaceDialog p={PL[picked]} onClose={() => setPicked(null)} onAdd={() => { setAdding(picked); setPicked(null); }} />}
      {adding && <AddToTripDialog pid={adding} onClose={() => setAdding(null)} />}
    </>
  );
}
