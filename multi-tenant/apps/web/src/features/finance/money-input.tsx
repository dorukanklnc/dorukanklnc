'use client';

import { Input, type InputProps } from '@repo/ui';
import { useTranslations } from 'next-intl';
import { z } from 'zod';
import { formatMoneyInput, parseMoneyInput } from '@/lib/money';
import { useFormat } from '@/lib/use-format';

const SYMBOLS: Record<string, string> = { TRY: '₺', USD: '$', EUR: '€', GBP: '£' };

/**
 * Amount field. Users type naturally (`12.500`, `12500,50`); the value stays text in the form and
 * is converted to integer minor units by {@link useMoneySchema} — never through floating point.
 * On blur the text is normalized to the locale format.
 */
export function MoneyInput({
  currency,
  onBlur,
  ...props
}: Omit<InputProps, 'type' | 'inputMode' | 'trailing'> & { currency: string }) {
  const format = useFormat();
  return (
    <Input
      {...props}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      className="tabular"
      trailing={<span className="text-xs text-fg-muted">{SYMBOLS[currency] ?? currency}</span>}
      onBlur={(event) => {
        const parsed = parseMoneyInput(event.target.value, currency, format.locale);
        if (parsed !== null) event.target.value = formatMoneyInput(parsed, currency, format.locale);
        onBlur?.(event);
      }}
    />
  );
}

/** Zod schema for a money text field: validates and transforms to minor units. */
export function useMoneySchema(currency: string) {
  const tv = useTranslations('validation');
  const format = useFormat();
  return {
    required: (options: { allowZero?: boolean } = {}) =>
      z
        .string()
        .trim()
        .min(1, tv('required'))
        .transform((value, ctx) => {
          const parsed = parseMoneyInput(value, currency, format.locale);
          if (parsed === null) {
            ctx.addIssue({ code: 'custom', message: tv('invalidAmount') });
            return z.NEVER;
          }
          if (parsed === 0 && !options.allowZero) {
            ctx.addIssue({ code: 'custom', message: tv('amountPositive') });
            return z.NEVER;
          }
          return parsed;
        }),
    optional: () =>
      z
        .string()
        .trim()
        .transform((value, ctx) => {
          if (value === '') return 0;
          const parsed = parseMoneyInput(value, currency, format.locale);
          if (parsed === null) {
            ctx.addIssue({ code: 'custom', message: tv('invalidAmount') });
            return z.NEVER;
          }
          return parsed;
        }),
  };
}
