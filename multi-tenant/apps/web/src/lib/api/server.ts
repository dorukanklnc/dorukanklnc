import 'server-only';
import { type Session, sessionSchema } from '@repo/contracts';
import { cookies, headers } from 'next/headers';
import { cache } from 'react';

const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';
const SESSION_COOKIES = ['__Host-sid', 'sid'] as const;

/**
 * Headers forwarded to the API on server-side calls: the client address (rate limiting and
 * audit), user agent and correlation id. Never the full cookie jar.
 */
async function forwardedHeaders(): Promise<Headers> {
  const incoming = await headers();
  const forwarded = new Headers({ accept: 'application/json' });
  for (const name of ['user-agent', 'x-forwarded-for', 'x-request-id']) {
    const value = incoming.get(name);
    if (value) forwarded.set(name, value);
  }
  return forwarded;
}

/**
 * Resolves the current session on the server by asking the API (the only authority on
 * identity and access). Forwards only the session cookie. Deduplicated per request.
 *
 * Returns null when there is no valid session; throws when the API is unavailable so the error
 * boundary can render instead of silently logging the user out.
 */
export const getServerSession = cache(async (): Promise<Session | null> => {
  const cookieStore = await cookies();
  const sessionCookie = SESSION_COOKIES.map((name) => cookieStore.get(name)).find(Boolean);
  if (!sessionCookie) return null;

  const forwarded = await forwardedHeaders();
  forwarded.set('cookie', `${sessionCookie.name}=${encodeURIComponent(sessionCookie.value)}`);
  const response = await fetch(`${API_INTERNAL_URL}/api/v1/auth/session`, {
    headers: forwarded,
    cache: 'no-store',
  });
  if (response.status === 401) return null;
  if (!response.ok) {
    throw new Error(`Session lookup failed with status ${response.status}`);
  }
  return sessionSchema.parse(await response.json());
});

export type PublicFetchResult<T> = { ok: true; data: T } | { ok: false; status: number };

/** Server-side call to a public (unauthenticated) API endpoint, e.g. an invitation preview. */
export async function fetchPublic<T>(path: string): Promise<PublicFetchResult<T>> {
  const response = await fetch(`${API_INTERNAL_URL}/api/v1${path}`, {
    headers: await forwardedHeaders(),
    cache: 'no-store',
  });
  if (!response.ok) return { ok: false, status: response.status };
  return { ok: true, data: (await response.json()) as T };
}
