// GET /api/climate?lat=…&lng=…  Monthly climate normals from Open-Meteo's historical archive (CC BY 4.0).
// Coordinates are rounded to 0.1° so nearby requests share the edge cache.
import { z } from 'zod';
import { handler, json } from '../_lib/http';
import { edgeCache, fetchJson } from '../_lib/upstream';

const Q = z.object({ lat: z.coerce.number().min(-90).max(90), lng: z.coerce.number().min(-180).max(180) });
export const YEARS = { from: 2015, to: 2024 };

interface Archive { daily?: { time: string[]; temperature_2m_max: (number | null)[]; temperature_2m_min: (number | null)[]; precipitation_sum: (number | null)[] } }

/** Aggregate daily values into 12 monthly normals (exported for tests). */
export function monthlyNormals(d: NonNullable<Archive['daily']>) {
  const acc = Array.from({ length: 12 }, () => ({ tmax: 0, tmin: 0, n: 0, rain: 0, rainDays: 0, months: new Set<string>() }));
  d.time.forEach((t, i) => {
    const m = Number(t.slice(5, 7)) - 1;
    const a = acc[m];
    const hi = d.temperature_2m_max[i], lo = d.temperature_2m_min[i], p = d.precipitation_sum[i];
    if (hi == null || lo == null) return;
    a.tmax += hi; a.tmin += lo; a.n++;
    a.rain += p ?? 0;
    if ((p ?? 0) >= 1) a.rainDays++;
    a.months.add(t.slice(0, 7));
  });
  return acc.map((a) => {
    const months = Math.max(1, a.months.size);
    return a.n ? { tmax: +(a.tmax / a.n).toFixed(1), tmin: +(a.tmin / a.n).toFixed(1), rainMm: Math.round(a.rain / months), rainDays: +(a.rainDays / months).toFixed(1) } : null;
  });
}

export const GET = handler({ methods: ['GET'], rateLimit: { bucket: 'open', limit: 60, windowSec: 60 } }, async (_r, { url }) => {
  const q = Q.parse(Object.fromEntries(url.searchParams));
  const lat = Math.round(q.lat * 10) / 10, lng = Math.round(q.lng * 10) / 10;
  const a = await fetchJson<Archive>(`https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}&start_date=${YEARS.from}-01-01&end_date=${YEARS.to}-12-31&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto`, { timeoutMs: 20_000 });
  const months = a?.daily ? monthlyNormals(a.daily) : null;
  return json({ months, period: `${YEARS.from}–${YEARS.to}`, source: 'Open-Meteo' }, { cache: edgeCache(30 * 86400) });
});
