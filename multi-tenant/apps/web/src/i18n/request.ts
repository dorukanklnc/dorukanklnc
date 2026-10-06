import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { DEFAULT_LOCALE, LOCALE_COOKIE, type Locale, isLocale } from './config';

const catalogs = {
  tr: () => import('../../messages/tr.json'),
  en: () => import('../../messages/en.json'),
} satisfies Record<Locale, () => Promise<{ default: object }>>;

/** Turkish by default; the locale cookie switches the UI language (no locale in URLs). */
export default getRequestConfig(async () => {
  const store = await cookies();
  const requested = store.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(requested) ? requested : DEFAULT_LOCALE;
  return {
    locale,
    timeZone: 'Europe/Istanbul',
    messages: (await catalogs[locale]()).default,
  };
});
