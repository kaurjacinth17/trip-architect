import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { TripCard } from '../components/Cards';
import { useTitle } from '../lib/hooks';
import { toast } from '../store/toast';
import { tripList, useTrips } from '../store/trips';

export function Trips() {
  useTitle('My trips');
  const trips = useTrips((s) => s.trips);
  const ts = tripList(trips);
  const nav = useNavigate();
  const [text, setText] = useState('');

  const doImport = (raw: string) => {
    try {
      const t = useTrips.getState().importTrip(raw);
      nav(`/trips/${t.id}/overview`);
      toast('Trip imported');
    } catch {
      toast('That doesn’t look like a Trip Architect file');
    }
  };

  return (
    <>
      <div className="row between"><h1>My trips</h1><Link className="btn pri" to="/new">Create a new trip</Link></div>
      <div className="grid auto" style={{ marginTop: 20 }}>
        {ts.length ? ts.map((t) => <TripCard key={t.id} t={t} />) : <div className="empty">No trips yet.</div>}
      </div>
      <section className="sec card grid" style={{ gap: 10 }}>
        <h3>Import a saved trip</h3>
        <p className="small muted">Choose a trip file exported from Share, or paste its contents.</p>
        <input type="file" accept=".json,application/json" aria-label="Trip file" onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          f.text().then(doImport);
          e.target.value = '';
        }} />
        <textarea aria-label="Trip data" placeholder="…or paste trip data here" value={text} onChange={(e) => setText(e.target.value)} />
        <div><button type="button" className="btn" onClick={() => doImport(text)}>Import pasted data</button></div>
      </section>
    </>
  );
}
