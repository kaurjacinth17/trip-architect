// Live sync for trips in an account. The trips store stays the working copy (every page works unchanged); this
// module pushes each change as row writes (optimistic, rolled back on error), detects clashes with per-row
// versions, and applies other people's changes from Realtime within about a second.
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { create } from 'zustand';
import type { Trip } from '../../engine/types';
import { toast } from '../../store/toast';
import { useTrips } from '../../store/trips';
import { useAuth } from '../../store/auth';
import { sb } from './client';
import { CONTENT_TABLES, diffRows, mergeRow, patchRows, rowKey, rowsToTrip, tripToRows, VERSIONED, type ContentTable, type FieldConflict, type TripRows } from './rows';

type Row = Record<string, unknown>;
type Role = 'owner' | 'editor' | 'viewer';
export interface Conflict { tripId: string; table: string; id: string; label: string; by: string | null; base: Row; mine: Row; theirs: Row; fields: FieldConflict[] }
export interface Presence { uid: string; name: string; avatar: string | null; day: number | null; editing: string | null; color: string }

interface CloudState {
  status: Record<string, 'loading' | 'synced' | 'saving' | 'offline' | 'error'>;
  conflicts: Conflict[];
  presence: Record<string, Presence[]>;
  members: Record<string, { user_id: string; display_name: string; avatar_url: string | null; upi_id: string | null; phone: string | null; role: Role; traveller_index: number | null }[]>;
}
/** Stable empty list for selectors (a new [] each render would loop) */
export const NONE: never[] = [];
export const useCloud = create<CloudState>()(() => ({ status: {}, conflicts: [], presence: {}, members: {} }));

const base = new Map<string, TripRows>();       // last server-confirmed rows (with versions) per trip
const owners = new Map<string, string>();
const roles = new Map<string, Role>();
const channels = new Map<string, RealtimeChannel>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const pushing = new Map<string, Promise<void>>();
const again = new Set<string>();
let applying = false;

const setStatus = (id: string, s: CloudState['status'][string]) => useCloud.setState((x) => ({ status: { ...x.status, [id]: s } }));
const COLORS = ['#b4532a', '#1f4d3a', '#3b5bdb', '#9c36b5', '#e67700', '#0b7285', '#c2255c'];
export const colorFor = (uid: string) => COLORS[[...uid].reduce((s, c) => s + c.charCodeAt(0), 0) % COLORS.length];

/** Put a trip from the server into the store without counting it as a local edit. */
function applyLocal(t: Trip) {
  applying = true;
  try {
    useTrips.setState((s) => ({ trips: { ...s.trips, [t.id]: t } }));
  } finally {
    applying = false;
  }
}

function myTraveller(tripId: string) {
  const me = useAuth.getState().user?.id;
  return useCloud.getState().members[tripId]?.find((m) => m.user_id === me)?.traveller_index ?? undefined;
}

/* ---------------------------------------------------------------------------------------------- load */

async function fetchRows(c: SupabaseClient, id: string): Promise<TripRows> {
  const q = (t: string) => c.from(t).select('*').eq('trip_id', id);
  const [trip, ...rest] = await Promise.all([c.from('trips').select('*').eq('id', id).single(), ...CONTENT_TABLES.map(q)]);
  if (trip.error) throw trip.error;
  const out = { trip: trip.data as Row, destinations: [] as Row[] } as TripRows;
  CONTENT_TABLES.forEach((t, i) => {
    if (rest[i].error) throw rest[i].error;
    out[t] = (rest[i].data || []) as Row[];
  });
  const keys = out.trip_destinations.map((d) => d.dest_key as string);
  if (keys.length) {
    const d = await c.from('destinations').select('*').in('key', keys);
    out.destinations = (d.data || []) as Row[];
  }
  return out;
}

export async function loadMembers(id: string) {
  const c = await sb();
  if (!c) return;
  const { data } = await c.rpc('trip_people', { t: id });
  useCloud.setState((x) => ({ members: { ...x.members, [id]: (data || []) as CloudState['members'][string] } }));
}

/** Load (or reload) one trip from the account into the store and start live sync for it. */
export async function loadTrip(id: string, role?: Role): Promise<Trip | null> {
  const c = await sb();
  if (!c) return null;
  setStatus(id, 'loading');
  try {
    const rows = await fetchRows(c, id);
    if (role) roles.set(id, role);
    owners.set(id, String(rows.trip.owner_id));
    base.set(id, rows);
    await loadMembers(id);
    const t = rowsToTrip(rows, roles.get(id) || 'viewer', myTraveller(id));
    applyLocal(t);
    subscribe(c, id);
    setStatus(id, 'synced');
    return t;
  } catch {
    setStatus(id, navigator.onLine ? 'error' : 'offline');
    return null;
  }
}

/** All trips you're a member of. Local copies of them are replaced by the account's version. */
export async function loadAccountTrips(): Promise<number> {
  const c = await sb();
  const uid = useAuth.getState().user?.id;
  if (!c || !uid) return 0;
  const { data } = await c.from('trip_members').select('trip_id,role').eq('user_id', uid);
  const list = (data || []) as { trip_id: string; role: Role }[];
  await Promise.all(list.map((m) => loadTrip(m.trip_id, m.role)));
  return list.length;
}

/* -------------------------------------------------------------------------------------- move to account */

/** Upload a guest trip to your account (a new id), then switch the store to the account copy. */
export async function moveToAccount(local: Trip): Promise<string> {
  const c = await sb();
  const uid = useAuth.getState().user?.id;
  if (!c || !uid) throw new Error('Sign in first');
  const id = crypto.randomUUID();
  const rows = tripToRows(local, id, uid);
  const ins = async (t: string, r: Row[] | Row) => {
    if (Array.isArray(r) && !r.length) return;
    const { error } = await c.from(t).insert(r);
    if (error) throw new Error(`Couldn’t upload ${t.replace('_', ' ')}`);
  };
  await ins('trips', rows.trip);
  try {
    const { error } = await c.from('destinations').upsert(rows.destinations.map((d) => ({ ...d, created_by: uid })), { onConflict: 'key', ignoreDuplicates: true });
    if (error) throw new Error('Couldn’t upload destinations');
    for (const t of ['trip_destinations', 'days', 'items', 'stays', 'pack_items', 'expenses', 'expense_payers', 'expense_shares', 'settlements'] as ContentTable[]) await ins(t, rows[t]);
  } catch (e) {
    await c.from('trips').delete().eq('id', id); // don't leave half a trip behind
    throw e;
  }
  roles.set(id, 'owner');
  const t = await loadTrip(id, 'owner');
  if (!t) throw new Error('Uploaded, but couldn’t open it; reload the page');
  useTrips.getState().remove(local.id);
  return id;
}

/* ---------------------------------------------------------------------------------------------- push */

function schedule(id: string) {
  clearTimeout(timers.get(id));
  timers.set(id, setTimeout(() => void push(id), 350));
}

async function push(id: string) {
  if (pushing.has(id)) { again.add(id); return; }
  const p = doPush(id).finally(() => {
    pushing.delete(id);
    if (again.delete(id)) void push(id);
  });
  pushing.set(id, p);
  await p;
}

const ORDER: ContentTable[] = ['trip_destinations', 'days', 'items', 'stays', 'pack_items', 'expenses', 'expense_payers', 'expense_shares', 'settlements'];

async function doPush(id: string) {
  const c = await sb();
  const local = useTrips.getState().trips[id];
  const prev = base.get(id);
  const uid = useAuth.getState().user?.id;
  if (!c || !local || !prev || !uid || roles.get(id) === 'viewer') return;
  const next = tripToRows(local, id, owners.get(id) || uid);
  const d = diffRows(prev, next);
  if (!d.trip && !d.destinations.length && !d.changes.length) return;
  // Offline: keep the edits on this device and send them when the connection is back.
  if (!navigator.onLine) { setStatus(id, 'offline'); return; }
  setStatus(id, 'saving');
  const confirmed = structuredClone(prev);
  try {
    if (d.destinations.length) {
      const { error } = await c.from('destinations').upsert(d.destinations.map((x) => ({ ...x, created_by: uid })), { onConflict: 'key', ignoreDuplicates: true });
      if (error) throw error;
      confirmed.destinations.push(...d.destinations);
    }
    if (d.trip) {
      const { owner_id: _o, id: _i, ...fields } = d.trip;
      const { data, error } = await c.from('trips').update(fields).eq('id', id).select('*').single();
      if (error) throw error;
      confirmed.trip = data as Row;
    }
    const byTable = new Map(d.changes.map((x) => [x.table, x]));
    // writes parents first, deletes children first
    for (const table of ORDER) {
      const ch = byTable.get(table);
      if (!ch?.upserts.length) continue;
      if (table === 'expense_payers' || table === 'expense_shares') {
        const exp = [...new Set(ch.upserts.map((r) => r.expense_id as string))];
        await must(c.from(table).delete().eq('trip_id', id).in('expense_id', exp));
        const rows = next[table].filter((r) => exp.includes(r.expense_id as string));
        await must(c.from(table).insert(rows));
        confirmed[table] = [...confirmed[table].filter((r) => !exp.includes(r.expense_id as string)), ...rows];
        continue;
      }
      if (!VERSIONED.has(table)) {
        const { data, error } = await c.from(table).upsert(ch.upserts).select('*');
        if (error) throw error;
        replaceRows(confirmed, table, data as Row[]);
        continue;
      }
      const known = new Map(prev[table].map((r) => [rowKey(table, r), r]));
      const fresh = ch.upserts.filter((r) => !known.has(rowKey(table, r)));
      if (fresh.length) {
        const { data, error } = await c.from(table).insert(fresh).select('*');
        if (error) throw error;
        replaceRows(confirmed, table, data as Row[]);
      }
      for (const r of ch.upserts.filter((x) => known.has(rowKey(table, x)))) {
        const b = known.get(rowKey(table, r))!;
        const { data, error } = await c.from(table).update(stripMeta(r)).eq('trip_id', id).eq('id', r.id as string).eq('version', b.version as number).select('*');
        if (error) throw error;
        if (data?.length) { replaceRows(confirmed, table, data as Row[]); continue; }
        await clash(c, id, table, b, r, confirmed);
      }
    }
    for (const table of [...ORDER].reverse()) {
      const ch = byTable.get(table);
      if (!ch?.deletes.length) continue;
      if (table === 'expense_payers' || table === 'expense_shares') {
        for (const r of ch.deletes) await must(c.from(table).delete().eq('trip_id', id).eq('expense_id', r.expense_id as string).eq('traveller', r.traveller as number));
      } else if (table === 'trip_destinations') {
        await must(c.from(table).delete().eq('trip_id', id).in('dest_key', ch.deletes.map((r) => r.dest_key as string)));
      } else {
        await must(c.from(table).delete().eq('trip_id', id).in('id', ch.deletes.map((r) => r.id as string)));
      }
      const gone = new Set(ch.deletes.map((r) => rowKey(table, r)));
      confirmed[table] = confirmed[table].filter((r) => !gone.has(rowKey(table, r)));
    }
    base.set(id, confirmed);
    setStatus(id, 'synced');
  } catch {
    // Roll back to what the server has, so the screen never shows changes that weren't saved.
    base.set(id, confirmed);
    applyLocal(rowsToTrip(confirmed, roles.get(id) || 'viewer', myTraveller(id)));
    setStatus(id, navigator.onLine ? 'error' : 'offline');
    toast(navigator.onLine ? 'Couldn’t save your last change, so it was undone. Try again.' : 'You’re offline; your last change wasn’t saved.');
  }
}

async function must(q: PromiseLike<{ error: unknown }>) {
  const { error } = await q;
  if (error) throw error;
}
const stripMeta = (r: Row) => { const { version: _v, updated_at: _a, updated_by: _b, ...x } = r; return x; };
function replaceRows(rows: TripRows, table: ContentTable, got: Row[]) {
  const m = new Map(rows[table].map((r) => [rowKey(table, r), r]));
  for (const r of got) m.set(rowKey(table, r), r);
  rows[table] = [...m.values()];
}

/** Someone else saved this row first: merge fields that don't overlap, or ask. */
async function clash(c: SupabaseClient, id: string, table: ContentTable, b: Row, mine: Row, confirmed: TripRows) {
  const { data } = await c.from(table).select('*').eq('trip_id', id).eq('id', mine.id as string).maybeSingle();
  if (!data) return; // they deleted it; their delete wins (it shows in the activity feed)
  const theirs = data as Row;
  const m = mergeRow(b, mine, theirs);
  if (!m.conflicts.length) {
    const { data: up } = await c.from(table).update(stripMeta(m.merged)).eq('trip_id', id).eq('id', mine.id as string).eq('version', theirs.version as number).select('*');
    replaceRows(confirmed, table, (up as Row[]) || [theirs]);
    return;
  }
  replaceRows(confirmed, table, [theirs]);
  const by = useCloud.getState().members[id]?.find((x) => x.user_id === theirs.updated_by)?.display_name || null;
  useCloud.setState((s) => ({ conflicts: [...s.conflicts.filter((x) => !(x.tripId === id && x.id === mine.id)), { tripId: id, table, id: String(mine.id), label: String(mine.title || mine.name || mine.description || 'this'), by, base: b, mine, theirs, fields: m.conflicts }] }));
}

/** Resolve a clash: keep theirs, keep mine, or a per-field choice. */
export async function resolveConflict(x: Conflict, choice: 'theirs' | 'mine' | Record<string, 'mine' | 'theirs'>) {
  useCloud.setState((s) => ({ conflicts: s.conflicts.filter((y) => y !== x) }));
  const c = await sb();
  const rows = base.get(x.tripId);
  if (!c || !rows) return;
  const merged: Row = choice === 'theirs' ? x.theirs : choice === 'mine' ? { ...x.theirs, ...stripMeta(x.mine) } : { ...x.theirs, ...Object.fromEntries(x.fields.filter((f) => choice[f.field] === 'mine').map((f) => [f.field, f.mine])) };
  if (choice !== 'theirs') {
    const { data } = await c.from(x.table).update(stripMeta(merged)).eq('trip_id', x.tripId).eq('id', x.id).eq('version', x.theirs.version as number).select('*');
    if (!data?.length) { toast('It changed again; reloading the latest version'); await loadTrip(x.tripId); return; }
    replaceRows(rows, x.table as ContentTable, data as Row[]);
  }
  applyLocal(rowsToTrip(rows, roles.get(x.tripId) || 'viewer', myTraveller(x.tripId)));
}

/* -------------------------------------------------------------------------------------------- realtime */

function onRemote(id: string, table: string, ev: 'INSERT' | 'UPDATE' | 'DELETE', row: Row) {
  const prev = base.get(id);
  if (!prev) return;
  const local = useTrips.getState().trips[id];
  const pending = local ? diffRows(prev, tripToRows(local, id, owners.get(id) || '')) : null;
  const next = structuredClone(prev);
  if (table === 'trips') {
    if (ev === 'DELETE') { useTrips.getState().remove(id); toast('This trip was deleted by its owner'); return; }
    next.trip = row;
  } else if ((CONTENT_TABLES as readonly string[]).includes(table)) {
    const t = table as ContentTable;
    const k = rowKey(t, row);
    const cur = next[t].find((r) => rowKey(t, r) === k);
    if (ev === 'DELETE') next[t] = next[t].filter((r) => rowKey(t, r) !== k);
    else if (cur && (cur.version != null && row.version != null && Number(row.version) <= Number(cur.version))) return; // our own echo or stale
    else replaceRows(next, t, [row]);
  } else return;
  base.set(id, next);
  const merged = pending && (pending.trip || pending.changes.length) ? patchRows(next, pending) : next;
  applyLocal(rowsToTrip(merged, roles.get(id) || 'viewer', myTraveller(id)));
}

function subscribe(c: SupabaseClient, id: string) {
  if (channels.has(id)) return;
  const ch = c.channel(`trip:${id}`, { config: { presence: { key: useAuth.getState().user?.id || 'anon' } } });
  for (const table of CONTENT_TABLES) {
    ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table, filter: `trip_id=eq.${id}` }, (p) => onRemote(id, table, 'INSERT', p.new as Row));
    ch.on('postgres_changes', { event: 'UPDATE', schema: 'public', table, filter: `trip_id=eq.${id}` }, (p) => onRemote(id, table, 'UPDATE', p.new as Row));
    // Delete events can't be filtered and (under RLS) carry only the primary key, which includes trip_id.
    ch.on('postgres_changes', { event: 'DELETE', schema: 'public', table }, (p) => { if ((p.old as Row).trip_id === id) onRemote(id, table, 'DELETE', p.old as Row); });
  }
  ch.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'trips', filter: `id=eq.${id}` }, (p) => onRemote(id, 'trips', 'UPDATE', p.new as Row));
  ch.on('postgres_changes', { event: '*', schema: 'public', table: 'trip_members', filter: `trip_id=eq.${id}` }, () => void loadMembers(id));
  ch.on('presence', { event: 'sync' }, () => {
    const st = ch.presenceState<Presence>();
    const me = useAuth.getState().user?.id;
    const list = Object.values(st).flat().filter((p) => p.uid !== me);
    useCloud.setState((s) => ({ presence: { ...s.presence, [id]: list } }));
  });
  ch.subscribe((s) => {
    if (s === 'SUBSCRIBED') void track(id, {});
    if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') setStatus(id, 'offline');
  });
  channels.set(id, ch);
}

const mine: Record<string, { day: number | null; editing: string | null }> = {};
/** Tell others where you are (day) and what you're editing (an item id or "field:<name>"). */
export async function track(id: string, p: Partial<{ day: number | null; editing: string | null }>) {
  const ch = channels.get(id);
  const a = useAuth.getState();
  if (!ch || !a.user) return;
  mine[id] = Object.assign({ day: null, editing: null }, mine[id], p);
  await ch.track({ uid: a.user.id, name: a.profile?.display_name || a.user.email?.split('@')[0] || 'Someone', avatar: a.profile?.avatar_url || null, color: colorFor(a.user.id), ...mine[id] } satisfies Presence);
}

/** Stop syncing everything (sign-out). Account trips are removed from this device. */
export async function stopAll() {
  const c = await sb();
  for (const [id, ch] of channels) { void c?.removeChannel(ch); channels.delete(id); }
  for (const id of base.keys()) useTrips.getState().remove(id);
  base.clear();
}

/* ------------------------------------------------------------------------------------------- wiring */

let wired = false;
/** Start pushing local edits of account trips. Call once after sign-in. */
export function wireSync() {
  if (wired) return;
  wired = true;
  useTrips.subscribe((s, prev) => {
    if (applying) return;
    for (const [id, t] of Object.entries(s.trips)) if (t.cloud && base.has(id) && t !== prev.trips[id]) schedule(id);
  });
  addEventListener('online', () => { for (const id of base.keys()) void push(id); });
}

/** Test hooks */
export const _sync = { base, roles, owners, onRemote, doPush, setApplying: (v: boolean) => { applying = v; } };
