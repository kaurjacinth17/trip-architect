// Upstash Redis when UPSTASH_* is set (shared across function instances), otherwise null.
import { Redis } from '@upstash/redis';
import { env } from './env';

let client: Redis | null | undefined;
export function redis(): Redis | null {
  if (client !== undefined) return client;
  client = env.upstashUrl() && env.upstashToken() ? new Redis({ url: env.upstashUrl(), token: env.upstashToken() }) : null;
  return client;
}
/** Tests only. */
export function _resetRedis(r?: Redis | null) {
  client = r;
}
