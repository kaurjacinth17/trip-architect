// Auto-built page for any destination (Google place or custom pin): overview (Wikipedia, attributed), best months
// from climate averages, suggested days, areas (OpenStreetMap), famous attractions (live, Google Maps) and a rough
// daily cost. Nothing here is invented: when data is missing the page says so or asks the user.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BestMonthsChart } from '../components/BestMonthsChart';
import { InsertDestDialog } from '../components/InsertDestDialog';
import { Modal } from '../components/Modal';
import { Scene } from '../components/Scene';
import { CoverPhoto } from '../components/CoverPhoto';
import { Missing } from '../components/Shell';
import { COST_BASIS, DEST_TYPE_LABEL } from '../data/costTables';
import { D } from '../data/destinations';
import { categorise } from '../engine/placeTypes';
import { destView, suggestedDays } from '../engine/dest';
import { rankFamous, isHiddenGem, PRIOR } from '../engine/ranking';
import { seasonOf } from '../engine/season';
import type { CostTiers, DestRecord, DestType } from '../engine/types';
import { inr } from '../engine/util';
import { CATS } from '../data/constants';
import { fetchDestinationRecord, useAreas, useClimate, usePlaceList, useSummary } from '../lib/live';
import { useLiveStatus } from '../lib/liveStatus';
import { useTitle } from '../lib/hooks';
import { useDestCache } from '../store/dests';
import { tripList, useTrips } from '../store/trips';
import { mapsLink } from './Destination';

const SCENE_FOR: Record<DestType, string> = { beach: 'goa', hill: 'manali', pilgrimage: 'varanasi', wildlife: 'kerala', tier2: 'jaipur', metro: 'pondicherry', other: 'udaipur' };

export function GoogleAttribution({ style }: { style?: React.CSSProperties }) {
  return <span className="gmaps-attr" style={style}>© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors</span>;
}

/** Find a record: local cache → any trip that uses it → Google details (Pro) for "g:" keys. */
export function useRecord(key: string) {
  const cached = useDestCache((s) => s.records[key]);
  const trips = useTrips((s) => s.trips);
  const fromTrip = Object.values(trips).map((t) => t.destRecords?.[key]).find(Boolean);
  const put = useDestCache((s) => s.put);
  const rec = cached || fromTrip || null;
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  const needsFetch = key.startsWith('g:') && (!rec || !rec.center);
  const live = useLiveStatus((s) => s.state);
  useEffect(() => {
    if (!needsFetch || live === 'unknown') return;
    let alive = true;
    setState('loading');
    fetchDestinationRecord(key.slice(2))
      .then((r) => { if (alive) { put({ ...r, type: rec?.type ?? r.type, cost: rec?.cost, days: rec?.days, climate: rec?.climate, climatePeriod: rec?.climatePeriod }); setState('idle'); } })
      .catch(() => { if (alive) setState('error'); });
    return () => { alive = false; };
  }, [key, needsFetch, live]); // eslint-disable-line react-hooks/exhaustive-deps
  return { rec, state };
}

function CostSection({ rec, onSave }: { rec: DestRecord; onSave: (p: Partial<DestRecord>) => void }) {
  const v = destView({ destRecords: { [rec.key]: rec } }, rec.key)!;
  const [edit, setEdit] = useState(false);
  const blank: CostTiers = rec.cost || { stay: [0, 0, 0], food: [0, 0, 0], local: [0, 0, 0] };
  const [f, setF] = useState<CostTiers>(blank);
  const tiers = ['Budget', 'Mid-range', 'Luxury'];
  const row = (k: keyof CostTiers, l: string) => (
    <tr key={k}><td>{l}</td>{[0, 1, 2].map((i) => (
      <td key={i} className="n"><input type="number" min={0} step={100} aria-label={`${l}, ${tiers[i]}`} value={f[k][i] || ''} style={{ maxWidth: 120, textAlign: 'right' }}
        onChange={(e) => { const n = [...f[k]] as [number, number, number]; n[i] = Math.max(0, +e.target.value || 0); setF({ ...f, [k]: n }); }} /></td>))}</tr>
  );
  return (
    <section className="sec">
      <h2>Rough daily cost</h2>
      {v.inIndia && (
        <label className="f" style={{ maxWidth: 320, marginTop: 10 }}>What kind of place is {rec.name}?
          <select value={rec.type} onChange={(e) => onSave({ type: e.target.value as DestType })}>{Object.entries(DEST_TYPE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </label>
      )}
      {v.cost && !edit ? (
        <>
          <div className="scroll" style={{ marginTop: 12 }}>
            <table>
              <thead><tr><th>Per person, per day</th>{tiers.map((t) => <th key={t} className="n">{t}</th>)}</tr></thead>
              <tbody>
                <tr><td>Stay (twin share)</td>{v.cost.stay.map((x, i) => <td key={i} className="n">{inr(x / 2)}</td>)}</tr>
                <tr><td>Food</td>{v.cost.food.map((x, i) => <td key={i} className="n">{inr(x)}</td>)}</tr>
                <tr><td>Local transport</td>{v.cost.local.map((x, i) => <td key={i} className="n">{inr(x)}</td>)}</tr>
              </tbody>
            </table>
          </div>
          <p className="tiny muted" style={{ marginTop: 6 }}>
            {v.costSource === 'table' ? `Estimate: the average of our hand-written guides for similar places (${(COST_BASIS[rec.type] || []).map((id) => D[id].name).join(', ')}), not live prices.` : 'Your own figures.'}{' '}
            <button type="button" className="btn sm ghost" onClick={() => { setF(v.cost!); setEdit(true); }}>Use my own figures</button>
          </p>
        </>
      ) : (
        <div className="card grid" style={{ gap: 10, marginTop: 12 }}>
          {!v.cost && <p className="small">{v.inIndia ? `We don’t have a cost basis for this kind of place.` : `We don’t estimate costs abroad.`} Enter your own daily figures (in ₹) and they’ll be used for this destination’s budget.</p>}
          <div className="scroll"><table><thead><tr><th>₹ per day</th>{tiers.map((t) => <th key={t} className="n">{t}</th>)}</tr></thead>
            <tbody>{row('stay', 'Stay, per room')}{row('food', 'Food, per person')}{row('local', 'Local transport, per person')}</tbody></table></div>
          <div className="row">
            <button type="button" className="btn pri" onClick={() => { onSave({ cost: f }); setEdit(false); }}>Save figures</button>
            {(rec.cost || edit) && <button type="button" className="btn" onClick={() => { onSave({ cost: null }); setEdit(false); }}>{rec.cost ? 'Clear my figures' : 'Cancel'}</button>}
          </div>
        </div>
      )}
    </section>
  );
}

export default function LiveDestination({ destKey }: { destKey: string }) {
  const { rec, state } = useRecord(destKey);
  const patch = useDestCache((s) => s.patch);
  const put = useDestCache((s) => s.put);
  const v = rec ? destView({ destRecords: { [rec.key]: rec } }, rec.key) : null;
  useTitle(v ? v.name : 'Destination');
  const summary = useSummary(v);
  const climate = useClimate(v?.center, !!v && !rec?.climate);
  const areas = useAreas(v);
  const famous = usePlaceList(v, 'famous');
  const [adding, setAdding] = useState(false);
  const [tripId, setTripId] = useState<string | null>(null);
  const trips = useTrips((s) => s.trips);

  // Climate averages are open data (CC BY 4.0) and may be stored with the record.
  useEffect(() => {
    if (rec && climate.data?.months && !rec.climate) put({ ...rec, climate: climate.data.months, climatePeriod: climate.data.period });
  }, [climate.data, rec, put]);

  if (!rec) return state === 'error' || !destKey.startsWith('g:') ? <Missing /> : <p className="muted" role="status">Loading destination…</p>;
  if (!v) return <Missing />;
  const save = (p: Partial<DestRecord>) => patch(rec.key, p);
  const ranked = famous.data ? rankFamous(famous.data.places, PRIOR.attractions) : [];
  const sugg = famous.data ? suggestedDays(famous.data.places) : null;
  const m = new Date().getMonth() + 1;
  const ss = v.good.length || v.poor.length ? seasonOf(v, m) : null;
  const sceneOf = D[SCENE_FOR[rec.type]];
  const ts = tripList(trips);

  return (
    <>
      <section className="hero">
        <div className="txt">
          <Link className="small" to="/explore">← Explore</Link>
          <span className="kicker">{[v.region, v.country].filter(Boolean).join(', ') || (rec.kind === 'custom' ? 'Custom place' : '')}</span>
          <h1>{v.name}</h1>
          <dl className="kv">
            <dt>Suggested stay</dt><dd>{v.daysKnown ? `${v.days[0]}–${v.days[1]} days` : sugg ? `About ${sugg} day${sugg > 1 ? 's' : ''} (suggested from top-rated attractions)` : 'Not enough data yet'}</dd>
            <dt>This month</dt><dd>{ss === 'good' ? 'Great time to go' : ss === 'poor' ? 'One of the harder months' : ss === 'ok' ? 'Shoulder season' : 'No climate data yet'}</dd>
            <dt>Currency</dt><dd>{rec.currency}</dd>
          </dl>
          <div className="row">
            <Link className="btn pri" to={`/new?dest=${encodeURIComponent(rec.key)}`}>Plan a trip here</Link>
            <Link className="btn" to={`/destinations/${rec.key}/guide`}>City Guide</Link>
            {ts.length > 0 && <button type="button" className="btn" onClick={() => setAdding(true)}>Add to a trip</button>}
            {rec.placeId && <a className="btn" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(v.name)}&query_place_id=${rec.placeId}`} target="_blank" rel="noopener noreferrer">Open in Google Maps</a>}
          </div>
        </div>
        <div className="art"><CoverPhoto q={[v.name, v.region, v.country].filter(Boolean).join(', ')} alt={v.name} height={320} fallback={sceneOf ? <Scene d={{ scene: sceneOf.scene, name: v.name }} h={320} /> : <div className="cover-ph" />} /></div>
      </section>

      <div className="grid g2 sec">
        <div className="grid" style={{ gap: 12, alignContent: 'start' }}>
          <h2>Overview</h2>
          {summary.loading ? <p className="muted small">Loading…</p> : summary.wiki ? (
            <>
              <p>{summary.wiki.extract}</p>
              <p className="src">From <a href={summary.wiki.url || 'https://en.wikipedia.org/'} target="_blank" rel="noopener noreferrer">Wikipedia</a>, CC BY-SA 4.0.</p>
            </>
          ) : summary.google ? (
            <div className="card"><p>{summary.google}</p><p style={{ marginTop: 8 }}><GoogleAttribution /></p></div>
          ) : <p className="muted small">No overview available for {v.name} yet.</p>}
        </div>
        <div className="card grid" style={{ gap: 10 }}>
          <h3>Best time to go</h3>
          <p className="small">{v.bestTime}</p>
          {rec.climate ? <BestMonthsChart normals={rec.climate} period={rec.climatePeriod} />
            : climate.isLoading ? <p className="muted small">Loading climate averages…</p>
            : <p className="muted small">Climate averages aren’t available right now.</p>}
        </div>
      </div>

      <section className="sec">
        <div className="row between"><h2>Famous attractions</h2><Link className="btn sm" to={`/destinations/${rec.key}/guide`}>Restaurants, hotels and more in the City Guide</Link></div>
        {famous.isLoading ? <p className="muted small" style={{ marginTop: 8 }}>Loading attractions…</p>
          : famous.isError || !famous.data ? <p className="muted small" style={{ marginTop: 8 }}>Live attractions aren’t available right now. You can still plan a trip and add your own activities.</p>
          : (
            <div className="lib gbox" style={{ marginTop: 12 }}>
              <div style={{ textAlign: 'right' }}><GoogleAttribution /></div>
              {ranked.slice(0, 12).map((p, i) => (
                <div className="li" key={p.id}>
                  <div>
                    <div className="nm">{p.name}{' '}{i < 10 && <span className="tag t">Must-see</span>}{isHiddenGem(p) && <span className="tag f" style={{ marginLeft: 4 }}>Hidden gem</span>}</div>
                    <div className="mt">{CATS[categorise(p.primaryType, p.types).cat][0]}{p.rating != null && ` · ★ ${p.rating.toFixed(1)} (${(p.userRatingCount || 0).toLocaleString('en-IN')})`}{p.areaHint ? ` · ${p.areaHint}` : ''}</div>
                  </div>
                  {p.location && <a className="btn sm" href={mapsLink(p.location.lat, p.location.lng) + `&query_place_id=${p.id}`} target="_blank" rel="noopener noreferrer" aria-label={`Open ${p.name} in Google Maps`}>Map</a>}
                </div>
              ))}
              <p className="tiny muted">Ranked by rating weighted by number of reviews. Ratings and reviews are from Google Maps and aren’t verified by Google; Google removes fake content when it finds it.</p>
            </div>
          )}
      </section>

      <section className="sec">
        <h2>Areas</h2>
        {areas.isLoading ? <p className="muted small" style={{ marginTop: 8 }}>Loading neighbourhoods…</p>
          : areas.data?.areas.length ? (
            <>
              <div className="row" style={{ gap: 6, marginTop: 12 }}>{areas.data.areas.map((a) => <span key={a.name} className="tag">{a.name}</span>)}</div>
              <p className="src" style={{ marginTop: 8 }}>{areas.data.areas.length} areas from © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a> (ODbL).</p>
            </>
          ) : <p className="muted small" style={{ marginTop: 8 }}>No neighbourhood data for {v.name}.</p>}
      </section>

      <CostSection rec={rec} onSave={save} />

      {adding && !tripId && (
        <Modal title={`Add ${v.name} to a trip`} onClose={() => setAdding(false)}>
          <h2>Add {v.name} to a trip</h2>
          <div className="grid" style={{ gap: 8 }}>
            {ts.map((t) => (
              <button type="button" key={t.id} className="opt" disabled={t.dests.includes(rec.key)} onClick={() => setTripId(t.id)}>
                <b>{t.name}</b><span className="small muted">{t.dests.includes(rec.key) ? 'Already in this trip' : `${t.plan.length} days`}</span>
              </button>
            ))}
          </div>
        </Modal>
      )}
      {tripId && trips[tripId] && <InsertDestDialog t={trips[tripId]} destKey={rec.key} record={rec} onClose={() => { setTripId(null); setAdding(false); }} />}
    </>
  );
}
