import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ForbiddenPage } from '@/components/forbidden-page';
import { ReceivablesView } from '@/features/finance/receivables-view';
import { routeAccess } from '@/lib/route-access';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('finance.receivables');
  return { title: t('title') };
}

export default async function ReceivablesPage() {
  const { allowed } = await routeAccess('receivables');
  return allowed ? <ReceivablesView /> : <ForbiddenPage />;
}
