// Google Map (Maps JavaScript API via @vis.gl/react-google-maps). Places API results shown on a map must be on a
// Google Map, so live places use this; the map carries Google's own attribution. Without a browser key it renders
// nothing and callers fall back to lists.
import { APIProvider, AdvancedMarker, Map, useMap } from '@vis.gl/react-google-maps';
import { useEffect, useMemo } from 'react';
import { prefersReducedMotion } from '../lib/hooks';

export const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY || '';
/** DEMO_MAP_ID is Google's documented demo map ID for development; set your own for production. */
export const MAP_ID = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID';
export const hasGoogleMaps = () => !!MAPS_KEY;

export interface GPin { id: string; lat: number; lng: number; label?: string | number; col?: string; title: string; kind?: 'place' | 'stay' | 'idea' }

function Fit({ pins, fitKey }: { pins: GPin[]; fitKey: string }) {
  const map = useMap();
  useEffect(() => {
    if (!map || !pins.length) return;
    if (pins.length === 1) { map.setCenter(pins[0]); map.setZoom(15); return; }
    const b = new google.maps.LatLngBounds();
    for (const p of pins) b.extend(p);
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

export function GMap({ pins, active, focus, onPick, onHover, label, height = 'min(68vh,620px)' }: {
  pins: GPin[];
  active?: string | null;
  focus?: string | null;
  onPick?: (id: string) => void;
  onHover?: (id: string | null) => void;
  label: string;
  height?: string;
}) {
  const fitKey = useMemo(() => pins.map((p) => p.id).join('|'), [pins]);
  if (!MAPS_KEY) return null;
  const centre = pins[0] || { lat: 22, lng: 79 };
  return (
    <APIProvider apiKey={MAPS_KEY} language="en" region="IN">
      <div className="map gmap" style={{ height }} role="region" aria-label={label}>
        <Map mapId={MAP_ID} defaultCenter={centre} defaultZoom={12} gestureHandling="cooperative" disableDefaultUI={false} clickableIcons={false} style={{ position: 'absolute', inset: 0 }}>
          <Fit pins={pins} fitKey={fitKey} />
          <Focus pin={pins.find((p) => p.id === focus)} />
          {pins.map((p) => {
            const on = p.id === active;
            return (
              <AdvancedMarker key={p.id} position={p} title={p.title} zIndex={on ? 1000 : p.kind === 'place' ? 500 : 1}
                onClick={() => onPick?.(p.id)}
                onMouseEnter={() => onHover?.(p.id)} onMouseLeave={() => onHover?.(null)}>
                {p.kind === 'stay'
                  ? <span className="pin-stay"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M0 11V5l6-5 6 5v6z" /></svg></span>
                  : p.kind === 'idea'
                    ? <span className={'pin-idea' + (on ? ' on' : '')} style={{ color: p.col || '#6b7a70' }} />
                    : <span className={'pin' + (on ? ' on' : '')} style={{ background: p.col || '#1f4d3a' }}>{p.label ?? ''}</span>}
              </AdvancedMarker>
            );
          })}
        </Map>
      </div>
    </APIProvider>
  );
}
