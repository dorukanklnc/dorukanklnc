import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { accessFromSession } from '@/lib/access';
import { getServerSession } from '@/lib/api/server';
import { homePath } from '@/lib/navigation';

/** Organization screens: require an active organization (platform staff go to their console). */
export default async function OrganizationLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession();
  if (!session) redirect('/login');
  if (!session.activeOrganization) redirect(homePath(accessFromSession(session)));
  return children;
}
