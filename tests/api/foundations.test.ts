import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { DEFAULT_DAILY, MONTHLY_FREE, _resetBudget, spend } from '../../api/_lib/budget';
import { _resetDedupe, dedupe } from '../../api/_lib/dedupe';
import { googlePlaces } from '../../api/_lib/google';
import { ApiError, handler, json, readJson } from '../../api/_lib/http';
import { _resetRateLimit } from '../../api/_lib/ratelimit';
import { _resetRedis } from '../../api/_lib/redis';
import { GET as health } from '../../api/health';
import { resolveApiFile } from '../../scripts/vite-api-dev';

const SECRET = 'AIzaTEST-SECRET-KEY-123';

beforeEach(() => {
  _resetRedis(null);
  _resetBudget();
  _resetDedupe();
  _resetRateLimit();
  process.env.GOOGLE_PLACES_SERVER_KEY = SECRET;
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.GOOGLE_PLACES_SERVER_KEY;
  delete process.env.GOOGLE_DAILY_BUDGET_TEXT_SEARCH_ENTERPRISE;
});

const req = (path: string, init: RequestInit & { ip?: string } = {}) =>
  new Request('http://localhost' + path, { ...init, headers: { 'x-forwarded-for': init.ip || '1.2.3.4', ...(init.headers || {}) } });

describe('daily SKU budget', () => {
  it('keeps every SKU under its monthly free usage over a 31-day month', () => {
    for (const [sku, monthly] of Object.entries(MONTHLY_FREE)) {
      expect(DEFAULT_DAILY[sku as keyof typeof DEFAULT_DAILY] * 31).toBeLessThan(monthly);
    }
    expect(DEFAULT_DAILY.textSearchEnterprise).toBe(220);
  });

  it('throws quota_exhausted once the day is used up, and honours env overrides', async () => {
    process.env.GOOGLE_DAILY_BUDGET_TEXT_SEARCH_ENTERPRISE = '2';
    await spend('textSearchEnterprise');
    await spend('textSearchEnterprise');
    await expect(spend('textSearchEnterprise')).rejects.toMatchObject({ code: 'quota_exhausted', status: 503 });
  });
});

describe('google client', () => {
  it('sends the key and an explicit field mask, and never puts the key in the response', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ places: [{ id: 'x' }] }), { status: 200 }));
    vi.stubGlobal('fetch', f);
    const out = await googlePlaces<{ places: { id: string }[] }>({ path: 'places:searchText', body: { textQuery: 'cafe' }, fieldMask: 'places.id,places.displayName', sku: 'textSearchPro' });
    expect(out.places[0].id).toBe('x');
    const [url, init] = f.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toBe('https://places.googleapis.com/v1/places:searchText');
    expect((init.headers as Record<string, string>)['X-Goog-FieldMask']).toBe('places.id,places.displayName');
    expect((init.headers as Record<string, string>)['X-Goog-Api-Key']).toBe(SECRET);
  });

  it('refuses wildcard field masks', async () => {
    await expect(googlePlaces({ path: 'places/x', fieldMask: '*', sku: 'detailsPro' })).rejects.toMatchObject({ code: 'internal' });
  });

  it('maps Google quota errors to quota_exhausted with the resting message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { status: 'RESOURCE_EXHAUSTED', message: 'Quota exceeded for key ' + SECRET } }), { status: 429 })));
    const err = (await googlePlaces({ path: 'places/x', fieldMask: 'id', sku: 'detailsPro' }).catch((e: unknown) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe('quota_exhausted');
    expect(err.message).toMatch(/resting for today/);
    expect(err.message).not.toContain(SECRET);
  });

  it('reports not_configured without calling Google when the key is missing', async () => {
    delete process.env.GOOGLE_PLACES_SERVER_KEY;
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    await expect(googlePlaces({ path: 'places/x', fieldMask: 'id', sku: 'detailsPro' })).rejects.toMatchObject({ code: 'not_configured' });
    expect(f).not.toHaveBeenCalled();
  });
});

describe('handler wrapper', () => {
  const echo = handler({ methods: ['POST'], rateLimit: { bucket: 't', limit: 2, windowSec: 60 } }, async (r) => {
    const body = z.object({ q: z.string().min(2).max(50) }).parse(await readJson(r));
    return json({ q: body.q });
  });

  it('rejects bad input with zod issues', async () => {
    const r = await echo(req('/x', { method: 'POST', body: JSON.stringify({ q: 1 }) }));
    expect(r.status).toBe(400);
    const b = await r.json();
    expect(b.error.code).toBe('bad_request');
    expect(b.error.issues[0].path).toBe('q');
  });

  it('rejects the wrong method', async () => {
    expect((await echo(req('/x'))).status).toBe(405);
  });

  it('rate limits per IP', async () => {
    const call = (ip: string) => echo(req('/x', { method: 'POST', body: '{"q":"ok"}', ip }));
    expect((await call('9.9.9.9')).status).toBe(200);
    expect((await call('9.9.9.9')).status).toBe(200);
    const third = await call('9.9.9.9');
    expect(third.status).toBe(429);
    expect(third.headers.get('retry-after')).toBeTruthy();
    expect((await call('8.8.8.8')).status).toBe(200);
  });

  it('hides unexpected errors', async () => {
    const boom = handler({ methods: ['GET'] }, async () => { throw new Error('secret ' + SECRET); });
    const r = await boom(req('/x'));
    expect(r.status).toBe(500);
    expect(await r.text()).not.toContain(SECRET);
  });
});

describe('dedupe', () => {
  it('shares one in-flight call and drops failures immediately', async () => {
    let n = 0;
    const fn = () => new Promise<number>((res) => setTimeout(() => res(++n), 5));
    const [a, b] = await Promise.all([dedupe('k', fn), dedupe('k', fn)]);
    expect([a, b]).toEqual([1, 1]);
    const bad = vi.fn(async () => { throw new Error('x'); });
    await expect(dedupe('e', bad)).rejects.toThrow();
    await expect(dedupe('e', bad)).rejects.toThrow();
    expect(bad).toHaveBeenCalledTimes(2);
  });

  it('never holds a result for more than 60 seconds', async () => {
    vi.useFakeTimers();
    let n = 0;
    await dedupe('h', async () => ++n, 10 * 60_000);
    vi.advanceTimersByTime(61_000);
    expect(await dedupe('h', async () => ++n)).toBe(2);
    vi.useRealTimers();
  });
});

describe('/api/health', () => {
  it('reports configuration as booleans only', async () => {
    process.env.UNSPLASH_ACCESS_KEY = 'unsplash-secret';
    const r = await health(req('/api/health'));
    const text = await r.text();
    expect(r.status).toBe(200);
    expect(JSON.parse(text).providers).toEqual({ googlePlaces: true, unsplash: true, supabase: false, upstash: false });
    expect(text).not.toContain(SECRET);
    expect(text).not.toContain('unsplash-secret');
    delete process.env.UNSPLASH_ACCESS_KEY;
  });
});

describe('dev API router', () => {
  it('maps paths to handler files and never exposes _lib', () => {
    const root = process.cwd();
    expect(resolveApiFile(root, '/api/health')?.file).toMatch(/api\/health\.ts$/);
    expect(resolveApiFile(root, '/api/_lib/env')).toBeNull();
    expect(resolveApiFile(root, '/api/nope')).toBeNull();
  });
});
