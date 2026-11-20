// One view over curated destinations (D) and destination records (any place on Google, or a custom pin).
// The engine reads destinations only through destView(), so curated behaviour is unchanged (parity tests).
import { COST_TABLE } from '../data/costTables';
import { COUNTRY_CURRENCY } from '../data/currencies';
import { D } from '../data/destinations';
import { bestMonths, bestTimeText } from './bestMonths';
import type { CostTiers, Dest, DestRecord, DestType, Trip } from './types';
import { uid } from './util';

export interface DestView {
  key: string;
  kind: 'curated' | 'google' | 'custom';
  name: string;
  region?: string;
  country?: string;
  inIndia: boolean;
  center: { lat: number; lng: number } | null;
  /** Recommended stay. `daysKnown` is false when it's only a default. */
  days: [number, number];
  daysKnown: boolean;
  good: number[];
  poor: number[];
  bestTime: string;
  /** Rough daily costs, or null when there's no honest basis (the user is asked instead). */
  cost: CostTiers | null;
  costSource: 'curated' | 'table' | 'user' | null;
  /** Packing/climate tags (hot, cold, beach, hills, monsoon, temple) */
  climateTags: (month?: number) => string[];
  areas: [string, string, number, number][];
  type: DestType | null;
  currency: string;
  curated?: Dest;
  record?: DestRecord;
}

type WithRecords = Pick<Trip, 'destRecords'> | null | undefined;

const DEFAULT_DAYS: [number, number] = [2, 3];

function fromCurated(d: Dest): DestView {
  return {
    key: d.id, kind: 'curated', name: d.name, region: d.state, country: 'India', inIndia: true,
    center: { lat: d.center[0], lng: d.center[1] }, days: d.days, daysKnown: true, good: d.good, poor: d.poor,
    bestTime: d.bestTime, cost: d.cost, costSource: 'curated', climateTags: () => d.climate, areas: d.areas,
    type: null, currency: 'INR', curated: d,
  };
}

export function recordCost(r: DestRecord): { cost: CostTiers | null; source: DestView['costSource'] } {
  if (r.cost) return { cost: r.cost, source: 'user' };
  if (r.countryCode === 'IN' && COST_TABLE[r.type]) return { cost: COST_TABLE[r.type]!, source: 'table' };
  return { cost: null, source: null };
}

function fromRecord(r: DestRecord): DestView {
  const bm = bestMonths(r.climate);
  const { cost, source } = recordCost(r);
  const typeTags = r.type === 'beach' ? ['beach'] : r.type === 'hill' ? ['hills'] : r.type === 'pilgrimage' ? ['temple'] : [];
  return {
    key: r.key, kind: r.kind, name: r.name, region: r.region, country: r.country, inIndia: r.countryCode === 'IN',
    center: r.center, days: r.days || DEFAULT_DAYS, daysKnown: !!r.days, good: r.climate ? bm.good : [], poor: r.climate ? bm.poor : [],
    bestTime: bestTimeText(r.climate), cost, costSource: source,
    climateTags: (month) => {
      const tags = [...typeTags];
      const c = month ? r.climate?.[month - 1] : null;
      if (c) {
        if (c.tmax >= 30) tags.push('hot');
        if (c.tmin <= 8) tags.push('cold');
        if (c.rainMm >= 150) tags.push('monsoon');
      }
      return tags;
    },
    areas: [], type: r.type, currency: r.currency, record: r,
  };
}

/** The destination for a trip key ("jaipur", "g:ChIJ…", "c:ab12cd34"), or null if unknown. */
export function destView(t: WithRecords, key: string | null | undefined): DestView | null {
  if (!key) return null;
  if (D[key]) return fromCurated(D[key]);
  const r = t?.destRecords?.[key];
  return r ? fromRecord(r) : null;
}

export const destName = (t: WithRecords, key: string | null | undefined) => destView(t, key)?.name || 'Unknown place';
export const routeName = (t: Pick<Trip, 'dests' | 'destRecords'>) => t.dests.map((k) => destName(t, k)).join(' → ');

/** Destination type from Google's types. Only unambiguous cases are inferred; the user picks the rest. */
export function inferDestType(types: string[] = []): DestType {
  if (types.includes('national_park') || types.includes('wildlife_park')) return 'wildlife';
  return 'other';
}

export interface GoogleDestination {
  placeId: string; name: string; region?: string; country?: string; countryCode?: string;
  center?: { lat: number; lng: number }; viewport?: DestRecord['viewport']; types: string[]; timezone?: string;
}

export function recordFromGoogle(g: GoogleDestination, now = Date.now()): DestRecord {
  return {
    key: 'g:' + g.placeId, kind: 'google', placeId: g.placeId, name: g.name, region: g.region, country: g.country,
    countryCode: g.countryCode, center: g.center || null, viewport: g.viewport || null, coordsFetchedAt: g.center ? now : undefined,
    googleTypes: g.types, type: inferDestType(g.types), timezone: g.timezone,
    currency: (g.countryCode && COUNTRY_CURRENCY[g.countryCode]) || 'INR',
  };
}

export function customRecord(o: { name: string; center: { lat: number; lng: number }; type?: DestType; countryCode?: string; country?: string }): DestRecord {
  return {
    key: 'c:' + uid(), kind: 'custom', name: o.name.trim(), center: o.center, type: o.type || 'other',
    countryCode: o.countryCode, country: o.country, currency: (o.countryCode && COUNTRY_CURRENCY[o.countryCode]) || 'INR',
  };
}

/** Recommended days from the number of well-reviewed attractions: 1 day per ~5, clamped to 1–7 ("suggested"). */
export function suggestedDays(attractions: { rating?: number; userRatingCount?: number }[]): number {
  const good = attractions.filter((a) => (a.rating ?? 0) >= 4.2 && (a.userRatingCount ?? 0) >= 500).length;
  return Math.max(1, Math.min(7, Math.round(good / 5) || 1));
}
