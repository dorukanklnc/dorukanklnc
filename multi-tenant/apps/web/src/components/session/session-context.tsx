'use client';

import type { PermissionKey, Scope } from '@repo/authorization';
import type { Session } from '@repo/contracts';
import { useQuery } from '@tanstack/react-query';
import { type ReactNode, createContext, use, useEffect, useMemo } from 'react';
import {
  type AccessContext,
  type AccessRequirement,
  accessFromSession,
  canAccess,
} from '@/lib/access';
import { api } from '@/lib/api/client';
import { queryKeys } from '@/lib/query-keys';
import { hardNavigate } from '@/lib/hard-navigate';

interface SessionValue {
  session: Session;
  access: AccessContext;
}

const SessionContext = createContext<SessionValue | null>(null);

/**
 * Holds the server-resolved session for the app shell. It is refreshed in the background (window
 * focus, explicit invalidation) so permission or organization changes reach the UI quickly.
 */
export function SessionProvider({
  initialSession,
  children,
}: {
  initialSession: Session;
  children: ReactNode;
}) {
  const { data: session } = useQuery({
    queryKey: queryKeys.session,
    queryFn: ({ signal }) => api.get<Session>('/auth/session', undefined, signal),
    initialData: initialSession,
    staleTime: 60_000,
  });

  const initialOrganizationId = initialSession.activeOrganization?.id ?? null;
  const currentOrganizationId = session.activeOrganization?.id ?? null;
  useEffect(() => {
    // The organization was switched in another tab: reload so no screen keeps showing (or
    // caching) data of the previous organization.
    if (currentOrganizationId !== initialOrganizationId) hardNavigate('/dashboard');
  }, [currentOrganizationId, initialOrganizationId]);

  const value = useMemo(() => ({ session, access: accessFromSession(session) }), [session]);
  return <SessionContext value={value}>{children}</SessionContext>;
}

function useSessionValue(): SessionValue {
  const value = use(SessionContext);
  if (!value) throw new Error('useSession() must be used inside <SessionProvider>');
  return value;
}

export function useSession(): Session {
  return useSessionValue().session;
}

/** The session when rendered inside the app shell, otherwise null (public pages). */
export function useOptionalSession(): Session | null {
  return use(SessionContext)?.session ?? null;
}

export function useAccess(): AccessContext {
  return useSessionValue().access;
}

/** Permission checks for conditional UI (buttons, tabs, columns). */
export function usePermissions() {
  const access = useAccess();
  return useMemo(
    () => ({
      can: (permission: PermissionKey, atLeast?: Scope) =>
        access.permissions.has(permission, atLeast),
      scopeOf: (permission: PermissionKey) => access.permissions.scopeOf(permission),
      allows: (requirement: AccessRequirement) => canAccess(requirement, access),
      moduleEnabled: (module: Parameters<AccessContext['enabledModules']['has']>[0]) =>
        access.enabledModules.has(module),
    }),
    [access],
  );
}

/** The organization the member is working in. Only valid inside organization screens. */
export function useOrganization(): NonNullable<Session['activeOrganization']> {
  const organization = useSession().activeOrganization;
  if (!organization) throw new Error('No active organization');
  return organization;
}
