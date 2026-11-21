// Sign-in (Google or email link), profile, the sync boot-up after sign-in, and the "Riya just changed this" dialog.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { cloudConfigured } from '../../lib/cloud/client';
import { loadAccountTrips, resolveConflict, stopAll, useCloud, wireSync, type Conflict } from '../../lib/cloud/sync';
import { useAuth } from '../../store/auth';
import { toast } from '../../store/toast';
import { setReadOnlyNotice } from '../../store/trips';
import { Modal } from '../Modal';

/** Mounted once: restores the session, loads account trips and starts live sync. */
export function CloudBoot() {
  const user = useAuth((s) => s.user?.id);
  useEffect(() => {
    if (!cloudConfigured()) return;
    void useAuth.getState().init();
    setReadOnlyNotice(() => toast('You can view this trip, comment and vote. Ask the owner for edit access to change it.'));
  }, []);
  useEffect(() => {
    if (!user) return;
    wireSync();
    void loadAccountTrips();
    return () => { void stopAll(); };
  }, [user]);
  return <ConflictDialog />;
}

export function AccountButton({ compact }: { compact?: boolean }) {
  const { ready, user, profile } = useAuth();
  const [open, setOpen] = useState<'signin' | 'profile' | null>(null);
  if (!cloudConfigured()) return null;
  if (!ready) return null;
  const name = profile?.display_name || user?.email?.split('@')[0] || '';
  return (
    <>
      {user ? (
        <button type="button" className={'acct' + (compact ? ' sm' : '')} onClick={() => setOpen('profile')} aria-label={`Account: ${name}`}>
          {profile?.avatar_url ? <img src={profile.avatar_url} alt="" referrerPolicy="no-referrer" /> : <span className="av" aria-hidden="true">{(name[0] || '?').toUpperCase()}</span>}
          {!compact && <span>{name}</span>}
        </button>
      ) : (
        <button type="button" className={'btn sm' + (compact ? '' : ' pri')} onClick={() => setOpen('signin')}>Sign in</button>
      )}
      {open === 'signin' && <SignInDialog onClose={() => setOpen(null)} />}
      {open === 'profile' && <ProfileDialog onClose={() => setOpen(null)} />}
    </>
  );
}

export function SignInDialog({ onClose, why }: { onClose: () => void; why?: string }) {
  const { signInGoogle, signInEmail } = useAuth();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="Sign in" onClose={onClose}>
      <h2>Sign in</h2>
      <p className="small">{why || 'Sync your trips across devices and plan together with friends. Guest mode keeps working without an account.'}</p>
      <div className="grid" style={{ gap: 10, marginTop: 12 }}>
        <button type="button" className="btn pri" onClick={() => void signInGoogle()}>Continue with Google</button>
        {sent ? <p className="small" role="status">Check your email for a sign-in link. You can close this.</p> : (
          <form className="grid" style={{ gap: 8 }} onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try { await signInEmail(email.trim()); setSent(true); } catch (x) { toast(x instanceof Error ? x.message : 'Couldn’t send the link'); } finally { setBusy(false); }
          }}>
            <label className="f">Or get a sign-in link by email<input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
            <button type="submit" className="btn" disabled={busy}>Email me a link</button>
          </form>
        )}
        <p className="tiny muted">By signing in you agree to the <Link to="/terms" onClick={onClose}>terms</Link>. See the <Link to="/privacy" onClick={onClose}>privacy policy</Link> for what’s stored.</p>
      </div>
    </Modal>
  );
}

function ProfileDialog({ onClose }: { onClose: () => void }) {
  const { profile, user, saveProfile, signOut } = useAuth();
  const [f, setF] = useState({ display_name: profile?.display_name || '', upi_id: profile?.upi_id || '', phone: profile?.phone || '', share_contact: !!profile?.share_contact });
  return (
    <Modal title="Your profile" onClose={onClose}>
      <form className="grid" style={{ gap: 10 }} onSubmit={async (e) => {
        e.preventDefault();
        try {
          await saveProfile({ display_name: f.display_name.trim().slice(0, 80), upi_id: f.upi_id.trim() || null, phone: f.phone.trim() || null, share_contact: f.share_contact });
          toast('Profile saved');
          onClose();
        } catch { toast('Check the UPI ID (name@bank) and phone number'); }
      }}>
        <h2>Your profile</h2>
        <p className="small muted">{user?.email}</p>
        <label className="f">Name<input type="text" value={f.display_name} maxLength={80} onChange={(e) => setF({ ...f, display_name: e.target.value })} /></label>
        <label className="f">UPI ID (optional)<input type="text" placeholder="name@bank" value={f.upi_id} onChange={(e) => setF({ ...f, upi_id: e.target.value })} /></label>
        <label className="f">Phone (optional)<input type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></label>
        <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={f.share_contact} onChange={(e) => setF({ ...f, share_contact: e.target.checked })} />Show my UPI ID and phone to people in my trips</label>
        <div className="row">
          <button type="submit" className="btn pri">Save</button>
          <button type="button" className="btn ghost" onClick={() => { void signOut(); onClose(); toast('Signed out. Trips in your account stay there.'); }}>Sign out</button>
        </div>
      </form>
    </Modal>
  );
}

const show = (v: unknown) => (v == null || v === '' ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v));
const FIELD: Record<string, string> = { title: 'Title', start_min: 'Start (minutes)', dur: 'Duration (minutes)', note: 'Note', day_id: 'Day', cost: 'Cost', locked: 'Locked', done: 'Done', price: 'Price', status: 'Status', name: 'Name', amount: 'Amount', description: 'Description' };

function ConflictDialog() {
  const x = useCloud((s) => s.conflicts[0]) as Conflict | undefined;
  const [pick, setPick] = useState<Record<string, 'mine' | 'theirs'>>({});
  if (!x) return null;
  return (
    <Modal title="Someone else changed this" onClose={() => void resolveConflict(x, 'theirs')}>
      <h2>{x.by || 'Someone'} just changed this</h2>
      <p className="small">“{x.label}” was changed while you were editing it.</p>
      <table className="cmp" style={{ marginTop: 10 }}>
        <thead><tr><th>Field</th><th>Theirs</th><th>Yours</th></tr></thead>
        <tbody>{x.fields.map((f) => (
          <tr key={f.field}><th scope="row">{FIELD[f.field] || f.field}</th>
            <td><label className="row small" style={{ gap: 6 }}><input type="radio" name={f.field} checked={(pick[f.field] || 'theirs') === 'theirs'} onChange={() => setPick({ ...pick, [f.field]: 'theirs' })} />{show(f.theirs)}</label></td>
            <td><label className="row small" style={{ gap: 6 }}><input type="radio" name={f.field} checked={pick[f.field] === 'mine'} onChange={() => setPick({ ...pick, [f.field]: 'mine' })} />{show(f.mine)}</label></td></tr>
        ))}</tbody>
      </table>
      <div className="row" style={{ marginTop: 12 }}>
        <button type="button" className="btn" onClick={() => void resolveConflict(x, 'theirs')}>Keep theirs</button>
        <button type="button" className="btn" onClick={() => void resolveConflict(x, 'mine')}>Keep mine</button>
        <button type="button" className="btn pri" onClick={() => void resolveConflict(x, pick)}>Merge fields</button>
      </div>
    </Modal>
  );
}
