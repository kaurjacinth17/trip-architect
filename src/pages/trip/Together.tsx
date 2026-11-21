// Together tab (shared trips): polls, the activity feed and open comments.
// Poll options link to a wishlist item, a saved stay, a Google place ID (name shown live) or free text, and one
// click turns the winner into an itinerary block or the stay.
import { useState } from 'react';
import { Modal } from '../../components/Modal';
import { closePoll, createPoll, deletePoll, describeActivity, revertActivity, useActivity, useComments, usePolls, useVotes, vote, winner, type Poll, type PollOption } from '../../lib/cloud/social';
import { NONE, useCloud } from '../../lib/cloud/sync';
import { customItem, placeOnDay, pullItem } from '../../engine/schedule';
import { defaultNights, setStayNights } from '../../engine/stays';
import { dayDate, fmtD } from '../../engine/time';
import type { Trip } from '../../engine/types';
import { mut } from '../../lib/actions';
import { useAuth } from '../../store/auth';
import { toast } from '../../store/toast';
import type { TabProps } from './TripPage';

const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

/** What an option points at, for display and for turning a winner into a plan change. */
function optionTarget(t: Trip, o: PollOption) {
  const [k, id] = (o.place_id || '').split(':');
  if (k === 'item') { const x = t.wish.find((w) => w.id === id) || t.plan.flatMap((d) => d.items).find((w) => w.id === id); return { kind: 'item' as const, id, name: x?.t || o.label }; }
  if (k === 'stay') { const s = t.stays.find((x) => x.id === id); return { kind: 'stay' as const, id, name: s?.name || o.label }; }
  return { kind: 'text' as const, id: '', name: o.label };
}

export function Together({ t }: TabProps) {
  if (!t.cloud) return <p className="muted">Polls, comments and the activity feed are for trips shared from an account. Open Share to invite people.</p>;
  return (
    <>
      <Polls t={t} />
      <OpenComments t={t} />
      <ActivityFeed t={t} />
    </>
  );
}

function Polls({ t }: { t: Trip }) {
  const q = usePolls(t.id);
  const votes = useVotes(t.id);
  const me = useAuth((s) => s.user?.id);
  const [create, setCreate] = useState(false);
  const [applyFor, setApplyFor] = useState<{ poll: Poll; o: PollOption } | null>(null);
  const canEdit = t.cloud?.role !== 'viewer';
  const polls = q.data?.polls || [], options = q.data?.options || [];
  return (
    <section className="sec">
      <div className="row between"><h2>Polls</h2>{canEdit && <button type="button" className="btn pri" onClick={() => setCreate(true)}>New poll</button>}</div>
      {!polls.length && <p className="small muted" style={{ marginTop: 8 }}>No polls yet. Ask “Which hotel?” or “Dinner Saturday?” and let everyone vote.</p>}
      <div className="grid g2" style={{ marginTop: 10 }}>
        {polls.map((p) => {
          const os = options.filter((o) => o.poll_id === p.id);
          const closed = !!p.closed_at || (p.closes_at != null && Date.parse(p.closes_at) < Date.now());
          const count = (o: PollOption) => (votes.data || []).filter((v) => v.poll_id === p.id && v.target_id === o.id).length;
          const mineV = (votes.data || []).find((v) => v.poll_id === p.id && v.user_id === me)?.target_id;
          const win = p.winner_option_id ? os.find((o) => o.id === p.winner_option_id) || null : closed ? winner(options, votes.data, p.id) : null;
          return (
            <div key={p.id} className="card grid" style={{ gap: 8 }}>
              <b>{p.question}</b>
              <span className="tiny muted">{closed ? 'Closed' : p.closes_at ? `Closes ${when(p.closes_at)}` : 'Open'}</span>
              {os.map((o) => (
                <label key={o.id} className="row between small" style={{ gap: 8 }}>
                  <span className="row" style={{ gap: 6 }}>
                    <input type="radio" name={'poll-' + p.id} disabled={closed} checked={mineV === o.id} onChange={() => void vote(t.id, 'poll_option', o.id, 1, p.id).catch((e) => toast(e.message))} />
                    {optionTarget(t, o).name}{win?.id === o.id && <span className="tag f">Winner</span>}
                  </span>
                  <b>{count(o)}</b>
                </label>
              ))}
              {canEdit && (
                <div className="row" style={{ gap: 6 }}>
                  {!p.closed_at && <button type="button" className="btn sm" onClick={() => void closePoll(p, winner(options, votes.data, p.id)).catch((e) => toast(e.message))}>Close poll</button>}
                  {win && <button type="button" className="btn sm pri" onClick={() => setApplyFor({ poll: p, o: win })}>{optionTarget(t, win).kind === 'stay' ? 'Make it our stay' : 'Add winner to the plan'}</button>}
                  <button type="button" className="btn sm ghost" onClick={() => void deletePoll(p.id)}>Delete</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {create && <NewPoll t={t} onClose={() => setCreate(false)} />}
      {applyFor && <ApplyWinner t={t} o={applyFor.o} onClose={() => setApplyFor(null)} />}
    </section>
  );
}

function NewPoll({ t, onClose }: { t: Trip; onClose: () => void }) {
  const [kind, setKind] = useState<Poll['kind']>('item');
  const [question, setQuestion] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [free, setFree] = useState(['', '']);
  const [closes, setCloses] = useState('');
  const choices = kind === 'item' ? t.wish.map((w) => ({ key: 'item:' + w.id, name: w.t })) : kind === 'stay' ? t.stays.map((s) => ({ key: 'stay:' + s.id, name: s.name })) : [];
  const options = [
    ...choices.filter((c) => picked.includes(c.key)).map((c) => ({ place_id: c.key, label: c.name && !t.wish.find((w) => 'item:' + w.id === c.key)?.gid && !t.stays.find((s) => 'stay:' + s.id === c.key)?.gid ? c.name.slice(0, 200) : kind === 'stay' ? 'Saved hotel' : 'Saved place' })),
    ...free.map((x) => x.trim()).filter(Boolean).map((label) => ({ label: label.slice(0, 200), place_id: null })),
  ];
  return (
    <Modal title="New poll" onClose={onClose}>
      <form className="grid" style={{ gap: 10 }} onSubmit={async (e) => {
        e.preventDefault();
        if (options.length < 2) { toast('Add at least two options'); return; }
        try { await createPoll(t.id, { question: question.trim(), kind, closesAt: closes ? new Date(closes).toISOString() : undefined, options }); onClose(); } catch (x) { toast(x instanceof Error ? x.message : 'Couldn’t create the poll'); }
      }}>
        <h2>New poll</h2>
        <label className="f">Question<input type="text" required maxLength={300} value={question} placeholder={kind === 'stay' ? 'Which hotel?' : 'Dinner Saturday?'} onChange={(e) => setQuestion(e.target.value)} /></label>
        <label className="f">About<select value={kind} onChange={(e) => { setKind(e.target.value as Poll['kind']); setPicked([]); }}><option value="item">Places (from the wishlist or typed)</option><option value="stay">Stays</option><option value="other">Anything else</option></select></label>
        {choices.length > 0 && (
          <fieldset className="grid" style={{ gap: 4, border: 0, padding: 0, margin: 0 }}>
            <legend className="small" style={{ fontWeight: 700 }}>Options from this trip</legend>
            {choices.map((c) => <label key={c.key} className="row small" style={{ gap: 6 }}><input type="checkbox" checked={picked.includes(c.key)} onChange={(e) => setPicked(e.target.checked ? [...picked, c.key] : picked.filter((k) => k !== c.key))} />{c.name}</label>)}
          </fieldset>
        )}
        <fieldset className="grid" style={{ gap: 4, border: 0, padding: 0, margin: 0 }}>
          <legend className="small" style={{ fontWeight: 700 }}>Other options</legend>
          {free.map((x, i) => <input key={i} type="text" aria-label={`Option ${i + 1}`} value={x} maxLength={200} onChange={(e) => setFree(free.map((y, k) => (k === i ? e.target.value : y)))} />)}
          <button type="button" className="linkish tiny" style={{ justifySelf: 'start' }} onClick={() => setFree([...free, ''])}>Add an option</button>
        </fieldset>
        <label className="f">Closes (optional)<input type="datetime-local" value={closes} onChange={(e) => setCloses(e.target.value)} /></label>
        <div className="row"><button type="button" className="btn" onClick={onClose}>Cancel</button><button type="submit" className="btn pri">Create poll</button></div>
      </form>
    </Modal>
  );
}

function ApplyWinner({ t, o, onClose }: { t: Trip; o: PollOption; onClose: () => void }) {
  const tg = optionTarget(t, o);
  const [di, setDi] = useState(0);
  if (tg.kind === 'stay') {
    const s = t.stays.find((x) => x.id === tg.id);
    return (
      <Modal title="Make it our stay" onClose={onClose}>
        <h2>Make {tg.name} our stay</h2>
        <p className="small">Sets it as the stay for its destination’s nights and adds locked check-in and check-out blocks.</p>
        <div className="row"><button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn pri" disabled={!s} onClick={() => { const [a, b] = defaultNights(t, s!.dest); mut(t.id, (tt) => { setStayNights(tt, s!.id, a, b); }, `${tg.name} is the stay for nights ${a + 1}–${b + 1}`, true); onClose(); }}>Set nights {s ? defaultNights(t, s.dest).map((x) => x + 1).join('–') : ''}</button></div>
      </Modal>
    );
  }
  return (
    <Modal title="Add the winner" onClose={onClose}>
      <h2>Add “{tg.name}”</h2>
      <label className="f">To<select value={di} onChange={(e) => setDi(+e.target.value)}>{t.plan.map((_, i) => <option key={i} value={i}>Day {i + 1}{dayDate(t, i) ? ' · ' + fmtD(dayDate(t, i)) : ''}</option>)}</select></label>
      <div className="row" style={{ marginTop: 10 }}><button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="button" className="btn pri" onClick={() => {
          mut(t.id, (tt) => {
            const wi = tg.kind === 'item' ? tt.wish.findIndex((w) => w.id === tg.id) : -1;
            const x = wi >= 0 ? tt.wish.splice(wi, 1)[0] : tg.kind === 'item' ? pullItem(tt, tg.id)?.x ?? null : null;
            placeOnDay(tt, di, x || customItem({ t: tg.name, cat: 'custom', dest: tt.plan[di].dest }));
          }, `Added to Day ${di + 1}`, true);
          onClose();
        }}>Add to Day {di + 1}</button></div>
    </Modal>
  );
}

function OpenComments({ t }: { t: Trip }) {
  const q = useComments(t.id);
  const people = useCloud((s) => s.members[t.id] || NONE);
  const open = (q.data || []).filter((c) => !c.resolved_at);
  if (!open.length) return null;
  const where = (k: string, id: string) => k === 'item' ? t.plan.flatMap((d) => d.items).concat(t.wish).find((x) => x.id === id)?.t || 'a block' : k === 'day' ? `Day ${Number(id.replace(/^d/, '')) + 1}` : k === 'expense' ? t.expenses.find((e) => e.id === id)?.note || 'an expense' : k === 'stay' ? t.stays.find((s) => s.id === id)?.name || 'a stay' : 'the trip';
  return (
    <section className="sec">
      <h2>Open comments</h2>
      <ul className="xlist" style={{ marginTop: 8 }}>{open.map((c) => (
        <li key={c.id} className="xrow"><span className="small"><b>{people.find((p) => p.user_id === c.author_id)?.display_name || 'Someone'}</b> on {where(c.target_kind, c.target_id)}: {c.body}</span><span className="tiny muted">{when(c.created_at)}</span></li>
      ))}</ul>
    </section>
  );
}

function ActivityFeed({ t }: { t: Trip }) {
  const q = useActivity(t.id);
  const people = useCloud((s) => s.members[t.id] || NONE);
  const me = useAuth((s) => s.user?.id);
  const [who, setWho] = useState('');
  const list = (q.data || []).filter((a) => !who || a.user_id === who);
  const owner = t.cloud?.role === 'owner';
  return (
    <section className="sec">
      <div className="row between">
        <h2>Activity</h2>
        <label className="row small" style={{ gap: 6, fontWeight: 600 }}>Person<select value={who} style={{ width: 'auto' }} onChange={(e) => setWho(e.target.value)}><option value="">Everyone</option>{people.map((p) => <option key={p.user_id} value={p.user_id}>{p.display_name}</option>)}</select></label>
      </div>
      <ul className="xlist" style={{ marginTop: 8 }}>
        {list.map((a) => (
          <li key={a.id} className="xrow">
            <span className="small"><b>{people.find((p) => p.user_id === a.user_id)?.display_name || 'Someone'}</b> {describeActivity(a)} <span className="tiny muted">· {when(a.at)}</span></span>
            {((a.user_id === me && a.action !== 'delete') || (owner && a.action === 'delete' && a.entity === 'items')) && t.cloud?.role !== 'viewer' && (
              <button type="button" className="btn sm ghost" onClick={() => void revertActivity(a).then(() => toast(a.action === 'delete' ? 'Restored' : 'Undone')).catch((e) => toast(e.message))}>{a.action === 'delete' ? 'Restore' : 'Undo'}</button>
            )}
          </li>
        ))}
        {!list.length && <li className="small muted">{q.isLoading ? 'Loading…' : 'Nothing yet.'}</li>}
      </ul>
    </section>
  );
}
