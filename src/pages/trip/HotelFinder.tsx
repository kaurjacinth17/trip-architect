// Find hotels by name or get suggestions filtered by Google rating, for each destination in the trip. Picking one
// saves it with its Google place ID: its name, rating, reviews and website are then always shown live from Google.
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { StayNightsDialog } from '../../components/StayNightsDialog';
import { bayesScores, PRIOR } from '../../engine/ranking';
import { destName, destView } from '../../engine/dest';
import { stayFromLive } from '../../engine/livePool';
import { defaultNights, setStayNights } from '../../engine/stays';
import type { Trip } from '../../engine/types';
import { mut } from '../../lib/actions';
import { apiPost } from '../../lib/api';
import { searchBody, type LiveListPlace } from '../../lib/live';
import { useLiveStatus } from '../../lib/liveStatus';
import { usePlaceDetails } from '../../lib/guide';
import { GoogleAttribution } from '../LiveDestination';

const PRICE = ['', 'Inexpensive', 'Moderate', 'Expensive', 'Very expensive'];

export function HotelFinder({ t }: { t: Trip }) {
  const live = useLiveStatus((s) => s.state === 'live');
  const [dest, setDest] = useState(t.dests[0] || '');
  const [name, setName] = useState('');
  const [query, setQuery] = useState<string | null>(null);
  const [minRating, setMinRating] = useState(4);
  const [suggest, setSuggest] = useState(false);
  const [stayFor, setStayFor] = useState<LiveListPlace | null>(null);
  const v = destView(t, dest);
  const search = useQuery({
    queryKey: ['hotelsearch', dest, query], enabled: live && !!v?.center && !!query,
    queryFn: ({ signal }) => apiPost<{ places: LiveListPlace[] }>('/api/places/search', searchBody(v!, 'hotels', { text: query }), signal),
  });
  const sug = useQuery({
    queryKey: ['guide-hotels', dest], enabled: live && !!v?.center && suggest,
    queryFn: ({ signal }) => apiPost<{ places: LiveListPlace[] }>('/api/places/search', searchBody(v!, 'hotels'), signal),
  });
  const ranked = (() => {
    const list = (sug.data?.places || []).filter((p) => (p.rating ?? 0) >= minRating && p.location);
    const s = bayesScores(list, PRIOR.other);
    return list.map((p, i) => ({ p, s: s[i] })).sort((a, b) => b.s - a.s).slice(0, 8).map((x) => x.p);
  })();
  const saved = (p: LiveListPlace) => t.stays.some((s) => s.gid === p.id);
  const add = (p: LiveListPlace) => mut(t.id, (tt) => { if (tt.stays.some((s) => s.gid === p.id)) return false; stayFromLive(tt, p, dest, t.destRecords?.[dest]); }, `${p.name} saved. Type the price you’re quoted.`, true);
  const row = (p: LiveListPlace) => (
    <li key={p.id} className="xrow">
      <span><b>{p.name}</b><br /><span className="small muted">{p.rating != null ? `★ ${p.rating.toFixed(1)} (${(p.userRatingCount || 0).toLocaleString('en-IN')} reviews)` : 'No rating yet'}{p.priceLevel ? ` · ${PRICE[p.priceLevel]}` : ''}{p.areaHint ? ` · ${p.areaHint}` : ''}</span></span>
      <span className="row" style={{ gap: 6 }}>
        <button type="button" className="btn sm" disabled={saved(p)} onClick={() => add(p)}>{saved(p) ? 'Saved' : 'Save'}</button>
        <button type="button" className="btn sm pri" onClick={() => setStayFor(p)}>Set as my stay…</button>
      </span>
    </li>
  );
  if (!live) return <div className="sec card small muted">Hotel search and suggestions need live Google data, which isn’t available right now. You can still add a stay by hand below.</div>;
  return (
    <section className="sec card grid gbox" style={{ gap: 10 }}>
      <div className="row between"><h3>Find your hotel</h3><GoogleAttribution /></div>
      <p className="small muted">Search the hotel you booked or are considering. Its Google rating, reviews and website appear automatically; you add the price you’re quoted.</p>
      <form className="row" style={{ gap: 8 }} onSubmit={(e) => { e.preventDefault(); if (name.trim().length >= 2) setQuery(name.trim()); }}>
        {t.dests.length > 1 && <select aria-label="Destination" value={dest} style={{ width: 'auto' }} onChange={(e) => { setDest(e.target.value); setQuery(null); }}>{t.dests.map((k) => <option key={k} value={k}>{destName(t, k)}</option>)}</select>}
        <input type="search" aria-label="Hotel name" placeholder={`Hotel name in ${v?.name || 'this destination'}`} value={name} onChange={(e) => setName(e.target.value)} style={{ flex: '1 1 220px' }} />
        <button type="submit" className="btn pri">Search</button>
      </form>
      {query && (search.isLoading ? <p className="small muted">Searching…</p> : <ul className="xlist">{(search.data?.places || []).slice(0, 6).map(row)}{!search.data?.places.length && <li className="small muted">No hotels found for “{query}”.</li>}</ul>)}
      <div className="row between" style={{ marginTop: 6 }}>
        <b className="small">Suggestions in {v?.name}</b>
        <span className="row" style={{ gap: 4 }} role="group" aria-label="Minimum Google rating">
          {[3.5, 4, 4.5].map((r) => <button key={r} type="button" className={'chip' + (minRating === r ? ' on' : '')} aria-pressed={minRating === r} onClick={() => { setMinRating(r); setSuggest(true); }}>{r}+ ★</button>)}
          {!suggest && <button type="button" className="btn sm" onClick={() => setSuggest(true)}>Suggest hotels</button>}
        </span>
      </div>
      {suggest && (sug.isLoading ? <p className="small muted">Finding well-rated hotels…</p> : <ul className="xlist">{ranked.map(row)}{!ranked.length && <li className="small muted">No hotels rated {minRating}+ found; try a lower rating.</li>}</ul>)}
      {suggest && <p className="tiny muted">Ranked by Google rating weighted by number of reviews. More filters (area, price) in the <a href={`/destinations/${dest}/guide?tab=hotels&trip=${t.id}`}>City Guide</a>.</p>}
      {stayFor && (
        <StayNightsDialog t={t} hotel={stayFor.name} initial={defaultNights(t, dest)} onClose={() => setStayFor(null)}
          onApply={(a, b) => mut(t.id, (tt) => { const s = tt.stays.find((x) => x.gid === stayFor.id) || stayFromLive(tt, stayFor, dest, t.destRecords?.[dest]); setStayNights(tt, s.id, a, b); }, `${stayFor.name} is your stay for nights ${a + 1}–${b + 1}`, true)} />
      )}
    </section>
  );
}

/** Google rating, reviews and the hotel's own website for a saved Google hotel (fetched live, never stored). */
export function HotelLive({ gid, children }: { gid: string; children: (d: { rating?: number; reviews?: number; website?: string; maps?: string } | null) => React.ReactNode }) {
  const q = usePlaceDetails(gid, false);
  const d = q.data;
  return <>{children(d ? { rating: d.rating, reviews: d.userRatingCount, website: d.website, maps: d.googleMapsUri } : null)}</>;
}
