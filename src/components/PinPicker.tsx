// Click-to-drop pin (also accepts typed coordinates). Used for custom blocks and custom places.
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapContainer, Marker, TileLayer, useMapEvents } from 'react-leaflet';
import { TILE_ATTRIBUTION, TILE_URL } from '../lib/tiles';

const pin = L.divIcon({ className: '', html: '<span class="pin" style="background:#b4532a">●</span>', iconSize: [24, 24], iconAnchor: [12, 12] });

function Picker({ onPick }: { onPick: (ll: { lat: number; lng: number }) => void }) {
  useMapEvents({ click: (e) => onPick({ lat: +e.latlng.lat.toFixed(5), lng: +e.latlng.lng.toFixed(5) }) });
  return null;
}

export default function PinPicker({ value, centre, onChange, height = 260 }: { value: { lat: number; lng: number } | null; centre?: { lat: number; lng: number } | null; onChange: (ll: { lat: number; lng: number } | null) => void; height?: number }) {
  const c = value || centre;
  return (
    <div className="grid" style={{ gap: 8 }}>
      <div className="map" style={{ height, minHeight: height }} role="region" aria-label="Click to drop a pin">
        <MapContainer center={c ? [c.lat, c.lng] : [22, 79]} zoom={c ? 13 : 4} style={{ height: '100%' }}>
          <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
          <Picker onPick={onChange} />
          {value && <Marker position={[value.lat, value.lng]} icon={pin} />}
        </MapContainer>
      </div>
      <div className="row" style={{ gap: 8 }}>
        <label className="f" style={{ flex: 1 }}>Latitude<input type="number" step="0.0001" value={value?.lat ?? ''} onChange={(e) => onChange(e.target.value === '' ? null : { lat: +e.target.value, lng: value?.lng ?? c?.lng ?? 0 })} /></label>
        <label className="f" style={{ flex: 1 }}>Longitude<input type="number" step="0.0001" value={value?.lng ?? ''} onChange={(e) => onChange(e.target.value === '' ? null : { lat: value?.lat ?? c?.lat ?? 0, lng: +e.target.value })} /></label>
        {value && <button type="button" className="btn sm ghost" style={{ alignSelf: 'end' }} onClick={() => onChange(null)}>Remove pin</button>}
      </div>
    </div>
  );
}
