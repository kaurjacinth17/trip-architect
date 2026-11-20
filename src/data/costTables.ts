// Rough daily costs (INR) for Indian destinations by type, used when a destination has no hand-written guide.
//
// Not invented: each row is the average of the curated guides of that type in destinations.raw.ts
// (stay per room per night; food and local transport per person per day; budget / mid / luxury):
//   tier2      = Jaipur, Udaipur          beach = Goa, Pondicherry
//   hill       = Manali                   pilgrimage = Varanasi, Rishikesh
// There is no curated metro or wildlife destination, so those types (and every destination abroad) ask the
// user to enter their own figures instead of showing a made-up number.
import type { CostTiers, DestType } from '../engine/types';
import { D } from './destinations';

const avg = (...ids: string[]): CostTiers => {
  const k = (f: 'stay' | 'food' | 'local') => [0, 1, 2].map((i) => Math.round(ids.reduce((s, id) => s + D[id].cost[f][i], 0) / ids.length / 50) * 50) as [number, number, number];
  return { stay: k('stay'), food: k('food'), local: k('local') };
};

export const COST_BASIS: Partial<Record<DestType, string[]>> = {
  tier2: ['jaipur', 'udaipur'],
  beach: ['goa', 'pondicherry'],
  hill: ['manali'],
  pilgrimage: ['varanasi', 'rishikesh'],
};

export const COST_TABLE: Partial<Record<DestType, CostTiers>> = Object.fromEntries(
  Object.entries(COST_BASIS).map(([t, ids]) => [t, avg(...ids!)]),
);

export const DEST_TYPE_LABEL: Record<DestType, string> = {
  metro: 'Metro city', tier2: 'City (tier 2)', hill: 'Hill station or mountains', beach: 'Beach', pilgrimage: 'Pilgrimage town', wildlife: 'Wildlife or national park', other: 'Other',
};
