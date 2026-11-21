import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { _resetRateLimit } from '../../api/_lib/ratelimit';
import { _resetRedis } from '../../api/_lib/redis';
import { sha256 } from '../../api/_lib/supabase';
import { GET as keepalive } from '../../api/cron/keepalive';
import { POST as createInvite } from '../../api/invites/create';
import { POST as redeem } from '../../api/invites/redeem';
import { POST as members } from '../../api/members/update';

const SB = 'https://testproject.supabase.co', SERVICE = 'service-role-SECRET-test', ANON = 'anon-test';
const TRIP = '11111111-1111-1111-1111-111111111111', OWNER = '00000000-0000-0000-0000-00000000000a', RIYA = '00000000-0000-0000-0000-00000000000b';
const users: Record<string, string> = { 'tok-owner': OWNER, 'tok-riya': RIYA };
let members_: { trip_id: string; user_id: string; role: string }[] = [];
let invites: Record<string, unknown>[] = [];
const calls: { method: string; url: string; body?: unknown; auth: string | null }[] = [];

const server = setupServer(
  http.get(`${SB}/auth/v1/user`, ({ request }) => {
    const tok = request.headers.get('authorization')?.replace('Bearer ', '') || '';
    return users[tok] ? HttpResponse.json({ id: users[tok], email: 'x@example.com' }) : HttpResponse.json({ msg: 'bad' }, { status: 401 });
  }),
  http.all(new RegExp(`^${SB}/rest/v1/.*`), async ({ request }) => {
    const u = new URL(request.url);
    const body = request.method === 'GET' || request.method === 'DELETE' ? undefined : await request.json();
    calls.push({ method: request.method, url: u.pathname + u.search, body, auth: request.headers.get('authorization') });
    const p = u.searchParams;
    const v = (k: string) => decodeURIComponent((p.get(k) || '').replace(/^eq\./, ''));
    if (u.pathname.endsWith('/trip_members')) {
      if (request.method === 'GET') return HttpResponse.json(members_.filter((m) => m.trip_id === v('trip_id') && m.user_id === v('user_id')));
      if (request.method === 'POST') { members_.push(body as never); return new HttpResponse(null, { status: 201 }); }
      if (request.method === 'PATCH') { const m = members_.find((x) => x.user_id === v('user_id')); Object.assign(m!, body); return new HttpResponse(null, { status: 204 }); }
      if (request.method === 'DELETE') { members_ = members_.filter((x) => x.user_id !== v('user_id')); return new HttpResponse(null, { status: 204 }); }
    }
    if (u.pathname.endsWith('/invites')) {
      if (request.method === 'POST') { const r = { id: 'inv1', uses: 0, revoked_at: null, ...(body as object) }; invites.push(r); return HttpResponse.json([r], { status: 201 }); }
      if (request.method === 'GET') return HttpResponse.json(invites.filter((i) => i.token_hash === v('token_hash')));
      if (request.method === 'PATCH') { const i = invites.find((x) => x.id === v('id') && String(x.uses) === v('uses')); if (!i) return HttpResponse.json([]); Object.assign(i, body); return HttpResponse.json([i]); }
    }
    return HttpResponse.json([]);
  }),
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
beforeEach(() => {
  _resetRedis(null); _resetRateLimit(); calls.length = 0;
  members_ = [{ trip_id: TRIP, user_id: OWNER, role: 'owner' }]; invites = [];
  Object.assign(process.env, { SUPABASE_URL: SB, SUPABASE_ANON_KEY: ANON, SUPABASE_SERVICE_ROLE_KEY: SERVICE, CRON_SECRET: 'cron-secret', VITE_SITE_URL: 'https://trips.example' });
});
afterEach(() => { for (const k of ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'CRON_SECRET', 'VITE_SITE_URL']) delete process.env[k]; });

const post = (fn: (r: Request) => Promise<Response>, body: unknown, tok?: string) =>
  fn(new Request('http://localhost/api/x', { method: 'POST', headers: tok ? { authorization: `Bearer ${tok}` } : {}, body: JSON.stringify(body) }));

describe('invites (Phase 8)', () => {
  it('owner creates a link; only the token hash is stored; Riya redeems it once and becomes an editor', async () => {
    const r = await post(createInvite, { tripId: TRIP, role: 'editor', days: 7, maxUses: 1 }, 'tok-owner');
    const b = await r.json();
    expect(r.status).toBe(200);
    const token = b.url.split('/join/')[1];
    expect(b.url).toBe(`https://trips.example/join/${token}`);
    expect(invites[0].token_hash).toBe(sha256(token));
    expect(JSON.stringify(invites)).not.toContain(token);
    expect(JSON.stringify(b)).not.toContain(SERVICE);
    expect(calls.every((c) => c.auth === `Bearer ${SERVICE}`)).toBe(true);

    const j = await (await post(redeem, { token }, 'tok-riya')).json();
    expect(j).toEqual({ tripId: TRIP, role: 'editor' });
    expect(members_).toContainEqual({ trip_id: TRIP, user_id: RIYA, role: 'editor' });
    // a second person can't use a single-use link
    users['tok-dia'] = '00000000-0000-0000-0000-00000000000d';
    expect((await post(redeem, { token }, 'tok-dia')).status).toBe(410);
  });
  it('refuses non-owners, signed-out callers, expired links and bad input', async () => {
    members_.push({ trip_id: TRIP, user_id: RIYA, role: 'editor' });
    expect((await post(createInvite, { tripId: TRIP, role: 'editor' }, 'tok-riya')).status).toBe(403);
    expect((await post(createInvite, { tripId: TRIP, role: 'editor' })).status).toBe(401);
    expect((await post(createInvite, { tripId: TRIP, role: 'owner' }, 'tok-owner')).status).toBe(400);
    invites.push({ id: 'old', trip_id: TRIP, token_hash: sha256('expiredtoken-expiredtoken'), role: 'viewer', expires_at: '2020-01-01T00:00:00Z', max_uses: 5, uses: 0, revoked_at: null });
    users['tok-dia'] = '00000000-0000-0000-0000-00000000000d';
    expect((await post(redeem, { token: 'expiredtoken-expiredtoken' }, 'tok-dia')).status).toBe(410);
    expect((await post(redeem, { token: 'nope nope' }, 'tok-dia')).status).toBe(400);
  });
  it('without Supabase configured: 503 not_configured', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const r = await post(createInvite, { tripId: TRIP, role: 'editor' }, 'tok-owner');
    expect(r.status).toBe(503);
    expect((await r.json()).error.code).toBe('not_configured');
  });
});

describe('members (Phase 8)', () => {
  it('owner changes a role and removes someone; nobody can change the owner', async () => {
    members_.push({ trip_id: TRIP, user_id: RIYA, role: 'editor' });
    expect((await post(members, { tripId: TRIP, userId: RIYA, role: 'viewer' }, 'tok-owner')).status).toBe(200);
    expect(members_.find((m) => m.user_id === RIYA)?.role).toBe('viewer');
    expect((await post(members, { tripId: TRIP, userId: OWNER, role: 'viewer' }, 'tok-owner')).status).toBe(400);
    expect((await post(members, { tripId: TRIP, userId: OWNER, remove: true }, 'tok-riya')).status).toBe(403);
    // members may link themselves to a traveller
    expect((await post(members, { tripId: TRIP, userId: RIYA, travellerIndex: 1 }, 'tok-riya')).status).toBe(200);
    expect((await post(members, { tripId: TRIP, userId: RIYA, remove: true }, 'tok-owner')).status).toBe(200);
    expect(members_.some((m) => m.user_id === RIYA)).toBe(false);
  });
});

describe('keep-alive cron (Phase 8)', () => {
  it('needs the cron secret; pings the database and clears Google coordinates older than 30 days', async () => {
    expect((await keepalive(new Request('http://localhost/api/cron/keepalive'))).status).toBe(401);
    const r = await keepalive(new Request('http://localhost/api/cron/keepalive', { headers: { authorization: 'Bearer cron-secret' } }));
    expect(r.status).toBe(200);
    const paths = calls.map((c) => `${c.method} ${decodeURIComponent(c.url)}`);
    expect(paths[0]).toBe('GET /rest/v1/trips?select=id&limit=1');
    expect(paths.some((p) => p.startsWith('PATCH /rest/v1/items?gid=not.is.null&coords_fetched_at=lt.'))).toBe(true);
    expect(paths.some((p) => p.startsWith('PATCH /rest/v1/trip_destinations?dest_key=like.g:*'))).toBe(true);
    expect(calls.find((c) => c.url.includes('/items'))?.body).toEqual({ lat: null, lng: null, coords_fetched_at: null });
  });
});
