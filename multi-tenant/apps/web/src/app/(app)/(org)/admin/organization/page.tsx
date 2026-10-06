import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ForbiddenPage } from '@/components/forbidden-page';
import { OrganizationView } from '@/features/admin/organization-view';
import { routeAccess } from '@/lib/route-access';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('admin.organization');
  return { title: t('title') };
}

export default async function OrganizationPage() {
  const { allowed } = await routeAccess('organization');
  return allowed ? <OrganizationView /> : <ForbiddenPage />;
}
