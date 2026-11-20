// Fetch JSON from a non-Google provider with a timeout and an identifying User-Agent (Wikipedia and Overpass ask
// for one). No personal contact details are sent.
import { ApiError } from './http';

export const USER_AGENT = 'TripArchitect/2.0 (+https://trip-architect-pi.vercel.app/about)';

export async function fetchJson<T>(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T | null> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), init.timeoutMs ?? 12_000);
  try {
    const r = await fetch(url, { ...init, signal: ctl.signal, headers: { 'user-agent': USER_AGENT, accept: 'application/json', ...(init.headers || {}) } });
    if (r.status === 404) return null;
    if (r.status === 429) throw new ApiError(503, 'upstream_error', 'That service is busy; try again in a minute');
    if (!r.ok) throw new ApiError(502, 'upstream_error', 'That service returned an error');
    return (await r.json()) as T;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(502, 'upstream_error', 'Couldn’t reach that service right now');
  } finally {
    clearTimeout(t);
  }
}

/** Edge-cache header for open data (never used for Google content). */
export const edgeCache = (seconds: number) => `public, s-maxage=${seconds}, stale-while-revalidate=${Math.round(seconds / 2)}`;
