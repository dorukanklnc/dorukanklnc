import { AppError } from '../../platform/errors/app-error.js';

export interface OpenReceivable {
  id: string;
  kind: 'installment' | 'charge';
  sequenceNo: number | null;
  dueDate: string;
  outstandingMinor: number;
  createdAt: Date;
}

export interface AllocationLine {
  receivableId: string;
  amountMinor: number;
}

/** Oldest first: due date, installments before charges, sequence number, creation time. */
export function compareForAllocation(a: OpenReceivable, b: OpenReceivable): number {
  if (a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
  if (a.kind !== b.kind) return a.kind === 'installment' ? -1 : 1;
  const sa = a.sequenceNo ?? Number.MAX_SAFE_INTEGER;
  const sb = b.sequenceNo ?? Number.MAX_SAFE_INTEGER;
  if (sa !== sb) return sa - sb;
  return a.createdAt.getTime() - b.createdAt.getTime();
}

/** Automatic allocation (default policy). Any remainder stays as account credit. */
export function allocateOldestFirst(amountMinor: number, receivables: readonly OpenReceivable[]): AllocationLine[] {
  const lines: AllocationLine[] = [];
  let remaining = amountMinor;
  for (const receivable of [...receivables].sort(compareForAllocation)) {
    if (remaining === 0) break;
    const take = Math.min(remaining, receivable.outstandingMinor);
    if (take <= 0) continue;
    lines.push({ receivableId: receivable.id, amountMinor: take });
    remaining -= take;
  }
  return lines;
}

/** Validates a user-chosen allocation against the payment amount and outstanding balances. */
export function validateManualAllocation(
  amountMinor: number,
  items: readonly AllocationLine[],
  receivables: ReadonlyMap<string, OpenReceivable>,
): AllocationLine[] {
  const seen = new Set<string>();
  let total = 0;
  for (const item of items) {
    if (seen.has(item.receivableId)) {
      throw new AppError('VALIDATION_FAILED', 400, 'Each receivable can appear only once');
    }
    seen.add(item.receivableId);
    const receivable = receivables.get(item.receivableId);
    if (!receivable) throw new AppError('FINANCE_RECEIVABLE_NOT_OPEN', 422, 'Receivable is not open on this account');
    if (item.amountMinor > receivable.outstandingMinor) {
      throw new AppError('FINANCE_ALLOCATION_EXCEEDS_OUTSTANDING', 422, 'Allocation exceeds the outstanding amount');
    }
    total += item.amountMinor;
  }
  if (total > amountMinor) {
    throw new AppError('FINANCE_ALLOCATION_EXCEEDS_PAYMENT', 422, 'Allocations exceed the payment amount');
  }
  return [...items];
}
