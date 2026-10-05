import { Injectable } from '@nestjs/common';
import type {
  Paginated,
  Payment,
  PaymentListItem,
  PaymentListQuery,
  RecordPaymentRequest,
} from '@repo/contracts';
import { and, asc, count, desc, eq, gte, isNull, lt, sql } from 'drizzle-orm';
import { hashPayload } from '../../platform/crypto/tokens.js';
import {
  branches,
  memberships,
  paymentAllocations,
  payments,
  receivables,
  students,
  users,
} from '../../platform/database/schema/index.js';
import { TenantDatabase } from '../../platform/database/tenant-database.service.js';
import type { Transaction } from '../../platform/database/types.js';
import { AppError, Errors } from '../../platform/errors/app-error.js';
import { isUniqueViolation } from '../../platform/errors/postgres-errors.js';
import { AuditService } from '../../core/audit/audit.service.js';
import type { Actor } from '../../core/authorization/actor.js';
import { branchPredicate } from '../../core/authorization/scope-filters.js';
import { DomainEvents } from '../../core/outbox/events.js';
import { OutboxService } from '../../core/outbox/outbox.service.js';
import { findOrCreateAccount, loadLinkedGuardian, loadStudentForFinance } from '../shared.js';
import { recordPayment } from './payment-recorder.js';

const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{8,128}$/;

const paymentColumns = {
  id: payments.id,
  receiptNumber: payments.receiptNumber,
  studentId: students.id,
  studentFirstName: students.firstName,
  studentLastName: students.lastName,
  studentNumber: students.studentNumber,
  accountId: payments.accountId,
  branchId: branches.id,
  branchName: branches.name,
  currency: payments.currency,
  amountMinor: payments.amountMinor,
  allocatedMinor: payments.allocatedMinor,
  refundedMinor: payments.refundedMinor,
  method: payments.method,
  status: payments.status,
  receivedAt: payments.receivedAt,
  payerName: payments.payerName,
  reference: payments.reference,
  notes: payments.notes,
  provider: payments.provider,
  recordedBy: users.fullName,
  reversedAt: payments.reversedAt,
  reversalReason: payments.reversalReason,
  createdAt: payments.createdAt,
};

interface PaymentRow {
  id: string;
  receiptNumber: string;
  studentId: string;
  studentFirstName: string;
  studentLastName: string;
  studentNumber: string;
  accountId: string;
  branchId: string;
  branchName: string;
  currency: string;
  amountMinor: number;
  allocatedMinor: number;
  refundedMinor: number;
  method: Payment['method'];
  status: Payment['status'];
  receivedAt: Date;
  payerName: string | null;
  reference: string | null;
  notes: string | null;
  provider: string | null;
  recordedBy: string | null;
  reversedAt: Date | null;
  reversalReason: string | null;
  createdAt: Date;
}

function toListItem(row: PaymentRow): PaymentListItem {
  return {
    id: row.id,
    receiptNumber: row.receiptNumber,
    student: { id: row.studentId, fullName: `${row.studentFirstName} ${row.studentLastName}`, studentNumber: row.studentNumber },
    accountId: row.accountId,
    branch: { id: row.branchId, name: row.branchName },
    currency: row.currency,
    amountMinor: row.amountMinor,
    allocatedMinor: row.allocatedMinor,
    refundedMinor: row.refundedMinor,
    unallocatedMinor: row.status === 'completed' ? row.amountMinor - row.allocatedMinor - row.refundedMinor : 0,
    method: row.method,
    status: row.status,
    receivedAt: row.receivedAt.toISOString(),
    payerName: row.payerName,
    reference: row.reference,
    provider: row.provider,
    recordedBy: row.recordedBy,
    reversedAt: row.reversedAt?.toISOString() ?? null,
    reversalReason: row.reversalReason,
    createdAt: row.createdAt.toISOString(),
  };
}

export interface RecordPaymentResult {
  payment: Payment;
  /** True when an earlier request with the same idempotency key is returned. */
  replayed: boolean;
}

@Injectable()
export class PaymentsService {
  constructor(
    private readonly db: TenantDatabase,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  /**
   * Flow 5: records a payment, allocates it (oldest first or manual), updates balances through
   * database triggers, writes the audit record and the `payment.received` event — atomically.
   */
  async record(actor: Actor, input: RecordPaymentRequest, idempotencyKey: string | undefined): Promise<RecordPaymentResult> {
    if (!idempotencyKey || !IDEMPOTENCY_KEY.test(idempotencyKey)) {
      throw new AppError('IDEMPOTENCY_KEY_REQUIRED', 400, 'An Idempotency-Key header (8–128 URL-safe characters) is required');
    }
    const requestHash = hashPayload(input);
    const organization = actor.tenant().organization;

    try {
      return await this.db.transaction(actor.tenantScope(), async (tx) => {
        const replay = await this.findReplay(tx, actor, idempotencyKey, requestHash);
        if (replay) return replay;

        const student = await loadStudentForFinance(tx, actor, input.studentId, 'finance.payments.create');
        const accountId = await findOrCreateAccount(tx, {
          organizationId: actor.organizationId,
          branchId: student.branchId,
          studentId: student.id,
          currency: input.currency,
        });
        const payer = input.payerGuardianId
          ? await loadLinkedGuardian(tx, actor.organizationId, student.id, input.payerGuardianId)
          : null;

        const recorded = await recordPayment(tx, {
          organizationId: actor.organizationId,
          branchId: student.branchId,
          accountId,
          studentId: student.id,
          currency: input.currency,
          amountMinor: input.amountMinor,
          method: input.method,
          receivedAt: input.receivedAt ? new Date(input.receivedAt) : new Date(),
          timezone: organization.timezone,
          payerGuardianId: payer?.id ?? null,
          payerName: input.payerName ?? payer?.fullName ?? null,
          reference: input.reference ?? null,
          notes: input.notes ?? null,
          idempotencyKey,
          requestHash,
          recordedByMembershipId: actor.membershipId,
          allocation: input.allocation,
        });

        await this.audit.record(tx, {
          organizationId: actor.organizationId,
          branchId: student.branchId,
          actor: actor.auditActor(),
          action: 'payment.created',
          resourceType: 'payment',
          resourceId: recorded.paymentId,
          metadata: {
            receiptNumber: recorded.receiptNumber,
            studentId: student.id,
            amountMinor: input.amountMinor,
            currency: input.currency,
            method: input.method,
            allocationMode: input.allocation.mode,
            allocations: recorded.allocations,
          },
        });
        await this.outbox.publish(tx, {
          organizationId: actor.organizationId,
          aggregateType: 'payment',
          aggregateId: recorded.paymentId,
          eventType: DomainEvents.paymentReceived,
          payload: {
            paymentId: recorded.paymentId,
            accountId,
            studentId: student.id,
            amountMinor: input.amountMinor,
            currency: input.currency,
            method: input.method,
            allocations: recorded.allocations,
          },
          actorUserId: actor.userId,
        });
        return { payment: await this.load(tx, actor, recorded.paymentId), replayed: false };
      });
    } catch (error) {
      // Two concurrent requests with one key: the loser returns the winner's payment.
      if (isUniqueViolation(error, 'payments_idempotency_uq')) {
        return this.db.transaction(actor.tenantScope(), async (tx) => {
          const replay = await this.findReplay(tx, actor, idempotencyKey, requestHash);
          if (!replay) throw error;
          return replay;
        });
      }
      throw error;
    }
  }

  async list(actor: Actor, query: PaymentListQuery): Promise<Paginated<PaymentListItem>> {
    const timezone = actor.tenant().organization.timezone;
    return this.db.transaction(actor.tenantScope(), async (tx) => {
      const where = and(
        eq(payments.organizationId, actor.organizationId),
        branchPredicate(actor, 'finance.payments.read', payments.branchId),
        query.from ? gte(sql`(${payments.receivedAt} AT TIME ZONE ${timezone})::date`, sql`${query.from}::date`) : undefined,
        query.to ? lt(sql`(${payments.receivedAt} AT TIME ZONE ${timezone})::date`, sql`${query.to}::date + 1`) : undefined,
        query.method ? eq(payments.method, query.method) : undefined,
        query.status ? eq(payments.status, query.status) : undefined,
        query.studentId ? eq(payments.studentId, query.studentId) : undefined,
        query.branchId ? eq(payments.branchId, query.branchId) : undefined,
        query.q
          ? sql`(${students.searchText} LIKE '%' || app.search_normalize(${query.q}) || '%' OR ${payments.receiptNumber} ILIKE ${`%${query.q}%`})`
          : undefined,
      );
      const direction = query.direction === 'asc' ? asc : desc;
      const [total] = await tx
        .select({ value: count() })
        .from(payments)
        .innerJoin(students, eq(students.id, payments.studentId))
        .where(where);
      const rows = await this.baseQuery(tx)
        .where(where)
        .orderBy(query.sort === 'amount' ? direction(payments.amountMinor) : direction(payments.receivedAt), desc(payments.id))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize);
      return {
        items: rows.map(toListItem),
        page: query.page,
        pageSize: query.pageSize,
        total: total?.value ?? 0,
      };
    });
  }

  async get(actor: Actor, paymentId: string): Promise<Payment> {
    return this.db.transaction(actor.tenantScope(), (tx) => this.load(tx, actor, paymentId));
  }

  /**
   * Reverses a completed payment: allocations are marked reversed (receivables re-open), then the
   * payment moves to `reversed`. Nothing is deleted or rewritten; the original stays visible.
   */
  async reverse(actor: Actor, paymentId: string, reason: string): Promise<Payment> {
    return this.db.transaction(actor.tenantScope(), async (tx) => {
      const [payment] = await tx
        .select({
          id: payments.id,
          status: payments.status,
          refundedMinor: payments.refundedMinor,
          branchId: payments.branchId,
          accountId: payments.accountId,
          studentId: payments.studentId,
          amountMinor: payments.amountMinor,
          currency: payments.currency,
        })
        .from(payments)
        .where(
          and(
            eq(payments.organizationId, actor.organizationId),
            eq(payments.id, paymentId),
            branchPredicate(actor, 'finance.payments.reverse', payments.branchId),
          ),
        )
        .for('update');
      if (!payment) throw Errors.notFound('Payment');
      if (payment.status === 'reversed') {
        throw Errors.conflict('FINANCE_PAYMENT_ALREADY_REVERSED', 'Payment is already reversed');
      }
      if (payment.refundedMinor > 0) {
        throw Errors.conflict('FINANCE_PAYMENT_HAS_REFUNDS', 'Reverse the refunds first');
      }

      const reversedAllocations = await tx
        .update(paymentAllocations)
        .set({ reversedAt: sql`now()`, reversedByMembershipId: actor.membershipId, reversalReason: reason })
        .where(
          and(
            eq(paymentAllocations.organizationId, actor.organizationId),
            eq(paymentAllocations.paymentId, paymentId),
            isNull(paymentAllocations.reversedAt),
          ),
        )
        .returning({ receivableId: paymentAllocations.receivableId, amountMinor: paymentAllocations.amountMinor });

      await tx
        .update(payments)
        .set({
          status: 'reversed',
          reversedAt: sql`now()`,
          reversedByMembershipId: actor.membershipId,
          reversalReason: reason,
        })
        .where(and(eq(payments.organizationId, actor.organizationId), eq(payments.id, paymentId)));

      await this.audit.record(tx, {
        organizationId: actor.organizationId,
        branchId: payment.branchId,
        actor: actor.auditActor(),
        action: 'payment.reversed',
        resourceType: 'payment',
        resourceId: paymentId,
        changes: { status: { before: 'completed', after: 'reversed' } },
        metadata: { reason, reversedAllocations },
      });
      await this.outbox.publish(tx, {
        organizationId: actor.organizationId,
        aggregateType: 'payment',
        aggregateId: paymentId,
        eventType: DomainEvents.paymentReversed,
        payload: {
          paymentId,
          accountId: payment.accountId,
          studentId: payment.studentId,
          amountMinor: payment.amountMinor,
          currency: payment.currency,
          reversedAllocations,
        },
        actorUserId: actor.userId,
      });
      return this.load(tx, actor, paymentId);
    });
  }

  private async findReplay(
    tx: Transaction,
    actor: Actor,
    idempotencyKey: string,
    requestHash: string,
  ): Promise<RecordPaymentResult | null> {
    const [existing] = await tx
      .select({ id: payments.id, requestHash: payments.requestHash })
      .from(payments)
      .where(and(eq(payments.organizationId, actor.organizationId), eq(payments.idempotencyKey, idempotencyKey)))
      .limit(1);
    if (!existing) return null;
    if (existing.requestHash !== requestHash) {
      throw Errors.conflict('IDEMPOTENCY_KEY_REUSED', 'This idempotency key was used for a different request');
    }
    return { payment: await this.load(tx, actor, existing.id), replayed: true };
  }

  private baseQuery(tx: Transaction) {
    return tx
      .select(paymentColumns)
      .from(payments)
      .innerJoin(students, eq(students.id, payments.studentId))
      .innerJoin(branches, eq(branches.id, payments.branchId))
      .leftJoin(memberships, eq(memberships.id, payments.recordedByMembershipId))
      .leftJoin(users, eq(users.id, memberships.userId));
  }

  private async load(tx: Transaction, actor: Actor, paymentId: string): Promise<Payment> {
    const [row] = await this.baseQuery(tx)
      .where(
        and(
          eq(payments.organizationId, actor.organizationId),
          eq(payments.id, paymentId),
          branchPredicate(actor, 'finance.payments.read', payments.branchId),
        ),
      )
      .limit(1);
    if (!row) throw Errors.notFound('Payment');
    const allocations = await tx
      .select({
        id: paymentAllocations.id,
        receivableId: paymentAllocations.receivableId,
        description: receivables.description,
        dueDate: receivables.dueDate,
        amountMinor: paymentAllocations.amountMinor,
        reversedAt: paymentAllocations.reversedAt,
      })
      .from(paymentAllocations)
      .innerJoin(receivables, eq(receivables.id, paymentAllocations.receivableId))
      .where(and(eq(paymentAllocations.organizationId, actor.organizationId), eq(paymentAllocations.paymentId, paymentId)))
      .orderBy(asc(receivables.dueDate), asc(receivables.sequenceNo));
    return {
      ...toListItem(row),
      notes: row.notes,
      allocations: allocations.map((allocation) => ({
        ...allocation,
        reversedAt: allocation.reversedAt?.toISOString() ?? null,
      })),
    };
  }
}
