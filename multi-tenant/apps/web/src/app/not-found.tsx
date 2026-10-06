import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { BrandLockup } from '@/components/brand';

export default async function NotFound() {
  const t = await getTranslations();
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 text-center">
      <BrandLockup name={t('app.name')} />
      <div>
        <p className="font-mono text-sm text-fg-subtle">404</p>
        <h1 className="mt-1 text-xl font-semibold text-fg">{t('common.notFoundTitle')}</h1>
        <p className="mt-1 max-w-sm text-sm text-fg-muted">{t('common.notFoundHint')}</p>
      </div>
      <Link href="/dashboard" className="text-sm font-medium text-primary hover:underline">
        {t('common.goToDashboard')}
      </Link>
    </main>
  );
}
