// Within one function instance, identical requests share one upstream call. A settled result is held for at most
// `holdMs` (capped at 60 s) and then dropped: this is request de-duplication, not a cache of Google content.
const inflight = new Map<string, { p: Promise<unknown>; expires: number }>();
export const MAX_HOLD_MS = 60_000;

export function dedupe<T>(key: string, fn: () => Promise<T>, holdMs = MAX_HOLD_MS): Promise<T> {
  const now = Date.now();
  const hold = Math.min(holdMs, MAX_HOLD_MS);
  const hit = inflight.get(key);
  if (hit && hit.expires > now) return hit.p as Promise<T>;
  const p = fn().catch((e) => {
    inflight.delete(key);
    throw e;
  });
  inflight.set(key, { p, expires: now + hold });
  if (inflight.size > 500) for (const [k, v] of inflight) if (v.expires <= now) inflight.delete(k);
  return p;
}

/** Tests only. */
export function _resetDedupe() {
  inflight.clear();
}
