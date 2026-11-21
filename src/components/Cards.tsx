import { Link, useNavigate } from 'react-router-dom';
import { sceneFor } from '../lib/destScene';
import { readiness } from '../engine/readiness';
import { travellers } from '../engine/schedule';
import { estRange } from '../engine/season';
import { dayDate, fmtD } from '../engine/time';
import type { Dest, Fix, Trip, Warning } from '../engine/types';
import { inr, plural } from '../engine/util';
import { useTrips } from '../store/trips';
import { Scene } from './Scene';
import { D } from '../data/destinations';
import { CoverPhoto, useVisible } from './CoverPhoto';
import { useCover } from '../lib/live';
import { MOODS } from '../data/constants';
import type { PopularDest } from '../data/popular';
import { toast } from '../store/toast';

export function useCompareToggle() {
  const cmp = useTrips((s) => s.compare.cmp);
  const setCompare = useTrips((s) => s.setCompare);
  const toggle = (id: string) =>
    setCompare((c) => {
      const list = [...c.cmp];
      const i = list.indexOf(id);
      if (i >= 0) list.splice(i, 1);
      else {
        if (list.length >= 4) list.shift();
        list.push(id);
      }
      return { ...c, cmp: list };
    });
  return { cmp, toggle };
}

export function DestCard({ d }: { d: Dest }) {
  const nav = useNavigate();
  const { cmp, toggle } = useCompareToggle();
  const [lo, hi] = estRange(d);
  const inCmp = cmp.includes(d.id);
  return (
    <article className="card dcard" onClick={(e) => { if (!(e.target as HTMLElement).closest('a,button')) nav(`/destinations/${d.id}`); }}>
      <div className="art"><CoverPhoto q={`${d.name}, ${d.state}, India`} alt={`${d.name}, ${d.state}`} height={150} fallback={<Scene d={d} h={150} />} /></div>
      <div className="bd">
        <div className="row between">
          <h3><Link to={`/destinations/${d.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>{d.name}</Link></h3>
          <span className="tiny muted">{d.state}</span>
        </div>
        <p className="small muted">{d.tag}</p>
        <dl className="kv">
          <dt>Best for</dt><dd>{d.bestFor}</dd>
          <dt>Ideal stay</dt><dd>{d.days[0]}–{d.days[1]} days</dd>
          <dt>Est. budget</dt><dd>{inr(lo)}–{inr(hi)} pp</dd>
          <dt>Pace</dt><dd>{d.pace}</dd>
          <dt>Planning</dt><dd>{d.ease}</dd>
        </dl>
        <div className="row">
          <button type="button" className={'btn sm' + (inCmp ? ' pri' : '')} aria-pressed={inCmp} onClick={() => toggle(d.id)}>
            {inCmp ? 'In comparison' : 'Compare'}
          </button>
          <Link className="btn sm" to={`/new?dest=${d.id}`}>Plan a trip</Link>
        </div>
      </div>
    </article>
  );
}

/** A popular destination without a hand-written guide: real photo and live guide from Google. */
export function PopularCard({ p }: { p: PopularDest }) {
  const nav = useNavigate();
  const [ref, vis] = useVisible<HTMLElement>();
  const c = useCover(p.q, vis);
  const go = async (sub = '') => {
    const id = c.data?.id ?? (await c.refetch()).data?.id;
    if (id) nav(`/destinations/g:${id}${sub}`);
    else toast('Live place data isn’t available right now; search for it above instead');
  };
  return (
    <article ref={ref} className="card dcard" onClick={(e) => { if (!(e.target as HTMLElement).closest('a,button')) void go(); }}>
      <div className="art"><CoverPhoto q={p.q} alt={`${p.name}, ${p.state}`} height={150} fallback={<div className="cover-ph" />} /></div>
      <div className="bd">
        <div className="row between"><h3>{p.name}</h3><span className="tiny muted">{p.state}</span></div>
        <p className="small muted">{p.tag}</p>
        <div className="row" style={{ gap: 4 }}>{p.moods.map((m) => <span key={m} className="tag">{MOODS.find((x) => x[0] === m)?.[1] || m}</span>)}</div>
        <div className="row">
          <button type="button" className="btn sm" onClick={() => void go()}>Details and plan</button>
          <button type="button" className="btn sm" onClick={() => void go('/guide')}>City Guide</button>
        </div>
      </div>
    </article>
  );
}

export function TripCard({ t }: { t: Trip }) {
  const r = readiness(t);
  const d = sceneFor(t, t.dests[0]);
  return (
    <Link className="card dcard" to={`/trips/${t.id}/overview`} style={{ textDecoration: 'none', color: 'inherit' }}>
      <div className="art" style={{ height: 110 }}><CoverPhoto q={`${d?.name || t.name}${t.destRecords?.[t.dests[0]]?.region ? ', ' + t.destRecords[t.dests[0]].region : D[t.dests[0]] ? ', ' + D[t.dests[0]].state : ''}, India`} alt={t.name} height={110} fallback={d ? <Scene d={d} h={140} /> : <div className="cover-ph" />} /></div>
      <div className="bd">
        <div className="row between"><h3>{t.name}</h3>{t.sample && <span className="tag">Sample</span>}</div>
        <span className="small muted">{t.start ? fmtD(dayDate(t, 0)) + ' · ' : ''}{plural(t.plan.length, 'day')} · {plural(travellers(t), 'traveller')}</span>
        <div className="row small" style={{ gap: 8 }}>
          <div className="meter" style={{ flex: 1 }}><i style={{ width: r.all + '%' }} /></div>
          <b>{r.all}% ready</b>
        </div>
        {r.A.count.alert > 0 && <span className="small" style={{ color: 'var(--alert)', fontWeight: 700 }}>{plural(r.A.count.alert, 'issue')} to fix</span>}
      </div>
    </Link>
  );
}

const TAB_PATH = { budget: 'budget', stays: 'stays' } as const;

export function WarningCard({ w, tripId, showDay, onFix, onGoDay }: {
  w: Warning;
  tripId: string;
  showDay?: number | null;
  onFix: (f: Fix) => void;
  onGoDay?: (di: number) => void;
}) {
  const hasRow = w.fix || w.tab || showDay != null;
  return (
    <div className={'warn ' + w.lvl}>
      <b>{w.title}</b>
      <p>{w.body}</p>
      {hasRow && (
        <div className="row" style={{ gap: 6 }}>
          {w.fix && <button type="button" className="btn sm" onClick={() => onFix(w.fix!)}>{w.fix.l}</button>}
          {w.tab && <Link className="btn sm" to={`/trips/${tripId}/${TAB_PATH[w.tab]}`}>Open {w.tab}</Link>}
          {showDay != null && onGoDay && <button type="button" className="btn sm ghost" onClick={() => onGoDay(showDay)}>Go to Day {showDay + 1}</button>}
        </div>
      )}
    </div>
  );
}
