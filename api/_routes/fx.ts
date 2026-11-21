// GET /api/fx?base=INR  Daily reference rates from Frankfurter (European Central Bank). Cached for 6 hours.
import { z } from 'zod';
import { ApiError, handler, json } from '../_lib/http';
import { edgeCache, fetchJson } from '../_lib/upstream';

const Q = z.object({ base: z.string().regex(/^[A-Z]{3}$/).default('INR') });

export const GET = handler({ methods: ['GET'], rateLimit: { bucket: 'open', limit: 60, windowSec: 60 } }, async (_r, { url }) => {
  const q = Q.parse(Object.fromEntries(url.searchParams));
  const r = await fetchJson<{ base: string; date: string; rates: Record<string, number> }>(`https://api.frankfurter.dev/v1/latest?base=${q.base}`);
  if (!r) throw new ApiError(404, 'not_found', 'No rates for that currency');
  return json({ base: r.base, date: r.date, rates: { ...r.rates, [r.base]: 1 }, source: 'Frankfurter (ECB)' }, { cache: edgeCache(6 * 3600) });
});
