import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ForbiddenPage } from '@/components/forbidden-page';
import { CollectionsView } from '@/features/finance/collections-view';
import { routeAccess } from '@/lib/route-access';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('finance.collections');
  return { title: t('title') };
}

export default async function CollectionsPage() {
  const { allowed } = await routeAccess('collections');
  return allowed ? <CollectionsView /> : <ForbiddenPage />;
}
