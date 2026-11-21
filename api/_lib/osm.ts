// Open data for places, with no Google: OpenStreetMap via Overpass (places, hotels, restaurants; ODbL), Photon
// (destination search), Nominatim (destination details and addresses) and Wikipedia/Wikimedia Commons (summaries
// and photos). Each service's fair-use rules apply: answers are cached at the edge and in-function, and every request
// carries an identifying User-Agent. Results use the same shape the app used before (`mapPlace`), so the site is
// unchanged apart from fields open data doesn't have (ratings, review counts, price levels).
import { ApiError } from './http.js';
import { fetchJson } from './upstream.js';

export interface OsmEl { type: 'node' | 'way' | 'relation'; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }
export interface Overpass { elements?: OsmEl[] }

/* ---------------------------------------------------------------------------------------------- ids */

const T: Record<string, string> = { node: 'N', way: 'W', relation: 'R', N: 'N', W: 'W', R: 'R', n: 'N', w: 'W', r: 'R' };
/** "osm-N123": our place ID for an OpenStreetMap object (stored in trips; ODbL allows it). */
export const osmId = (type: string, id: number | string) => `osm-${T[type] || 'N'}${id}`;
export const OSM_ID_RE = /^osm-[NWR]\d{1,15}$/;
export function parseOsmId(id: string): { type: 'node' | 'way' | 'relation'; letter: 'N' | 'W' | 'R'; num: string } | null {
  const m = /^osm-([NWR])(\d{1,15})$/.exec(id);
  if (!m) return null;
  return { type: m[1] === 'N' ? 'node' : m[1] === 'W' ? 'way' : 'relation', letter: m[1] as 'N' | 'W' | 'R', num: m[2] };
}

/* ------------------------------------------------------------------------------------------ overpass */

export const OVERPASS_URLS = () => [process.env.OVERPASS_URL || 'https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];

export async function overpass(query: string): Promise<Overpass> {
  let last: unknown;
  for (const u of OVERPASS_URLS()) {
    try {
      const r = await fetchJson<Overpass>(u, { method: 'POST', body: 'data=' + encodeURIComponent(query), headers: { 'content-type': 'application/x-www-form-urlencoded' }, timeoutMs: 25_000 });
      return r || { elements: [] };
    } catch (e) { last = e; }
  }
  throw last instanceof ApiError ? last : new ApiError(502, 'upstream_error', 'OpenStreetMap didn’t answer; try again');
}

/** Which OpenStreetMap features each City Guide tab and map layer shows. */
export const FILTERS: Record<string, string[]> = {
  famous: ['["tourism"~"^(attraction|museum|viewpoint|gallery)$"]', '["historic"~"^(monument|castle|fort|palace|memorial|ruins|archaeological_site|city_gate)$"]', '["amenity"="place_of_worship"]["wikidata"]'],
  todo: ['["leisure"~"^(park|garden|nature_reserve|water_park)$"]["name"]', '["tourism"~"^(zoo|theme_park|aquarium|viewpoint)$"]', '["natural"~"^(beach|peak|waterfall)$"]["name"]', '["leisure"="sports_centre"]["sport"~"climbing|surfing|diving"]'],
  restaurants: ['["amenity"~"^(restaurant|food_court)$"]'],
  cafes: ['["amenity"="cafe"]', '["shop"~"^(bakery|tea|coffee)$"]["name"]'],
  hotels: ['["tourism"~"^(hotel|guest_house|hostel|motel|apartment|chalet)$"]'],
  shopping: ['["shop"~"^(mall|department_store|clothes|gift|jewelry|books|craft|art|souvenir|handicraft)$"]', '["amenity"="marketplace"]'],
  nightlife: ['["amenity"~"^(bar|pub|nightclub|biergarten)$"]'],
  // map layers
  attractions: ['["tourism"~"^(attraction|museum|viewpoint)$"]', '["historic"~"^(monument|castle|fort|palace)$"]'],
  atms: ['["amenity"="atm"]', '["amenity"="bank"]["atm"="yes"]'],
  pharmacies: ['["amenity"="pharmacy"]', '["shop"="chemist"]'],
  hospitals: ['["amenity"~"^(hospital|clinic)$"]'],
  stations: ['["railway"="station"]["train"!="no"]', '["public_transport"="station"]["train"="yes"]'],
  airports: ['["aeroway"="aerodrome"]["iata"]'],
};

const nameRe = (s: string) => s.replace(/[^\p{L}\p{N} '&.-]/gu, '').trim();

/** Overpass QL: the features for `kinds` within `radius` metres of a point, optionally whose name matches `text`. */
export function aroundQuery(kinds: string[], center: { lat: number; lng: number }, radius: number, opts: { text?: string; limit?: number; named?: boolean } = {}) {
  const r = Math.round(Math.max(200, Math.min(radius, 50_000)));
  const name = opts.text ? `["name"~"${nameRe(opts.text)}",i]` : opts.named === false ? '' : '["name"]';
  const parts = kinds.flatMap((k) => (FILTERS[k] || []).map((f) => `nwr${f}${name}(around:${r},${center.lat},${center.lng});`));
  return `[out:json][timeout:25];(${parts.join('')});out center tags ${opts.limit || 150};`;
}

export const byIdQuery = (ids: string[]) => {
  const ps = ids.map(parseOsmId).filter(Boolean) as NonNullable<ReturnType<typeof parseOsmId>>[];
  return `[out:json][timeout:20];(${ps.map((p) => `${p.type}(${p.num});`).join('')});out center tags;`;
};

/* --------------------------------------------------------------------------------- tags → place shape */

/** OSM tags → the place types the app already understands (src/engine/placeTypes.ts). */
export function typesOf(t: Record<string, string>): string[] {
  const out: string[] = [];
  const v = (k: string) => t[k];
  if (v('tourism') && /^(hotel|motel|apartment|chalet)$/.test(v('tourism'))) out.push('lodging', 'hotel');
  if (v('tourism') === 'guest_house') out.push('lodging', 'guest_house');
  if (v('tourism') === 'hostel') out.push('lodging', 'hostel');
  if (v('amenity') === 'restaurant' || v('amenity') === 'food_court') out.push('restaurant');
  if (v('amenity') === 'fast_food') out.push('meal_takeaway');
  if (v('amenity') === 'cafe') out.push('cafe');
  if (v('shop') === 'bakery') out.push('bakery');
  if (v('shop') === 'tea' || v('shop') === 'coffee') out.push('cafe');
  if (/^(bar|biergarten)$/.test(v('amenity') || '')) out.push('bar');
  if (v('amenity') === 'pub') out.push('pub');
  if (v('amenity') === 'nightclub') out.push('night_club');
  if (v('amenity') === 'place_of_worship') out.push(({ hindu: 'hindu_temple', muslim: 'mosque', christian: 'church', sikh: 'gurudwara', buddhist: 'buddhist_temple', jain: 'hindu_temple' } as Record<string, string>)[v('religion')] || 'place_of_worship');
  if (v('tourism') === 'museum') out.push('museum');
  if (v('tourism') === 'gallery') out.push('art_gallery');
  if (/^(castle|fort)$/.test(v('historic') || '')) out.push('fort');
  if (v('historic') === 'palace' || v('castle_type') === 'palace') out.push('palace');
  if (/^(monument|memorial|city_gate)$/.test(v('historic') || '')) out.push('monument');
  if (/^(ruins|archaeological_site)$/.test(v('historic') || '')) out.push('archaeological_site');
  if (v('tourism') === 'viewpoint') out.push('viewpoint');
  if (v('tourism') === 'zoo') out.push('zoo');
  if (v('tourism') === 'theme_park') out.push('amusement_park');
  if (v('leisure') === 'water_park') out.push('water_park');
  if (v('tourism') === 'aquarium') out.push('aquarium');
  if (v('leisure') === 'park') out.push('park');
  if (v('leisure') === 'garden') out.push('garden');
  if (v('leisure') === 'nature_reserve' || v('boundary') === 'national_park') out.push('national_park');
  if (v('natural') === 'beach') out.push('beach');
  if (v('natural') === 'peak') out.push('mountain_peak');
  if (v('natural') === 'waterfall') out.push('waterfall');
  if (v('amenity') === 'marketplace') out.push('market');
  if (v('shop') === 'mall') out.push('shopping_mall');
  if (v('shop') === 'department_store') out.push('department_store');
  if (v('shop') && !out.length) out.push('store');
  if (v('amenity') === 'atm' || v('atm') === 'yes') out.push('atm');
  if (v('amenity') === 'pharmacy' || v('shop') === 'chemist') out.push('pharmacy');
  if (/^(hospital|clinic)$/.test(v('amenity') || '')) out.push('hospital');
  if (v('railway') === 'station' || v('public_transport') === 'station') out.push('train_station');
  if (v('aeroway') === 'aerodrome') out.push('airport');
  if (v('tourism') === 'attraction' && !out.length) out.push('tourist_attraction');
  if (!out.length) out.push('point_of_interest');
  return [...new Set(out)];
}

/** How notable a place is, from open signals only (a Wikipedia article, heritage listing, website, official class). */
export function notability(t: Record<string, string>): number {
  return (t.wikipedia || t.wikidata ? 5 : 0) + (t.heritage ? 2 : 0) + (t.tourism === 'attraction' ? 1 : 0) + (t.website || t['contact:website'] ? 1 : 0)
    + (t.stars ? Math.min(5, parseFloat(t.stars) || 0) / 5 : 0) + (t['name:en'] ? 0.5 : 0) + (t.opening_hours ? 0.3 : 0);
}

const DAY: Record<string, number> = { Su: 0, Mo: 1, Tu: 2, We: 3, Th: 4, Fr: 5, Sa: 6 };
/**
 * Common OSM opening_hours forms → weekly periods (minutes of the week, Sunday 00:00 = 0). Handles "24/7",
 * "Mo-Su 09:00-18:00", lists like "Mo-Fr 10:00-19:00; Sa 10:00-14:00", several ranges a day and after-midnight
 * closing. Anything more complex (holidays, months, "sunset") returns undefined, meaning "unknown".
 */
export function parseOpeningHours(s?: string): { open: number; close: number | null }[] | undefined {
  if (!s) return undefined;
  const v = s.trim();
  if (v === '24/7') return [{ open: 0, close: null }];
  const out: { open: number; close: number | null }[] = [];
  for (const rule of v.split(';').map((x) => x.trim()).filter(Boolean)) {
    const m = /^((?:(?:Mo|Tu|We|Th|Fr|Sa|Su)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?,?)+)?\s*(.+)$/.exec(rule);
    if (!m) return undefined;
    const daysPart = m[1] || 'Mo-Su';
    const times = m[2].trim();
    const days: number[] = [];
    for (const d of daysPart.split(',').filter(Boolean)) {
      const [a, b] = d.split('-');
      if (!(a in DAY) || (b && !(b in DAY))) return undefined;
      if (!b) days.push(DAY[a]);
      else for (let i = DAY[a]; ; i = (i + 1) % 7) { days.push(i); if (i === DAY[b]) break; }
    }
    if (/^off$/i.test(times)) continue;
    for (const r of times.split(',')) {
      const t = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/.exec(r.trim());
      if (!t) return undefined;
      const o = +t[1] * 60 + +t[2];
      let c = +t[3] * 60 + +t[4];
      if (c <= o) c += 1440;
      for (const d of days) out.push({ open: d * 1440 + o, close: (d * 1440 + c) % (7 * 1440) });
    }
  }
  return out.length ? out : undefined;
}

const pt = (e: OsmEl) => (e.center ? { lat: e.center.lat, lng: e.center.lon } : e.lat != null && e.lon != null ? { lat: e.lat, lng: e.lon } : undefined);
const nm = (t: Record<string, string>) => t['name:en'] || t.name || t['int_name'] || '';
const mapsLink = (l?: { lat: number; lng: number }) => (l ? `https://www.google.com/maps/search/?api=1&query=${l.lat},${l.lng}` : undefined);

/** One OSM feature → the app's place shape. No ratings, review counts or price levels exist in open data. */
export function mapOsm(e: OsmEl) {
  const t = e.tags || {};
  const types = typesOf(t);
  const location = pt(e);
  const area = t['addr:suburb'] || t['addr:neighbourhood'] || t['addr:quarter'] || t['addr:district'] || undefined;
  const street = [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' ');
  return {
    id: osmId(e.type, e.id),
    name: nm(t),
    types,
    primaryType: types[0],
    location,
    rating: undefined as number | undefined,
    userRatingCount: undefined as number | undefined,
    priceLevel: undefined as number | undefined,
    openNow: undefined as boolean | undefined,
    googleMapsUri: mapsLink(location),
    areaHint: area,
    address: [street, area, t['addr:city']].filter(Boolean).join(', ') || undefined,
    closed: t['disused:amenity'] || t.disused === 'yes' ? 'permanently' as const : undefined,
    hours: parseOpeningHours(t.opening_hours),
    wheelchair: t.wheelchair === 'yes' ? true : t.wheelchair === 'no' ? false : undefined,
    stars: t.stars ? parseFloat(t.stars) || undefined : undefined,
    cuisine: t.cuisine ? t.cuisine.split(';').map((x) => x.replace(/_/g, ' ')).slice(0, 3) : undefined,
    veg: t['diet:vegetarian'] === 'yes' || t['diet:vegetarian'] === 'only' ? true : t['diet:vegetarian'] === 'no' ? false : undefined,
    notability: notability(t),
  };
}
export type OsmPlace = ReturnType<typeof mapOsm>;

/** Places sorted by notability, then name; no duplicates, no unnamed features. */
export function mapList(r: Overpass): OsmPlace[] {
  const seen = new Set<string>();
  return (r.elements || []).map(mapOsm).filter((p) => p.name && p.location && !seen.has(p.name.toLowerCase() + p.primaryType) && seen.add(p.name.toLowerCase() + p.primaryType))
    .sort((a, b) => b.notability - a.notability || a.name.localeCompare(b.name));
}

/* ------------------------------------------------------------------------------- photon / nominatim */

export interface PhotonFeature { geometry: { coordinates: [number, number] }; properties: { osm_type: string; osm_id: number; osm_key?: string; osm_value?: string; name?: string; state?: string; country?: string; countrycode?: string; county?: string; extent?: [number, number, number, number]; type?: string } }
export const PHOTON_URL = () => process.env.PHOTON_URL || 'https://photon.komoot.io';
export const NOMINATIM_URL = () => process.env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org';

export async function photon(q: string, limit = 8): Promise<PhotonFeature[]> {
  const r = await fetchJson<{ features?: PhotonFeature[] }>(`${PHOTON_URL()}/api/?q=${encodeURIComponent(q)}&limit=${limit}&lang=en&lat=22.5&lon=79&location_bias_scale=0.2`, { timeoutMs: 8000 });
  return r?.features || [];
}

export interface NomPlace { osm_type: string; osm_id: number; lat: string; lon: string; boundingbox?: [string, string, string, string]; name?: string; display_name?: string; category?: string; type?: string; address?: Record<string, string>; extratags?: Record<string, string> }
export async function nominatimLookup(ids: string[], lang = 'en'): Promise<NomPlace[]> {
  const list = ids.map(parseOsmId).filter(Boolean).map((p) => `${p!.letter}${p!.num}`).join(',');
  if (!list) return [];
  const r = await fetchJson<NomPlace[]>(`${NOMINATIM_URL()}/lookup?osm_ids=${list}&format=jsonv2&addressdetails=1&extratags=1&accept-language=${lang}`, { timeoutMs: 10_000 });
  return r || [];
}

/* --------------------------------------------------------------------------------------- wikipedia */

export interface WikiSummary { type?: string; title?: string; extract?: string; thumbnail?: { source: string; width: number; height: number }; originalimage?: { source: string; width: number; height: number }; content_urls?: { desktop?: { page?: string } } }
export async function wikiSummary(title: string, lang = 'en'): Promise<WikiSummary | null> {
  return fetchJson<WikiSummary>(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`, { timeoutMs: 8000 });
}

/** A Wikimedia image URL at a given width (thumbnail URLs carry the width in the file name). */
export function sized(src: string, w: number) {
  return /\/\d+px-/.test(src) ? src.replace(/\/\d+px-/, `/${w}px-`) : src;
}

/** Photographer and licence for a Commons file (shown as the credit). */
export async function commonsCredit(fileUrl: string): Promise<{ name: string; uri: string; licence?: string } | null> {
  const m = /\/(?:thumb\/)?[0-9a-f]\/[0-9a-f]{2}\/([^/]+?)(?:\/\d+px-[^/]+)?$/.exec(fileUrl);
  if (!m) return null;
  const file = decodeURIComponent(m[1]);
  const r = await fetchJson<{ query?: { pages?: Record<string, { imageinfo?: { extmetadata?: Record<string, { value?: string }> }[] }> } }>(
    `https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=extmetadata&titles=${encodeURIComponent('File:' + file)}`, { timeoutMs: 8000 }).catch(() => null);
  const meta = Object.values(r?.query?.pages || {})[0]?.imageinfo?.[0]?.extmetadata || {};
  const artist = (meta.Artist?.value || '').replace(/<[^>]+>/g, '').trim();
  return { name: artist || 'Wikimedia Commons', uri: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file)}`, licence: meta.LicenseShortName?.value };
}
