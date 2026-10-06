import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ForbiddenPage } from '@/components/forbidden-page';
import { RolesView } from '@/features/admin/roles-view';
import { routeAccess } from '@/lib/route-access';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('admin.roles');
  return { title: t('title') };
}

export default async function RolesPage() {
  const { allowed } = await routeAccess('roles');
  return allowed ? <RolesView /> : <ForbiddenPage />;
}
