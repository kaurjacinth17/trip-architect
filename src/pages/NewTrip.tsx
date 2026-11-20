import { useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Stepper } from '../components/Inputs';
import { GROUPS, MONTHS, PACE } from '../data/constants';
import { D, DESTS } from '../data/destinations';
import { DestinationSearch } from '../components/DestinationSearch';
import { destName, destView } from '../engine/dest';
import { poolFromLive } from '../engine/livePool';
import { fetchPools } from '../lib/live';
import { useDestCache } from '../store/dests';
import { useState } from 'react';
import { buildTrip, DEFAULT_PREFS, wizardEstimate } from '../engine/generate';
import { seasonOf } from '../engine/season';
import { fmtD, hm } from '../engine/time';
import type { PaceKey, Prefs, Tier } from '../engine/types';
import { inr, plural, r500, sum } from '../engine/util';
import { useTitle } from '../lib/hooks';
import { toast } from '../store/toast';
import { useTrips } from '../store/trips';
import { useUI, type Wizard } from '../store/ui';

const TITLES = ['Where are you going?', 'When are you going?', 'Who is travelling?', 'What kind of trip do you want?', 'What’s the budget?', 'Ready to build'];

export function newWizard(pre: string): Wizard {
  const rec = /^[gc]:/.test(pre) ? useDestCache.getState().records[pre] : undefined;
  const ok = !!(pre && (D[pre] || rec));
  const records = rec ? { [pre]: rec } : {};
  return {
    pre, step: 1, dests: ok ? [pre] : [], records, start: '', days: ok ? (destView({ destRecords: records }, pre)?.days[0] ?? 2) + 1 : 4, group: 'couple', n: 2, names: ['', ''],
    pace: 'balanced', prefs: { ...DEFAULT_PREFS }, bMode: 'total', budget: '', name: '',
  };
}

export function NewTrip() {
  useTitle('Create a new trip');
  const [params] = useSearchParams();
  const pre = params.get('dest') || '';
  const wz = useUI((s) => s.wz);
  const setUI = useUI((s) => s.set);
  const nav = useNavigate();
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!wz || wz.pre !== pre) setUI({ wz: newWizard(pre) });
  }, [pre, wz, setUI]);
  if (!wz || wz.pre !== pre) return null;

  const w = wz;
  const upd = (p: Partial<Wizard>) => setUI({ wz: { ...w, ...p } });
  const st = w.step;
  const names = (n: number) => Array.from({ length: n }, (_, i) => w.names[i] || '');

  const W = { destRecords: w.records };
  const nameOf = (k: string) => destName(W, k);
  const setDests = (dests: string[], records = w.records) =>
    upd({ dests, records, days: dests.length ? Math.max(w.days, Math.min(14, sum(dests, (x) => destView({ destRecords: records }, x)?.days[0] ?? 2))) : w.days });
  const toggleDest = (id: string) => {
    const dests = [...w.dests];
    const i = dests.indexOf(id);
    if (i >= 0) dests.splice(i, 1);
    else dests.push(id);
    setDests(dests);
  };
  const moveStop = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= w.dests.length) return;
    const dests = [...w.dests];
    [dests[i], dests[j]] = [dests[j], dests[i]];
    upd({ dests });
  };

  const create = async () => {
    setCreating(true);
    const travelers = w.names.map((x, i) => x.trim() || (i === 0 ? 'You' : `Traveller ${i + 1}`));
    const b = +w.budget || 0;
    // Live destinations: one Famous and one Restaurants search each (only now, on Create).
    const pools: Record<string, ReturnType<typeof poolFromLive>> = {};
    const lunchPools: Record<string, Awaited<ReturnType<typeof fetchPools>>['restaurants']> = {};
    let liveMissing = false;
    for (const key of w.dests) {
      const v = destView(W, key);
      if (!v || v.kind !== 'google') continue;
      const p = await fetchPools(v);
      if (!p.famous.length) liveMissing = true;
      pools[key] = poolFromLive(key, p.famous);
      lunchPools[key] = p.restaurants;
    }
    const abroad = w.dests.map((k) => destView(W, k)).find((v) => v && !v.inIndia);
    const t = buildTrip({ dests: w.dests, start: w.start, days: w.days, group: w.group, travelers, pace: w.pace, prefs: w.prefs, budgetTotal: w.bMode === 'total' ? b : b * w.n, name: w.name.trim(), destRecords: w.records, pools, lunchPools, currency: abroad?.currency || 'INR' });
    useTrips.getState().add(t);
    setUI({ wz: null, cur: t.id, day: 0, slot: null, ptab: 'checks', mapDay: 'all' });
    setCreating(false);
    nav(`/trips/${t.id}/itinerary`);
    toast(liveMissing ? 'Trip created. Live suggestions weren’t available, so some days start empty: add places from the wishlist or your own.' : 'Trip created. Everything here is editable.');
  };

  let body: React.ReactNode = null;
  if (st === 1) {
    body = (
      <>
        <p className="muted">Pick one destination, or a few for a multi-stop trip. Order matters: you’ll travel in the order you pick.</p>
        <div className="grid auto" style={{ marginTop: 16 }}>
          {DESTS.map((d) => {
            const i = w.dests.indexOf(d.id);
            return (
              <button type="button" key={d.id} className={'opt' + (i >= 0 ? ' on' : '')} aria-pressed={i >= 0} onClick={() => toggleDest(d.id)}>
                <span className="row between"><b>{d.name}</b>{i >= 0 && <span className="tag f">Stop {i + 1}</span>}</span>
                <span className="small muted">{d.tag}</span>
                <span className="tiny muted">{d.days[0]}–{d.days[1]} days · {d.bestFor}</span>
              </button>
            );
          })}
        </div>
        <div className="card" style={{ marginTop: 18 }}>
          <DestinationSearch label="Or search anywhere: any city, town, hill station, island, region or park" exclude={w.dests}
            onPick={(d) => setDests([...w.dests, d.key], d.record ? { ...w.records, [d.key]: d.record } : w.records)} />
        </div>
        {w.dests.length > 0 && (
          <ol className="stops" aria-label="Your route">
            {w.dests.map((k, i) => (
              <li key={k}>
                <span className="tag f">Stop {i + 1}</span> <b>{nameOf(k)}</b>
                <span className="row" style={{ gap: 2, marginLeft: 'auto' }}>
                  <button type="button" className="btn sm icon" aria-label={`Move ${nameOf(k)} earlier`} disabled={i === 0} onClick={() => moveStop(i, -1)}>↑</button>
                  <button type="button" className="btn sm icon" aria-label={`Move ${nameOf(k)} later`} disabled={i === w.dests.length - 1} onClick={() => moveStop(i, 1)}>↓</button>
                  <button type="button" className="btn sm icon" aria-label={`Remove ${nameOf(k)}`} onClick={() => toggleDest(k)}>×</button>
                </span>
              </li>
            ))}
          </ol>
        )}
        <p className="small" style={{ marginTop: 14 }}>Haven’t decided yet? <Link to="/compare">Compare destinations</Link> against what you care about.</p>
      </>
    );
  }
  if (st === 2) {
    const views = w.dests.map((id) => destView(W, id)).filter((v): v is NonNullable<typeof v> => !!v);
    const rec = views.length && views.every((v) => v.daysKnown) ? [sum(views, (v) => v.days[0]), sum(views, (v) => v.days[1])] : null;
    const m = w.start ? new Date(w.start + 'T00:00:00').getMonth() + 1 : 0;
    body = (
      <>
        <div className="grid g2">
          <label className="f">Start date
            <input type="date" value={w.start} onChange={(e) => upd({ start: e.target.value })} />
            <span className="tiny muted">Leave empty if your dates are flexible. Dates unlock weekday and season checks.</span>
          </label>
          <div className="f" style={{ display: 'grid', gap: 6 }}>
            <b className="small">Number of days</b>
            <Stepper value={w.days} onStep={(v) => upd({ days: Math.max(1, Math.min(14, w.days + v)) })} less="Fewer days" more="More days" />
            {rec && <span className="tiny muted">Recommended for this route: {rec[0]}–{rec[1]} days.</span>}
          </div>
        </div>
        {rec && w.days < rec[0] && (
          <div className="warn caution" style={{ marginTop: 14 }}>
            <b>That’s tight</b>
            <p>{w.dests.map(nameOf).join(' + ')} usually needs at least {rec[0]} days. The planner will prioritise must-sees and leave the rest in your wishlist.</p>
          </div>
        )}
        {m > 0 && views.filter((v) => (v.good.length || v.poor.length) && seasonOf(v, m) === 'poor').map((v) => (
          <div className="warn caution" style={{ marginTop: 14 }} key={v.key}>
            <b>{MONTHS[m - 1]} is off-season for {v.name}</b>
            <p>{v.bestTime}</p>
          </div>
        ))}
      </>
    );
  }
  if (st === 3) {
    body = (
      <>
        <div className="grid g3" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))' }}>
          {GROUPS.map(([k, l, n]) => (
            <button type="button" key={k} className={'opt' + (w.group === k ? ' on' : '')} aria-pressed={w.group === k} onClick={() => upd({ group: k, n, names: names(n) })}><b>{l}</b></button>
          ))}
        </div>
        <div className="row" style={{ marginTop: 18 }}>
          <b className="small">Travellers</b>
          <Stepper value={w.n} less="Fewer travellers" more="More travellers" onStep={(v) => {
            const n = Math.max(1, Math.min(12, w.n + v));
            upd({ n, names: names(n), group: n === 1 ? 'solo' : w.group });
          }} />
        </div>
        <div className="grid auto" style={{ marginTop: 14 }}>
          {w.names.map((x, i) => (
            <label className="f" key={i}>Traveller {i + 1} name
              <input type="text" value={x} placeholder={i === 0 ? 'You' : 'Traveller ' + (i + 1)} onChange={(e) => { const nn = [...w.names]; nn[i] = e.target.value; upd({ names: nn }); }} />
            </label>
          ))}
        </div>
        <p className="tiny muted" style={{ marginTop: 8 }}>Names are used for expense splitting. Optional.</p>
      </>
    );
  }
  if (st === 4) {
    const pr = w.prefs;
    const setPref = (k: keyof Prefs, v: number) => upd({ prefs: { ...pr, [k]: k === 'tier' ? (v as Tier) : v } });
    const pair = (k: keyof Prefs, a: string, b: string, min = -2, max = 2, al = `${a} versus ${b}`) => (
      <div className="pair"><span>{a}</span><input type="range" min={min} max={max} step={1} value={pr[k]} aria-label={al} onChange={(e) => setPref(k, +e.target.value)} /><span>{b}</span></div>
    );
    body = (
      <>
        <div className="grid" style={{ gap: 10 }}>
          <b className="small">Pace</b>
          <div className="grid g3">
            {(Object.entries(PACE) as [PaceKey, (typeof PACE)[PaceKey]][]).map(([k, p]) => (
              <button type="button" key={k} className={'opt' + (w.pace === k ? ' on' : '')} aria-pressed={w.pace === k} onClick={() => upd({ pace: k })}>
                <b>{p.l}</b><span className="small muted">About {hm(p.cap)} of activities a day, up to {p.max} stops</span>
              </button>
            ))}
          </div>
        </div>
        <div className="grid card" style={{ gap: 16, marginTop: 18 }}>
          {pair('natureCity', 'Nature', 'City')}
          {pair('sightExp', 'Sightseeing', 'Experiences')}
          {pair('foodShop', 'Food', 'Shopping')}
          {pair('advComfort', 'Adventure', 'Comfort')}
          {pair('tier', 'Budget', 'Luxury', 0, 2, 'Budget versus luxury')}
        </div>
      </>
    );
  }
  if (st === 5) {
    const est = wizardEstimate({ ...w, destRecords: w.records });
    const noBasis = w.dests.map((k) => destView(W, k)).filter((v) => v && !v.cost).map((v) => v!.name);
    body = (
      <div className="grid g2">
        <div className="grid" style={{ gap: 12 }}>
          <div className="row" role="group" aria-label="Budget type">
            <button type="button" className={'chip' + (w.bMode === 'total' ? ' on' : '')} aria-pressed={w.bMode === 'total'} onClick={() => upd({ bMode: 'total' })}>Total budget</button>
            <button type="button" className={'chip' + (w.bMode === 'pp' ? ' on' : '')} aria-pressed={w.bMode === 'pp'} onClick={() => upd({ bMode: 'pp' })}>Per person</button>
          </div>
          <label className="f">{w.bMode === 'total' ? 'Total for the group' : 'Per person'} (₹)
            <input type="number" min={0} step={500} value={w.budget} placeholder={'e.g. ' + (w.bMode === 'total' ? r500(est * 1.2) : r500((est * 1.2) / w.n))} onChange={(e) => upd({ budget: e.target.value })} />
          </label>
          <p className="tiny muted">Optional. You can change it, and every category, later.</p>
        </div>
        <div className="card">
          <span className="small muted">Estimated on-ground cost</span>
          <div className="stat"><b>{inr(est)}</b><span>for {plural(w.n, 'traveller')}, {plural(w.days, 'day')} · {inr(est / w.n)} pp</span></div>
          <p className="tiny muted" style={{ marginTop: 8 }}>Stay, food, local transport, key entry fees, plus a little for shopping and extras. Excludes your train or flight to get there.{noBasis.length ? ` Doesn’t include ${noBasis.join(', ')}: there’s no cost basis yet; add your own figures on its destination page or in the Budget tab.` : ''}</p>
        </div>
      </div>
    );
  }
  if (st === 6) {
    body = (
      <>
        <div className="grid g2">
          <label className="f">Trip name
            <input type="text" value={w.name} placeholder={w.dests.map(nameOf).join(' + ') + ' getaway'} onChange={(e) => upd({ name: e.target.value })} />
          </label>
        </div>
        <dl className="kv" style={{ marginTop: 16, fontSize: 15 }}>
          <dt>Route</dt><dd>{w.dests.map(nameOf).join(' → ') || '—'}</dd>
          <dt>When</dt><dd>{w.start ? fmtD(new Date(w.start + 'T00:00:00')) : 'Flexible'} · {plural(w.days, 'day')}</dd>
          <dt>Who</dt><dd>{GROUPS.find((g) => g[0] === w.group)?.[1]} · {plural(w.n, 'traveller')}</dd>
          <dt>Pace</dt><dd>{PACE[w.pace].l}</dd>
          <dt>Budget</dt><dd>{w.budget ? inr(w.bMode === 'total' ? +w.budget : +w.budget * w.n) + ' total' : 'Not set'}</dd>
        </dl>
        <p className="small muted" style={{ marginTop: 12 }}>You’ll get a starter itinerary, budget categories and a packing list. It’s a starting point: everything stays editable.</p>
      </>
    );
  }
  const can = st !== 1 || w.dests.length > 0;
  const step = (v: number) => { upd({ step: Math.max(1, Math.min(6, st + v)) }); window.scrollTo(0, 0); };

  return (
    <>
      <Link className="small" to="/">← Cancel</Link>
      <h1 style={{ marginTop: 8 }}>Create a new trip</h1>
      <div className="steps" aria-hidden="true">{TITLES.map((_, i) => <i key={i} className={i < st ? 'on' : ''} />)}</div>
      <span className="kicker">Step {st} of 6</span>
      <h2 style={{ margin: '6px 0 16px' }}>{TITLES[st - 1]}</h2>
      {body}
      <div className="row" style={{ marginTop: 26 }}>
        {st > 1 && <button type="button" className="btn" onClick={() => step(-1)}>Back</button>}
        {st < 6
          ? <button type="button" className="btn pri" onClick={() => step(1)} disabled={!can}>Continue</button>
          : <button type="button" className="btn acc" onClick={() => void create()} disabled={!w.dests.length || creating}>{creating ? 'Building your plan…' : 'Create my trip'}</button>}
      </div>
    </>
  );
}
