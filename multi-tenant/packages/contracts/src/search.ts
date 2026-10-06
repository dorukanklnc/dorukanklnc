import { z } from 'zod';
import { uuidSchema } from './common.js';

export const searchQuerySchema = z.object({
  q: z.string().trim().min(2).max(100),
  limit: z.coerce.number().int().min(1).max(10).default(5),
});
export type SearchQuery = z.infer<typeof searchQuerySchema>;

export const searchResultTypeSchema = z.enum([
  'student',
  'guardian',
  'personnel',
  'payment',
  'class',
]);
export type SearchResultType = z.infer<typeof searchResultTypeSchema>;

export const searchResultSchema = z.object({
  type: searchResultTypeSchema,
  id: uuidSchema,
  title: z.string(),
  /** Language-neutral context (names, numbers); clients add localized labels. */
  subtitle: z.string().nullable(),
  /** In-app path to open the result. */
  href: z.string(),
  /** Structured details the client formats for its locale (e.g. a payment's amount). */
  meta: z
    .object({
      amountMinor: z.number().int().optional(),
      currency: z.string().optional(),
      reversed: z.boolean().optional(),
    })
    .optional(),
});
export type SearchResult = z.infer<typeof searchResultSchema>;

export const searchResponseSchema = z.object({
  query: z.string(),
  groups: z.array(z.object({ type: searchResultTypeSchema, items: z.array(searchResultSchema) })),
});
export type SearchResponse = z.infer<typeof searchResponseSchema>;
