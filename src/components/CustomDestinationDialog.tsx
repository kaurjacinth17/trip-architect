// A destination that isn't on Google: the user names it and drops a pin. Works everywhere, without ratings.
import { useState } from 'react';
import { DEST_TYPE_LABEL } from '../data/costTables';
import { COUNTRY_CURRENCY } from '../data/currencies';
import { customRecord } from '../engine/dest';
import type { DestRecord, DestType } from '../engine/types';
import { Modal } from './Modal';
import PinPicker from './PinPicker';

export default function CustomDestinationDialog({ initialName, onClose, onCreate }: { initialName: string; onClose: () => void; onCreate: (r: DestRecord) => void }) {
  const [name, setName] = useState(initialName);
  const [type, setType] = useState<DestType>('other');
  const [cc, setCc] = useState('IN');
  const [point, setPoint] = useState<{ lat: number; lng: number } | null>(null);
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
      <PinPicker value={point} centre={{ lat: 22, lng: 79 }} onChange={setPoint} height={300} />
      <div className="row">
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="button" className="btn pri" disabled={!ok} onClick={() => onCreate(customRecord({ name, center: point!, type, countryCode: cc, country: cc }))}>Add place</button>
      </div>
    </Modal>
  );
}
