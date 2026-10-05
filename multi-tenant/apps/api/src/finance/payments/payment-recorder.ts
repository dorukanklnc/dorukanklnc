import type { AllocationInput } from '@repo/contracts';
import { and, asc, eq } from 'drizzle-orm';
import { paymentAllocations, payments, receivables, type PaymentMethod } from '../../platform/database/schema/index.js';
import { formatReceiptNumber, nextSequenceValue } from '../../platform/database/sequences.js';
import type { DbExecutor } from '../../platform/database/types.js';
import { type AllocationLine, type OpenReceivable, allocateOldestFirst, validateManualAllocation } from '../domain/allocation.js';
import { todayIn } from '../domain/dates.js';

export interface RecordPaymentParams {
  organizationId: string;
  branchId: string;
  accountId: string;
  studentId: string;
  currency: string;
  amountMinor: number;
  method: PaymentMethod;
  receivedAt: Date;
  timezone: string;
  payerGuardianId?: string | null;
  payerName?: string | null;
  reference?: string | null;
  notes?: string | null;
  idempotencyKey?: string | null;
  requestHash?: string | null;
  provider?: string | null;
  providerReference?: string | null;
  paymentIntentId?: string | null;
  recordedByMembershipId?: string | null;
  allocation: AllocationInput;
}

export interface RecordedPayment {
  paymentId: string;
  receiptNumber: string;
  allocations: AllocationLine[];
}

/**
 * Records a payment and its allocations on the given executor. Shared by manual entry
 * (tenant transaction, RLS) and provider webhooks (system transaction, explicit organization).
 *
 * Open receivables of the account are locked (FOR UPDATE) before allocating, so concurrent
 * payments serialize per account; database constraints remain the final guard.
 */
export async function recordPayment(db: DbExecutor, params: RecordPaymentParams): Promise<RecordedPayment> {
  const openRows = await db
    .select({
      id: receivables.id,
      kind: receivables.kind,
      sequenceNo: receivables.sequenceNo,
      dueDate: receivables.dueDate,
      amountMinor: receivables.amountMinor,
      allocatedMinor: receivables.allocatedMinor,
      createdAt: receivables.createdAt,
    })
    .from(receivables)
    .where(
      and(
        eq(receivables.organizationId, params.organizationId),
        eq(receivables.accountId, params.accountId),
        eq(receivables.status, 'open'),
      ),
    )
    .orderBy(asc(receivables.dueDate))
    .for('update');

  const open: OpenReceivable[] = openRows.map((row) => ({
    id: row.id,
    kind: row.kind,
    sequenceNo: row.sequenceNo,
    dueDate: row.dueDate,
    outstandingMinor: row.amountMinor - row.allocatedMinor,
    createdAt: row.createdAt,
  }));

  const allocations =
    params.allocation.mode === 'auto'
      ? allocateOldestFirst(params.amountMinor, open)
      : validateManualAllocation(
          params.amountMinor,
          params.allocation.items,
          new Map(open.map((receivable) => [receivable.id, receivable])),
        );

  const receiptYear = todayIn(params.timezone, params.receivedAt).slice(0, 4);
  const receiptNumber = formatReceiptNumber(
    receiptYear,
    await nextSequenceValue(db, { organizationId: params.organizationId, key: 'receipt', period: receiptYear }),
  );

  const [payment] = await db
    .insert(payments)
    .values({
      organizationId: params.organizationId,
      branchId: params.branchId,
      accountId: params.accountId,
      studentId: params.studentId,
      payerGuardianId: params.payerGuardianId ?? null,
      payerName: params.payerName ?? null,
      currency: params.currency,
      amountMinor: params.amountMinor,
      method: params.method,
      receivedAt: params.receivedAt,
      receiptNumber,
      reference: params.reference ?? null,
      notes: params.notes ?? null,
      idempotencyKey: params.idempotencyKey ?? null,
      requestHash: params.requestHash ?? null,
      provider: params.provider ?? null,
      providerReference: params.providerReference ?? null,
      paymentIntentId: params.paymentIntentId ?? null,
      recordedByMembershipId: params.recordedByMembershipId ?? null,
    })
    .returning({ id: payments.id });
  if (!payment) throw new Error('Payment insert failed');

  if (allocations.length > 0) {
    await db.insert(paymentAllocations).values(
      allocations.map((allocation) => ({
        organizationId: params.organizationId,
        branchId: params.branchId,
        accountId: params.accountId,
        paymentId: payment.id,
        receivableId: allocation.receivableId,
        amountMinor: allocation.amountMinor,
        createdByMembershipId: params.recordedByMembershipId ?? null,
      })),
    );
  }
  return { paymentId: payment.id, receiptNumber, allocations };
}
