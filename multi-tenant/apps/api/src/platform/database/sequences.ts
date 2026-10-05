import { sql } from 'drizzle-orm';
import type { DbExecutor } from './types.js';

/**
 * Hands out the next number of a per-organization sequence (student numbers, receipt numbers).
 * The upsert takes a row lock, so concurrent callers in different transactions serialize; numbers
 * of rolled-back transactions are skipped (gap-tolerant by design).
 */
export async function nextSequenceValue(
  db: DbExecutor,
  input: { organizationId: string; key: string; period?: string; start?: number },
): Promise<number> {
  const start = input.start ?? 1;
  const result = await db.execute<{ value: number }>(sql`
    INSERT INTO document_sequences (organization_id, sequence_key, period, next_value)
    VALUES (${input.organizationId}, ${input.key}, ${input.period ?? ''}, ${start + 1})
    ON CONFLICT (organization_id, sequence_key, period)
    DO UPDATE SET next_value = document_sequences.next_value + 1, updated_at = now()
    RETURNING next_value - 1 AS value
  `);
  const value = result.rows[0]?.value;
  if (value === undefined) throw new Error('Sequence allocation failed');
  return Number(value);
}

export function formatReceiptNumber(year: string, value: number): string {
  return `TAH-${year}-${String(value).padStart(6, '0')}`;
}
