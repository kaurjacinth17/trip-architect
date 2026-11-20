import { MONTHS, WD } from '../data/constants';

export const hm = (m: number) => {
  m = Math.round(m);
  const h = Math.floor(m / 60), r = m % 60;
  return h ? (r ? `${h}h ${r}m` : `${h}h`) : `${r}m`;
};
export const fmtT = (m: number) => {
  m = ((Math.round(m) % 1440) + 1440) % 1440;
  let h = Math.floor(m / 60);
  const mm = m % 60, ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${String(mm).padStart(2, '0')} ${ap}`;
};
export const toHHMM = (m: number) => {
  m = Math.max(0, Math.min(1439, Math.round(m)));
  return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
};
export const fromHHMM = (s: string) => {
  const [a, b] = String(s || '09:00').split(':').map(Number);
  return (a || 0) * 60 + (b || 0);
};
export function dayDate(t: { start: string }, i: number): Date | null {
  if (!t.start) return null;
  const d = new Date(t.start + 'T00:00:00');
  if (isNaN(+d)) return null;
  d.setDate(d.getDate() + i);
  return d;
}
export const fmtD = (d: Date | null) => (d ? `${WD[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}` : '');
