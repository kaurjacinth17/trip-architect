// Google Map (Maps JavaScript API via @vis.gl/react-google-maps). Every map in the app uses it: Google's terms
// require Places data on a map to be on a Google Map, and the map carries Google's own attribution. Without a
// browser key it renders nothing and callers show a list fallback (MapFallback).
import { APIProvider, AdvancedMarker, Map, useMap } from '@vis.gl/react-google-maps';
import { useEffect, useMemo, useRef } from 'react';
import { prefersReducedMotion } from '../lib/hooks';

export const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY || '';
/** DEMO_MAP_ID is Google's documented demo map ID for development; set your own for production. */
export const MAP_ID = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID';
export const hasGoogleMaps = () => !!MAPS_KEY;

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

/** Dashed polyline per day, in visit order. */
function Routes({ routes }: { routes: GRoute[] }) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    const lines = routes.filter((r) => r.pts.length > 1).map((r) => new google.maps.Polyline({
      map, path: r.pts, strokeOpacity: 0, clickable: false,
      icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.85, strokeColor: r.col, strokeWeight: 3, scale: 3 }, offset: '0', repeat: '14px' }],
    }));
    return () => lines.forEach((l) => l.setMap(null));
  }, [map, routes]);
  return null;
}

/** Neighbourhood circles (stay guide / OpenStreetMap areas). */
function Areas({ areas }: { areas: GArea[] }) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    const cs = areas.map((a) => new google.maps.Circle({ map, center: a, radius: 900, strokeOpacity: 0, fillColor: '#1f4d3a', fillOpacity: 0.1, clickable: false }));
    return () => cs.forEach((c) => c.setMap(null));
  }, [map, areas]);
  return null;
}

function Fit({ pts, fitKey }: { pts: { lat: number; lng: number }[]; fitKey: string }) {
  const map = useMap();
  useEffect(() => {
    if (!map || !pts.length) return;
    if (pts.length === 1) { map.setCenter(pts[0]); map.setZoom(15); return; }
    const b = new google.maps.LatLngBounds();
    for (const p of pts) b.extend(p);
    map.fitBounds(b, 48);
  }, [map, fitKey]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function Focus({ pin }: { pin: GPin | undefined }) {
  const map = useMap();
  useEffect(() => {
    if (!map || !pin) return;
    if (prefersReducedMotion()) map.setCenter(pin); else map.panTo(pin);
  }, [map, pin]);
  return null;
}

/** Report the visible area (centre + radius) after the user stops moving the map. */
function ViewWatcher({ onView }: { onView: (v: MapView) => void }) {
  const map = useMap();
  const cb = useRef(onView);
  cb.current = onView;
  useEffect(() => {
    if (!map) return;
    const l = map.addListener('idle', () => {
      const b = map.getBounds(), c = map.getCenter();
      if (!b || !c) return;
      const ne = b.getNorthEast();
      const radius = Math.min(10_000, Math.max(300, google.maps.geometry ? google.maps.geometry.spherical.computeDistanceBetween(c, ne) : haversine(c.lat(), c.lng(), ne.lat(), ne.lng())));
      cb.current({ center: { lat: c.lat(), lng: c.lng() }, radius });
    });
    return () => l.remove();
  }, [map]);
  return null;
}

const haversine = (a: number, b: number, c: number, d: number) => {
  const r = (x: number) => (x * Math.PI) / 180;
  const h = Math.sin(r(c - a) / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(r(d - b) / 2) ** 2;
  return 12742000 * Math.asin(Math.sqrt(h));
};

function FitButton({ pts }: { pts: { lat: number; lng: number }[] }) {
  const map = useMap();
  return (
    <div className="mapctl noprint">
      <button type="button" aria-label="Fit all" style={{ fontSize: 14 }} onClick={() => {
        if (!map || !pts.length) return;
        const b = new google.maps.LatLngBounds();
        for (const p of pts) b.extend(p);
        map.fitBounds(b, 48);
      }}>Fit</button>
    </div>
  );
}

function ClickToPin({ onClick }: { onClick: (ll: { lat: number; lng: number }) => void }) {
  const map = useMap();
  const cb = useRef(onClick);
  cb.current = onClick;
  useEffect(() => {
    if (!map) return;
    const l = map.addListener('click', (e: google.maps.MapMouseEvent) => { if (e.latLng) cb.current({ lat: +e.latLng.lat().toFixed(5), lng: +e.latLng.lng().toFixed(5) }); });
    return () => l.remove();
  }, [map]);
  return null;
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
  const frame = useMemo(() => (fitTo && fitTo.length ? fitTo : [...pins, ...areas]), [fitTo, pins, areas]);
  const fitKey = useMemo(() => frame.map((p) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join('|'), [frame]);
  if (!MAPS_KEY) return null;
  const centre = frame[0] || { lat: 22, lng: 79 };
  return (
    <APIProvider apiKey={MAPS_KEY} language="en" region="IN" libraries={['geometry']}>
      <div className="map gmap" style={{ height }} role="region" aria-label={label}>
        <Map mapId={MAP_ID} defaultCenter={centre} defaultZoom={12} gestureHandling="cooperative" clickableIcons={false} style={{ position: 'absolute', inset: 0 }}>
          <Fit pts={frame} fitKey={fitKey} />
          <Focus pin={pins.find((p) => p.id === focus)} />
          <Routes routes={routes} />
          <Areas areas={areas} />
          {onView && <ViewWatcher onView={onView} />}
          {onMapClick && <ClickToPin onClick={onMapClick} />}
          {areas.map((a) => (
            <AdvancedMarker key={'a:' + a.name} position={a} zIndex={0} clickable={false}><span className="alab">{a.name}</span></AdvancedMarker>
          ))}
          {pins.map((p) => {
            const on = p.id === active;
            return (
              <AdvancedMarker key={p.kind + ':' + p.id} position={p} title={p.title} zIndex={on ? 1000 : p.kind === 'place' ? 500 : p.kind === 'stay' ? 400 : 100}
                onClick={onPick ? () => onPick(p.id) : undefined}
                onMouseEnter={() => onHover?.(p.id)} onMouseLeave={() => onHover?.(null)}>
                <span className="gpin">
                  {p.kind === 'stay'
                    ? <span className="pin-stay"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M0 11V5l6-5 6 5v6z" /></svg></span>
                    : p.kind === 'idea' || p.kind === 'nearby'
                      ? <span className={'pin-idea' + (on ? ' on' : '')} style={{ color: p.col || '#6b7a70' }} />
                      : <span className={'pin' + (on ? ' on' : '')} style={{ background: p.col || '#1f4d3a' }}>{p.label ?? ''}</span>}
                  {(p.showTitle || on) && <span className="plab">{p.title}</span>}
                </span>
              </AdvancedMarker>
            );
          })}
        </Map>
        <APIProviderChildren pts={frame}>{children}</APIProviderChildren>
      </div>
    </APIProvider>
  );
}

function APIProviderChildren({ pts, children }: { pts: { lat: number; lng: number }[]; children?: React.ReactNode }) {
  return <><FitButton pts={pts} />{children}</>;
}

/** Without a Maps key: the same places as an accessible list with Google Maps links. */
export function MapFallback({ pins, onPick, note }: { pins: GPin[]; onPick?: (id: string) => void; note?: string }) {
  return (
    <div className="card mapfb">
      <p className="small muted">{note || 'The map isn’t available on this site right now. Here are the places instead.'}</p>
      <ol className="small">
        {pins.filter((p) => p.kind !== 'idea').slice(0, 60).map((p) => (
          <li key={p.kind + p.id}>
            {onPick ? <button type="button" className="linkish" onClick={() => onPick(p.id)}>{p.title}</button> : p.title}
            {' · '}<a href={`https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`} target="_blank" rel="noopener noreferrer">Google Maps</a>
          </li>
        ))}
      </ol>
    </div>
  );
}
