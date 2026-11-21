// "Where are you staying?" Each day starts and ends at the hotel for that night (until check-out), so routes and
// travel times need it. Shown on the Itinerary and Map when a night has no stay with a location.
import { Link } from 'react-router-dom';
import { destName } from '../../engine/dest';
import { stayForNight, tripNights } from '../../engine/stays';
import type { Trip } from '../../engine/types';

export function StayPrompt({ t, di }: { t: Trip; di: number }) {
  const day = t.plan[di];
  if (!day || day.startLoc?.kind === 'point' || day.endLoc?.kind === 'point') return null;
  const night = Math.min(di, tripNights(t) - 1);
  if (stayForNight(t, night) || stayForNight(t, di - 1)) return null;
  const name = destName(t, day.dest);
  return (
    <div className="banner stayprompt" role="note">
      <span className="small"><b>Where are you staying in {name}?</b> Each day starts and ends at your hotel until check-out, so routes and travel times start from there.</span>
      <span className="row" style={{ gap: 6 }}>
        <Link className="btn sm pri" to={`/destinations/${day.dest}/guide?tab=hotels&trip=${t.id}`}>Find a hotel</Link>
        <Link className="btn sm" to={`/trips/${t.id}/stays`}>I’ve booked one</Link>
      </span>
    </div>
  );
}
