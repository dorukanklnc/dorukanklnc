import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ForbiddenPage } from '@/components/forbidden-page';
import { UsersView } from '@/features/admin/users-view';
import { routeAccess } from '@/lib/route-access';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('admin.users');
  return { title: t('title') };
}

export default async function UsersPage() {
  const { allowed } = await routeAccess('users');
  return allowed ? <UsersView /> : <ForbiddenPage />;
}
