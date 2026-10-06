'use client';

import { useLocale } from 'next-intl';
import { useMemo } from 'react';
import { useOptionalSession } from '@/components/session/session-context';
import { INTL_LOCALE, isLocale } from '@/i18n/config';
import {
  type DateStyle,
  formatCalendarDate,
  formatInstant,
  formatMonth,
  formatRelative,
  todayIn,
} from './dates';
import { formatBasisPoints, formatMoney, formatMoneyCompact, formatRatio } from './money';

const FALLBACK_TIME_ZONE = 'Europe/Istanbul';
const FALLBACK_CURRENCY = 'TRY';

/**
 * Locale- and organization-aware formatters. Instants use the organization's time zone (a
 * school in Istanbul sees Istanbul time on any device); calendar dates are never shifted.
 */
export function useFormat() {
  const appLocale = useLocale();
  const session = useOptionalSession();
  const locale = INTL_LOCALE[isLocale(appLocale) ? appLocale : 'tr'];
  const timeZone = session?.activeOrganization?.timezone ?? FALLBACK_TIME_ZONE;
  const currency = session?.activeOrganization?.defaultCurrency ?? FALLBACK_CURRENCY;

  return useMemo(
    () => ({
      locale,
      timeZone,
      currency,
      money: (amountMinor: number, code: string = currency) =>
        formatMoney(amountMinor, code, locale),
      moneyCompact: (amountMinor: number, code: string = currency) =>
        formatMoneyCompact(amountMinor, code, locale),
      date: (value: string | null | undefined, style?: DateStyle) =>
        value ? formatCalendarDate(value, locale, style) : '—',
      dateTime: (value: string | null | undefined) =>
        value ? formatInstant(value, locale, timeZone) : '—',
      relative: (value: string) => formatRelative(value, locale),
      month: (value: string) => formatMonth(value, locale),
      number: (value: number) => new Intl.NumberFormat(locale).format(value),
      ratio: (value: number) => formatRatio(value, locale),
      basisPoints: (value: number) => formatBasisPoints(value, locale),
      today: () => todayIn(timeZone),
    }),
    [locale, timeZone, currency],
  );
}

export type Formatters = ReturnType<typeof useFormat>;
