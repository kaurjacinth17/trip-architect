// Health and configuration check (also the target of the daily keep-alive cron in Phase 8).
// Returns booleans and counters only, never key values.
import { configured } from '../_lib/env.js';
import { handler, json } from '../_lib/http.js';

export const GET = handler({ methods: ['GET'], rateLimit: { bucket: 'health', limit: 30, windowSec: 60 } }, async () => {
  const providers = configured();
  return json({ ok: true, time: new Date().toISOString(), providers, sources: ['OpenStreetMap', 'Photon', 'Nominatim', 'Wikipedia', 'Open-Meteo'] }, { cache: 'no-store' });
});
