// "Navigate this day in Google Maps": Maps URLs directions links (no API key, no cost). Google allows up to nine
// waypoints, but only three in mobile browsers, so long days are split into several consecutive links that share
// their end/start stop. Place IDs are passed alongside coordinates, as the Maps URLs docs require.
export type TravelMode = 'driving' | 'walking' | 'transit' | 'bicycling' | 'two-wheeler';
export interface NavStop { lat: number; lng: number; placeId?: string; label?: string }
export interface NavLink { url: string; from: number; to: number }

export const MAX_WAYPOINTS = { desktop: 9, mobile: 3 } as const;

const ll = (s: NavStop) => `${s.lat},${s.lng}`;

export function navLinks(stops: NavStop[], mode: TravelMode = 'driving', platform: 'desktop' | 'mobile' = 'desktop'): NavLink[] {
  const pts = stops.filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng));
  if (pts.length < 2) return [];
  const per = MAX_WAYPOINTS[platform] + 2; // origin + waypoints + destination
  const out: NavLink[] = [];
  for (let start = 0; start < pts.length - 1; start += per - 1) {
    const chunk = pts.slice(start, start + per);
    if (chunk.length < 2) break;
    const o = chunk[0], d = chunk[chunk.length - 1], w = chunk.slice(1, -1);
    const p = new URLSearchParams({ api: '1', origin: ll(o), destination: ll(d), travelmode: mode === 'two-wheeler' ? 'two-wheeler' : mode });
    if (o.placeId) p.set('origin_place_id', o.placeId);
    if (d.placeId) p.set('destination_place_id', d.placeId);
    if (w.length) {
      p.set('waypoints', w.map(ll).join('|'));
      if (w.every((x) => x.placeId)) p.set('waypoint_place_ids', w.map((x) => x.placeId).join('|'));
    }
    out.push({ url: 'https://www.google.com/maps/dir/?' + p.toString(), from: start, to: start + chunk.length - 1 });
  }
  return out;
}

/** Phones and small tablets get the mobile limit (the link may open in a mobile browser before the app). */
export const navPlatform = (): 'desktop' | 'mobile' =>
  typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ? 'mobile' : 'desktop';
