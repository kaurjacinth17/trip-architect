// Browser client for /api. Errors keep the server's typed code; quota errors flip the app into "resting" mode.
import { useLiveStatus } from './liveStatus';

export type ApiCode =
  | 'bad_request' | 'not_found' | 'method_not_allowed' | 'rate_limited' | 'quota_exhausted'
  | 'not_configured' | 'upstream_error' | 'unauthorized' | 'forbidden' | 'internal' | 'network';

export class ApiClientError extends Error {
  constructor(public status: number, public code: ApiCode, message: string) {
    super(message);
  }
}

async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  let r: Response;
  try {
    r = await fetch(path, {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e;
    throw new ApiClientError(0, 'network', 'You seem to be offline');
  }
  if (r.ok) return (await r.json()) as T;
  let code: ApiCode = 'internal', message = 'Something went wrong';
  try {
    const b = (await r.json()) as { error?: { code?: ApiCode; message?: string } };
    code = b.error?.code || code;
    message = b.error?.message || message;
  } catch { /* non-JSON error (e.g. static host without functions) */ code = r.status === 404 ? 'not_configured' : code; }
  if (code === 'quota_exhausted') useLiveStatus.getState().set({ state: 'resting' });
  if (code === 'not_configured') useLiveStatus.getState().set({ state: 'unconfigured' });
  throw new ApiClientError(r.status, code, message);
}

export const apiGet = <T>(path: string, signal?: AbortSignal) => call<T>('GET', path, undefined, signal);
export const apiPost = <T>(path: string, body: unknown, signal?: AbortSignal) => call<T>('POST', path, body, signal);

/** Errors worth retrying once (network blips, upstream 5xx). Never retry quota, validation or config errors. */
export const retryable = (e: unknown) => e instanceof ApiClientError && (e.code === 'network' || e.code === 'upstream_error');
