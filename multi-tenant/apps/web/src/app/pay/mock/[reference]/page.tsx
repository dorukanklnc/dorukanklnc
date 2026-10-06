import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { BrandLockup } from '@/components/brand';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('pay');
  return { title: t('title') };
}

/**
 * Hosted checkout of the development mock provider. A real provider (iyzico, PayTR, Stripe…)
 * hosts this page itself; the mock never collects card data and completes payments only through
 * the signed webhook triggered by staff ("complete test payment").
 */
export default async function MockCheckoutPage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const { reference } = await params;
  const t = await getTranslations();
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4">
      <BrandLockup name={t('app.name')} />
      <div className="w-full max-w-md rounded-xl border border-line bg-surface p-7 shadow-sm">
        <p className="text-xs font-medium text-warning-fg">{t('pay.badge')}</p>
        <h1 className="mt-1 text-lg font-semibold text-fg">{t('pay.title')}</h1>
        <p className="mt-2 text-sm text-fg-muted">{t('pay.description')}</p>
        <p className="mt-4 rounded-md bg-surface-muted px-3 py-2 font-mono text-xs text-fg-muted">
          {reference}
        </p>
      </div>
    </main>
  );
}
