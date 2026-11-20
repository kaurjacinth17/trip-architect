import { lazy, Suspense, useEffect, useMemo } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Missing } from '../../components/Shell';
import { paceOf } from '../../data/constants';
import { D } from '../../data/destinations';
import { analyzeTrip } from '../../engine/checks';
import { travellers } from '../../engine/schedule';
import { dayDate, fmtD } from '../../engine/time';
import type { Fix, Trip, TripAnalysis } from '../../engine/types';
import { plural, sum } from '../../engine/util';
import { runFix, undoTrip } from '../../lib/actions';
import { useTitle } from '../../lib/hooks';
import { useTrips } from '../../store/trips';
import { useUI } from '../../store/ui';
import { Overview } from './Overview';
import { Budget } from './Budget';
import { Stays } from './Stays';
import { Packing } from './Packing';
import { Share } from './Share';

const Studio = lazy(() => import('./Studio'));
const TripMap = lazy(() => import('./TripMap'));

export const TABS = [['overview', 'Overview'], ['itinerary', 'Itinerary'], ['map', 'Map'], ['budget', 'Budget'], ['stays', 'Stays'], ['packing', 'Packing'], ['share', 'Share']] as const;
export type TabKey = (typeof TABS)[number][0];

export interface TabProps {
  t: Trip;
  A: TripAnalysis;
  fix: (f: Fix) => void;
  goDay: (di: number) => void;
}

export default function TripPage() {
  const { id = '', tab = 'overview' } = useParams();
  const t = useTrips((s) => s.trips[id]);
  const canUndo = useTrips((s) => !!s.undo[id]?.length);
  const enterTrip = useUI((s) => s.enterTrip);
  const nav = useNavigate();
  useTitle(t ? t.name : 'Not found');
  useEffect(() => { if (t) enterTrip(t.id); }, [t, enterTrip]);
  const A = useMemo(() => (t ? analyzeTrip(t) : null), [t]);
  if (!t || !A) return <Missing />;
  if (!TABS.some(([k]) => k === tab)) return <Navigate to={`/trips/${id}/overview`} replace />;

  const goDay = (di: number) => {
    useUI.getState().set({ day: di, slot: null, ptab: 'checks' });
    nav(`/trips/${id}/itinerary`);
  };
  const fix = (f: Fix) => runFix(t.id, f, () => { if (tab !== 'itinerary') nav(`/trips/${id}/itinerary`); });
  const dalerts = sum(A.days, (d) => d.filter((w) => w.lvl === 'alert').length);
  const talerts = A.trip.filter((w) => w.lvl === 'alert').length;
  const props: TabProps = { t, A, fix, goDay };

  return (
    <>
      <div className="row between noprint">
        <Link className="small" to="/trips">← My trips</Link>
        <div className="row" style={{ gap: 6 }}>
          <button type="button" className="btn sm" onClick={() => undoTrip(t.id)} disabled={!canUndo} title="Undo (Ctrl+Z)">Undo</button>
          <Link className="btn sm" to={`/trips/${t.id}/print`}>Print view</Link>
        </div>
      </div>
      <div style={{ marginTop: 10 }}>
        <span className="kicker">{t.dests.map((d) => D[d]?.name).join(' → ')}{t.sample ? ' · sample trip, edit freely' : ''}</span>
        <h1 style={{ marginTop: 4 }}>{t.name}</h1>
        <p className="muted" style={{ marginTop: 6 }}>
          {t.start ? fmtD(dayDate(t, 0)) + ' – ' + fmtD(dayDate(t, t.plan.length - 1)) + ' · ' : 'Flexible dates · '}
          {plural(t.plan.length, 'day')} · {plural(travellers(t), 'traveller')} · {paceOf(t.pace).l} pace
        </p>
      </div>
      <nav className="tabs" aria-label="Trip sections">
        {TABS.map(([k, l]) => (
          <Link key={k} to={`/trips/${t.id}/${k}`} className={tab === k ? 'on' : ''} aria-current={tab === k ? 'page' : undefined}>
            {l}
            {k === 'itinerary' && dalerts > 0 && <span className="cnt" aria-label={`${dalerts} alerts`}>{dalerts}</span>}
            {k === 'overview' && talerts > 0 && <span className="cnt" aria-label={`${talerts} alerts`}>{talerts}</span>}
          </Link>
        ))}
      </nav>
      <Suspense fallback={<p className="muted" role="status">Loading…</p>}>
        {tab === 'overview' && <Overview {...props} />}
        {tab === 'itinerary' && <Studio {...props} />}
        {tab === 'map' && <TripMap {...props} />}
        {tab === 'budget' && <Budget {...props} />}
        {tab === 'stays' && <Stays {...props} />}
        {tab === 'packing' && <Packing {...props} />}
        {tab === 'share' && <Share {...props} />}
      </Suspense>
    </>
  );
}
