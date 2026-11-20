// Per-IP rate limiting: Upstash sliding window when configured, otherwise a best-effort in-memory fixed window
// (per function instance, so it's a speed bump rather than a guarantee).
import { Ratelimit } from '@upstash/ratelimit';
import { redis } from './redis';

const limiters = new Map<string, Ratelimit>();
const memory = new Map<string, { count: number; reset: number }>();

export async function rateLimit(bucket: string, ip: string, limit: number, windowSec: number): Promise<{ ok: boolean; retryAfter: number }> {
  const r = redis();
  if (r) {
    const k = `${bucket}:${limit}:${windowSec}`;
    let rl = limiters.get(k);
    if (!rl) {
      rl = new Ratelimit({ redis: r, limiter: Ratelimit.slidingWindow(limit, `${windowSec} s`), prefix: 'ta:rl:' + bucket });
      limiters.set(k, rl);
    }
    const res = await rl.limit(ip);
    return { ok: res.success, retryAfter: Math.max(1, Math.ceil((res.reset - Date.now()) / 1000)) };
  }
  const now = Date.now();
  const key = bucket + '|' + ip;
  const cur = memory.get(key);
  if (!cur || cur.reset <= now) {
    memory.set(key, { count: 1, reset: now + windowSec * 1000 });
    if (memory.size > 5000) for (const [k, v] of memory) if (v.reset <= now) memory.delete(k);
    return { ok: true, retryAfter: 0 };
  }
  cur.count++;
  return { ok: cur.count <= limit, retryAfter: Math.max(1, Math.ceil((cur.reset - now) / 1000)) };
}

/** Tests only. */
export function _resetRateLimit() {
  memory.clear();
  limiters.clear();
}
