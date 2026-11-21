// After sign-in: offer to move guest trips (in this browser) into the account.
import { useMemo, useState } from 'react';
import { cloudConfigured } from '../../lib/cloud/client';
import { moveToAccount } from '../../lib/cloud/sync';
import { useAuth } from '../../store/auth';
import { toast } from '../../store/toast';
import { useTrips } from '../../store/trips';

export function MoveTripsBanner() {
  const user = useAuth((s) => s.user);
  const trips = useTrips((s) => s.trips);
  const local = useMemo(() => Object.values(trips).filter((t) => !t.cloud && !(t.sample && !t.touched)), [trips]);
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(false);
  if (!cloudConfigured() || !user || !local.length || hidden) return null;
  return (
    <div className="banner" role="region" aria-label="Move trips to your account">
      <span className="small"><b>{local.length} trip{local.length === 1 ? ' is' : 's are'} only in this browser.</b> Move {local.length === 1 ? 'it' : 'them'} to your account to sync across devices and plan with others.</span>
      <span className="row" style={{ gap: 6 }}>
        <button type="button" className="btn sm pri" disabled={busy} onClick={async () => {
          setBusy(true);
          let n = 0;
          for (const t of local) { try { await moveToAccount(t); n++; } catch { /* reported below */ } }
          setBusy(false);
          toast(n === local.length ? 'Moved to your account' : `Moved ${n} of ${local.length}; the rest stay in this browser`);
        }}>{busy ? 'Moving…' : 'Move my trips to my account'}</button>
        <button type="button" className="btn sm ghost" onClick={() => setHidden(true)}>Not now</button>
      </span>
    </div>
  );
}
