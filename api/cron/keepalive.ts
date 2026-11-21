// GET /api/cron/keepalive  Daily Vercel cron (vercel.json). Free Supabase projects pause after a week without
// activity; this query keeps the database awake. It also deletes Google coordinates older than 30 days from the
// database (the Places API caching limit), as the app does in browsers.
import { ApiError, handler, json } from '../_lib/http';
import { env } from '../_lib/env';
import { admin } from '../_lib/supabase';

const CLEAR = { lat: null, lng: null, coords_fetched_at: null };

export const GET = handler({ methods: ['GET'] }, async (request) => {
  const secret = env.cronSecret();
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) throw new ApiError(401, 'unauthorized', 'Not allowed');
  await admin('trips?select=id&limit=1');
  const cutoff = encodeURIComponent(new Date(Date.now() - 30 * 86_400_000).toISOString());
  await admin(`items?gid=not.is.null&coords_fetched_at=lt.${cutoff}`, { method: 'PATCH', body: CLEAR });
  await admin(`stays?gid=not.is.null&coords_fetched_at=lt.${cutoff}`, { method: 'PATCH', body: CLEAR });
  // Google destinations only (custom pins are the user’s own data)
  await admin(`trip_destinations?dest_key=like.g%3A*&coords_fetched_at=lt.${cutoff}`, { method: 'PATCH', body: { center_lat: null, center_lng: null, viewport: null, coords_fetched_at: null } });
  return json({ ok: true, at: new Date().toISOString() });
});
