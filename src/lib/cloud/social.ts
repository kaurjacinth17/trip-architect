// Comments, votes, polls and the activity feed for shared trips (Supabase tables, kept live with Realtime).
// Viewers can comment and vote; editors create polls; the database's RLS policies enforce all of it.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useAuth } from '../../store/auth';
import { sb } from './client';

export type TargetKind = 'trip' | 'day' | 'item' | 'expense' | 'stay';
export interface Comment { id: string; trip_id: string; target_kind: TargetKind; target_id: string; body: string; mentions: string[]; author_id: string; created_at: string; resolved_at: string | null }
export interface Vote { trip_id: string; target_kind: 'wish' | 'stay' | 'poll_option'; target_id: string; poll_id: string | null; user_id: string; value: 1 | -1 }
export interface Poll { id: string; trip_id: string; question: string; kind: 'item' | 'stay' | 'other'; closes_at: string | null; closed_at: string | null; winner_option_id: string | null; created_by: string; created_at: string }
export interface PollOption { id: string; poll_id: string; trip_id: string; label: string; place_id: string | null; position: number }
export interface Activity { id: number; trip_id: string; user_id: string | null; at: string; entity: string; entity_id: string; action: 'insert' | 'update' | 'delete'; diff: Record<string, unknown> }

async function client() {
  const c = await sb();
  if (!c) throw new Error('Accounts aren’t set up on this site');
  return c;
}
const ok = <T,>(r: { data: T | null; error: unknown }) => { if (r.error) throw new Error('Couldn’t save that; try again'); return r.data as T; };

/** Keep a query fresh with Realtime changes on `table` for this trip. */
function useLive(tripId: string | null, table: string, key: unknown[]) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!tripId) return;
    let off = () => {};
    void sb().then((c) => {
      if (!c) return;
      const ch = c.channel(`${table}:${tripId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table, filter: `trip_id=eq.${tripId}` }, () => void qc.invalidateQueries({ queryKey: key }))
        .subscribe();
      off = () => void c.removeChannel(ch);
    });
    return () => off();
  }, [tripId, table]); // eslint-disable-line react-hooks/exhaustive-deps
}

/* -------------------------------------------------------------------------------------------- comments */

export function useComments(tripId: string | null) {
  const key = ['comments', tripId];
  useLive(tripId, 'comments', key);
  return useQuery({
    queryKey: key, enabled: !!tripId,
    queryFn: async () => ok(await (await client()).from('comments').select('*').eq('trip_id', tripId!).order('created_at')) as Comment[],
  });
}
/** @mentions: "@Riya" matches a member's display name (first word, case-insensitive). */
export function mentionsIn(body: string, people: { user_id: string; display_name: string }[]): string[] {
  const names = [...body.matchAll(/@([\p{L}\p{N}_.-]+)/gu)].map((m) => m[1].toLowerCase());
  return people.filter((p) => names.includes((p.display_name.split(/\s+/)[0] || '').toLowerCase())).map((p) => p.user_id);
}
export async function addComment(tripId: string, kind: TargetKind, id: string, body: string, mentions: string[]) {
  const uid = useAuth.getState().user?.id;
  ok(await (await client()).from('comments').insert({ trip_id: tripId, target_kind: kind, target_id: id, body, mentions, author_id: uid }));
}
export async function resolveComment(id: string, resolved: boolean) {
  ok(await (await client()).from('comments').update({ resolved_at: resolved ? new Date().toISOString() : null, resolved_by: resolved ? useAuth.getState().user?.id : null }).eq('id', id));
}
export async function deleteComment(id: string) {
  ok(await (await client()).from('comments').delete().eq('id', id));
}

/* ----------------------------------------------------------------------------------------------- votes */

export function useVotes(tripId: string | null) {
  const key = ['votes', tripId];
  useLive(tripId, 'votes', key);
  return useQuery({
    queryKey: key, enabled: !!tripId,
    queryFn: async () => ok(await (await client()).from('votes').select('*').eq('trip_id', tripId!)) as Vote[],
  });
}
export function tally(votes: Vote[] | undefined, kind: Vote['target_kind'], id: string, me?: string) {
  const v = (votes || []).filter((x) => x.target_kind === kind && x.target_id === id);
  return { up: v.filter((x) => x.value === 1).length, down: v.filter((x) => x.value === -1).length, mine: (v.find((x) => x.user_id === me)?.value ?? 0) as -1 | 0 | 1 };
}
/** Vote 👍 (1) / 👎 (-1), or clear it (0). */
export async function vote(tripId: string, kind: Vote['target_kind'], id: string, value: -1 | 0 | 1, pollId?: string) {
  const c = await client();
  const uid = useAuth.getState().user?.id;
  if (pollId) ok(await c.from('votes').delete().eq('poll_id', pollId).eq('user_id', uid!)); // one vote per poll
  else ok(await c.from('votes').delete().eq('trip_id', tripId).eq('target_kind', kind).eq('target_id', id).eq('user_id', uid!));
  if (value) ok(await c.from('votes').insert({ trip_id: tripId, target_kind: kind, target_id: id, user_id: uid, value, poll_id: pollId ?? null }));
}

/* ----------------------------------------------------------------------------------------------- polls */

export function usePolls(tripId: string | null) {
  const key = ['polls', tripId];
  useLive(tripId, 'polls', key);
  useLive(tripId, 'poll_options', key);
  return useQuery({
    queryKey: key, enabled: !!tripId,
    queryFn: async () => {
      const c = await client();
      const [p, o] = await Promise.all([c.from('polls').select('*').eq('trip_id', tripId!).order('created_at', { ascending: false }), c.from('poll_options').select('*').eq('trip_id', tripId!).order('position')]);
      return { polls: ok(p) as Poll[], options: ok(o) as PollOption[] };
    },
  });
}
export async function createPoll(tripId: string, o: { question: string; kind: Poll['kind']; closesAt?: string; options: { label: string; place_id?: string | null }[] }) {
  const c = await client();
  const poll = ok(await c.from('polls').insert({ trip_id: tripId, question: o.question, kind: o.kind, closes_at: o.closesAt || null, created_by: useAuth.getState().user?.id }).select('id').single()) as { id: string };
  ok(await c.from('poll_options').insert(o.options.map((x, i) => ({ poll_id: poll.id, trip_id: tripId, label: x.label, place_id: x.place_id ?? null, position: i }))));
  return poll.id;
}
/** The option with the most votes (ties: the earlier option). */
export function winner(options: PollOption[], votes: Vote[] | undefined, pollId: string): PollOption | null {
  const n = (o: PollOption) => (votes || []).filter((v) => v.poll_id === pollId && v.target_id === o.id).length;
  const best = options.filter((o) => o.poll_id === pollId).sort((a, b) => n(b) - n(a) || a.position - b.position)[0];
  return best && n(best) > 0 ? best : null;
}
export async function closePoll(poll: Poll, win: PollOption | null) {
  ok(await (await client()).from('polls').update({ closed_at: new Date().toISOString(), winner_option_id: win?.id ?? null }).eq('id', poll.id));
}
export async function deletePoll(id: string) {
  ok(await (await client()).from('polls').delete().eq('id', id));
}

/* --------------------------------------------------------------------------------------------- activity */

export function useActivity(tripId: string | null) {
  const key = ['activity', tripId];
  useLive(tripId, 'activity_log', key);
  return useQuery({
    queryKey: key, enabled: !!tripId,
    queryFn: async () => ok(await (await client()).from('activity_log').select('*').eq('trip_id', tripId!).order('at', { ascending: false }).limit(200)) as Activity[],
  });
}

const LABEL: Record<string, string> = { items: 'block', days: 'day', stays: 'stay', pack_items: 'packing item', expenses: 'expense', settlements: 'payment', trips: 'trip details' };
const FIELD: Record<string, string> = { start_min: 'time', dur: 'duration', title: 'title', day_id: 'day', locked: 'lock', done: 'done', note: 'note', price: 'price', status: 'status', amount: 'amount', description: 'description', name: 'name', cost: 'cost', deleted_at: 'deleted', position: 'order' };
/** "moved Fort Aguada (time, day)" */
export function describeActivity(a: Activity): string {
  const what = LABEL[a.entity] || a.entity;
  const row = a.diff as Record<string, unknown>;
  const name = (a.action === 'update' ? undefined : (row.title || row.name || row.description)) as string | undefined;
  if (a.action === 'insert') return `added a ${what}${name ? ` “${name}”` : ''}`;
  if (a.action === 'delete') return `removed a ${what}${name ? ` “${name}”` : ''}`;
  const fields = Object.keys(row).map((k) => FIELD[k] || k.replace(/_/g, ' '));
  return `changed a ${what} (${fields.slice(0, 4).join(', ')}${fields.length > 4 ? '…' : ''})`;
}

const KEYS: Record<string, string[]> = { items: ['trip_id', 'id'], days: ['trip_id', 'id'], stays: ['trip_id', 'id'], pack_items: ['trip_id', 'id'], expenses: ['trip_id', 'id'], settlements: ['trip_id', 'id'], trips: ['id'] };
/** Undo one logged change: put the old values back, re-create a removed row, or remove an added one. */
export async function revertActivity(a: Activity) {
  const keys = KEYS[a.entity];
  if (!keys) throw new Error('That change can’t be undone here');
  const c = await client();
  const row = a.diff as Record<string, unknown>;
  const match = (q: ReturnType<ReturnType<typeof c.from>['update']> | ReturnType<ReturnType<typeof c.from>['delete']>) => {
    let x = q;
    for (const k of keys) x = x.eq(k, k === 'id' ? a.entity_id : k === 'trip_id' ? a.trip_id : (row[k] as string));
    return x;
  };
  if (a.action === 'update') {
    const old = Object.fromEntries(Object.entries(row).map(([k, v]) => [k, (v as unknown[])[0]]));
    ok(await match(c.from(a.entity).update(old)));
  } else if (a.action === 'insert') {
    ok(await match(c.from(a.entity).delete()));
  } else {
    const { version: _v, updated_at: _u, updated_by: _b, ...r } = row;
    ok(await c.from(a.entity).insert(r));
  }
}
