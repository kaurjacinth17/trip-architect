// The one Vercel function behind every /api/* endpoint (vercel.json rewrites /api/<path> here as ?__path=<path>).
// Vercel's Hobby plan allows 12 functions per deployment; routing in one function keeps the site on the free plan.
// Endpoint modules live in api/_routes/ (underscore folders aren't deployed as functions of their own).
import { ApiError, errorResponse, type Handler } from './_lib/http';
import * as areas from './_routes/areas';
import * as climate from './_routes/climate';
import * as fx from './_routes/fx';
import * as health from './_routes/health';
import * as inviteCreate from './_routes/invites/create';
import * as inviteRedeem from './_routes/invites/redeem';
import * as members from './_routes/members/update';
import * as placeId from './_routes/places/[id]';
import * as autocomplete from './_routes/places/autocomplete';
import * as address from './_routes/places/address';
import * as cover from './_routes/places/cover';
import * as destination from './_routes/places/destination';
import * as hours from './_routes/places/hours';
import * as lite from './_routes/places/lite';
import * as nearby from './_routes/places/nearby';
import * as photo from './_routes/places/photo';
import * as search from './_routes/places/search';
import * as placeSummary from './_routes/places/summary';
import * as transport from './_routes/places/transport';
import * as legs from './_routes/routes/legs';
import * as summary from './_routes/summary';
import * as weather from './_routes/weather';
import * as keepalive from './cron/keepalive';

type Mod = Partial<Record<'GET' | 'POST' | 'DELETE' | 'PATCH', Handler>>;
export const ROUTES: Record<string, Mod> = {
  areas, climate, fx, health, summary, weather,
  'invites/create': inviteCreate, 'invites/redeem': inviteRedeem, 'members/update': members,
  'places/autocomplete': autocomplete, 'places/address': address, 'places/cover': cover, 'places/destination': destination, 'places/hours': hours, 'places/lite': lite,
  'places/nearby': nearby, 'places/photo': photo, 'places/search': search, 'places/summary': placeSummary, 'places/transport': transport,
  'routes/legs': legs, 'cron/keepalive': keepalive,
};

/** Which module serves /api/<path>; "places/<placeId>" goes to the place details endpoint. */
export function resolve(path: string): Mod | null {
  const p = path.replace(/^\/+|\/+$/g, '');
  if (ROUTES[p]) return ROUTES[p];
  if (/^places\/[^/]+$/.test(p)) return placeId;
  return null;
}

async function route(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const path = url.searchParams.get('__path') ?? url.pathname.replace(/^\/api\/?/, '');
  url.searchParams.delete('__path');
  if (path.split('/').some((s) => s.startsWith('_') || s.startsWith('.'))) return errorResponse(new ApiError(404, 'not_found', 'No such endpoint'));
  const mod = resolve(path);
  if (!mod) return errorResponse(new ApiError(404, 'not_found', 'No such endpoint'));
  const fn = mod[request.method as keyof Mod];
  if (!fn) return errorResponse(new ApiError(405, 'method_not_allowed', 'Method not allowed'));
  // Hand the endpoint the URL it was called with (path and query), as if it were its own function.
  const original = new URL(`/api/${path.replace(/^\/+/, '')}${url.search}`, url.origin);
  const body = request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.arrayBuffer();
  return fn(new Request(original, { method: request.method, headers: request.headers, body }));
}

export const GET = route, POST = route, PATCH = route, DELETE = route;
