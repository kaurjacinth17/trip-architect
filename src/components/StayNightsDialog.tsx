// "Set as my stay for nights X–Y": pick the nights; check-in and check-out blocks are added (locked) on apply.
import { useState } from 'react';
import { tripNights } from '../engine/stays';
import { dayDate, fmtD } from '../engine/time';
import type { Trip } from '../engine/types';
import { Modal } from './Modal';

export function StayNightsDialog({ t, hotel, initial, onApply, onClose }: {
  t: Trip; hotel: string; initial: [number, number]; onApply: (from: number, to: number) => void; onClose: () => void;
}) {
  const N = tripNights(t);
  const [from, setFrom] = useState(Math.min(initial[0], N - 1));
  const [to, setTo] = useState(Math.max(Math.min(initial[1], N - 1), Math.min(initial[0], N - 1)));
  const day = (i: number) => `Day ${i + 1}${dayDate(t, i) ? ` (${fmtD(dayDate(t, i))})` : ''}`;
  const opt = (k: number) => <option key={k} value={k}>Night {k + 1} · {day(k)}</option>;
  const nights = to - from + 1;
  return (
    <Modal title={`Set ${hotel} as my stay`} onClose={onClose}>
      <h2>Set as my stay</h2>
      <p className="small">{hotel}</p>
      <div className="grid g2" style={{ marginTop: 10 }}>
        <label className="f">From night<select value={from} onChange={(e) => { const v = +e.target.value; setFrom(v); if (to < v) setTo(v); }}>{Array.from({ length: N }, (_, k) => opt(k))}</select></label>
        <label className="f">To night<select value={to} onChange={(e) => setTo(+e.target.value)}>{Array.from({ length: N }, (_, k) => k).filter((k) => k >= from).map(opt)}</select></label>
      </div>
      <p className="small" style={{ marginTop: 10 }} aria-live="polite">
        {nights} night{nights === 1 ? '' : 's'}: check in on {day(from)}{t.plan[to + 1] ? `, check out on ${day(to + 1)}` : ''}. Both are added to the itinerary as locked blocks, and this hotel becomes the start and end point of those days.
      </p>
      <div className="row" style={{ marginTop: 12 }}>
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="button" className="btn pri" onClick={() => { onApply(from, to); onClose(); }}>Set nights {from + 1}–{to + 1}</button>
      </div>
    </Modal>
  );
}
