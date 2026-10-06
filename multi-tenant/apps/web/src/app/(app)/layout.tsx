import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { SessionProvider } from '@/components/session/session-context';
import { AppShell } from '@/components/shell/app-shell';
import { SIDEBAR_COOKIE } from '@/components/shell/sidebar-state';
import { getServerSession } from '@/lib/api/server';

/**
 * Signed-in area. The session is resolved on the server before anything renders, so the shell
 * (navigation, organization, permissions) is correct on the first paint.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession();
  if (!session) redirect('/login');

  const collapsed = (await cookies()).get(SIDEBAR_COOKIE)?.value === '1';
  return (
    <SessionProvider initialSession={session}>
      <AppShell initialCollapsed={collapsed}>{children}</AppShell>
    </SessionProvider>
  );
}
