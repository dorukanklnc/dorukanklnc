import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ForbiddenPage } from '@/components/forbidden-page';
import { BranchesView } from '@/features/admin/branches-view';
import { routeAccess } from '@/lib/route-access';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('admin.branches');
  return { title: t('title') };
}

export default async function BranchesPage() {
  const { allowed } = await routeAccess('branches');
  return allowed ? <BranchesView /> : <ForbiddenPage />;
}
