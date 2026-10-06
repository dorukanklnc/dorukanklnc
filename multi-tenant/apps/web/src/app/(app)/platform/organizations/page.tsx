import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ForbiddenPage } from '@/components/forbidden-page';
import { OrganizationsView } from '@/features/platform/organizations-view';
import { routeAccess } from '@/lib/route-access';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('platform.organizations');
  return { title: t('title') };
}

export default async function OrganizationsPage() {
  const { allowed } = await routeAccess('platformOrganizations');
  return allowed ? <OrganizationsView /> : <ForbiddenPage />;
}
