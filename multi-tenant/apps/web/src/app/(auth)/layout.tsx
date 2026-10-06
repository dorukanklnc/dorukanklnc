import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { BrandLockup } from '@/components/brand';
import { LocaleSwitcher } from '@/components/locale-switcher';

/** Centered layout for sign-in, password recovery and invitation pages. */
export default async function AuthLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations('app');
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between px-6 py-5">
        <BrandLockup name={t('name')} />
        <LocaleSwitcher />
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pb-16 pt-[8vh]">
        <div className="w-full max-w-[400px]">{children}</div>
      </main>
      <footer className="px-6 py-5 text-center text-xs text-fg-subtle">{t('tagline')}</footer>
    </div>
  );
}
