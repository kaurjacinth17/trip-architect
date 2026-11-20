export const uid = (): string => crypto.randomUUID().replace(/-/g, '').slice(0, 8);
export const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o)) as T;
export function sum<T>(a: readonly T[], f: (x: T) => unknown = (x) => x): number {
  return a.reduce((s, x) => s + (Number(f(x)) || 0), 0);
}
export const up5 = (m: number) => Math.ceil(m / 5) * 5;
export const up15 = (m: number) => Math.ceil(m / 15) * 15;
export const r500 = (n: number) => Math.round(n / 500) * 500;
export const inr = (n: number) => {
  n = Math.round(n || 0);
  return (n < 0 ? '−' : '') + '₹' + Math.abs(n).toLocaleString('en-IN');
};
export const plural = (n: number, w: string, p?: string) => `${n} ${n === 1 ? w : p || w + 's'}`;
export const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'trip';
export const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
/** Local calendar date as YYYY-MM-DD (the reference used toISOString(), which is UTC; see NOTES.md). */
export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export const todayISO = () => isoDate(new Date());
/** Whole days from today's local midnight until an ISO date. */
export function daysUntil(start: string, now = new Date()): number | null {
  if (!start) return null;
  const d = new Date(start + 'T00:00:00');
  if (isNaN(+d)) return null;
  return Math.round((+d - +new Date(now.toDateString())) / 864e5);
}
