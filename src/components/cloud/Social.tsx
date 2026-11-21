// Comments (any block, day, expense or stay), 👍/👎 votes, who's here (presence) and the sync status chip.
import { useState } from 'react';
import { addComment, deleteComment, mentionsIn, resolveComment, tally, useComments, useVotes, vote, type TargetKind, type Vote } from '../../lib/cloud/social';
import { NONE, useCloud } from '../../lib/cloud/sync';
import type { Trip } from '../../engine/types';
import { useAuth } from '../../store/auth';
import { toast } from '../../store/toast';
import { Modal } from '../Modal';

const isCloud = (t: Trip) => !!t.cloud;

export function CommentsButton({ t, kind, id, label }: { t: Trip; kind: TargetKind; id: string; label: string }) {
  const q = useComments(isCloud(t) ? t.id : null);
  const [open, setOpen] = useState(false);
  if (!isCloud(t)) return null;
  const n = (q.data || []).filter((c) => c.target_kind === kind && c.target_id === id && !c.resolved_at).length;
  return (
    <>
      <button type="button" className="btn sm ghost" aria-label={`Comments on ${label}${n ? ` (${n} open)` : ''}`} onClick={() => setOpen(true)}>💬{n ? ` ${n}` : ''}</button>
      {open && <CommentsDrawer t={t} kind={kind} id={id} label={label} onClose={() => setOpen(false)} />}
    </>
  );
}

export function CommentsDrawer({ t, kind, id, label, onClose }: { t: Trip; kind: TargetKind; id: string; label: string; onClose: () => void }) {
  const q = useComments(t.id);
  const people = useCloud((s) => s.members[t.id] || NONE);
  const me = useAuth((s) => s.user?.id);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const list = (q.data || []).filter((c) => c.target_kind === kind && c.target_id === id);
  const name = (uid: string) => people.find((p) => p.user_id === uid)?.display_name || 'Someone';
  const canEdit = t.cloud?.role !== 'viewer';
  return (
    <Modal title={`Comments on ${label}`} onClose={onClose}>
      <h2>Comments</h2>
      <p className="small muted">{label}</p>
      <ul className="xlist" aria-live="polite">
        {list.map((c) => (
          <li key={c.id} className={'xrow' + (c.resolved_at ? ' muted' : '')}>
            <div><b className="small">{name(c.author_id)}</b> <span className="tiny muted">{new Date(c.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}{c.resolved_at ? ' · resolved' : ''}</span>
              <p className="small" style={{ margin: '2px 0 0', whiteSpace: 'pre-wrap' }}>{c.body}</p></div>
            <div className="row" style={{ gap: 4 }}>
              {(c.author_id === me || canEdit) && <button type="button" className="btn sm" onClick={() => void resolveComment(c.id, !c.resolved_at).catch((e) => toast(e.message))}>{c.resolved_at ? 'Reopen' : 'Resolve'}</button>}
              {(c.author_id === me || t.cloud?.role === 'owner') && <button type="button" className="btn sm ghost" aria-label="Delete comment" onClick={() => void deleteComment(c.id).catch((e) => toast(e.message))}>Delete</button>}
            </div>
          </li>
        ))}
        {!list.length && !q.isLoading && <li className="small muted">No comments yet.</li>}
      </ul>
      <form className="grid" style={{ gap: 8, marginTop: 10 }} onSubmit={async (e) => {
        e.preventDefault();
        const b = body.trim();
        if (!b) return;
        setBusy(true);
        try { await addComment(t.id, kind, id, b, mentionsIn(b, people)); setBody(''); } catch (x) { toast(x instanceof Error ? x.message : 'Couldn’t post'); } finally { setBusy(false); }
      }}>
        <label className="f">Add a comment<textarea rows={2} value={body} maxLength={4000} placeholder={people.length > 1 ? `Type @${people.find((p) => p.user_id !== me)?.display_name.split(' ')[0] || 'name'} to mention someone` : ''} onChange={(e) => setBody(e.target.value)} /></label>
        <div className="row"><button type="submit" className="btn pri" disabled={busy || !body.trim()}>Post</button><button type="button" className="btn ghost" onClick={onClose}>Close</button></div>
      </form>
    </Modal>
  );
}

export function VoteButtons({ t, kind, id, label }: { t: Trip; kind: Vote['target_kind']; id: string; label: string }) {
  const q = useVotes(isCloud(t) ? t.id : null);
  const me = useAuth((s) => s.user?.id);
  if (!isCloud(t)) return null;
  const v = tally(q.data, kind, id, me);
  const cast = (x: -1 | 1) => void vote(t.id, kind, id, v.mine === x ? 0 : x).catch((e) => toast(e.message));
  return (
    <span className="row votes" style={{ gap: 2 }}>
      <button type="button" className="btn sm ghost" aria-pressed={v.mine === 1} aria-label={`Vote for ${label} (${v.up})`} onClick={() => cast(1)}>👍 {v.up || ''}</button>
      <button type="button" className="btn sm ghost" aria-pressed={v.mine === -1} aria-label={`Vote against ${label} (${v.down})`} onClick={() => cast(-1)}>👎 {v.down || ''}</button>
    </span>
  );
}

/** Avatars of who else has this trip open, and which day they're on. */
export function PresenceBar({ t }: { t: Trip }) {
  const others = useCloud((s) => s.presence[t.id] || NONE);
  const status = useCloud((s) => s.status[t.id]);
  if (!t.cloud) return null;
  const label = { loading: 'Loading…', synced: 'Saved', saving: 'Saving…', offline: 'Offline', error: 'Not saved' }[status || 'synced'];
  return (
    <div className="row presence" style={{ gap: 6 }} aria-label="Who's here">
      {others.map((p) => (
        <span key={p.uid} className="pav" style={{ borderColor: p.color }} title={`${p.name}${p.day != null ? ` · on Day ${p.day + 1}` : ''}`}>
          {p.avatar ? <img src={p.avatar} alt="" referrerPolicy="no-referrer" /> : <span aria-hidden="true">{p.name[0]?.toUpperCase()}</span>}
          <span className="vh">{p.name}{p.day != null ? `, on Day ${p.day + 1}` : ''}</span>
        </span>
      ))}
      <span className={'tag' + (status === 'error' || status === 'offline' ? ' t' : ' f')} role="status">{t.cloud.role === 'viewer' ? 'View only · ' : ''}{label}</span>
    </div>
  );
}

/** Who else is editing this block right now (for the coloured outline and the soft lock). */
export function useEditingBy(tripId: string, itemId: string) {
  return useCloud((s) => (s.presence[tripId] || []).find((p) => p.editing === itemId) || null);
}
