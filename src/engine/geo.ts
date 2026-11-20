import type { LatLng } from './types';
import { up5 } from './util';

type Pt = Partial<LatLng> | null | undefined;

export const geo = (x: Pt): x is { lat: number; lng: number } => !!x && x.lat != null && x.lng != null;

/** Great-circle distance in km, or null if either point has no coordinates. */
export function km(a: Pt, b: Pt): number | null {
  if (a?.lat == null || b?.lat == null || a.lng == null || b.lng == null) return null;
  const R = 6371, toR = (x: number) => (x * Math.PI) / 180;
  const dLa = toR(b.lat - a.lat), dLo = toR(b.lng - a.lng);
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Door-to-door minutes for a straight-line distance.
 * Under 0.4 km: 5 min. Under 1.5 km: walking at ~14 min/km. Otherwise road distance
 * (×1.3, or ×1.15 over 100 km) at a speed band of 18/28/45/60 km/h plus 10 min.
 */
export function travelMin(d: number | null | undefined): number {
  if (d == null) return 0;
  if (d < 0.4) return 5;
  if (d < 1.5) return up5(d * 14);
  const road = d * (d > 100 ? 1.15 : 1.3), sp = d < 10 ? 18 : d < 40 ? 28 : d < 100 ? 45 : 60;
  return up5((road / sp) * 60 + 10);
}

export const mode = (d: number | null | undefined): '' | 'walk' | 'ride' => (d == null ? '' : d < 1.5 ? 'walk' : 'ride');

/** Travel minutes between two items, 0 if either is unmapped. */
export const trm = (a: Pt, b: Pt) => (geo(a) && geo(b) ? travelMin(km(a, b)) : 0);

export function pathKm(list: Pt[]): number {
  let s = 0;
  for (let i = 1; i < list.length; i++) s += km(list[i - 1], list[i]) || 0;
  return s;
}

/** Greedy nearest-neighbour order starting from the first point. */
export function nnOrder<T extends Pt>(g: T[]): T[] {
  if (!g.length) return [];
  const order = [g[0]], left = g.slice(1);
  while (left.length) {
    const cur = order[order.length - 1];
    let bi = 0, bd = 1e9;
    left.forEach((x, i) => {
      const d = km(cur, x)!;
      if (d < bd) { bd = d; bi = i; }
    });
    order.push(left.splice(bi, 1)[0]);
  }
  return order;
}

export function nnKm(g: Pt[]): number {
  if (g.length < 3) return pathKm(g);
  return pathKm(nnOrder(g));
}

export const fmtDist = (d: number) => (d < 1 ? Math.round(d * 1000) + ' m' : d.toFixed(1) + ' km');
