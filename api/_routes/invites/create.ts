// POST /api/invites/create  { tripId, role, days, maxUses, email? }  Owner only. Returns a join link; only a hash of
// its token is stored. Email invites open the owner's mail app with the link (no email service is used).
import { z } from 'zod';
import { ApiError, handler, json, readJson } from '../../_lib/http';
import { admin, newToken, roleOf, sha256, verifyUser } from '../../_lib/supabase';

const Body = z.object({
  tripId: z.string().uuid(),
  role: z.enum(['editor', 'viewer']),
  days: z.number().int().min(1).max(30).default(7),
  maxUses: z.number().int().min(1).max(100).default(10),
  email: z.string().email().max(200).optional(),
});

export const POST = handler({ methods: ['POST'], rateLimit: { bucket: 'invites', limit: 20, windowSec: 60 } }, async (request) => {
  const user = await verifyUser(request);
  const b = Body.parse(await readJson(request));
  if ((await roleOf(b.tripId, user.id)) !== 'owner') throw new ApiError(403, 'forbidden', 'Only the trip’s owner can invite people');
  const token = newToken();
  const expiresAt = new Date(Date.now() + b.days * 86_400_000).toISOString();
  const [row] = await admin<{ id: string }[]>('invites', {
    method: 'POST', prefer: 'return=representation',
    body: { trip_id: b.tripId, token_hash: sha256(token), role: b.role, email: b.email ?? null, expires_at: expiresAt, max_uses: b.maxUses, created_by: user.id },
  });
  const site = (process.env.VITE_SITE_URL || new URL(request.url).origin).replace(/\/+$/, '');
  return json({ id: row?.id, url: `${site}/join/${token}`, role: b.role, expiresAt, maxUses: b.maxUses });
});
