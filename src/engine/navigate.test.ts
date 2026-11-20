// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { navLinks } from './navigate';

const stops = (n: number) => Array.from({ length: n }, (_, i) => ({ lat: 26 + i / 100, lng: 75 + i / 100, placeId: i % 2 ? `ChIJTESTstop${String(i).padStart(12, '0')}` : undefined }));

describe('Navigate this day', () => {
  it('builds one link with origin, destination, waypoints and travel mode', () => {
    const [l, ...rest] = navLinks(stops(4), 'driving');
    expect(rest).toEqual([]);
    const u = new URL(l.url);
    expect(u.origin + u.pathname).toBe('https://www.google.com/maps/dir/');
    expect(u.searchParams.get('api')).toBe('1');
    expect(u.searchParams.get('origin')).toBe('26,75');
    expect(u.searchParams.get('destination')).toBe('26.03,75.03');
    expect(u.searchParams.get('destination_place_id')).toBe('ChIJTESTstop000000000003');
    expect(u.searchParams.get('waypoints')).toBe('26.01,75.01|26.02,75.02');
    expect(u.searchParams.get('waypoint_place_ids')).toBeNull(); // only when every waypoint has one
    expect(u.searchParams.get('travelmode')).toBe('driving');
  });
  it('splits long days: 9 waypoints on desktop, 3 on mobile, consecutive links share a stop', () => {
    const d = navLinks(stops(14), 'walking');
    expect(d.map((l) => [l.from, l.to])).toEqual([[0, 10], [10, 13]]);
    expect(new URL(d[0].url).searchParams.get('waypoints')!.split('|')).toHaveLength(9);
    const m = navLinks(stops(9), 'driving', 'mobile');
    expect(m.map((l) => [l.from, l.to])).toEqual([[0, 4], [4, 8]]);
    for (const l of m) expect((new URL(l.url).searchParams.get('waypoints') || '').split('|').length).toBeLessThanOrEqual(3);
  });
  it('needs at least two mapped stops', () => {
    expect(navLinks(stops(1))).toEqual([]);
    expect(navLinks([{ lat: NaN, lng: 1 }, { lat: 1, lng: 1 }])).toEqual([]);
  });
});
