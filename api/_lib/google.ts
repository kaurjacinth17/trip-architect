// The only place that talks to Places API (New). Every call: key configured? → daily SKU budget → strict field
// mask → Google error mapping. Responses are passed through in memory only; nothing here is stored.
import { spend, QUOTA_MESSAGE, type Sku } from './budget';
import { env } from './env';
import { ApiError } from './http';

export const PLACES_BASE = 'https://places.googleapis.com/v1/';

export interface GoogleCall {
  /** e.g. 'places:searchText' or 'places/ChIJ…' */
  path: string;
  method?: 'GET' | 'POST';
  body?: unknown;
  /** Comma-separated field mask. Required (Places API (New) bills by the fields requested), except for photo media. */
  fieldMask: string | null;
  sku: Sku;
  query?: Record<string, string>;
}

export async function googlePlaces<T>(c: GoogleCall): Promise<T> {
  const key = env.googlePlacesKey();
  if (!key) throw new ApiError(503, 'not_configured', 'Live place data isn’t set up on this site yet');
  if (c.fieldMask === null ? !c.path.endsWith('/media') : !c.fieldMask || c.fieldMask.includes('*')) throw new ApiError(500, 'internal', 'Field mask required');
  await spend(c.sku);
  // Not new URL(path, base): 'places:searchText' would parse as a URL scheme.
  const url = new URL(PLACES_BASE + c.path.replace(/^\//, ''));
  for (const [k, v] of Object.entries(c.query || {})) url.searchParams.set(k, v);
  let res: Response;
  try {
    res = await fetch(url, {
      method: c.method || (c.body ? 'POST' : 'GET'),
      headers: {
        'content-type': 'application/json',
        'X-Goog-Api-Key': key,
        ...(c.fieldMask ? { 'X-Goog-FieldMask': c.fieldMask } : {}),
      },
      body: c.body ? JSON.stringify(c.body) : undefined,
    });
  } catch {
    throw new ApiError(502, 'upstream_error', 'Couldn’t reach Google right now');
  }
  if (res.ok) return (await res.json()) as T;
  let status = '';
  try {
    status = ((await res.json()) as { error?: { status?: string } })?.error?.status || '';
  } catch { /* ignore body */ }
  if (res.status === 429 || status === 'RESOURCE_EXHAUSTED') throw new ApiError(503, 'quota_exhausted', QUOTA_MESSAGE);
  if (res.status === 404 || status === 'NOT_FOUND') throw new ApiError(404, 'not_found', 'That place wasn’t found');
  if (res.status === 400 || status === 'INVALID_ARGUMENT') throw new ApiError(400, 'bad_request', 'Google rejected the request');
  if (res.status === 403 || status === 'PERMISSION_DENIED') throw new ApiError(503, 'not_configured', 'Live place data isn’t available on this site right now');
  throw new ApiError(502, 'upstream_error', 'Google returned an error');
}
