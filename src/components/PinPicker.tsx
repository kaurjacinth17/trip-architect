// Click-to-drop pin on a Google Map, plus typed coordinates (the only option when the site has no Maps key).
import { GMap, hasGoogleMaps } from './GMap';

export default function PinPicker({ value, centre, onChange, height = 260 }: { value: { lat: number; lng: number } | null; centre?: { lat: number; lng: number } | null; onChange: (ll: { lat: number; lng: number } | null) => void; height?: number }) {
  const c = value || centre;
  return (
    <div className="grid" style={{ gap: 8 }}>
      {hasGoogleMaps() ? (
        <GMap label="Click the map to drop a pin" height={`${height}px`} onMapClick={onChange}
          pins={value ? [{ id: 'pin', lat: value.lat, lng: value.lng, title: 'Pin', col: '#b4532a', kind: 'place', label: '●' }] : []}
          fitTo={c ? [c] : null} />
      ) : <p className="tiny muted">Type the coordinates (you can copy them from Google Maps: right-click a spot, then click the numbers).</p>}
      <div className="row" style={{ gap: 8 }}>
        <label className="f" style={{ flex: 1 }}>Latitude<input type="number" step="0.0001" value={value?.lat ?? ''} onChange={(e) => onChange(e.target.value === '' ? null : { lat: +e.target.value, lng: value?.lng ?? c?.lng ?? 0 })} /></label>
        <label className="f" style={{ flex: 1 }}>Longitude<input type="number" step="0.0001" value={value?.lng ?? ''} onChange={(e) => onChange(e.target.value === '' ? null : { lat: value?.lat ?? c?.lat ?? 0, lng: +e.target.value })} /></label>
        {value && <button type="button" className="btn sm ghost" style={{ alignSelf: 'end' }} onClick={() => onChange(null)}>Remove pin</button>}
      </div>
    </div>
  );
}
