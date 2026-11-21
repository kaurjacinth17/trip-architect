// Every map in the app: OpenStreetMap tiles via Leaflet (free, no key; © OpenStreetMap contributors, ODbL).
// The component keeps the props the app already used (pins, day routes, area circles, framing, focus, hover,
// "search this area" view reports and click-to-pin), so pages don't care which map library draws it.
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useMemo, useRef } from 'react';
import { prefersReducedMotion } from '../lib/hooks';

/** Maps need no key any more; kept for callers that still ask. */
export const hasGoogleMaps = () => true;
export const hasMap = hasGoogleMaps;

export interface GPin {
  id: string; lat: number; lng: number; title: string;
  label?: string | number; col?: string;
  kind?: 'place' | 'stay' | 'idea' | 'nearby';
  /** show the title next to the pin */
  showTitle?: boolean;
}
export interface GRoute { col: string; pts: { lat: number; lng: number }[] }
export interface GArea { name: string; lat: number; lng: number }
export interface MapView { center: { lat: number; lng: number }; radius: number }

/** Tile server: OpenStreetMap's own by default (fair use, light traffic). Set VITE_MAP_TILES to use another provider. */
const TILES = import.meta.env.VITE_MAP_TILES || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIB = '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors';

const haversine = (a: number, b: number, c: number, d: number) => {
  const r = (x: number) => (x * Math.PI) / 180;
  const h = Math.sin(r(c - a) / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(r(d - b) / 2) ** 2;
  return 12742000 * Math.asin(Math.sqrt(h));
};
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function pinHtml(p: GPin, on: boolean) {
  const body = p.kind === 'stay'
    ? '<span class="pin-stay"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M0 11V5l6-5 6 5v6z" /></svg></span>'
    : p.kind === 'idea' || p.kind === 'nearby'
      ? `<span class="pin-idea${on ? ' on' : ''}" style="color:${p.col || '#6b7a70'}"></span>`
      : `<span class="pin${on ? ' on' : ''}" style="background:${p.col || '#1f4d3a'}">${esc(String(p.label ?? ''))}</span>`;
  return `<span class="gpin">${body}${p.showTitle || on ? `<span class="plab">${esc(p.title)}</span>` : ''}</span>`;
}

export function GMap({ pins, routes = [], areas = [], fitTo, active, focus, onPick, onHover, onView, onMapClick, label, height = 'min(68vh,620px)', children }: {
  pins: GPin[];
  routes?: GRoute[];
  areas?: GArea[];
  /** what to frame; defaults to all pins and areas */
  fitTo?: { lat: number; lng: number }[] | null;
  active?: string | null;
  focus?: string | null;
  onPick?: (id: string) => void;
  onHover?: (id: string | null) => void;
  onView?: (v: MapView) => void;
  onMapClick?: (ll: { lat: number; lng: number }) => void;
  label: string;
  height?: string;
  children?: React.ReactNode;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layers = useRef<{ pins: L.LayerGroup; shapes: L.LayerGroup } | null>(null);
  const cbs = useRef({ onPick, onHover, onView, onMapClick });
  cbs.current = { onPick, onHover, onView, onMapClick };
  const frame = useMemo(() => (fitTo && fitTo.length ? fitTo : [...pins, ...areas]), [fitTo, pins, areas]);
  const fitKey = useMemo(() => frame.map((p) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join('|'), [frame]);

  // Create the map once
  useEffect(() => {
    if (!el.current) return;
    const m = L.map(el.current, { scrollWheelZoom: false, zoomControl: true, attributionControl: true }).setView([22, 79], 5);
    L.tileLayer(TILES, { maxZoom: 19, attribution: ATTRIB }).addTo(m);
    layers.current = { shapes: L.layerGroup().addTo(m), pins: L.layerGroup().addTo(m) };
    m.on('moveend', () => {
      if (!cbs.current.onView) return;
      const c = m.getCenter(), ne = m.getBounds().getNorthEast();
      cbs.current.onView({ center: { lat: c.lat, lng: c.lng }, radius: Math.min(10_000, Math.max(300, haversine(c.lat, c.lng, ne.lat, ne.lng))) });
    });
    m.on('click', (e: L.LeafletMouseEvent) => cbs.current.onMapClick?.({ lat: +e.latlng.lat.toFixed(5), lng: +e.latlng.lng.toFixed(5) }));
    map.current = m;
    return () => { m.remove(); map.current = null; layers.current = null; };
  }, []);

  // Routes and areas
  useEffect(() => {
    const g = layers.current?.shapes;
    if (!g) return;
    g.clearLayers();
    for (const r of routes) if (r.pts.length > 1) L.polyline(r.pts.map((p) => [p.lat, p.lng] as L.LatLngTuple), { color: r.col, weight: 3, opacity: 0.85, dashArray: '6 8', interactive: false }).addTo(g);
    for (const a of areas) {
      L.circle([a.lat, a.lng], { radius: 900, stroke: false, fillColor: '#1f4d3a', fillOpacity: 0.1, interactive: false }).addTo(g);
      L.marker([a.lat, a.lng], { icon: L.divIcon({ className: 'alab-wrap', html: `<span class="alab">${esc(a.name)}</span>`, iconSize: undefined }), interactive: false, zIndexOffset: -1000 }).addTo(g);
    }
  }, [routes, areas]);

  // Pins
  useEffect(() => {
    const g = layers.current?.pins;
    if (!g) return;
    g.clearLayers();
    for (const p of pins) {
      const on = p.id === active;
      const mk = L.marker([p.lat, p.lng], {
        icon: L.divIcon({ className: 'gpin-wrap', html: pinHtml(p, on), iconSize: undefined }),
        title: p.title, alt: p.title, keyboard: !!cbs.current.onPick,
        zIndexOffset: on ? 1000 : p.kind === 'place' ? 500 : p.kind === 'stay' ? 400 : 100,
      });
      mk.on('click', () => cbs.current.onPick?.(p.id));
      mk.on('mouseover', () => cbs.current.onHover?.(p.id));
      mk.on('mouseout', () => cbs.current.onHover?.(null));
      mk.addTo(g);
    }
  }, [pins, active]);

  // Frame the places
  useEffect(() => {
    const m = map.current;
    if (!m || !frame.length) return;
    if (frame.length === 1) m.setView([frame[0].lat, frame[0].lng], 15, { animate: false });
    else m.fitBounds(L.latLngBounds(frame.map((p) => [p.lat, p.lng] as L.LatLngTuple)), { padding: [48, 48], maxZoom: 16, animate: false });
  }, [fitKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Focus a pin
  useEffect(() => {
    const m = map.current;
    const p = pins.find((x) => x.id === focus);
    if (!m || !p) return;
    m.panTo([p.lat, p.lng], { animate: !prefersReducedMotion() });
  }, [focus]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="map gmap" style={{ height, position: 'relative' }} role="region" aria-label={label}>
      <div ref={el} style={{ position: 'absolute', inset: 0 }} />
      <div className="mapctl noprint">
        <button type="button" aria-label="Fit all" style={{ fontSize: 14 }} onClick={() => {
          const m = map.current;
          if (!m || !frame.length) return;
          m.fitBounds(L.latLngBounds(frame.map((p) => [p.lat, p.lng] as L.LatLngTuple)), { padding: [48, 48], maxZoom: 16 });
        }}>Fit</button>
      </div>
      {children}
    </div>
  );
}

/** A plain list of the places with map links (used where a list reads better than a map). */
export function MapFallback({ pins, onPick, note }: { pins: GPin[]; onPick?: (id: string) => void; note?: string }) {
  return (
    <div className="card mapfb">
      <p className="small muted">{note || 'Here are the places.'}</p>
      <ol className="small">
        {pins.filter((p) => p.kind !== 'idea').slice(0, 60).map((p) => (
          <li key={p.kind + p.id}>
            {onPick ? <button type="button" className="linkish" onClick={() => onPick(p.id)}>{p.title}</button> : p.title}
            {' · '}<a href={`https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lng}#map=17/${p.lat}/${p.lng}`} target="_blank" rel="noopener noreferrer">Map</a>
          </li>
        ))}
      </ol>
    </div>
  );
}
