// Members and invites for a shared trip (Share tab). The owner invites by link or email, sets roles and removes
// people; everyone links themselves to a traveller so expenses and packing know who they are.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { SignInDialog } from '../../components/cloud/Account';
import { authedPost, cloudConfigured, sb } from '../../lib/cloud/client';
import { loadMembers, moveToAccount, NONE, useCloud } from '../../lib/cloud/sync';
import type { Trip } from '../../engine/types';
import { copyText } from '../../lib/browser';
import { useAuth } from '../../store/auth';
import { toast } from '../../store/toast';
import { useNavigate } from 'react-router-dom';

interface InviteRow { id: string; role: string; email: string | null; expires_at: string; max_uses: number; uses: number; revoked_at: string | null }

export function People({ t }: { t: Trip }) {
  const user = useAuth((s) => s.user);
  const [signin, setSignin] = useState(false);
  const nav = useNavigate();
  if (!cloudConfigured()) return null;
  if (!user || !t.cloud) {
    return (
      <div className="card grid" style={{ gap: 8 }}>
        <h3>Plan together</h3>
        <p className="small">Invite friends to edit this trip with you, live: comments, votes, polls and shared expenses.</p>
        {!user ? <div><button type="button" className="btn pri" onClick={() => setSignin(true)}>Sign in to invite people</button></div>
          : <div><button type="button" className="btn pri" onClick={async () => {
            try { const id = await moveToAccount(t); toast('Moved to your account'); nav(`/trips/${id}/share`, { replace: true }); } catch (e) { toast(e instanceof Error ? e.message : 'Couldn’t move it'); }
          }}>Move this trip to my account</button></div>}
        {signin && <SignInDialog onClose={() => setSignin(false)} why="Sign in to invite people to this trip." />}
      </div>
    );
  }
  return <Members t={t} />;
}

function Members({ t }: { t: Trip }) {
  const me = useAuth((s) => s.user?.id);
  const people = useCloud((s) => s.members[t.id] || NONE);
  const owner = t.cloud?.role === 'owner';
  const qc = useQueryClient();
  const invites = useQuery({
    queryKey: ['invites', t.id], enabled: owner,
    queryFn: async () => ((await (await sb())!.from('invites').select('id,role,email,expires_at,max_uses,uses,revoked_at').eq('trip_id', t.id).order('created_at', { ascending: false })).data || []) as InviteRow[],
  });
  const [f, setF] = useState({ role: 'editor' as 'editor' | 'viewer', days: 7, maxUses: 10, email: '' });
  const [link, setLink] = useState<string | null>(null);
  const update = async (body: Record<string, unknown>, msg: string) => {
    try { await authedPost('/api/members/update', { tripId: t.id, ...body }); await loadMembers(t.id); toast(msg); } catch (e) { toast(e instanceof Error ? e.message : 'Couldn’t change that'); }
  };
  return (
    <div className="card grid" style={{ gap: 10 }}>
      <h3>People</h3>
      <ul className="xlist">
        {people.map((p) => (
          <li key={p.user_id} className="xrow">
            <span className="row" style={{ gap: 8 }}>
              {p.avatar_url ? <img className="pav" src={p.avatar_url} alt="" referrerPolicy="no-referrer" /> : <span className="pav" aria-hidden="true">{p.display_name[0]?.toUpperCase()}</span>}
              <span><b>{p.display_name || 'Someone'}</b>{p.user_id === me ? ' (you)' : ''}<br /><span className="tiny muted">{p.role}</span></span>
            </span>
            <span className="row" style={{ gap: 6 }}>
              {(p.user_id === me || owner) && (
                <label className="row tiny" style={{ gap: 4 }}>Traveller
                  <select value={p.traveller_index ?? ''} style={{ width: 'auto' }} onChange={(e) => void update({ userId: p.user_id, travellerIndex: e.target.value === '' ? null : +e.target.value }, 'Saved')}>
                    <option value="">—</option>{t.travelers.map((x, i) => <option key={i} value={i}>{x}</option>)}
                  </select>
                </label>
              )}
              {owner && p.role !== 'owner' && (
                <>
                  <select aria-label={`Role for ${p.display_name}`} value={p.role} style={{ width: 'auto' }} onChange={(e) => void update({ userId: p.user_id, role: e.target.value }, 'Role changed')}>
                    <option value="editor">Can edit</option><option value="viewer">Can view</option>
                  </select>
                  <button type="button" className="btn sm ghost" onClick={() => void update({ userId: p.user_id, remove: true }, `${p.display_name} removed`)}>Remove</button>
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
      {owner && (
        <form className="grid" style={{ gap: 8 }} onSubmit={async (e) => {
          e.preventDefault();
          try {
            const r = await authedPost<{ url: string }>('/api/invites/create', { tripId: t.id, role: f.role, days: f.days, maxUses: f.maxUses, ...(f.email.trim() ? { email: f.email.trim() } : {}) });
            setLink(r.url);
            void qc.invalidateQueries({ queryKey: ['invites', t.id] });
            if (f.email.trim()) location.href = `mailto:${encodeURIComponent(f.email.trim())}?subject=${encodeURIComponent(`Join “${t.name}” on Trip Architect`)}&body=${encodeURIComponent(`Plan this trip with me: ${r.url}`)}`;
          } catch (x) { toast(x instanceof Error ? x.message : 'Couldn’t create the invite'); }
        }}>
          <b className="small">Invite someone</b>
          <div className="grid g3" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))' }}>
            <label className="f">They can<select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as 'editor' | 'viewer' })}><option value="editor">Edit</option><option value="viewer">View, comment and vote</option></select></label>
            <label className="f">Link works for<select value={f.days} onChange={(e) => setF({ ...f, days: +e.target.value })}>{[1, 3, 7, 14, 30].map((d) => <option key={d} value={d}>{d} day{d > 1 ? 's' : ''}</option>)}</select></label>
            <label className="f">Up to<select value={f.maxUses} onChange={(e) => setF({ ...f, maxUses: +e.target.value })}>{[1, 2, 5, 10, 25].map((d) => <option key={d} value={d}>{d} {d > 1 ? 'people' : 'person'}</option>)}</select></label>
            <label className="f">Email (optional)<input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
          </div>
          <div><button type="submit" className="btn pri">{f.email.trim() ? 'Create link and email it' : 'Create invite link'}</button></div>
          {link && <div className="row" style={{ gap: 6 }}><input type="text" readOnly value={link} aria-label="Invite link" onFocus={(e) => e.target.select()} /><button type="button" className="btn" onClick={() => copyText(link, 'Invite link copied')}>Copy</button></div>}
        </form>
      )}
      {owner && (invites.data || []).filter((i) => !i.revoked_at && Date.parse(i.expires_at) > Date.now() && i.uses < i.max_uses).map((i) => (
        <div key={i.id} className="row between small">
          <span>{i.role === 'editor' ? 'Edit' : 'View'} link{i.email ? ` for ${i.email}` : ''} · {i.uses}/{i.max_uses} used · until {new Date(i.expires_at).toLocaleDateString('en-IN')}</span>
          <button type="button" className="btn sm ghost" onClick={async () => { await (await sb())!.from('invites').update({ revoked_at: new Date().toISOString() }).eq('id', i.id); void qc.invalidateQueries({ queryKey: ['invites', t.id] }); toast('Invite withdrawn'); }}>Withdraw</button>
        </div>
      ))}
    </div>
  );
}
