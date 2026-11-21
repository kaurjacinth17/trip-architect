// POST /api/invites/redeem  { token }  Join a trip with an invite link. Checks expiry, revocation and uses.
import { z } from 'zod';
import { ApiError, handler, json, readJson } from '../../_lib/http';
import { admin, eq, roleOf, sha256, verifyUser } from '../../_lib/supabase';

const Body = z.object({ token: z.string().min(20).max(100).regex(/^[A-Za-z0-9_-]+$/) });
interface Invite { id: string; trip_id: string; role: 'editor' | 'viewer'; expires_at: string; max_uses: number; uses: number; revoked_at: string | null }

export const POST = handler({ methods: ['POST'], rateLimit: { bucket: 'redeem', limit: 20, windowSec: 60 } }, async (request) => {
  const user = await verifyUser(request);
  const { token } = Body.parse(await readJson(request));
  const [inv] = await admin<Invite[]>(`invites?select=id,trip_id,role,expires_at,max_uses,uses,revoked_at&token_hash=${eq(sha256(token))}`);
  if (!inv) throw new ApiError(404, 'not_found', 'This invite link isn’t valid');
  const already = await roleOf(inv.trip_id, user.id);
  if (already) return json({ tripId: inv.trip_id, role: already, already: true });
  if (inv.revoked_at) throw new ApiError(410 as number, 'forbidden', 'This invite was withdrawn; ask for a new one');
  if (Date.parse(inv.expires_at) < Date.now()) throw new ApiError(410 as number, 'forbidden', 'This invite has expired; ask for a new one');
  if (inv.uses >= inv.max_uses) throw new ApiError(410 as number, 'forbidden', 'This invite has been used up; ask for a new one');
  // Count the use first (only if it still has uses left), then add the member.
  const used = await admin<{ id: string }[]>(`invites?id=${eq(inv.id)}&uses=${eq(String(inv.uses))}`, { method: 'PATCH', prefer: 'return=representation', body: { uses: inv.uses + 1 } });
  if (!used.length) throw new ApiError(409 as number, 'bad_request', 'Please try again');
  await admin('trip_members', { method: 'POST', prefer: 'resolution=ignore-duplicates', body: { trip_id: inv.trip_id, user_id: user.id, role: inv.role } });
  return json({ tripId: inv.trip_id, role: inv.role });
});
