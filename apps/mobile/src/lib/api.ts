// The API client: base URL from the saved server, bearer token, silent refresh on expiry.
// Error bodies follow section 19.1 and become ApiClientError.

import type { ErrorCode } from '@nboard/shared';
import { ERROR_MESSAGE } from '@nboard/shared';
import { apiBase } from '../state/server';
import { useAuth } from '../state/auth';

export class ApiClientError extends Error {
  constructor(
    public code: ErrorCode | 'NETWORK' | 'UNKNOWN',
    public status: number,
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
  }
  /** Field messages from a 422, keyed by field name */
  get fields(): Record<string, string> {
    return ((this.details?.fields as Record<string, string> | undefined) ?? {}) as Record<string, string>;
  }
}

interface Options {
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  auth?: boolean;
  signal?: AbortSignal;
  /** internal: already retried after a refresh */
  retried?: boolean;
  timeoutMs?: number;
}

function qs(q?: Options['query']): string {
  if (!q) return '';
  const p = Object.entries(q)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return p.length ? `?${p.join('&')}` : '';
}

export async function request<T>(method: string, path: string, opts: Options = {}): Promise<T> {
  const auth = opts.auth !== false;
  const token = useAuth.getState().accessToken;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 15000);
  opts.signal?.addEventListener('abort', () => ctrl.abort());
  let res: Response;
  try {
    res = await fetch(`${apiBase()}${path}${qs(opts.query)}`, {
      method,
      headers: {
        Accept: 'application/json',
        ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(auth && token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: ctrl.signal,
    });
  } catch {
    throw new ApiClientError('NETWORK', 0, 'Cannot reach the server. Check the Wi-Fi and the address.');
  } finally {
    clearTimeout(timer);
  }

  let data: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (res.ok) return data as T;

  const err = (data as { error?: { code?: ErrorCode; message?: string; details?: Record<string, unknown> } } | null)?.error;
  const code = (err?.code ?? 'UNKNOWN') as ErrorCode | 'UNKNOWN';

  // Expired or revoked access token: refresh once and replay.
  if (auth && !opts.retried && res.status === 401 && (code === 'TOKEN_EXPIRED' || code === 'AUTH_REQUIRED')) {
    const ok = await useAuth.getState().refresh();
    if (ok) return request<T>(method, path, { ...opts, retried: true });
    useAuth.getState().expire();
  }
  if (code === 'PASSWORD_CHANGE_REQUIRED') useAuth.getState().flagMustChange();

  throw new ApiClientError(
    code,
    res.status,
    err?.message ?? (code !== 'UNKNOWN' ? ERROR_MESSAGE[code] : `Request failed (${res.status}).`),
    err?.details,
  );
}

export const api = {
  get: <T>(path: string, query?: Options['query'], o?: Options) => request<T>('GET', path, { ...o, query }),
  post: <T>(path: string, body?: unknown, o?: Options) => request<T>('POST', path, { ...o, body: body ?? {} }),
  put: <T>(path: string, body?: unknown, o?: Options) => request<T>('PUT', path, { ...o, body: body ?? {} }),
  patch: <T>(path: string, body?: unknown, o?: Options) => request<T>('PATCH', path, { ...o, body: body ?? {} }),
  del: <T>(path: string, o?: Options) => request<T>('DELETE', path, o),
};

/** Public call used before sign-in (and for the connection test). */
export async function probeServer(baseUrl: string, timeoutMs = 6000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl}/api/v1/system/info`, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as import('@nboard/shared').SystemInfo;
  } finally {
    clearTimeout(t);
  }
}
