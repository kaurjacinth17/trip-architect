// /join/:token  Accept an invite: sign in if needed, join, open the trip.
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { SignInDialog } from '../components/cloud/Account';
import { authedPost, cloudConfigured } from '../lib/cloud/client';
import { loadTrip } from '../lib/cloud/sync';
import { useTitle } from '../lib/hooks';
import { useAuth } from '../store/auth';

export default function Join() {
  useTitle('Join a trip');
  const { token = '' } = useParams();
  const { ready, user } = useAuth();
  const nav = useNavigate();
  const [err, setErr] = useState<string | null>(null);
  const [signin, setSignin] = useState(false);
  useEffect(() => {
    if (!ready || !user || err) return;
    authedPost<{ tripId: string; role: 'owner' | 'editor' | 'viewer' }>('/api/invites/redeem', { token })
      .then(async (r) => { await loadTrip(r.tripId, r.role); nav(`/trips/${r.tripId}/overview`, { replace: true }); })
      .catch((e) => setErr(e instanceof Error ? e.message : 'This invite didn’t work'));
  }, [ready, user, token]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!cloudConfigured()) return <div className="card"><h1>Accounts aren’t set up here</h1><p>This copy of Trip Architect runs in guest mode only.</p><Link to="/">Go home</Link></div>;
  return (
    <div className="card grid" style={{ gap: 10, maxWidth: 560 }}>
      <h1>You’re invited to a trip</h1>
      {err ? <><p role="alert">{err}</p><Link className="btn" to="/trips">My trips</Link></>
        : !ready ? <p className="muted" role="status">Checking your account…</p>
        : !user ? <><p>Sign in to join. It’s free, and your own trips stay as they are.</p><div><button type="button" className="btn pri" onClick={() => setSignin(true)}>Sign in to join</button></div></>
        : <p className="muted" role="status">Joining…</p>}
      {signin && <SignInDialog onClose={() => setSignin(false)} why="Sign in to join this trip." />}
    </div>
  );
}
