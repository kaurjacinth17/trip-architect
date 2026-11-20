import { useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { DestinationSearch } from '../components/DestinationSearch';
import { DestCard } from '../components/Cards';
import { MONTHS, MOODS } from '../data/constants';
import { DESTS } from '../data/destinations';
import { seasonOf } from '../engine/season';
import { plural } from '../engine/util';
import { useTitle } from '../lib/hooks';
import { useTrips } from '../store/trips';
import { useUI } from '../store/ui';

export function Explore() {
  useTitle('Explore destinations');
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();
  const { mood, q, len, set } = useUI();
  const cmp = useTrips((s) => s.compare.cmp);

  // `?mood=` from Home's mood chips (and shareable filter links).
  const urlMood = params.get('mood');
  useEffect(() => {
    if (urlMood !== null) set({ mood: urlMood || null });
  }, [urlMood, set]);

  const setMood = (m: string | null) => {
    set({ mood: m });
    setParams(m ? { mood: m } : {}, { replace: true });
  };

  let list = DESTS.filter((d) => (!mood || d.moods.includes(mood)) && (!q || (d.name + d.state + d.tag + d.bestFor + d.pl.map((p) => p.n).join(' ')).toLowerCase().includes(q.toLowerCase())));
  if (len === 'short') list = list.filter((d) => d.days[0] <= 3);
  if (len === 'mid') list = list.filter((d) => d.days[1] >= 4 && d.days[0] <= 5);
  if (len === 'long') list = list.filter((d) => d.days[1] >= 6);
  const m = new Date().getMonth() + 1;

  return (
    <>
      <h1>Where to next?</h1>
      <p className="muted" style={{ marginTop: 8 }}>Browse by mood, compare a few, then plan. Budgets are on-ground estimates per person (stay on a twin share, food, local transport, key entry fees), excluding travel to get there.</p>
      <div className="card" style={{ marginTop: 20 }}>
        <DestinationSearch label="Go anywhere: search any city, town, hill station, island, region or national park" onPick={(d) => nav(`/destinations/${d.key}`)} />
      </div>
      <h2 style={{ marginTop: 28 }}>Hand-written guides</h2>
      <p className="muted small" style={{ marginTop: 6 }}>Eight destinations with curated places, visit timings and editor’s picks.</p>
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr)', marginTop: 14, gap: 12 }}>
        <input type="text" placeholder="Filter the guides or their places, e.g. ‘sunset’ or ‘fort’" value={q} onChange={(e) => set({ q: e.target.value })} aria-label="Filter curated guides" />
        <select value={len} onChange={(e) => set({ len: e.target.value as typeof len })} aria-label="Trip length">
          <option value="any">Any trip length</option>
          <option value="short">Weekend (2–3 days)</option>
          <option value="mid">4–5 days</option>
          <option value="long">A week</option>
        </select>
      </div>
      <div className="row" style={{ marginTop: 12 }} role="group" aria-label="Mood">
        <button type="button" className={'chip' + (!mood ? ' on' : '')} aria-pressed={!mood} onClick={() => setMood(null)}>All moods</button>
        {MOODS.map(([k, l]) => (
          <button type="button" key={k} className={'chip' + (mood === k ? ' on' : '')} aria-pressed={mood === k} onClick={() => setMood(k)}>{l}</button>
        ))}
      </div>
      <div className="grid auto" style={{ marginTop: 20 }}>
        {list.length ? list.map((d) => <DestCard key={d.id} d={d} />) : <div className="empty">No destinations match. Try another mood or clear the search.</div>}
      </div>
      {cmp.length > 0 && (
        <div className="noprint" style={{ position: 'sticky', bottom: 16, marginTop: 20, display: 'flex', justifyContent: 'center' }}>
          <Link className="btn acc" to="/compare">Compare {plural(cmp.length, 'destination')}</Link>
        </div>
      )}
      <p className="foot">
        Good this month ({MONTHS[m - 1]}): {DESTS.filter((d) => seasonOf(d, m) === 'good').map((d) => d.name).join(', ') || 'none in this list'}. Seasons and estimates are general guidance; check current conditions before booking.
      </p>
    </>
  );
}
