import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ForbiddenPage } from '@/components/forbidden-page';
import { PaymentDetail } from '@/features/finance/payment-detail';
import { routeAccess } from '@/lib/route-access';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('finance.payments');
  return { title: t('title') };
}

export default async function PaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { allowed } = await routeAccess('payments');
  return allowed ? <PaymentDetail paymentId={id} /> : <ForbiddenPage />;
}
