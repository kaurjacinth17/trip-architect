// Supabase from Vercel functions: verify the caller's session, and call PostgREST with the service-role key for the
// few operations RLS deliberately doesn't allow from the browser (joining a trip, changing roles, maintenance).
// The service-role key never leaves the server.
import { createHash, randomBytes } from 'node:crypto';
import { ApiError } from './http';
import { env } from './env';

export interface SbUser { id: string; email?: string }

function cfg() {
  const url = env.supabaseUrl(), anon = env.supabaseAnonKey(), service = env.supabaseServiceRole();
  if (!url || !anon || !service) throw new ApiError(503, 'not_configured', 'Accounts aren’t set up on this site');
  return { url: url.replace(/\/+$/, ''), anon, service };
}

/** The signed-in user behind `Authorization: Bearer <access token>`, checked with Supabase Auth. */
export async function verifyUser(request: Request): Promise<SbUser> {
  const { url, anon } = cfg();
  const token = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') || '')?.[1];
  if (!token) throw new ApiError(401, 'unauthorized', 'Sign in first');
  const r = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anon, authorization: `Bearer ${token}` } });
  if (!r.ok) throw new ApiError(401, 'unauthorized', 'Your session has expired; sign in again');
  const u = (await r.json()) as { id?: string; email?: string };
  if (!u?.id) throw new ApiError(401, 'unauthorized', 'Sign in first');
  return { id: u.id, email: u.email };
}

/** PostgREST with the service role. `path` like "trip_members?trip_id=eq.<id>". */
export async function admin<T = unknown>(path: string, init: { method?: string; body?: unknown; prefer?: string } = {}): Promise<T> {
  const { url, service } = cfg();
  const r = await fetch(`${url}/rest/v1/${path}`, {
    method: init.method || 'GET',
    headers: {
      apikey: service, authorization: `Bearer ${service}`, 'content-type': 'application/json',
      ...(init.prefer ? { prefer: init.prefer } : {}),
    },
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });
  if (!r.ok) {
    console.error('[api] supabase error', r.status);
    throw new ApiError(502, 'upstream_error', 'The database didn’t answer; try again');
  }
  const text = await r.text();
  return (text ? JSON.parse(text) : null) as T;
}

export const eq = (v: string) => `eq.${encodeURIComponent(v)}`;
export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
export const newToken = () => randomBytes(24).toString('base64url');

export async function roleOf(tripId: string, userId: string): Promise<'owner' | 'editor' | 'viewer' | null> {
  const rows = await admin<{ role: 'owner' | 'editor' | 'viewer' }[]>(`trip_members?select=role&trip_id=${eq(tripId)}&user_id=${eq(userId)}`);
  return rows[0]?.role ?? null;
}
