// The whole trip at a glance on OpenStreetMap (Leaflet). Only our own data is drawn here: hand-written guide places,
// places the user pinned or typed, and stays the user entered. Google places are never shown on a non-Google map
// (Google Maps Platform terms), so items and stays with a Google place ID are left out.
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';
import { DAYC } from '../data/constants';
import type { Trip } from '../engine/types';

export default function OverviewMap({ t, height = 360 }: { t: Trip; height?: number }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!el.current) return;
    const map = L.map(el.current, { scrollWheelZoom: false, attributionControl: true });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(map);
    const pts: L.LatLngExpression[] = [];
    t.plan.forEach((d, di) => {
      const col = DAYC[di % DAYC.length];
      const line: L.LatLngExpression[] = [];
      [...d.items].sort((a, b) => a.s - b.s).forEach((x, k) => {
        if (x.gid || x.lat == null || x.lng == null) return;
        const ll: L.LatLngExpression = [x.lat, x.lng];
        line.push(ll);
        pts.push(ll);
        L.circleMarker(ll, { radius: 7, color: '#fff', weight: 2, fillColor: col, fillOpacity: 1 })
          .bindTooltip(`Day ${di + 1} · ${k + 1}. ${x.t}`).addTo(map);
      });
      if (line.length > 1) L.polyline(line, { color: col, weight: 2, dashArray: '4 6', opacity: 0.8 }).addTo(map);
    });
    for (const s of t.stays) {
      if (s.gid || s.lat == null || s.lng == null) continue;
      const ll: L.LatLngExpression = [s.lat, s.lng];
      pts.push(ll);
      L.marker(ll, { icon: L.divIcon({ className: 'ov-home', html: '🏨', iconSize: [24, 24] }) }).bindTooltip(s.name || 'Your stay').addTo(map);
    }
    if (pts.length) map.fitBounds(L.latLngBounds(pts), { padding: [24, 24], maxZoom: 14 });
    else map.setView([22.5, 79], 4);
    return () => { map.remove(); };
  }, [t]);
  const own = t.plan.some((d) => d.items.some((x) => !x.gid && x.lat != null));
  return (
    <div>
      <div ref={el} className="ovmap" style={{ height }} role="img" aria-label={`Overview map of ${t.name}`} />
      {!own && <p className="tiny muted" style={{ marginTop: 6 }}>Nothing to show here yet: this map shows guide places and your own pins.</p>}
    </div>
  );
}
