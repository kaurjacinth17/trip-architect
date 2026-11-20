// A destination that isn't on Google: the user names it and drops a pin. Works everywhere, without ratings.
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useState } from 'react';
import { MapContainer, Marker, TileLayer, useMapEvents } from 'react-leaflet';
import { DEST_TYPE_LABEL } from '../data/costTables';
import { COUNTRY_CURRENCY } from '../data/currencies';
import { customRecord } from '../engine/dest';
import type { DestRecord, DestType } from '../engine/types';
import { TILE_ATTRIBUTION, TILE_URL } from '../lib/tiles';
import { Modal } from './Modal';

const pin = L.divIcon({ className: '', html: '<span class="pin" style="background:#b4532a">●</span>', iconSize: [24, 24], iconAnchor: [12, 12] });

function Picker({ onPick }: { onPick: (ll: { lat: number; lng: number }) => void }) {
  useMapEvents({ click: (e) => onPick({ lat: +e.latlng.lat.toFixed(5), lng: +e.latlng.lng.toFixed(5) }) });
  return null;
}

export default function CustomDestinationDialog({ initialName, onClose, onCreate }: { initialName: string; onClose: () => void; onCreate: (r: DestRecord) => void }) {
  const [name, setName] = useState(initialName);
  const [type, setType] = useState<DestType>('other');
  const [cc, setCc] = useState('IN');
  const [ll, setLl] = useState<{ lat: number; lng: number } | null>(null);
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const point = ll || (lat && lng && Number.isFinite(+lat) && Number.isFinite(+lng) ? { lat: +lat, lng: +lng } : null);
  const ok = name.trim().length > 0 && !!point && Math.abs(point.lat) <= 90 && Math.abs(point.lng) <= 180;
  return (
    <Modal title="Add a custom place" onClose={onClose} wide>
      <h2>Add a custom place</h2>
      <p className="small muted">For somewhere Google doesn’t list. It works in every part of the planner; there are just no ratings or live suggestions.</p>
      <div className="grid g3" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))' }}>
        <label className="f">Name<input type="text" value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="f">Kind of place<select value={type} onChange={(e) => setType(e.target.value as DestType)}>{Object.entries(DEST_TYPE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label className="f">Country<select value={cc} onChange={(e) => setCc(e.target.value)}>{Object.keys(COUNTRY_CURRENCY).sort().map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
      </div>
      <p className="small"><b>Drop a pin:</b> click the map, or type coordinates.</p>
      <div className="map" style={{ height: 300, minHeight: 300 }} role="region" aria-label="Click to drop a pin">
        <MapContainer center={ll ? [ll.lat, ll.lng] : [22, 79]} zoom={ll ? 10 : 4} style={{ height: '100%' }}>
          <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
          <Picker onPick={(p) => { setLl(p); setLat(String(p.lat)); setLng(String(p.lng)); }} />
          {point && <Marker position={[point.lat, point.lng]} icon={pin} />}
        </MapContainer>
      </div>
      <div className="grid g2">
        <label className="f">Latitude<input type="number" step="0.0001" value={lat} onChange={(e) => { setLat(e.target.value); setLl(null); }} /></label>
        <label className="f">Longitude<input type="number" step="0.0001" value={lng} onChange={(e) => { setLng(e.target.value); setLl(null); }} /></label>
      </div>
      <div className="row">
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="button" className="btn pri" disabled={!ok} onClick={() => onCreate(customRecord({ name, center: point!, type, countryCode: cc, country: cc }))}>Add place</button>
      </div>
    </Modal>
  );
}
