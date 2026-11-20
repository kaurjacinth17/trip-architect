// Leaflet replacement for the reference's schematic SVG map (`mountMap`), keeping its behaviour:
// numbered day-coloured pins, dashed per-day routes, neighbourhood circles, labels and pin picking.
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useMemo, useRef } from 'react';
import { Circle, MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet';
import { esc } from '../engine/util';
import { prefersReducedMotion } from '../lib/hooks';
import { TILE_ATTRIBUTION, TILE_URL } from '../lib/tiles';

export interface Pin {
  id: string;
  lat: number;
  lng: number;
  kind: 'plan' | 'idea' | 'stay';
  col?: string;
  num?: number | string;
  lab?: string;
}
export interface LL { lat: number; lng: number }
export interface MapData {
  pts: Pin[];
  routes?: { col: string; pts: LL[] }[];
  areas?: { name: string; lat: number; lng: number }[];
  /** What to frame; null/empty frames everything. */
  fitTo?: LL[] | null;
  showAreas?: boolean;
  labels?: boolean;
  sel?: string | null;
  onPick?: (id: string) => void;
  label: string;
}

const HOUSE = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M0 11V5l6-5 6 5v6z"/></svg>';

function icon(p: Pin, on: boolean) {
  if (p.kind === 'stay') return L.divIcon({ className: '', html: `<span class="pin-stay">${HOUSE}</span>`, iconSize: [24, 24], iconAnchor: [12, 12] });
  if (p.kind === 'idea') {
    const s = on ? 20 : 14;
    return L.divIcon({ className: '', html: `<span class="pin-idea${on ? ' on' : ''}" style="color:${p.col}"></span>`, iconSize: [s, s], iconAnchor: [s / 2, s / 2] });
  }
  const s = on ? 32 : 24;
  return L.divIcon({ className: '', html: `<span class="pin${on ? ' on' : ''}" style="background:${p.col}">${esc(p.num ?? '')}</span>`, iconSize: [s, s], iconAnchor: [s / 2, s / 2] });
}

function Fit({ pts, fitKey }: { pts: LL[]; fitKey: string }) {
  const map = useMap();
  const first = useRef(true);
  useEffect(() => {
    if (!pts.length) return;
    const b = L.latLngBounds(pts.map((p) => [p.lat, p.lng] as [number, number]));
    map.fitBounds(b, { padding: [45, 45], maxZoom: 15, animate: !first.current && !prefersReducedMotion() });
    first.current = false;
    // fitKey identifies the framing; re-fit only when it changes, not on every render
  }, [fitKey]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function Controls({ pts }: { pts: LL[] }) {
  const map = useMap();
  const fit = () => {
    if (!pts.length) return;
    map.fitBounds(L.latLngBounds(pts.map((p) => [p.lat, p.lng] as [number, number])), { padding: [45, 45], maxZoom: 15 });
  };
  return (
    <div className="mapctl noprint">
      <button type="button" onClick={() => map.zoomIn()} aria-label="Zoom in">+</button>
      <button type="button" onClick={() => map.zoomOut()} aria-label="Zoom out">−</button>
      <button type="button" onClick={fit} aria-label="Fit all" style={{ fontSize: 14 }}>Fit</button>
    </div>
  );
}

/** Hide pin labels that would overlap an earlier one (the reference's `free()` collision check). */
function Declutter({ dep }: { dep: string }) {
  const map = useMap();
  useEffect(() => {
    const run = () => {
      const els = [...map.getContainer().querySelectorAll<HTMLElement>('.leaflet-tooltip.plab')];
      const boxes: DOMRect[] = [];
      for (const el of els.sort((a, b) => Number(b.classList.contains('on')) - Number(a.classList.contains('on')))) {
        el.style.visibility = '';
        const r = el.getBoundingClientRect();
        if (boxes.some((o) => r.left < o.right && r.right > o.left && r.top < o.bottom && r.bottom > o.top)) el.style.visibility = 'hidden';
        else boxes.push(r);
      }
    };
    const t = setTimeout(run, 50);
    map.on('zoomend moveend', run);
    return () => { clearTimeout(t); map.off('zoomend moveend', run); };
  }, [map, dep]);
  return null;
}

export default function MapView(data: MapData) {
  const { pts, routes = [], areas = [], showAreas = true, labels, sel, onPick } = data;
  const all = useMemo<LL[]>(() => [...pts, ...areas], [pts, areas]);
  const frame = data.fitTo && data.fitTo.length ? data.fitTo : all;
  const fitKey = frame.map((p) => p.lat.toFixed(4) + ',' + p.lng.toFixed(4)).join('|');
  const centre: [number, number] = frame.length ? [frame[0].lat, frame[0].lng] : [22, 79];
  const ord = [...pts].sort((a, b) => Number(a.id === sel) - Number(b.id === sel));
  return (
    <div className="map" role="region" aria-label={data.label}>
      <MapContainer center={centre} zoom={12} zoomControl={false} scrollWheelZoom style={{ height: '100%' }} zoomAnimation={!prefersReducedMotion()}>
        <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
        <Fit pts={frame} fitKey={fitKey} />
        <Controls pts={frame} />
        {labels && <Declutter dep={fitKey + (sel || '')} />}
        {showAreas && areas.map((a) => (
          <Circle key={a.name} center={[a.lat, a.lng]} radius={900} pathOptions={{ stroke: false, fillColor: '#1f4d3a', fillOpacity: 0.1 }} interactive={false}>
            <Tooltip permanent direction="top" offset={[0, -14]} className="alab">{a.name}</Tooltip>
          </Circle>
        ))}
        {routes.filter((r) => r.pts.length > 1).map((r, i) => (
          <Polyline key={i} positions={r.pts.map((p) => [p.lat, p.lng] as [number, number])} pathOptions={{ color: r.col, weight: 3, dashArray: '6 6', opacity: 0.75, lineCap: 'round' }} interactive={false} />
        ))}
        {ord.map((p) => {
          const on = p.id === sel;
          return (
            <Marker key={p.kind + p.id} position={[p.lat, p.lng]} icon={icon(p, on)} title={p.lab} alt={p.lab} zIndexOffset={on ? 1000 : p.kind === 'plan' ? 500 : 0}
              eventHandlers={onPick ? { click: () => onPick(p.id) } : undefined}>
              {p.lab && (labels || on) && <Tooltip permanent direction="right" offset={[12, 0]} className={'plab' + (on ? ' on' : '')}>{p.lab}</Tooltip>}
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
