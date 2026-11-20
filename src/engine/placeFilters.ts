// City Guide filters, sorting and badges. Pure; operates on live results held in memory only.
import { km } from './geo';
import { isOpenAt, type Period } from './hours';
import { PRIOR, bayesScores, isHiddenGem } from './ranking';

export interface GuidePlace {
  id: string;
  name: string;
  types: string[];
  primaryType?: string;
  location?: { lat: number; lng: number };
  rating?: number;
  userRatingCount?: number;
  priceLevel?: number;
  openNow?: boolean;
  hours?: Period[];
  wheelchair?: boolean;
  areaHint?: string;
  googleMapsUri?: string;
  /** Area whose query found this result ("All areas" mode) */
  foundIn?: string;
  closed?: 'temporarily' | 'permanently';
  /** Position in Google's relevance order (lower is more relevant) */
  rank: number;
}

export interface GuideFilters {
  minRating?: number;
  minReviews?: number;
  price?: number[];
  areas?: string[];
  open?: 'now' | { weekday: number; minute: number };
  veg?: boolean;
  wheelchair?: boolean;
  q?: string;
}

export type SortKey = 'famous' | 'rating' | 'reviews' | 'nearHotel' | 'nearDay' | 'price';

export interface FilterCtx {
  /** veg-friendly by place id, once details have loaded */
  veg?: Record<string, boolean | undefined>;
}

export function applyFilters(list: GuidePlace[], f: GuideFilters, ctx: FilterCtx = {}): GuidePlace[] {
  const q = f.q?.trim().toLowerCase();
  return list.filter((p) => {
    if (p.closed === 'permanently') return false;
    if (f.minRating && !((p.rating ?? 0) >= f.minRating)) return false;
    if (f.minReviews && !((p.userRatingCount ?? 0) >= f.minReviews)) return false;
    if (f.price?.length && (p.priceLevel == null || !f.price.includes(p.priceLevel))) return false;
    if (f.areas?.length && !f.areas.some((a) => a === p.foundIn || a === p.areaHint)) return false;
    if (f.open === 'now' && p.openNow !== true) return false;
    if (f.open && f.open !== 'now' && !(p.hours && isOpenAt(p.hours, f.open.weekday, f.open.minute))) return false;
    if (f.veg && ctx.veg?.[p.id] !== true) return false;
    if (f.wheelchair && p.wheelchair !== true) return false;
    if (q && !p.name.toLowerCase().includes(q) && !(p.areaHint || '').toLowerCase().includes(q)) return false;
    return true;
  });
}

export interface SortCtx { attractions: boolean; hotel?: { lat: number; lng: number } | null; dayCentre?: { lat: number; lng: number } | null }

export function sortPlaces(list: GuidePlace[], key: SortKey, ctx: SortCtx): GuidePlace[] {
  const out = [...list];
  const dist = (p: GuidePlace, o?: { lat: number; lng: number } | null) => (o && p.location ? km(o, p.location)! : Infinity);
  switch (key) {
    case 'rating': return out.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1) || (b.userRatingCount ?? 0) - (a.userRatingCount ?? 0));
    case 'reviews': return out.sort((a, b) => (b.userRatingCount ?? -1) - (a.userRatingCount ?? -1));
    case 'price': return out.sort((a, b) => (a.priceLevel ?? 99) - (b.priceLevel ?? 99) || (b.rating ?? 0) - (a.rating ?? 0));
    case 'nearHotel': return out.sort((a, b) => dist(a, ctx.hotel) - dist(b, ctx.hotel));
    case 'nearDay': return out.sort((a, b) => dist(a, ctx.dayCentre) - dist(b, ctx.dayCentre));
    default: {
      // Famous: Bayesian score (m = 300 for attractions, 150 otherwise) with a small weight for Google's order.
      const byRank = [...out].sort((a, b) => a.rank - b.rank);
      const s = bayesScores(byRank, ctx.attractions ? PRIOR.attractions : PRIOR.other);
      const score = new Map(byRank.map((p, i) => [p.id, s[i]]));
      return out.sort((a, b) => score.get(b.id)! - score.get(a.id)!);
    }
  }
}

export interface Badges { mustSee: boolean; hiddenGem: boolean; editorsPick: boolean }

/** Must-see: curated must-sees plus the top 10 by Famous score. Hidden gem: 4.5+ with 50–800 reviews. */
export function badgesFor(list: GuidePlace[], attractions: boolean, curated: Record<string, { must: boolean }> = {}): Map<string, Badges> {
  const top = new Set(sortPlaces(list, 'famous', { attractions }).slice(0, 10).map((p) => p.id));
  return new Map(list.map((p) => [p.id, {
    mustSee: (attractions && top.has(p.id)) || !!curated[p.id]?.must,
    hiddenGem: isHiddenGem(p),
    editorsPick: !!curated[p.id],
  }]));
}

/** Merge pages / area runs, keeping the first occurrence of each place and recording every area it was found in. */
export function mergeResults(pages: { area?: string; places: Omit<GuidePlace, 'rank' | 'foundIn'>[] }[]): GuidePlace[] {
  const seen = new Map<string, GuidePlace>();
  let rank = 0;
  for (const pg of pages) {
    for (const p of pg.places) {
      if (seen.has(p.id)) continue;
      seen.set(p.id, { ...p, rank: rank++, foundIn: pg.area });
    }
  }
  return [...seen.values()];
}
