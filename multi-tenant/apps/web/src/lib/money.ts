import { currencyExponent } from '@repo/contracts';

/**
 * Money helpers for the UI. Amounts travel as integer minor units (kuruş); conversion to and
 * from decimal text uses string/BigInt arithmetic, never floating point.
 */

/** Exact decimal string for an integer scaled by 10^exponent, e.g. (1234567, 2) → "12345.67". */
export function scaledToDecimalString(value: number, exponent: number): string {
  const negative = value < 0;
  const digits = Math.abs(value)
    .toString()
    .padStart(exponent + 1, '0');
  const whole = digits.slice(0, digits.length - exponent);
  const fraction = exponent > 0 ? `.${digits.slice(digits.length - exponent)}` : '';
  return `${negative ? '-' : ''}${whole}${fraction}`;
}

export function minorToDecimalString(amountMinor: number, currency: string): string {
  return scaledToDecimalString(amountMinor, currencyExponent(currency));
}

const formatters = new Map<string, Intl.NumberFormat>();

function formatter(locale: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let cached = formatters.get(key);
  if (!cached) {
    cached = new Intl.NumberFormat(locale, options);
    formatters.set(key, cached);
  }
  return cached;
}

function asNumeric(value: string): Intl.StringNumericLiteral {
  // Intl formats numeric strings exactly (no binary floating-point rounding).
  return value as Intl.StringNumericLiteral;
}

/** Formats minor units as a localized currency string, e.g. `₺12.345,67`. */
export function formatMoney(amountMinor: number, currency: string, locale: string): string {
  const exponent = currencyExponent(currency);
  return formatter(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: exponent,
    maximumFractionDigits: exponent,
  }).format(asNumeric(minorToDecimalString(amountMinor, currency)));
}

/** Short form for chart axes and dense KPIs, e.g. `₺1,2 Mn`. Display only. */
export function formatMoneyCompact(amountMinor: number, currency: string, locale: string): string {
  return formatter(locale, {
    style: 'currency',
    currency,
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(asNumeric(minorToDecimalString(amountMinor, currency)));
}

/** Localized number with the currency's fraction digits, for prefilling input fields. */
export function formatMoneyInput(amountMinor: number, currency: string, locale: string): string {
  const exponent = currencyExponent(currency);
  return formatter(locale, {
    minimumFractionDigits: exponent,
    maximumFractionDigits: exponent,
  }).format(asNumeric(minorToDecimalString(amountMinor, currency)));
}

/** Basis points → localized percentage, e.g. 1250 → `%12,5`. */
export function formatBasisPoints(bps: number, locale: string): string {
  return formatter(locale, { style: 'percent', maximumFractionDigits: 2 }).format(
    asNumeric(scaledToDecimalString(bps, 4)),
  );
}

/** Ratio (0..1) → localized percentage with one decimal, e.g. 0.8734 → `%87,3`. */
export function formatRatio(ratio: number, locale: string): string {
  return formatter(locale, { style: 'percent', maximumFractionDigits: 1 }).format(ratio);
}

export function decimalSeparator(locale: string): string {
  const parts = formatter(locale, {}).formatToParts(1.5);
  return parts.find((part) => part.type === 'decimal')?.value ?? '.';
}

/**
 * Parses a non-negative decimal typed by a user into an integer scaled by 10^exponent.
 *
 * The locale's decimal separator always wins. Without it, a single occurrence of the other
 * separator followed by exactly three digits is a thousands separator (`1.250` → 1 250 in
 * Turkish); followed by one or two digits it is read as decimals (`12.5` → 12,50). Returns null
 * for invalid or ambiguous input: negatives, letters, malformed grouping, more fraction digits
 * than allowed, or values beyond the safe integer range.
 */
export function parseScaledDecimal(input: string, exponent: number, locale: string): number | null {
  const decimal = decimalSeparator(locale);
  const thousands = decimal === ',' ? '.' : ',';
  const text = input.replace(/[\s\u00a0\u202f'’]/g, '');
  if (!/^[0-9.,]+$/.test(text)) return null;

  let wholeText = text;
  let fraction = '';
  const decimalIndex = text.lastIndexOf(decimal);
  if (decimalIndex !== -1) {
    if (text.indexOf(decimal) !== decimalIndex) return null;
    wholeText = text.slice(0, decimalIndex);
    fraction = text.slice(decimalIndex + 1);
  } else {
    const otherIndex = text.lastIndexOf(thousands);
    const single = otherIndex !== -1 && text.indexOf(thousands) === otherIndex;
    if (single && text.length - otherIndex - 1 !== 3) {
      wholeText = text.slice(0, otherIndex);
      fraction = text.slice(otherIndex + 1);
    }
  }

  const groups = wholeText.split(thousands);
  const [head = '', ...tail] = groups;
  if (tail.length > 0 && (head === '' || head.length > 3 || tail.some((g) => g.length !== 3))) {
    return null;
  }
  const whole = groups.join('');
  if (!/^[0-9]*$/.test(whole) || !/^[0-9]*$/.test(fraction)) return null;
  if (whole === '' && fraction === '') return null;
  if (fraction.length > exponent) return null;

  const scaled =
    BigInt(whole === '' ? '0' : whole) * 10n ** BigInt(exponent) +
    BigInt(fraction.padEnd(exponent, '0') || '0');
  if (scaled > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(scaled);
}

/** Parses `12.500`, `12.500,50`, `12500.5` or `₺ 1.250 TL` into minor units (null if invalid). */
export function parseMoneyInput(input: string, currency: string, locale: string): number | null {
  const withoutSymbols = input.replace(/[₺$€£]|TRY|TL|USD|EUR|GBP/gi, '');
  return parseScaledDecimal(withoutSymbols, currencyExponent(currency), locale);
}

/** Percentage input (`12,5`, `%10`) → basis points; null when invalid or above 100 %. */
export function parsePercentInput(input: string, locale: string): number | null {
  const bps = parseScaledDecimal(input.replace(/%/g, ''), 2, locale);
  if (bps === null || bps > 10_000) return null;
  return bps;
}
