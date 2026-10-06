import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ForbiddenPage } from '@/components/forbidden-page';
import { PaymentsView } from '@/features/finance/payments-view';
import { routeAccess } from '@/lib/route-access';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('finance.payments');
  return { title: t('title') };
}

export default async function PaymentsPage() {
  const { allowed } = await routeAccess('payments');
  return allowed ? <PaymentsView /> : <ForbiddenPage />;
}
