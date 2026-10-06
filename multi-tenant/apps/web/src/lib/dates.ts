/**
 * Date helpers. Calendar dates travel as `YYYY-MM-DD` strings (no time zone); instants as ISO
 * strings formatted in the organization's time zone. Calendar dates are never converted through
 * a local `Date`, which would shift them across time zones.
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

export function parseIsoDate(value: string): CalendarDate | null {
  const match = ISO_DATE.exec(value.slice(0, 10));
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

export function toIsoDate({ year, month, day }: CalendarDate): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Adds calendar months, clamping the day (Jan 31 + 1 month → Feb 28/29), like the API does. */
export function addMonths(value: string, months: number): string {
  const date = parseIsoDate(value);
  if (!date) return value;
  const index = date.year * 12 + (date.month - 1) + months;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return toIsoDate({ year, month, day: Math.min(date.day, daysInMonth(year, month)) });
}

/** Today's calendar date in a time zone, e.g. the organization's `Europe/Istanbul`. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** First day of the next month (a sensible default for a first installment). */
export function firstOfNextMonth(today: string): string {
  const date = parseIsoDate(today);
  if (!date) return today;
  return addMonths(toIsoDate({ ...date, day: 1 }), 1);
}

export function compareIsoDates(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

const dateFormatters = new Map<string, Intl.DateTimeFormat>();

function dateFormatter(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let cached = dateFormatters.get(key);
  if (!cached) {
    cached = new Intl.DateTimeFormat(locale, options);
    dateFormatters.set(key, cached);
  }
  return cached;
}

export type DateStyle = 'numeric' | 'medium' | 'long';

const DATE_STYLES: Record<DateStyle, Intl.DateTimeFormatOptions> = {
  numeric: { day: '2-digit', month: '2-digit', year: 'numeric' },
  medium: { day: 'numeric', month: 'short', year: 'numeric' },
  long: { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' },
};

/** Formats a calendar date (`YYYY-MM-DD`) without any time-zone shift. */
export function formatCalendarDate(
  value: string,
  locale: string,
  style: DateStyle = 'numeric',
): string {
  const date = parseIsoDate(value);
  if (!date) return value;
  const utc = new Date(Date.UTC(date.year, date.month - 1, date.day));
  return dateFormatter(locale, { ...DATE_STYLES[style], timeZone: 'UTC' }).format(utc);
}

/** Formats an instant in the given time zone, e.g. `05.10.2026 14:32`. */
export function formatInstant(
  value: string,
  locale: string,
  timeZone: string,
  options: { seconds?: boolean } = {},
): string {
  return dateFormatter(locale, {
    ...DATE_STYLES.numeric,
    hour: '2-digit',
    minute: '2-digit',
    ...(options.seconds ? { second: '2-digit' } : {}),
    timeZone,
  }).format(new Date(value));
}

/** The calendar date of an instant in a time zone. */
export function instantToCalendarDate(value: string, timeZone: string): string {
  return todayIn(timeZone, new Date(value));
}

/** `2026-10` → `Eki 2026` (chart axis labels). */
export function formatMonth(value: string, locale: string): string {
  const [year, month] = value.split('-').map(Number);
  if (!year || !month) return value;
  return dateFormatter(locale, { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(year, month - 1, 1)),
  );
}

const relativeFormatters = new Map<string, Intl.RelativeTimeFormat>();

/** `3 gün önce`, `2 saat önce`, … for activity feeds. */
export function formatRelative(value: string, locale: string, now: Date = new Date()): string {
  let formatter = relativeFormatters.get(locale);
  if (!formatter) {
    formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    relativeFormatters.set(locale, formatter);
  }
  const seconds = Math.round((new Date(value).getTime() - now.getTime()) / 1000);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31_536_000],
    ['month', 2_592_000],
    ['week', 604_800],
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
  ];
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return formatter.format(Math.trunc(seconds / size), unit);
  }
  return formatter.format(0, 'minute');
}
