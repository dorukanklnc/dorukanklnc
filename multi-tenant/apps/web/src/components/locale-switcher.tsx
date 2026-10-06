'use client';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Button,
} from '@repo/ui';
import { Check, Languages } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { LOCALES, LOCALE_COOKIE, type Locale } from '@/i18n/config';

export function setLocaleCookie(locale: Locale): void {
  const secure = window.location.protocol === 'https:' ? '; secure' : '';
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax${secure}`;
}

/** Language picker for public pages (signed-in users switch from the user menu). */
export function LocaleSwitcher() {
  const t = useTranslations('shell');
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const select = (next: Locale) => {
    if (next === locale) return;
    setLocaleCookie(next);
    startTransition(() => router.refresh());
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          leadingIcon={<Languages />}
          loading={pending}
          aria-label={t('language')}
        >
          {t(`languages.${locale === 'en' ? 'en' : 'tr'}`)}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[160px]">
        {LOCALES.map((option) => (
          <DropdownMenuItem key={option} onSelect={() => select(option)}>
            <span className="flex-1">{t(`languages.${option}`)}</span>
            {option === locale ? <Check className="!text-primary" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
