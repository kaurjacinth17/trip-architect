// City Guide: Famous attractions · Things to do · Restaurants · Cafés · Hotels · Shopping · Nightlife · Areas.
// Live Google results (first page on open, more on request), filters kept in the URL, Bayesian "Famous" sort,
// badges, place cards with trip actions, a detail drawer, the on-request "All areas" run and a synced Google Map.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { GMap, hasGoogleMaps, type GPin } from '../../components/GMap';
import { Modal } from '../../components/Modal';
import { Missing } from '../../components/Shell';
import { CATS } from '../../data/constants';
import { CURATED_PLACE_IDS } from '../../data/curatedPlaceIds';
import { D, PL } from '../../data/destinations';
import { destView, type DestView } from '../../engine/dest';
import { fmtDist, km } from '../../engine/geo';
import { addLiveToDay, MEALS, stayFromLive, type MealKind } from '../../engine/livePool';
import { applyFilters, badgesFor, mergeResults, sortPlaces, type GuidePlace, type SortKey } from '../../engine/placeFilters';
import { categorise, isLodging } from '../../engine/placeTypes';
import { dayCentre, startFor, travellers } from '../../engine/schedule';
import { dayDate, fmtD, fmtT, fromHHMM, toHHMM } from '../../engine/time';
import type { DestRecord, Trip } from '../../engine/types';
import { mut } from '../../lib/actions';
import { GUIDE_TABS, guideParams, isFoodTab, parseGuide, toGuidePlace, useAllAreas, useGuideList, usePhotoUri, usePlaceDetails, type ApiPlace, type GuideState, type GuideTab, type PlacePhoto } from '../../lib/guide';
import { useAreas } from '../../lib/live';
import { useLiveStatus } from '../../lib/liveStatus';
import { useTitle } from '../../lib/hooks';
import { tripList, useTrips } from '../../store/trips';
import { GoogleAttribution, useRecord } from '../LiveDestination';

const PRICE = ['Free', 'Inexpensive', 'Moderate', 'Expensive', 'Very expensive'];
const RATINGS = [3.5, 4, 4.5];
const REVIEWS = [50, 500, 5000];
const SORTS: [SortKey, string][] = [['famous', 'Famous'], ['rating', 'Highest rated'], ['reviews', 'Most reviewed'], ['nearHotel', 'Nearest to my hotel'], ['nearDay', 'Nearest to a day’s plan'], ['price', 'Price']];

/** Curated places linked to Google IDs → editor's pick / must-see badges */
const CURATED_BY_GID: Record<string, { must: boolean; pid: string }> = Object.fromEntries(Object.entries(CURATED_PLACE_IDS).map(([pid, gid]) => [gid, { must: !!PL[pid]?.must, pid }]));

export default function CityGuide() {
  const { id = '' } = useParams();
  const curated = D[id];
  const { rec } = useRecord(curated ? '' : id);
  const v = curated ? destView(null, id) : rec ? destView({ destRecords: { [rec.key]: rec } }, rec.key) : null;
  useTitle(v ? `${v.name} City Guide` : 'City Guide');
  if (!curated && !/^[gc]:/.test(id)) return <Missing />;
  if (!v) return <p className="muted" role="status">Loading destination…</p>;
  return <Guide v={v} record={rec || undefined} />;
}

function Guide({ v, record }: { v: DestView; record?: DestRecord }) {
  const [params, setParams] = useSearchParams();
  const state = parseGuide(params);
  const set = (p: Partial<GuideState> & { filters?: Partial<GuideState['filters']> }) =>
    setParams(guideParams({ ...state, ...p, filters: { ...state.filters, ...(p.filters || {}) } }), { replace: true });
  const live = useLiveStatus((s) => s.state);
  const trips = useTrips((s) => s.trips);
  const ts = tripList(trips);
  const trip = (state.trip && trips[state.trip]) || ts.find((t) => t.dests.includes(v.key)) || null;
  const tab = state.tab;

  return (
    <>
      <Link className="small" to={`/destinations/${v.key}`}>← {v.name}</Link>
      <h1 style={{ marginTop: 8 }}>{v.name} City Guide</h1>
      <div className="row" style={{ marginTop: 10, gap: 10 }}>
        <label className="row small" style={{ gap: 8, fontWeight: 600 }}>Planning for
          <select value={trip?.id || ''} style={{ width: 'auto' }} onChange={(e) => set({ trip: e.target.value || undefined, day: undefined })}>
            <option value="">No trip selected</option>
            {ts.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        {trip && (
          <label className="row small" style={{ gap: 8, fontWeight: 600 }}>Day
            <select value={state.day ?? ''} style={{ width: 'auto' }} onChange={(e) => set({ day: e.target.value === '' ? undefined : +e.target.value })}>
              <option value="">Any</option>
              {trip.plan.map((_, i) => <option key={i} value={i}>Day {i + 1}{dayDate(trip, i) ? ' · ' + fmtD(dayDate(trip, i)) : ''}</option>)}
            </select>
          </label>
        )}
      </div>
      <nav className="tabs" aria-label="City Guide sections">
        {GUIDE_TABS.map(([k, l]) => (
          <a key={k} href={`?${guideParams({ ...state, tab: k, inArea: undefined }).toString()}`} className={tab === k ? 'on' : ''} aria-current={tab === k ? 'page' : undefined}
            onClick={(e) => { e.preventDefault(); set({ tab: k, inArea: undefined }); }}>{l}</a>
        ))}
      </nav>
      {live !== 'live' && tab !== 'areas' && (
        <div className="warn caution">
          <b>{live === 'resting' ? 'Live place data is resting for today' : 'Live place data isn’t available here'}</b>
          <p>{v.curated ? `The hand-written ${v.name} guide is always available.` : 'Saved places in your trips still work.'} {v.curated && <Link to={`/destinations/${v.key}`}>Open the guide</Link>}</p>
        </div>
      )}
      {tab === 'areas' ? <AreasTab v={v} trip={trip} onGo={(t, area) => set({ tab: t, inArea: area })} /> : <PlacesTab key={tab + (state.inArea || '')} v={v} record={record} trip={trip} state={state} set={set} />}
    </>
  );
}

/* ------------------------------------------------------------------------------------------- places */

function PlacesTab({ v, record, trip, state, set }: { v: DestView; record?: DestRecord; trip: Trip | null; state: GuideState; set: (p: Partial<GuideState> & { filters?: Partial<GuideState['filters']> }) => void }) {
  const tab = state.tab as Exclude<GuideTab, 'areas'>;
  const list = useGuideList(v, tab, state.inArea);
  const allAreas = useAllAreas(v, tab);
  const areas = useAreaNames(v);
  const [hover, setHover] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [open, setOpen] = useState<GuidePlace | null>(null);
  const [action, setAction] = useState<{ p: GuidePlace; meal?: MealKind } | null>(null);
  const [veg, setVeg] = useState<Record<string, boolean | undefined>>({});
  const [showMap, setShowMap] = useState(false);
  const f = state.filters;
  const attractions = tab === 'famous' || tab === 'todo';

  const raw: GuidePlace[] = useMemo(() => {
    const pages = list.data?.pages || [];
    const base = mergeResults([{ area: state.inArea, places: pages.flatMap((p) => p.places) }]);
    const run = allAreas.run?.pages || [];
    return run.length ? mergeResults([{ area: state.inArea, places: base }, ...run]) : base.map((p, i) => toGuidePlace(p as ApiPlace, i, p.foundIn));
  }, [list.data, allAreas.run, state.inArea]);

  const weekdayMinute = (() => {
    if (f.openDay == null || !trip) return undefined;
    const d = dayDate(trip, f.openDay);
    return d ? { weekday: d.getDay(), minute: fromHHMM(f.openTime || '13:00') } : undefined;
  })();
  const filtered = applyFilters(raw.filter((p) => tab === 'hotels' || !isLodging(p.types)), { ...f, open: f.open === 'now' ? 'now' : weekdayMinute }, { veg });
  const hotel = trip ? (trip.stays.find((s) => s.status === 'booked' && s.lat != null) || trip.stays.find((s) => s.lat != null)) : null;
  const dayC = trip && state.day != null && trip.plan[state.day] ? dayCentre(trip.plan[state.day], trip) : null;
  const sorted = sortPlaces(filtered, state.sort, { attractions, hotel: hotel ? { lat: hotel.lat!, lng: hotel.lng! } : null, dayCentre: dayC });
  const badges = badgesFor(raw, attractions, CURATED_BY_GID);
  const ref = dayC || (hotel ? { lat: hotel.lat!, lng: hotel.lng! } : null) || v.center;
  const pins: GPin[] = sorted.filter((p) => p.location).slice(0, 60).map((p, i) => ({ id: p.id, lat: p.location!.lat, lng: p.location!.lng, label: i + 1, title: p.name, col: hover === p.id ? '#b4532a' : '#1f4d3a', kind: 'place' }));
  const runAreas = areas.data || [];
  const r = allAreas.run;
  const label = GUIDE_TABS.find(([k]) => k === tab)![1].toLowerCase();

  const scrollTo = (id: string) => {
    setFocus(id);
    document.getElementById('card-' + id)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };

  return (
    <>
      {state.inArea && (
        <div className="banner"><span className="small"><b>{GUIDE_TABS.find(([k]) => k === tab)![1]} in {state.inArea}</b></span><button type="button" className="btn sm" onClick={() => set({ inArea: undefined })}>Whole of {v.name}</button></div>
      )}
      <Filters v={v} trip={trip} state={state} set={set} areaNames={[...new Set([...runAreas.map((a) => a.name), ...raw.map((p) => p.areaHint).filter(Boolean) as string[]])].sort()} tab={tab} />

      <div className="row between" style={{ margin: '14px 0 8px' }}>
        <p className="small" aria-live="polite">
          {list.isLoading ? 'Loading…' : r && r.pages.length
            ? `Showing ${sorted.length} of ${raw.length} ${label} from Google across ${r.pages.length} area${r.pages.length === 1 ? '' : 's'}`
            : `Showing ${sorted.length} of ${raw.length} ${label}${state.inArea ? ` in ${state.inArea}` : ''}`}
        </p>
        <div className="row" style={{ gap: 6 }}>
          {hasGoogleMaps() && <button type="button" className="btn sm mapToggle" aria-pressed={showMap} onClick={() => setShowMap(!showMap)}>{showMap ? 'Hide map' : 'Show map'}</button>}
          {!state.inArea && runAreas.length > 1 && !r?.running && (
            <AllAreasButton n={runAreas.length} label={label} done={!!r && !r.running} onRun={() => void allAreas.start(runAreas.map((a) => a.name))} />
          )}
        </div>
      </div>
      {r?.running && (
        <div className="card" role="status" style={{ marginBottom: 12 }}>
          <b className="small">Searching area {r.done} of {r.total}…</b>
          <div className="meter" style={{ marginTop: 8 }}><i style={{ width: (r.done / r.total) * 100 + '%' }} /></div>
          <button type="button" className="btn sm ghost" onClick={allAreas.stop}>Stop</button>
        </div>
      )}
      {r?.stopped && <div className="warn caution"><b>Stopped early</b><p>{r.stopped} {r.pages.length} of {r.total} areas were searched.</p></div>}

      <div className={'guide-split' + (showMap ? ' map-on' : '')}>
        <div className="gbox guide-list">
          <div style={{ textAlign: 'right' }}><GoogleAttribution /></div>
          {list.isError && <p className="small muted">Live results aren’t available right now.</p>}
          {!list.isLoading && !sorted.length && <p className="small muted" style={{ padding: 12 }}>{raw.length ? 'No places match these filters.' : `No ${label} found.`}</p>}
          {sorted.map((p, i) => (
            <PlaceCard key={p.id} p={p} n={i + 1} tab={tab} badges={badges.get(p.id)!} dist={ref && p.location ? km(ref, p.location) : null} distFrom={dayC ? `Day ${state.day! + 1}` : hotel ? 'your stay' : v.name}
              active={hover === p.id || focus === p.id} onHover={setHover} trip={trip}
              onOpen={() => setOpen(p)} onAction={(meal) => setAction({ p, meal })} onMap={() => { setShowMap(true); setFocus(p.id); }}
              onWish={() => trip && mut(trip.id, (t) => { if (t.wish.some((w) => w.gid === p.id)) return false; t.wish.push(itemForWish(p, v.key)); if (record && !t.dests.includes(v.key)) { t.dests.push(v.key); t.destRecords = { ...(t.destRecords || {}), [v.key]: record }; } }, `Saved to the wishlist in ${trip.name}`, true)}
              onStay={() => trip && mut(trip.id, (t) => { stayFromLive(t, p, v.key, record); }, `Added to stays in ${trip.name}. Enter the price you find.`, true)} />
          ))}
          {list.hasNextPage && !r && (
            <div style={{ padding: 8 }}><button type="button" className="btn" disabled={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>{list.isFetchingNextPage ? 'Loading…' : 'Load more'}</button></div>
          )}
          {!list.hasNextPage && raw.length >= 60 && !r && <p className="tiny muted" style={{ padding: 8 }}>Google returns up to 60 results per search. {runAreas.length > 1 ? 'Search all areas for more.' : ''}</p>}
          <p className="tiny muted" style={{ padding: '4px 8px' }}>Ratings and reviews come from Google Maps. Google doesn’t verify reviews but removes fake content when it finds it.</p>
        </div>
        {hasGoogleMaps() && (
          <div className="guide-map">
            <GMap pins={pins} active={hover} focus={focus} onPick={scrollTo} onHover={setHover} label={`Map of ${label} in ${v.name}`} height="calc(100vh - 32px)" />
          </div>
        )}
      </div>
      {open && <DetailDrawer p={open} tab={tab} badges={badges.get(open.id)!} trip={trip} onClose={() => setOpen(null)} onVeg={(id, x) => setVeg((s) => ({ ...s, [id]: x }))}
        onAction={(meal) => { setAction({ p: open, meal }); setOpen(null); }} />}
      {action && trip && <AddToDayDialog trip={trip} p={action.p} meal={action.meal} destKey={v.key} record={record} day={state.day} onClose={() => setAction(null)} />}
      {action && !trip && <NoTripDialog v={v} onClose={() => setAction(null)} />}
    </>
  );
}

const itemForWish = (p: GuidePlace, destKey: string) => {
  const { cat, duration } = categorise(p.primaryType, p.types);
  return { id: crypto.randomUUID().slice(0, 8), pid: null, gid: p.id, t: '', cat, s: 540, d: duration, c: 0, lat: p.location?.lat ?? null, lng: p.location?.lng ?? null, coordsFetchedAt: p.location ? Date.now() : undefined, area: '', dest: destKey, pri: 'nice' as const, n: '', done: false };
};

function useAreaNames(v: DestView) {
  const osm = useAreas(v);
  return useMemo(() => ({
    data: v.curated ? v.curated.areas.map((a) => ({ name: a[0], center: { lat: a[2], lng: a[3] }, kind: a[1] })) : osm.data?.areas,
    isLoading: !v.curated && osm.isLoading,
  }), [v, osm.data, osm.isLoading]);
}

function AllAreasButton({ n, label, done, onRun }: { n: number; label: string; done: boolean; onRun: () => void }) {
  const [ask, setAsk] = useState(false);
  return (
    <>
      <button type="button" className="btn sm" onClick={() => setAsk(true)}>{done ? 'Search all areas again' : `All ${label} (search ${n} areas)`}</button>
      {ask && (
        <Modal title="Search every area?" onClose={() => setAsk(false)}>
          <h2>Search every area?</h2>
          <p>This runs one live search for each of the {n} areas, to find {label} that a single search misses. The site shares about 220 live searches a day across everyone, so it may stop early.</p>
          <div className="row"><button type="button" className="btn" onClick={() => setAsk(false)}>Cancel</button><button type="button" className="btn pri" onClick={() => { setAsk(false); onRun(); }}>Search {n} areas</button></div>
        </Modal>
      )}
    </>
  );
}

/* ------------------------------------------------------------------------------------------ filters */

function Filters({ trip, state, set, areaNames, tab }: { v: DestView; trip: Trip | null; state: GuideState; set: (p: Partial<GuideState> & { filters?: Partial<GuideState['filters']> }) => void; areaNames: string[]; tab: GuideTab }) {
  const f = state.filters;
  const [aq, setAq] = useState('');
  const [q, setQ] = useState(f.q || '');
  useEffect(() => {
    const t = setTimeout(() => { if ((f.q || '') !== q) set({ filters: { q: q || undefined } }); }, 400);
    return () => clearTimeout(t);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
  const chip = (on: boolean, label: string, onClick: () => void) => <button type="button" className={'chip' + (on ? ' on' : '')} aria-pressed={on} onClick={onClick}>{label}</button>;
  const active = [f.minRating, f.minReviews, f.price?.length, f.areas?.length, f.open || f.openDay != null, f.veg, f.wheelchair].filter(Boolean).length;
  const [wide] = useState(() => typeof matchMedia === 'undefined' || matchMedia('(min-width: 701px)').matches);
  return (
    <div className="card grid filters" style={{ gap: 10 }}>
      <div className="row" style={{ gap: 8 }}>
        <input type="search" placeholder={`Search within ${GUIDE_TABS.find(([k]) => k === tab)![1].toLowerCase()}`} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search within this tab" style={{ flex: '2 1 220px' }} />
        <label className="row small" style={{ gap: 6, fontWeight: 600, flex: '1 1 200px' }}>Sort
          <select value={state.sort} onChange={(e) => set({ sort: e.target.value as SortKey })}>{SORTS.map(([k, l]) => <option key={k} value={k} disabled={(k === 'nearDay' && state.day == null) || (k === 'nearHotel' && !trip?.stays.some((s) => s.lat != null))}>{l}</option>)}</select>
        </label>
      </div>
      <details open={wide || undefined} className="fdetails">
      <summary className="small"><b>Filters</b>{active ? ` (${active} active)` : ''}</summary>
      <div className="grid" style={{ gap: 10, marginTop: 10 }}>
      <div className="row" style={{ gap: 6 }} role="group" aria-label="Minimum rating">
        <span className="small muted">Rating</span>
        {chip(!f.minRating, 'Any', () => set({ filters: { minRating: undefined } }))}
        {RATINGS.map((x) => chip(f.minRating === x, `${x}+ ★`, () => set({ filters: { minRating: x } })))}
      </div>
      <div className="row" style={{ gap: 6 }} role="group" aria-label="Minimum reviews">
        <span className="small muted">Reviews</span>
        {chip(!f.minReviews, 'Any', () => set({ filters: { minReviews: undefined } }))}
        {REVIEWS.map((x) => chip(f.minReviews === x, `${x.toLocaleString('en-IN')}+`, () => set({ filters: { minReviews: x } })))}
      </div>
      <div className="row" style={{ gap: 6 }} role="group" aria-label="Price level">
        <span className="small muted">Price</span>
        {[1, 2, 3, 4].map((x) => chip(!!f.price?.includes(x), PRICE[x], () => set({ filters: { price: f.price?.includes(x) ? f.price.filter((y) => y !== x) : [...(f.price || []), x] } })))}
      </div>
      <div className="row" style={{ gap: 6 }}>
        {chip(f.open === 'now', 'Open now', () => set({ filters: { open: f.open === 'now' ? undefined : 'now', openDay: undefined } }))}
        {trip?.start && (
          <span className="row small" style={{ gap: 6 }}>
            <label className="row" style={{ gap: 6 }}>Open on
              <select value={f.openDay ?? ''} style={{ width: 'auto' }} onChange={(e) => set({ filters: { openDay: e.target.value === '' ? undefined : +e.target.value, open: undefined } })}>
                <option value="">any day</option>
                {trip.plan.map((_, i) => <option key={i} value={i}>Day {i + 1} ({fmtD(dayDate(trip, i))})</option>)}
              </select>
            </label>
            {f.openDay != null && <label className="row" style={{ gap: 6 }}>at<input type="time" value={f.openTime || '13:00'} style={{ width: 'auto' }} onChange={(e) => set({ filters: { openTime: e.target.value } })} /></label>}
          </span>
        )}
        {isFoodTab(tab) && chip(!!f.veg, 'Veg-friendly', () => set({ filters: { veg: f.veg ? undefined : true } }))}
        {chip(!!f.wheelchair, 'Wheelchair-accessible entrance', () => set({ filters: { wheelchair: f.wheelchair ? undefined : true } }))}
      </div>
      {f.veg && <p className="tiny muted">Google shares veg-friendliness per place, so this shows places whose details you’ve opened.</p>}
      {areaNames.length > 0 && (
        <details className="areas-pick">
          <summary className="small"><b>Area</b> {f.areas?.length ? `(${f.areas.length} selected)` : '(all)'}</summary>
          <input type="search" placeholder="Find an area" value={aq} onChange={(e) => setAq(e.target.value)} aria-label="Find an area" style={{ margin: '8px 0' }} />
          <div className="areas-list">
            {areaNames.filter((a) => a.toLowerCase().includes(aq.toLowerCase())).map((a) => (
              <label key={a} className="row small" style={{ gap: 6 }}>
                <input type="checkbox" checked={!!f.areas?.includes(a)} onChange={(e) => set({ filters: { areas: e.target.checked ? [...(f.areas || []), a] : (f.areas || []).filter((x) => x !== a) } })} />{a}
              </label>
            ))}
          </div>
          {!!f.areas?.length && <button type="button" className="btn sm ghost" onClick={() => set({ filters: { areas: undefined } })}>Clear areas</button>}
          <p className="tiny muted">Matches the area a place was found in (when searching by area) or the neighbourhood Google lists for it.</p>
        </details>
      )}
      </div>
      </details>
    </div>
  );
}

/* ---------------------------------------------------------------------------------------- place card */

function PlaceCard({ p, n, tab, badges, dist, distFrom, active, onHover, onOpen, onAction, onMap, onWish, onStay, trip }: {
  p: GuidePlace; n: number; tab: GuideTab; badges: { mustSee: boolean; hiddenGem: boolean; editorsPick: boolean }; dist: number | null; distFrom: string; active: boolean;
  onHover: (id: string | null) => void; onOpen: () => void; onAction: (meal?: MealKind) => void; onMap: () => void; onWish: () => void; onStay: () => void; trip: Trip | null;
}) {
  const { cat } = categorise(p.primaryType, p.types);
  const food = isFoodTab(tab);
  return (
    <article id={'card-' + p.id} className={'li pcard' + (active ? ' on' : '')} onMouseEnter={() => onHover(p.id)} onMouseLeave={() => onHover(null)}>
      <div>
        <div className="nm">
          <span className="pnum" aria-hidden="true">{n}</span>
          <button type="button" className="linkish" onClick={onOpen}>{p.name}</button>
          {badges.mustSee && <span className="tag t">Must-see</span>}
          {badges.hiddenGem && <span className="tag f">Hidden gem</span>}
          {badges.editorsPick && <span className="tag">Editor’s pick</span>}
        </div>
        <div className="mt">
          {CATS[cat][0]}
          {p.rating != null && <> · <span aria-label={`Rated ${p.rating} out of 5 from ${p.userRatingCount} reviews`}>★ {p.rating.toFixed(1)} ({(p.userRatingCount || 0).toLocaleString('en-IN')})</span></>}
          {p.priceLevel != null && ` · ${PRICE[p.priceLevel]}`}
          {p.areaHint && ` · ${p.areaHint}`}
          {p.openNow != null && <> · <b style={{ color: p.openNow ? 'var(--forest)' : 'var(--alert)' }}>{p.openNow ? 'Open now' : 'Closed now'}</b></>}
          {p.closed === 'temporarily' && <> · <b style={{ color: 'var(--alert)' }}>Temporarily closed</b></>}
          {dist != null && ` · ${fmtDist(dist)} from ${distFrom}`}
        </div>
        <div className="row pacts" style={{ gap: 4, marginTop: 6 }}>
          {tab === 'hotels'
            ? <button type="button" className="btn sm pri" disabled={!trip} onClick={onStay}>Set as my stay</button>
            : <button type="button" className="btn sm pri" onClick={() => onAction()}>Add to day…</button>}
          {food && (['breakfast', 'lunch', 'dinner'] as MealKind[]).map((m) => <button key={m} type="button" className="btn sm" onClick={() => onAction(m)} aria-label={`Add ${p.name} as ${m}`}>{MEALS[m].label}</button>)}
          <button type="button" className="btn sm" disabled={!trip} onClick={onWish} aria-label={`Save ${p.name} to wishlist`}>♡ Save</button>
          {hasGoogleMaps() && <button type="button" className="btn sm ghost" onClick={onMap}>Show on map</button>}
          {p.googleMapsUri && <a className="btn sm ghost" href={p.googleMapsUri} target="_blank" rel="noopener noreferrer" aria-label={`Open ${p.name} in Google Maps`}>Google Maps</a>}
        </div>
      </div>
    </article>
  );
}

/* ---------------------------------------------------------------------------------------- drawer */

function useVisible<T extends Element>() {
  const ref = useRef<T>(null);
  const [vis, setVis] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || vis) return;
    if (typeof IntersectionObserver === 'undefined') { setVis(true); return; }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) setVis(true); }, { rootMargin: '100px' });
    io.observe(el);
    return () => io.disconnect();
  }, [vis]);
  return [ref, vis] as const;
}

function GooglePhoto({ ph, alt }: { ph: PlacePhoto; alt: string }) {
  const [ref, vis] = useVisible<HTMLDivElement>();
  const q = usePhotoUri(ph.name, 640, vis);
  const ratio = ph.width && ph.height ? `${ph.width} / ${ph.height}` : '4 / 3';
  return (
    <figure className="gphoto" ref={ref} style={{ aspectRatio: ratio }}>
      {q.data?.uri ? <img src={q.data.uri} alt={alt} loading="lazy" decoding="async" referrerPolicy="no-referrer" /> : <span className="tiny muted">{vis ? (q.isError ? 'Photo unavailable' : 'Loading photo…') : ''}</span>}
      {q.data?.uri && ph.authors[0] && (
        <figcaption className="tiny">Photo: {ph.authors[0].uri ? <a href={ph.authors[0].uri} target="_blank" rel="noopener noreferrer">{ph.authors[0].name}</a> : ph.authors[0].name}{ph.googleMapsUri && <> · <a href={ph.googleMapsUri} target="_blank" rel="noopener noreferrer">View on Google Maps</a></>}</figcaption>
      )}
    </figure>
  );
}

function DetailDrawer({ p, tab, badges, trip, onClose, onVeg, onAction }: { p: GuidePlace; tab: GuideTab; badges: { mustSee: boolean; hiddenGem: boolean; editorsPick: boolean }; trip: Trip | null; onClose: () => void; onVeg: (id: string, v: boolean | undefined) => void; onAction: (meal?: MealKind) => void }) {
  const food = isFoodTab(tab);
  const q = usePlaceDetails(p.id, food);
  const d = q.data;
  useEffect(() => { if (d && food) onVeg(p.id, d.veg); }, [d, food, p.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Modal title={p.name} onClose={onClose} wide>
      <div className="row between"><h2>{p.name}</h2><GoogleAttribution /></div>
      <div className="row" style={{ gap: 6 }}>
        {badges.mustSee && <span className="tag t">Must-see</span>}{badges.hiddenGem && <span className="tag f">Hidden gem</span>}{badges.editorsPick && <span className="tag">Editor’s pick</span>}
        {p.rating != null && <span className="small">★ {p.rating.toFixed(1)} from {(p.userRatingCount || 0).toLocaleString('en-IN')} reviews</span>}
      </div>
      {q.isLoading ? <p className="muted small">Loading details…</p> : q.isError || !d ? <p className="muted small">Details aren’t available right now.</p> : (
        <div className="gbox grid" style={{ gap: 12 }}>
          {d.photos.length > 0 && <div className="gphotos">{d.photos.slice(0, 4).map((ph, i) => <GooglePhoto key={ph.name} ph={ph} alt={`${p.name}, photo ${i + 1}`} />)}</div>}
          {d.summary && <p>{d.summary}</p>}
          <dl className="kv">
            {d.address && <><dt>Address</dt><dd>{d.address}</dd></>}
            {d.phone && <><dt>Phone</dt><dd><a href={`tel:${(d.phoneIntl || d.phone).replace(/\s/g, '')}`}>{d.phone}</a></dd></>}
            {d.website && <><dt>Website</dt><dd><a href={d.website} target="_blank" rel="noopener noreferrer">{new URL(d.website).hostname.replace(/^www\./, '')}</a></dd></>}
            {food && <><dt>Vegetarian</dt><dd>{d.veg === true ? 'Serves vegetarian food' : d.veg === false ? 'Not listed as serving vegetarian food' : 'Not stated'}</dd></>}
            {d.wheelchair != null && <><dt>Wheelchair</dt><dd>{d.wheelchair ? 'Accessible entrance' : 'Entrance not accessible'}</dd></>}
          </dl>
          {d.weekdayHours && (
            <div><b className="small">Opening hours</b><ul className="small" style={{ margin: '6px 0 0', paddingLeft: 18 }}>{d.weekdayHours.map((h) => <li key={h}>{h}</li>)}</ul></div>
          )}
          {d.googleMapsUri && <p className="small"><a href={d.googleMapsUri} target="_blank" rel="noopener noreferrer">View on Google Maps</a></p>}
        </div>
      )}
      <div className="row">
        {tab !== 'hotels' && <button type="button" className="btn pri" onClick={() => onAction()} disabled={!trip}>Add to day…</button>}
        {food && (['breakfast', 'lunch', 'dinner'] as MealKind[]).map((m) => <button key={m} type="button" className="btn" disabled={!trip} onClick={() => onAction(m)}>Add as {m}</button>)}
        <button type="button" className="btn ghost" onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------------------------------ dialogs */

function AddToDayDialog({ trip, p, meal: meal0, destKey, record, day, onClose }: { trip: Trip; p: GuidePlace; meal?: MealKind; destKey: string; record?: DestRecord; day?: number; onClose: () => void }) {
  const [meal, setMeal] = useState<MealKind | ''>(meal0 || '');
  const [di, setDi] = useState(day ?? Math.max(0, trip.plan.findIndex((d) => d.dest === destKey)));
  const suggested = meal ? MEALS[meal].start : startFor(trip, structuredClone(trip.plan[di]), { id: '', pid: null, t: '', cat: 'sight', s: 0, d: 60, c: 0, lat: p.location?.lat ?? null, lng: p.location?.lng ?? null, area: '', dest: destKey, pri: 'nice', n: '', done: false });
  const [time, setTime] = useState<string | null>(null);
  const t = time ?? toHHMM(suggested);
  const add = () => {
    mut(trip.id, (x) => { addLiveToDay(x, p, { destKey, record, di, start: fromHHMM(t), meal: meal || undefined }); },
      `${p.name} added to Day ${di + 1} at ${fmtT(fromHHMM(t))}${meal ? ` as ${meal}` : ''}`, true);
    onClose();
  };
  return (
    <Modal title={`Add ${p.name}`} onClose={onClose}>
      <h2>Add {p.name}</h2>
      <p className="small muted">To “{trip.name}” ({travellers(trip)} traveller{travellers(trip) > 1 ? 's' : ''}). Later items move back if needed; nothing earlier moves.</p>
      <div className="grid g2">
        <label className="f">Day<select value={di} onChange={(e) => { setDi(+e.target.value); setTime(null); }}>{trip.plan.map((d, i) => <option key={i} value={i}>Day {i + 1}{dayDate(trip, i) ? ' · ' + fmtD(dayDate(trip, i)) : ''}{d.label ? ' · ' + d.label : ''}</option>)}</select></label>
        <label className="f">As<select value={meal} onChange={(e) => { setMeal(e.target.value as MealKind | ''); setTime(null); }}><option value="">Activity</option><option value="breakfast">Breakfast</option><option value="lunch">Lunch</option><option value="dinner">Dinner</option></select></label>
        <label className="f">Start time<input type="time" step={300} value={t} onChange={(e) => setTime(e.target.value)} /></label>
      </div>
      <div className="row"><button type="button" className="btn" onClick={onClose}>Cancel</button><button type="button" className="btn pri" onClick={add}>Add to Day {di + 1}</button></div>
    </Modal>
  );
}

function NoTripDialog({ v, onClose }: { v: DestView; onClose: () => void }) {
  return (
    <Modal title="Choose a trip first" onClose={onClose}>
      <h2>Choose a trip first</h2>
      <p>Pick a trip in “Planning for” at the top, or start a new one for {v.name}.</p>
      <div className="row"><button type="button" className="btn" onClick={onClose}>OK</button><Link className="btn pri" to={`/new?dest=${v.key}`}>Plan a {v.name} trip</Link></div>
    </Modal>
  );
}

/* ------------------------------------------------------------------------------------------ areas */

function AreasTab({ v, trip, onGo }: { v: DestView; trip: Trip | null; onGo: (tab: GuideTab, area: string) => void }) {
  const areas = useAreaNames(v);
  const planned = trip ? trip.plan.flatMap((d) => d.items).filter((x) => x.dest === v.key && x.lat != null && x.lng != null) : [];
  const avg = (c: { lat: number; lng: number }) => (planned.length ? planned.reduce((s, x) => s + (km(c, x) || 0), 0) / planned.length : null);
  const rows = (areas.data || []).map((a) => ({ a, d: avg(a.center) })).sort((x, y) => (x.d ?? 1e9) - (y.d ?? 1e9) || x.a.name.localeCompare(y.a.name));
  const best = rows.find((r) => r.d != null);
  if (areas.isLoading) return <p className="muted small">Loading neighbourhoods…</p>;
  if (!rows.length) return <p className="muted small">No neighbourhood data for {v.name}.</p>;
  return (
    <>
      <p className="small muted">{rows.length} areas.{planned.length ? ` Sorted by average straight-line distance to the ${planned.length} mapped stops in ${trip!.name}.` : trip ? '' : ' Choose a trip above to rank areas by distance to your plan.'}</p>
      <div className="lib" style={{ marginTop: 12 }}>
        {rows.map(({ a, d }) => (
          <div className="li" key={a.name}>
            <div>
              <div className="nm">{a.name}{best === rows.find((r) => r.a.name === a.name) && <> <span className="tag f">Closest to your plan</span></>}</div>
              <div className="mt">{a.kind}{d != null ? ` · ${fmtDist(d)} from your stops on average` : ''}</div>
              <div className="row" style={{ gap: 4, marginTop: 6 }}>
                <button type="button" className="btn sm" onClick={() => onGo('hotels', a.name)}>Hotels here</button>
                <button type="button" className="btn sm" onClick={() => onGo('restaurants', a.name)}>Restaurants here</button>
                <button type="button" className="btn sm" onClick={() => onGo('todo', a.name)}>Things to do here</button>
              </div>
            </div>
          </div>
        ))}
      </div>
      {!v.curated && <p className="src" style={{ marginTop: 8 }}>Areas © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a> (ODbL).</p>}
    </>
  );
}
