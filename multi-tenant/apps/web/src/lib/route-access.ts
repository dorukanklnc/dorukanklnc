import 'server-only';
import type { Session } from '@repo/contracts';
import { redirect } from 'next/navigation';
import { type RouteKey, ROUTE_ACCESS, accessFromSession, canAccess } from './access';
import { getServerSession } from './api/server';

/**
 * Page-level gate for server components. The API enforces the same permissions on every call;
 * this only decides whether to render the screen or the "no access" state.
 */
export async function routeAccess(
  route: RouteKey,
): Promise<{ session: Session; allowed: boolean }> {
  const session = await getServerSession();
  if (!session) redirect('/login');
  return { session, allowed: canAccess(ROUTE_ACCESS[route], accessFromSession(session)) };
}
