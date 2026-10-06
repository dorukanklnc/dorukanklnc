import { ApiError } from './errors';

/** Same-origin API base (ADR-0011). The Next.js server proxies `/api/*` to the NestJS API. */
export const API_BASE = '/api/v1';

export type QueryValue = string | number | boolean | null | undefined;
export type QueryParams = Readonly<Record<string, QueryValue>>;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  query?: QueryParams | undefined;
  body?: unknown;
  /** Sent as `Idempotency-Key`; generate one per user submission, reuse it on retries. */
  idempotencyKey?: string | undefined;
  signal?: AbortSignal | undefined;
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const CSRF_COOKIES = ['__Host-csrf', 'csrf'];

/** Builds `path?query`, dropping empty values so URLs stay canonical and cacheable. */
export function buildUrl(path: string, query?: QueryParams): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }
  const search = params.toString();
  return `${API_BASE}${path}${search ? `?${search}` : ''}`;
}

function readCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  for (const part of document.cookie.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() === name) {
      return decodeURIComponent(part.slice(separator + 1).trim());
    }
  }
  return undefined;
}

/** The CSRF token the API issued with the session (synchronizer token, cookie transport). */
export function csrfToken(): string | undefined {
  for (const name of CSRF_COOKIES) {
    const value = readCookie(name);
    if (value) return value;
  }
  return undefined;
}

/**
 * Browser-side API call. Sends cookies (same origin), the CSRF header on unsafe methods and an
 * optional idempotency key; throws {@link ApiError} for every non-2xx response.
 *
 * Response bodies are typed by the caller from `@repo/contracts`; the API validates its own
 * payloads, so the client does not re-parse every response at runtime.
 */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const headers = new Headers({ Accept: 'application/json' });
  if (options.body !== undefined) headers.set('Content-Type', 'application/json');
  if (!SAFE_METHODS.has(method)) {
    const token = csrfToken();
    if (token) headers.set('x-csrf-token', token);
  }
  if (options.idempotencyKey) headers.set('Idempotency-Key', options.idempotencyKey);

  let response: Response;
  try {
    response = await fetch(buildUrl(path, options.query), {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      credentials: 'same-origin',
      cache: 'no-store',
      signal: options.signal ?? null,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError({ status: 0, code: 'NETWORK_ERROR' });
  }

  if (response.status === 204) return undefined as T;
  const isJson = (response.headers.get('content-type') ?? '').includes('json');
  const payload: unknown = isJson ? await response.json().catch(() => null) : null;
  if (!response.ok) {
    throw ApiError.fromResponse(response.status, payload, response.headers.get('x-request-id'));
  }
  return payload as T;
}

export const api = {
  get: <T>(path: string, query?: QueryParams, signal?: AbortSignal) =>
    apiRequest<T>(path, { query, signal }),
  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(path, { ...options, method: 'POST', body }),
  patch: <T>(path: string, body: unknown) => apiRequest<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string) => apiRequest<T>(path, { method: 'DELETE' }),
};
