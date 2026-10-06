import { Injectable } from '@nestjs/common';
import type {
  CreateChargeRequest,
  Paginated,
  Receivable,
  ReceivableListQuery,
} from '@repo/contracts';
import { type SQL, and, asc, count, desc, eq, gte, lt, lte, sql } from 'drizzle-orm';
import {
  type ReceivableCategory,
  type ReceivableKind,
  type ReceivableStatus,
  branches,
  receivables,
  students,
} from '../../platform/database/schema/index.js';
import { TenantDatabase } from '../../platform/database/tenant-database.service.js';
import type { Transaction } from '../../platform/database/types.js';
import { Errors } from '../../platform/errors/app-error.js';
import { AuditService } from '../../core/audit/audit.service.js';
import type { Actor } from '../../core/authorization/actor.js';
import { branchPredicate } from '../../core/authorization/scope-filters.js';
import { DomainEvents } from '../../core/outbox/events.js';
import { OutboxService } from '../../core/outbox/outbox.service.js';
import { daysOverdue } from '../domain/aging.js';
import { todayIn } from '../domain/dates.js';
import { findOrCreateAccount, loadStudentForFinance } from '../shared.js';

export const receivableColumns = {
  id: receivables.id,
  kind: receivables.kind,
  sequenceNo: receivables.sequenceNo,
  category: receivables.category,
  description: receivables.description,
  currency: receivables.currency,
  amountMinor: receivables.amountMinor,
  allocatedMinor: receivables.allocatedMinor,
  dueDate: receivables.dueDate,
  status: receivables.status,
  agreementId: receivables.agreementId,
  studentId: students.id,
  studentFirstName: students.firstName,
  studentLastName: students.lastName,
  studentNumber: students.studentNumber,
  branchId: branches.id,
  branchName: branches.name,
};

export interface ReceivableRow {
  id: string;
  kind: ReceivableKind;
  sequenceNo: number | null;
  category: ReceivableCategory;
  description: string;
  currency: string;
  amountMinor: number;
  allocatedMinor: number;
  dueDate: string;
  status: ReceivableStatus;
  agreementId: string | null;
  studentId: string;
  studentFirstName: string;
  studentLastName: string;
  studentNumber: string;
  branchId: string;
  branchName: string;
}

export function toReceivable(row: ReceivableRow, today: string): Receivable {
  const outstandingMinor = row.amountMinor - row.allocatedMinor;
  const overdueDays =
    row.status === 'open' && outstandingMinor > 0 ? daysOverdue(row.dueDate, today) : 0;
  return {
    id: row.id,
    kind: row.kind,
    sequenceNo: row.sequenceNo,
    category: row.category,
    description: row.description,
    currency: row.currency,
    amountMinor: row.amountMinor,
    allocatedMinor: row.allocatedMinor,
    outstandingMinor,
    dueDate: row.dueDate,
    status: row.status,
    isOverdue: overdueDays > 0,
    daysOverdue: overdueDays,
    student: {
      id: row.studentId,
      fullName: `${row.studentFirstName} ${row.studentLastName}`,
      studentNumber: row.studentNumber,
    },
    branch: { id: row.branchId, name: row.branchName },
    agreementId: row.agreementId,
  };
}

@Injectable()
export class ReceivablesService {
  constructor(
    private readonly db: TenantDatabase,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async list(actor: Actor, query: ReceivableListQuery): Promise<Paginated<Receivable>> {
    const today = todayIn(actor.tenant().organization.timezone);
    return this.db.transaction(actor.tenantScope(), async (tx) => {
      const where = and(
        eq(receivables.organizationId, actor.organizationId),
        branchPredicate(actor, 'finance.collections.read', receivables.branchId),
        query.kind ? eq(receivables.kind, query.kind) : undefined,
        query.status ? eq(receivables.status, query.status) : undefined,
        query.overdue === true
          ? and(eq(receivables.status, 'open'), lt(receivables.dueDate, today))
          : query.overdue === false
            ? sql`NOT (${receivables.status} = 'open' AND ${receivables.dueDate} < ${today}::date)`
            : undefined,
        query.dueFrom ? gte(receivables.dueDate, query.dueFrom) : undefined,
        query.dueTo ? lte(receivables.dueDate, query.dueTo) : undefined,
        query.studentId ? eq(receivables.studentId, query.studentId) : undefined,
        query.branchId ? eq(receivables.branchId, query.branchId) : undefined,
        query.q
          ? sql`${students.searchText} LIKE '%' || app.search_normalize(${query.q}) || '%'`
          : undefined,
      );
      const direction = query.direction === 'desc' ? desc : asc;
      const orderBy: SQL[] =
        query.sort === 'amount'
          ? [direction(sql`${receivables.amountMinor} - ${receivables.allocatedMinor}`)]
          : query.sort === 'student'
            ? [
                direction(sql`${students.lastName} COLLATE "tr-x-icu"`),
                direction(sql`${students.firstName} COLLATE "tr-x-icu"`),
              ]
            : [direction(receivables.dueDate), asc(receivables.sequenceNo)];

      const [total] = await tx
        .select({ value: count() })
        .from(receivables)
        .innerJoin(students, eq(students.id, receivables.studentId))
        .where(where);
      const rows = await tx
        .select(receivableColumns)
        .from(receivables)
        .innerJoin(students, eq(students.id, receivables.studentId))
        .innerJoin(branches, eq(branches.id, receivables.branchId))
        .where(where)
        .orderBy(...orderBy, asc(receivables.id))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize);
      return {
        items: rows.map((row) => toReceivable(row, today)),
        page: query.page,
        pageSize: query.pageSize,
        total: total?.value ?? 0,
      };
    });
  }

  async createCharge(actor: Actor, input: CreateChargeRequest): Promise<Receivable> {
    const today = todayIn(actor.tenant().organization.timezone);
    return this.db.transaction(actor.tenantScope(), async (tx) => {
      const student = await loadStudentForFinance(
        tx,
        actor,
        input.studentId,
        'finance.collections.write',
      );
      const accountId = await findOrCreateAccount(tx, {
        organizationId: actor.organizationId,
        branchId: student.branchId,
        studentId: student.id,
        currency: input.currency,
      });
      const [charge] = await tx
        .insert(receivables)
        .values({
          organizationId: actor.organizationId,
          branchId: student.branchId,
          accountId,
          studentId: student.id,
          kind: 'charge',
          category: input.category,
          description: input.description,
          currency: input.currency,
          amountMinor: input.amountMinor,
          dueDate: input.dueDate,
          createdByMembershipId: actor.membershipId,
        })
        .returning({ id: receivables.id });
      if (!charge) throw new Error('Charge insert failed');
      await this.audit.record(tx, {
        organizationId: actor.organizationId,
        branchId: student.branchId,
        actor: actor.auditActor(),
        action: 'charge.created',
        resourceType: 'receivable',
        resourceId: charge.id,
        metadata: {
          studentId: student.id,
          amountMinor: input.amountMinor,
          currency: input.currency,
          category: input.category,
        },
      });
      await this.outbox.publish(tx, {
        organizationId: actor.organizationId,
        aggregateType: 'receivable',
        aggregateId: charge.id,
        eventType: DomainEvents.chargeCreated,
        payload: {
          receivableId: charge.id,
          accountId,
          studentId: student.id,
          amountMinor: input.amountMinor,
          currency: input.currency,
          dueDate: input.dueDate,
          category: input.category,
        },
        actorUserId: actor.userId,
      });
      return this.load(tx, actor, charge.id, today);
    });
  }

  /** Cancels an unpaid receivable. Paid amounts must be reversed first (allocations are final). */
  async cancel(actor: Actor, receivableId: string, reason: string): Promise<Receivable> {
    const today = todayIn(actor.tenant().organization.timezone);
    return this.db.transaction(actor.tenantScope(), async (tx) => {
      const [current] = await tx
        .select({
          status: receivables.status,
          allocatedMinor: receivables.allocatedMinor,
          branchId: receivables.branchId,
        })
        .from(receivables)
        .where(
          and(
            eq(receivables.organizationId, actor.organizationId),
            eq(receivables.id, receivableId),
            branchPredicate(actor, 'finance.collections.write', receivables.branchId),
          ),
        )
        .for('update');
      if (!current) throw Errors.notFound('Receivable');
      if (current.status !== 'open' || current.allocatedMinor > 0) {
        throw Errors.unprocessable(
          'FINANCE_RECEIVABLE_NOT_OPEN',
          'Only unpaid open receivables can be cancelled',
        );
      }
      await tx
        .update(receivables)
        .set({ status: 'cancelled', cancelledAt: sql`now()`, cancelReason: reason })
        .where(
          and(
            eq(receivables.organizationId, actor.organizationId),
            eq(receivables.id, receivableId),
          ),
        );
      await this.audit.record(tx, {
        organizationId: actor.organizationId,
        branchId: current.branchId,
        actor: actor.auditActor(),
        action: 'receivable.cancelled',
        resourceType: 'receivable',
        resourceId: receivableId,
        changes: { status: { before: 'open', after: 'cancelled' } },
        metadata: { reason },
      });
      return this.load(tx, actor, receivableId, today);
    });
  }

  private async load(
    tx: Transaction,
    actor: Actor,
    receivableId: string,
    today: string,
  ): Promise<Receivable> {
    const [row] = await tx
      .select(receivableColumns)
      .from(receivables)
      .innerJoin(students, eq(students.id, receivables.studentId))
      .innerJoin(branches, eq(branches.id, receivables.branchId))
      .where(
        and(
          eq(receivables.organizationId, actor.organizationId),
          eq(receivables.id, receivableId),
          branchPredicate(actor, 'finance.collections.read', receivables.branchId),
        ),
      );
    if (!row) throw Errors.notFound('Receivable');
    return toReceivable(row, today);
  }
}
