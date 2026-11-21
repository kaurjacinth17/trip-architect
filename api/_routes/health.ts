// Health and configuration check (also the target of the daily keep-alive cron in Phase 8).
// Returns booleans and counters only, never key values.
import { usage } from '../_lib/budget';
import { configured } from '../_lib/env';
import { handler, json } from '../_lib/http';

export const GET = handler({ methods: ['GET'], rateLimit: { bucket: 'health', limit: 30, windowSec: 60 } }, async () => {
  const providers = configured();
  const u = await usage();
  const resting = Object.values(u).some((x) => x.used >= x.limit) ? Object.entries(u).filter(([, x]) => x.used >= x.limit).map(([k]) => k) : [];
  return json({ ok: true, time: new Date().toISOString(), providers, resting }, { cache: 'no-store' });
});
