import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { isApiError } from './api/errors';
import { hardNavigate } from './hard-navigate';

let redirecting = false;

/**
 * Session-level failures are handled once, globally: an expired session goes back to the login
 * page (keeping the current location), a session without an organization goes to the picker.
 * Full page navigations drop every cached query, so no data outlives the session.
 */
function handleSessionErrors(error: unknown): void {
  if (!isApiError(error) || redirecting || typeof window === 'undefined') return;
  if (error.code === 'UNAUTHENTICATED') {
    redirecting = true;
    const next = window.location.pathname + window.location.search;
    hardNavigate(`/login?next=${encodeURIComponent(next)}`);
  } else if (error.code === 'AUTH_ORGANIZATION_REQUIRED') {
    redirecting = true;
    hardNavigate('/select-organization');
  }
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({ onError: handleSessionErrors }),
    mutationCache: new MutationCache({ onError: handleSessionErrors }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        // Client errors (403, 404, validation) are final; retry only transient failures.
        retry: (failureCount, error) => {
          if (isApiError(error) && error.status >= 400 && error.status < 500) return false;
          return failureCount < 2;
        },
        refetchOnWindowFocus: true,
      },
      mutations: { retry: false },
    },
  });
}
