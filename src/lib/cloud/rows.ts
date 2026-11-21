// Trip ⇄ database rows for the normalised Supabase schema (supabase/migrations). Pure: no network, no React.
// Google names are never written (items with a place ID keep an empty title; Google hotels keep an empty name);
// Google coordinates are written with their fetched-at time, as in localStorage.
import { D } from '../../data/destinations';
import { payersOf, splitOf } from '../../engine/expenses';
import { stripLiveNames } from '../../engine/coords';
import type { Budget, Day, DestRecord, Expense, Item, PackItem, Payment, Prefs, Stay, Trip } from '../../engine/types';

type Row = Record<string, unknown>;
export interface TripRows {
  trip: Row;
  destinations: Row[];
  trip_destinations: Row[];
  days: Row[];
  items: Row[];
  stays: Row[];
  pack_items: Row[];
  expenses: Row[];
  expense_payers: Row[];
  expense_shares: Row[];
  settlements: Row[];
}
export const CONTENT_TABLES = ['trip_destinations', 'days', 'items', 'stays', 'pack_items', 'expenses', 'expense_payers', 'expense_shares', 'settlements'] as const;
export type ContentTable = (typeof CONTENT_TABLES)[number];
/** Tables whose rows carry a `version` (optimistic concurrency) */
export const VERSIONED = new Set<string>(['days', 'items', 'stays', 'pack_items', 'expenses']);

/** Primary key of a row within its trip */
export function rowKey(table: string, r: Row): string {
  if (table === 'trip_destinations') return String(r.dest_key);
  if (table === 'expense_payers' || table === 'expense_shares') return `${r.expense_id}:${r.traveller}`;
  return String(r.id);
}

const ts = (ms?: number) => (ms ? new Date(ms).toISOString() : null);
const ms = (iso: unknown) => (typeof iso === 'string' && iso ? Date.parse(iso) : undefined);
const dayId = (i: number) => `d${i}`;

function itemRow(trip_id: string, x: Item, day_id: string | null, position: number): Row {
  return {
    trip_id, id: x.id, day_id, position, pid: x.pid, gid: x.gid ?? null, title: x.gid && x.nameLive ? '' : x.t, cat: x.cat,
    start_min: x.s, dur: x.d, cost: x.c, lat: x.lat, lng: x.lng, coords_fetched_at: ts(x.coordsFetchedAt), area: x.area, dest_key: x.dest,
    pri: x.pri, note: x.n, done: x.done, locked: !!x.locked, booking: x.booking ?? null, link: x.link ?? null, tags: x.tags ?? null, stay_ref: x.stayRef ?? null,
  };
}
function rowItem(r: Row): Item {
  const x: Item = {
    id: String(r.id), pid: (r.pid as string) ?? null, t: String(r.title ?? ''), cat: r.cat as Item['cat'], s: Number(r.start_min), d: Number(r.dur), c: Number(r.cost) || 0,
    lat: (r.lat as number) ?? null, lng: (r.lng as number) ?? null, area: String(r.area ?? ''), dest: (r.dest_key as string) ?? null,
    pri: (r.pri as Item['pri']) || 'nice', n: String(r.note ?? ''), done: !!r.done,
  };
  if (r.gid) x.gid = String(r.gid);
  if (r.coords_fetched_at) x.coordsFetchedAt = ms(r.coords_fetched_at);
  if (r.locked) x.locked = true;
  if (r.booking) x.booking = r.booking as Item['booking'];
  if (r.link) x.link = String(r.link);
  if (r.tags) x.tags = r.tags as string[];
  if (r.stay_ref) x.stayRef = r.stay_ref as Item['stayRef'];
  return x;
}

/** All rows for a trip. `tripId` is the cloud trip's uuid. */
export function tripToRows(t0: Trip, tripId: string, ownerId: string): TripRows {
  const t = stripLiveNames(t0);
  const trip: Row = {
    id: tripId, owner_id: ownerId, name: t.name, start_date: t.start || null, pace: t.pace, group_kind: t.group, travellers: t.travelers,
    prefs: t.prefs, budget_total: t.budgetTotal, budget: t.budget, budget_mode: t.budgetMode ?? {}, currency: t.currency || 'INR', notes: t.notes,
  };
  const destinations = t.dests.map((k): Row => {
    const r = t.destRecords?.[k];
    if (D[k] || !r) return { key: k, kind: 'curated', name: D[k]?.name || k, dest_type: 'other', currency: 'INR' };
    return { key: k, kind: r.kind, place_id: r.placeId ?? null, name: r.name, region: r.region ?? null, country: r.country ?? null, country_code: r.countryCode ?? null,
      dest_type: r.type, timezone: r.timezone ?? null, currency: r.currency, climate: r.climate ?? null, climate_period: r.climatePeriod ?? null };
  });
  const trip_destinations = t.dests.map((k, i): Row => {
    const r = t.destRecords?.[k];
    return { trip_id: tripId, dest_key: k, position: i, center_lat: r?.center?.lat ?? null, center_lng: r?.center?.lng ?? null, viewport: r?.viewport ?? null,
      coords_fetched_at: ts(r?.coordsFetchedAt), days: r?.days ?? null, cost: r?.cost ?? null };
  });
  const days = t.plan.map((d, i): Row => ({
    trip_id: tripId, id: dayId(i), position: i, dest_key: d.dest, label: d.label, start_min: d.start ?? null, end_min: d.end ?? null,
    start_loc: d.startLoc ?? null, end_loc: d.endLoc ?? null, pace: d.pace ?? null,
  }));
  const items = [
    ...t.plan.flatMap((d, i) => d.items.map((x, k) => itemRow(tripId, x, dayId(i), k))),
    ...t.wish.map((x, k) => itemRow(tripId, x, null, k)),
  ];
  const stays = t.stays.map((s, i): Row => ({
    trip_id: tripId, id: s.id, name: s.gid && s.nameLive ? '' : s.name, gid: s.gid ?? null, area: s.area, dest_key: s.dest, lat: s.lat, lng: s.lng,
    coords_fetched_at: ts(s.coordsFetchedAt), price: s.price, nights: s.nights, night_from: s.from ?? null, night_to: s.to ?? null, rooms: s.rooms ?? null,
    checkin: s.checkin || null, checkout: s.checkout || null, rating: s.rating, link: s.link, notes: s.notes, status: s.status, position: i,
  }));
  const pack_items = t.pack.map((p, i): Row => ({ trip_id: tripId, id: p.id, cat: p.cat, name: p.name, qty: p.qty, done: p.done, custom: !!p.custom, assigned_to: p.assignedTo ?? null, shared: !!p.shared, position: i }));
  const n = Math.max(1, t.travelers.length);
  const live = (t.payments || []).filter((p) => !p.deleted);
  const expenses: Row[] = [], expense_payers: Row[] = [], expense_shares: Row[] = [];
  for (const e of t.expenses) {
    const sp = splitOf(e, n);
    expenses.push({
      trip_id: tripId, id: e.id, description: e.note, amount: e.amt, currency: e.cur || 'INR', amount_inr: e.inr ?? e.amt, fx_date: e.fxDate ?? null, category: e.cat,
      spent_on: e.date || null, spent_at: e.time ?? null, item_id: e.itemId ?? null, notes: e.notes ?? null, split_kind: sp.kind, history: e.history ?? [],
      created_at: ts(e.created) ?? undefined, deleted_at: ts(e.deleted),
    });
    for (const p of payersOf(e)) expense_payers.push({ trip_id: tripId, expense_id: e.id, traveller: p.who, amount: p.amt });
    for (const i of sp.among) {
      const s = live.find((p) => p.expenseId === e.id && p.from === i);
      expense_shares.push({ trip_id: tripId, expense_id: e.id, traveller: i, value: sp.kind === 'equal' ? null : sp.values?.[i] ?? null, settled_at: s ? ts(s.created) : null, settlement_id: s?.id ?? null });
    }
  }
  const settlements = (t.payments || []).map((p): Row => ({
    trip_id: tripId, id: p.id, from_traveller: p.from, to_traveller: p.to, amount: p.amt, paid_on: p.date || null, method: p.method, note: p.note,
    expense_id: p.expenseId ?? null, created_at: ts(p.created), deleted_at: ts(p.deleted),
  }));
  for (const e of expenses) if (e.created_at === undefined) delete e.created_at;
  return { trip, destinations, trip_destinations, days, items, stays, pack_items, expenses, expense_payers, expense_shares, settlements };
}

const byPos = (a: Row, b: Row) => Number(a.position) - Number(b.position) || String(a.id ?? a.dest_key).localeCompare(String(b.id ?? b.dest_key));

/** Rebuild a Trip from rows. `role` is your membership role. */
export function rowsToTrip(r: TripRows, role: 'owner' | 'editor' | 'viewer', me?: number): Trip {
  const tr = r.trip;
  const tds = [...r.trip_destinations].sort(byPos);
  const destRecords: Record<string, DestRecord> = {};
  for (const td of tds) {
    const k = String(td.dest_key);
    if (D[k]) continue;
    const d = r.destinations.find((x) => x.key === k);
    if (!d) continue;
    const rec: DestRecord = {
      key: k, kind: d.kind === 'custom' ? 'custom' : 'google', name: String(d.name), type: (d.dest_type as DestRecord['type']) || 'other', currency: String(d.currency || 'INR'),
      center: td.center_lat != null && td.center_lng != null ? { lat: Number(td.center_lat), lng: Number(td.center_lng) } : null,
    };
    if (d.place_id) rec.placeId = String(d.place_id);
    if (d.region) rec.region = String(d.region);
    if (d.country) rec.country = String(d.country);
    if (d.country_code) rec.countryCode = String(d.country_code);
    if (d.timezone) rec.timezone = String(d.timezone);
    if (d.climate) rec.climate = d.climate as DestRecord['climate'];
    if (d.climate_period) rec.climatePeriod = String(d.climate_period);
    if (td.viewport) rec.viewport = td.viewport as DestRecord['viewport'];
    if (td.coords_fetched_at) rec.coordsFetchedAt = ms(td.coords_fetched_at);
    if (td.days) rec.days = td.days as [number, number];
    if (td.cost) rec.cost = td.cost as DestRecord['cost'];
    destRecords[k] = rec;
  }
  const days = [...r.days].sort(byPos);
  const items = [...r.items].sort(byPos);
  const plan: Day[] = days.map((d) => {
    const day: Day = { dest: String(d.dest_key), label: String(d.label ?? ''), items: items.filter((x) => x.day_id === d.id).map(rowItem) };
    if (d.start_min != null) day.start = Number(d.start_min);
    if (d.end_min != null) day.end = Number(d.end_min);
    if (d.start_loc) day.startLoc = d.start_loc as Day['startLoc'];
    if (d.end_loc) day.endLoc = d.end_loc as Day['endLoc'];
    if (d.pace) day.pace = d.pace as Day['pace'];
    return day;
  });
  const dayIds = new Set(days.map((d) => d.id));
  const wish = items.filter((x) => x.day_id == null || !dayIds.has(x.day_id)).map(rowItem);
  const stays: Stay[] = [...r.stays].sort(byPos).map((s) => {
    const x: Stay = {
      id: String(s.id), name: String(s.name ?? ''), area: String(s.area ?? ''), dest: String(s.dest_key), lat: (s.lat as number) ?? null, lng: (s.lng as number) ?? null,
      price: Number(s.price) || 0, nights: Number(s.nights) || 1, checkin: String(s.checkin ?? ''), checkout: String(s.checkout ?? ''), rating: Number(s.rating) || 0,
      link: String(s.link ?? ''), notes: String(s.notes ?? ''), status: s.status as Stay['status'],
    };
    if (s.gid) x.gid = String(s.gid);
    if (s.coords_fetched_at) x.coordsFetchedAt = ms(s.coords_fetched_at);
    if (s.night_from != null) x.from = Number(s.night_from);
    if (s.night_to != null) x.to = Number(s.night_to);
    if (s.rooms != null) x.rooms = Number(s.rooms);
    return x;
  });
  const pack: PackItem[] = [...r.pack_items].sort(byPos).map((p) => {
    const x: PackItem = { id: String(p.id), cat: String(p.cat), name: String(p.name), qty: Number(p.qty) || 1, done: !!p.done };
    if (p.custom) x.custom = true;
    if (p.assigned_to != null) x.assignedTo = Number(p.assigned_to);
    if (p.shared) x.shared = true;
    return x;
  });
  const expenses: Expense[] = [...r.expenses].sort((a, b) => String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')) || String(a.id).localeCompare(String(b.id))).map((e) => {
    const payers = r.expense_payers.filter((p) => p.expense_id === e.id).sort((a, b) => Number(a.traveller) - Number(b.traveller)).map((p) => ({ who: Number(p.traveller), amt: Number(p.amount) }));
    const shares = r.expense_shares.filter((p) => p.expense_id === e.id).sort((a, b) => Number(a.traveller) - Number(b.traveller));
    const among = shares.map((s) => Number(s.traveller));
    const kind = e.split_kind as NonNullable<Expense['split']>['kind'];
    const values = kind === 'equal' ? undefined : Array.from({ length: Math.max(0, ...among.map((i) => i + 1), tr.travellers ? (tr.travellers as string[]).length : 0) }, (_, i) => {
      const s = shares.find((x) => Number(x.traveller) === i);
      return s && s.value != null ? Number(s.value) : null;
    });
    const x: Expense = {
      id: String(e.id), amt: Number(e.amount), cur: String(e.currency || 'INR'), inr: e.amount_inr != null ? Number(e.amount_inr) : undefined, cat: e.category as Expense['cat'],
      date: String(e.spent_on ?? ''), note: String(e.description ?? ''), paid: payers.length ? [...payers].sort((a, b) => b.amt - a.amt)[0].who : 0, among,
      payers, split: { kind, among, ...(values ? { values } : {}) },
    };
    if (x.inr === undefined) delete x.inr;
    if (e.fx_date) x.fxDate = String(e.fx_date);
    if (e.spent_at) x.time = String(e.spent_at);
    if (e.item_id) x.itemId = String(e.item_id);
    if (e.notes) x.notes = String(e.notes);
    if (e.history && (e.history as unknown[]).length) x.history = e.history as Expense['history'];
    if (e.created_at) x.created = ms(e.created_at);
    if (e.deleted_at) x.deleted = ms(e.deleted_at);
    return x;
  });
  const payments: Payment[] = [...r.settlements].sort((a, b) => String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''))).map((p) => {
    const x: Payment = { id: String(p.id), from: Number(p.from_traveller), to: Number(p.to_traveller), amt: Number(p.amount), date: String(p.paid_on ?? ''), method: p.method as Payment['method'], note: String(p.note ?? ''), created: ms(p.created_at) || 0 };
    if (p.expense_id) x.expenseId = String(p.expense_id);
    if (p.deleted_at) x.deleted = ms(p.deleted_at);
    return x;
  });
  const t: Trip = {
    id: String(tr.id), name: String(tr.name), dests: tds.map((d) => String(d.dest_key)), start: String(tr.start_date ?? ''), days: plan.length, group: String(tr.group_kind || 'couple'),
    travelers: (tr.travellers as string[]) || ['You'], pace: (tr.pace as Trip['pace']) || 'balanced', prefs: (tr.prefs as Prefs) || { natureCity: 0, sightExp: 0, foodShop: 0, advComfort: 0, tier: 1 },
    budgetTotal: Number(tr.budget_total) || 0, plan, wish, budget: Object.assign({ travel: 0, stay: 0, food: 0, local: 0, act: 0, shop: 0, misc: 0 }, (tr.budget as Budget) || {}),
    expenses, payments, stays, pack, notes: String(tr.notes ?? ''), created: ms(tr.created_at) || Date.now(), updated: ms(tr.updated_at) || Date.now(),
    destRecords, currency: String(tr.currency || 'INR'), cloud: { role },
  };
  const bm = tr.budget_mode as Trip['budgetMode'];
  if (bm && Object.keys(bm).length) t.budgetMode = bm;
  if (me != null) t.me = me;
  return t;
}

/* ------------------------------------------------------------------------------------------ diffing */

export interface TableChange { table: string; upserts: Row[]; deletes: Row[] }
const IGNORE = new Set(['version', 'updated_at', 'updated_by', 'created_at', 'created_by']);
export const sameRow = (a: Row, b: Row) => {
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if (!IGNORE.has(k) && JSON.stringify(a[k] ?? null) !== JSON.stringify(b[k] ?? null)) return false;
  return true;
};

/** Rows to write and delete to go from `prev` to `next` (per content table, in a safe order). */
export function diffRows(prev: TripRows, next: TripRows): { trip: Row | null; destinations: Row[]; changes: TableChange[] } {
  const changes: TableChange[] = [];
  for (const table of CONTENT_TABLES) {
    const a = new Map(prev[table].map((r) => [rowKey(table, r), r]));
    const b = new Map(next[table].map((r) => [rowKey(table, r), r]));
    const upserts = [...b.entries()].filter(([k, r]) => !a.has(k) || !sameRow(a.get(k)!, r)).map(([, r]) => r);
    const deletes = [...a.entries()].filter(([k]) => !b.has(k)).map(([, r]) => r);
    if (upserts.length || deletes.length) changes.push({ table, upserts, deletes });
  }
  const known = new Set(prev.destinations.map((d) => d.key));
  return { trip: sameRow(prev.trip, next.trip) ? null : next.trip, destinations: next.destinations.filter((d) => !known.has(d.key)), changes };
}

/** Apply a diff (from your pending local edits) on top of fresh server rows. */
export function patchRows(base: TripRows, d: ReturnType<typeof diffRows>): TripRows {
  const out = structuredClone(base);
  if (d.trip) out.trip = { ...out.trip, ...d.trip };
  out.destinations = [...out.destinations, ...d.destinations.filter((x) => !out.destinations.some((y) => y.key === x.key))];
  for (const c of d.changes) {
    const t = c.table as ContentTable;
    const del = new Set(c.deletes.map((r) => rowKey(t, r)));
    const up = new Map(c.upserts.map((r) => [rowKey(t, r), r]));
    out[t] = [...out[t].filter((r) => !del.has(rowKey(t, r)) && !up.has(rowKey(t, r))), ...out[t].filter((r) => up.has(rowKey(t, r))).map((r) => ({ ...r, ...up.get(rowKey(t, r)) })),
      ...[...up.values()].filter((r) => !out[t].some((x) => rowKey(t, x) === rowKey(t, r)))];
  }
  return out;
}

/* ------------------------------------------------------------------------------------------ merging */

export interface FieldConflict { field: string; base: unknown; mine: unknown; theirs: unknown }
/**
 * Three-way merge of one row: fields only you changed take yours, fields only they changed take theirs, and fields
 * both changed differently are conflicts (they keep theirs until you choose).
 */
export function mergeRow(base: Row, mine: Row, theirs: Row): { merged: Row; conflicts: FieldConflict[] } {
  const merged: Row = { ...theirs };
  const conflicts: FieldConflict[] = [];
  const eq = (x: unknown, y: unknown) => JSON.stringify(x ?? null) === JSON.stringify(y ?? null);
  for (const k of new Set([...Object.keys(mine), ...Object.keys(theirs)])) {
    if (IGNORE.has(k)) continue;
    const mineChanged = !eq(base[k], mine[k]), theirsChanged = !eq(base[k], theirs[k]);
    if (mineChanged && !theirsChanged) merged[k] = mine[k];
    else if (mineChanged && theirsChanged && !eq(mine[k], theirs[k])) conflicts.push({ field: k, base: base[k], mine: mine[k], theirs: theirs[k] });
  }
  return { merged, conflicts };
}
