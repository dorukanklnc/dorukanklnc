import { z } from 'zod';

export const uuidSchema = z.uuid();

/** Calendar date `YYYY-MM-DD`, interpreted in the organization's time zone. */
export const isoDateSchema = z.iso.date();

/** Instant with offset, e.g. `2026-10-05T09:30:00.000Z`. */
export const isoDateTimeSchema = z.iso.datetime({ offset: true });

export const currencySchema = z
  .string()
  .regex(/^[A-Z]{3}$/, { message: 'ISO-4217 currency code expected' });

/** Strictly positive amount in minor units (e.g. kuruş). */
export const positiveAmountMinorSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

/** Non-negative amount in minor units. */
export const amountMinorSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

export const moneySchema = z.object({
  amountMinor: z.number().int(),
  currency: currencySchema,
});
export type Money = z.infer<typeof moneySchema>;

export const sortDirectionSchema = z.enum(['asc', 'desc']);
export type SortDirection = z.infer<typeof sortDirectionSchema>;

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export function paginatedSchema<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
  });
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

/** Optional free-text search parameter used by list endpoints. */
export const searchTermSchema = z.string().trim().min(1).max(100);

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9 ()-]{7,20}$/, { message: 'Invalid phone number' });

export const personNameSchema = z.string().trim().min(1).max(80);

export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === '' ? undefined : value))
    .optional();

/** A reference to another entity with its display label. */
export const refSchema = z.object({ id: uuidSchema, name: z.string() });
export type Ref = z.infer<typeof refSchema>;

/**
 * Turkish national ID (T.C. Kimlik No) validation: 11 digits, first digit non-zero and the two
 * official checksum digits.
 */
export function isValidTurkishNationalId(value: string): boolean {
  if (!/^[1-9][0-9]{10}$/.test(value)) return false;
  const d = [...value].map(Number);
  const odd = d[0]! + d[2]! + d[4]! + d[6]! + d[8]!;
  const even = d[1]! + d[3]! + d[5]! + d[7]!;
  const tenth = (((odd * 7 - even) % 10) + 10) % 10;
  if (tenth !== d[9]) return false;
  const eleventh = d.slice(0, 10).reduce((sum, digit) => sum + digit, 0) % 10;
  return eleventh === d[10];
}

export const turkishNationalIdSchema = z
  .string()
  .trim()
  .refine(isValidTurkishNationalId, { message: 'Invalid national ID number' });
