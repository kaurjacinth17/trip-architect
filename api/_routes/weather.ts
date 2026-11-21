// GET /api/weather?lat=…&lng=…  16-day daily forecast from Open-Meteo (CC BY 4.0), edge-cached for 3 hours.
import { z } from 'zod';
import { handler, json } from '../_lib/http.js';
import { edgeCache, fetchJson } from '../_lib/upstream.js';

const Q = z.object({ lat: z.coerce.number().min(-90).max(90), lng: z.coerce.number().min(-180).max(180) });
interface Forecast { daily?: { time: string[]; temperature_2m_max: (number | null)[]; temperature_2m_min: (number | null)[]; precipitation_probability_max: (number | null)[]; precipitation_sum: (number | null)[]; weather_code: (number | null)[] } }

export function mapForecast(f: Forecast) {
  const d = f.daily;
  if (!d) return [];
  return d.time.map((date, i) => ({ date, tmax: d.temperature_2m_max[i], tmin: d.temperature_2m_min[i], rainProb: d.precipitation_probability_max[i], rainMm: d.precipitation_sum[i], code: d.weather_code[i] }))
    .filter((x) => x.tmax != null && x.tmin != null);
}

export const GET = handler({ methods: ['GET'], rateLimit: { bucket: 'open', limit: 60, windowSec: 60 } }, async (_r, { url }) => {
  const q = Q.parse(Object.fromEntries(url.searchParams));
  const lat = Math.round(q.lat * 10) / 10, lng = Math.round(q.lng * 10) / 10;
  const f = await fetchJson<Forecast>(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,weather_code&forecast_days=16&timezone=auto`, { timeoutMs: 10_000 });
  return json({ days: f ? mapForecast(f) : [], source: 'Open-Meteo' }, { cache: edgeCache(3 * 3600) });
});
