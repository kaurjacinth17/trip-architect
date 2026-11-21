// POST /api/members/update  { tripId, userId, role?, remove?, travellerIndex? }  Owner manages members: change role
// (editor/viewer), remove someone, or link a member to a traveller in the trip. Members may set their own traveller.
import { z } from 'zod';
import { ApiError, handler, json, readJson } from '../../_lib/http.js';
import { admin, eq, roleOf, verifyUser } from '../../_lib/supabase.js';

const Body = z.object({
  tripId: z.string().uuid(),
  userId: z.string().uuid(),
  role: z.enum(['editor', 'viewer']).optional(),
  remove: z.boolean().optional(),
  travellerIndex: z.number().int().min(0).max(29).nullable().optional(),
});

export const POST = handler({ methods: ['POST'], rateLimit: { bucket: 'members', limit: 30, windowSec: 60 } }, async (request) => {
  const user = await verifyUser(request);
  const b = Body.parse(await readJson(request));
  const mine = await roleOf(b.tripId, user.id);
  const self = b.userId === user.id;
  if (mine !== 'owner' && !(self && mine && b.role === undefined && !b.remove)) throw new ApiError(403, 'forbidden', 'Only the trip’s owner can change members');
  const theirs = self ? mine : await roleOf(b.tripId, b.userId);
  if (!theirs) throw new ApiError(404, 'not_found', 'That person isn’t in this trip');
  if (theirs === 'owner' && (b.role || b.remove)) throw new ApiError(400, 'bad_request', 'The owner’s role can’t be changed');
  const where = `trip_members?trip_id=${eq(b.tripId)}&user_id=${eq(b.userId)}`;
  if (b.remove) {
    await admin(where, { method: 'DELETE' });
    return json({ removed: true });
  }
  const patch: Record<string, unknown> = {};
  if (b.role) patch.role = b.role;
  if (b.travellerIndex !== undefined) patch.traveller_index = b.travellerIndex;
  if (!Object.keys(patch).length) throw new ApiError(400, 'bad_request', 'Nothing to change');
  await admin(where, { method: 'PATCH', body: patch });
  return json({ ok: true, ...patch });
});
