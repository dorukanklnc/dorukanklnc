/** ISO-4217 minor unit exponents for the currencies the platform supports. */
export const CURRENCY_EXPONENTS = {
  TRY: 2,
  USD: 2,
  EUR: 2,
  GBP: 2,
} as const;

export type SupportedCurrency = keyof typeof CURRENCY_EXPONENTS;

export const SUPPORTED_CURRENCIES = Object.keys(CURRENCY_EXPONENTS) as SupportedCurrency[];

export function currencyExponent(currency: string): number {
  return (CURRENCY_EXPONENTS as Record<string, number>)[currency] ?? 2;
}

/** 10^exponent — the number of minor units in one major unit (100 for TRY). */
export function minorUnitsPerMajor(currency: string): number {
  return 10 ** currencyExponent(currency);
}
