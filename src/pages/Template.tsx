// /template#<data>  A published itinerary (no expenses or personal data). "Use this itinerary" makes your own copy
// with your dates and travellers.
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { routeName } from '../engine/dest';
import { fromTemplate } from '../engine/extras';
import { decodeShare, normaliseTrip } from '../engine/share';
import { fmtT } from '../engine/time';
import { plural, todayISO } from '../engine/util';
import { useTitle } from '../lib/hooks';
import { toast } from '../store/toast';
import { useTrips } from '../store/trips';

export default function Template() {
  const nav = useNavigate();
  const tpl = useMemo(() => { try { return normaliseTrip(decodeShare(location.hash)); } catch { return null; } }, []);
  useTitle(tpl ? `${tpl.name} (template)` : 'Template');
  const [start, setStart] = useState('');
  const [n, setN] = useState(2);
  if (!tpl) return <div className="card"><h1>This template link is incomplete</h1><p>Ask for the link again.</p><Link className="btn" to="/">Go home</Link></div>;
  return (
    <>
      <span className="kicker">Itinerary template · {routeName(tpl)}</span>
      <h1 style={{ marginTop: 4 }}>{tpl.name}</h1>
      <p className="muted">{plural(tpl.plan.length, 'day')}. A read-only plan someone shared; make it yours with your own dates.</p>
      <form className="card row sec" style={{ gap: 10, alignItems: 'end' }} onSubmit={(e) => {
        e.preventDefault();
        const t = useTrips.getState().add(fromTemplate(tpl, { start, travelers: Array.from({ length: n }, (_, i) => (i ? `Traveller ${i + 1}` : 'You')) }));
        toast('Your copy is ready');
        nav(`/trips/${t.id}/overview`);
      }}>
        <label className="f">Start date<input type="date" min={todayISO()} value={start} onChange={(e) => setStart(e.target.value)} /></label>
        <label className="f">Travellers<input type="number" min={1} max={20} value={n} onChange={(e) => setN(Math.max(1, Math.min(20, +e.target.value || 1)))} /></label>
        <button type="submit" className="btn pri">Use this itinerary</button>
      </form>
      {tpl.plan.map((d, i) => (
        <section key={i} className="sec">
          <h2>Day {i + 1}{d.label ? ` · ${d.label}` : ''}</h2>
          <ul className="xlist">{[...d.items].sort((a, b) => a.s - b.s).map((x) => <li key={x.id} className="xrow"><span><b>{fmtT(x.s)}</b> {x.t || 'Saved place'}</span></li>)}</ul>
        </section>
      ))}
    </>
  );
}
