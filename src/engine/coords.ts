// Google Places coordinates may be cached for at most 30 consecutive days (Service Specific Terms, Places API).
// Items and destination records carry `coordsFetchedAt`; we refresh after 25 days and delete after 30.
import type { Item, Trip } from './types';
import { clone } from './util';

export const COORD_TTL_MS = 30 * 864e5;
export const COORD_REFRESH_MS = 25 * 864e5;

const allItems = (t: Trip): Item[] => [...t.plan.flatMap((d) => d.items), ...t.wish];

/** Delete expired Google coordinates. Returns the same object when nothing changed. */
export function purgeExpiredCoords(t: Trip, now = Date.now()): Trip {
  const expired = (at?: number) => at != null && now - at >= COORD_TTL_MS;
  const stale = allItems(t).some((x) => x.gid && expired(x.coordsFetchedAt)) || Object.values(t.destRecords || {}).some((r) => r.kind === 'google' && expired(r.coordsFetchedAt));
  if (!stale) return t;
  const c = clone(t);
  for (const x of allItems(c)) if (x.gid && expired(x.coordsFetchedAt)) { x.lat = null; x.lng = null; delete x.coordsFetchedAt; }
  for (const r of Object.values(c.destRecords || {})) if (r.kind === 'google' && expired(r.coordsFetchedAt)) { r.center = null; r.viewport = null; delete r.coordsFetchedAt; }
  return c;
}

/** Google place IDs whose coordinates are missing or due for refresh. */
export function coordsToRefresh(t: Trip, now = Date.now()): { items: string[]; dests: string[] } {
  const due = (at?: number, has?: boolean) => !has || at == null || now - at >= COORD_REFRESH_MS;
  const items = [...new Set(allItems(t).filter((x) => x.gid && due(x.coordsFetchedAt, x.lat != null)).map((x) => x.gid!))];
  const dests = Object.values(t.destRecords || {}).filter((r) => r.kind === 'google' && r.placeId && due(r.coordsFetchedAt, !!r.center)).map((r) => r.placeId!);
  return { items, dests };
}

/** Apply refreshed coordinates for a Google place everywhere it appears in the trip. */
export function setItemCoords(t: Trip, gid: string, loc: { lat: number; lng: number }, now = Date.now()) {
  for (const x of allItems(t)) if (x.gid === gid) { x.lat = loc.lat; x.lng = loc.lng; x.coordsFetchedAt = now; }
}

/** Strip Google coordinates (for share links and exports, which leave this app). */
export function stripGoogleCoords(t: Trip): Trip {
  const c = clone(t);
  for (const x of allItems(c)) if (x.gid) { x.lat = null; x.lng = null; delete x.coordsFetchedAt; }
  for (const r of Object.values(c.destRecords || {})) if (r.kind === 'google') { r.center = null; r.viewport = null; delete r.coordsFetchedAt; }
  return c;
}
