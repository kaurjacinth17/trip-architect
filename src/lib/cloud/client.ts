// Supabase in the browser (anon key only; access is decided by Row Level Security). Loaded on demand, so guests
// never download it. Without VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY the site stays in guest mode.
import type { SupabaseClient } from '@supabase/supabase-js';

export const cloudConfigured = () => !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);

let client: Promise<SupabaseClient | null> | null = null;
export function sb(): Promise<SupabaseClient | null> {
  if (!cloudConfigured()) return Promise.resolve(null);
  client ||= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(import.meta.env.VITE_SUPABASE_URL!, import.meta.env.VITE_SUPABASE_ANON_KEY!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
      realtime: { params: { eventsPerSecond: 10 } },
    }));
  return client;
}

/** Call one of our /api functions as the signed-in user. */
export async function authedPost<T>(path: string, body: unknown): Promise<T> {
  const c = await sb();
  const token = (await c?.auth.getSession())?.data.session?.access_token;
  if (!token) throw new Error('Sign in first');
  const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error?.message || 'Something went wrong');
  return j as T;
}
