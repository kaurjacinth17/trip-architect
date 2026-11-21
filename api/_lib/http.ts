// Typed errors and JSON responses for every function. Error bodies are generic: upstream messages, stack traces
// and request URLs (which could contain keys) are never echoed to the client.
import { ZodError } from 'zod';
import { clientIp } from './ip.js';
import { rateLimit } from './ratelimit.js';

export type ErrorCode =
  | 'bad_request' | 'not_found' | 'method_not_allowed' | 'rate_limited' | 'quota_exhausted'
  | 'not_configured' | 'upstream_error' | 'unauthorized' | 'forbidden' | 'internal';

export class ApiError extends Error {
  constructor(public status: number, public code: ErrorCode, message: string, public retryAfter?: number, public details?: unknown) {
    super(message);
  }
}

export interface JsonInit { status?: number; headers?: Record<string, string>; cache?: string }

export function json(data: unknown, init: JsonInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status: init.status ?? 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': init.cache ?? 'no-store',
      'x-content-type-options': 'nosniff',
      ...init.headers,
    },
  });
}

export function errorResponse(e: unknown): Response {
  if (e instanceof ZodError) {
    return json({ error: { code: 'bad_request', message: 'Invalid request', issues: e.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) } }, { status: 400 });
  }
  if (e instanceof ApiError) {
    const headers: Record<string, string> = {};
    if (e.retryAfter) headers['retry-after'] = String(e.retryAfter);
    return json({ error: { code: e.code, message: e.message, ...(e.details ? { details: e.details } : {}) } }, { status: e.status, headers });
  }
  // Unknown failure: log a generic line server-side, return a generic message.
  console.error('[api] internal error:', e instanceof Error ? e.name : typeof e);
  return json({ error: { code: 'internal', message: 'Something went wrong' } }, { status: 500 });
}

export interface HandlerOptions {
  methods: ('GET' | 'POST' | 'DELETE' | 'PATCH')[];
  /** Per-IP limit for this endpoint group. */
  rateLimit?: { bucket: string; limit: number; windowSec: number };
}

export type Handler = (request: Request) => Promise<Response>;

/** Wrap an endpoint: method check, per-IP rate limit, typed error mapping. */
export function handler(opts: HandlerOptions, fn: (request: Request, ctx: { ip: string; url: URL }) => Promise<Response>): Handler {
  return async (request: Request) => {
    try {
      if (!opts.methods.includes(request.method as HandlerOptions['methods'][number])) {
        throw new ApiError(405, 'method_not_allowed', 'Method not allowed');
      }
      const ip = clientIp(request);
      if (opts.rateLimit) {
        const r = await rateLimit(opts.rateLimit.bucket, ip, opts.rateLimit.limit, opts.rateLimit.windowSec);
        if (!r.ok) throw new ApiError(429, 'rate_limited', 'Too many requests, slow down a little', r.retryAfter);
      }
      return await fn(request, { ip, url: new URL(request.url) });
    } catch (e) {
      return errorResponse(e);
    }
  };
}

/** Read and parse a JSON body (max 32 KB). */
export async function readJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.length > 32_768) throw new ApiError(413 as number, 'bad_request', 'Request body too large');
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(400, 'bad_request', 'Body must be JSON');
  }
}
