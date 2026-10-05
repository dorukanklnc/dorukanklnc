import { Injectable } from '@nestjs/common';
import type {
  AccountBalance,
  Agreement,
  AgreementPreview,
  AgreementPreviewRequest,
  CreateAgreementRequest,
  StudentFinance,
} from '@repo/contracts';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import {
  academicYears,
  agreementDiscounts,
  branches,
  enrollments,
  financialAccounts,
  guardians,
  paymentPlans,
  receivables,
  tuitionAgreements,
} from '../../platform/database/schema/index.js';
import { ref } from '../../platform/database/sql.js';
import { TenantDatabase } from '../../platform/database/tenant-database.service.js';
import type { Transaction } from '../../platform/database/types.js';
import { Errors } from '../../platform/errors/app-error.js';
import { AuditService } from '../../core/audit/audit.service.js';
import type { Actor } from '../../core/authorization/actor.js';
import { branchPredicate } from '../../core/authorization/scope-filters.js';
import { DomainEvents } from '../../core/outbox/events.js';
import { OutboxService } from '../../core/outbox/outbox.service.js';
import { applyDiscounts, buildSchedule } from '../domain/agreement-calculator.js';
import { todayIn } from '../domain/dates.js';
import { findOrCreateAccount, loadLinkedGuardian, loadStudentForFinance } from '../shared.js';

@Injectable()
export class AgreementsService {
  constructor(
    private readonly db: TenantDatabase,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  /** Pure calculation shown to the user before saving; the UI never re-implements it. */
  preview(actor: Actor, input: AgreementPreviewRequest): AgreementPreview {
    const today = todayIn(actor.tenant().organization.timezone);
    const discounts = applyDiscounts(input.grossAmountMinor, input.discounts);
    const schedule = buildSchedule({
      ...input.plan,
      downPaymentDueDate: input.plan.downPaymentDueDate ?? today,
      netAmountMinor: discounts.netAmountMinor,
    });
    return {
      currency: input.currency,
      grossAmountMinor: input.grossAmountMinor,
      discounts: discounts.lines,
      discountTotalMinor: discounts.discountTotalMinor,
      netAmountMinor: discounts.netAmountMinor,
      schedule,
    };
  }

  /** Flow 4: agreement + discounts + payment plan + installments, atomically. */
  async create(actor: Actor, input: CreateAgreementRequest): Promise<Agreement> {
    const preview = this.preview(actor, input);
    return this.db.transaction(actor.tenantScope(), async (tx) => {
      const student = await loadStudentForFinance(tx, actor, input.studentId, 'finance.collections.write');
      const organizationId = actor.organizationId;
      const branchId = student.branchId;

      if (input.responsibleGuardianId) {
        await loadLinkedGuardian(tx, organizationId, student.id, input.responsibleGuardianId);
      }

      const [year] = await tx
        .select({ id: academicYears.id })
        .from(academicYears)
        .where(
          and(
            eq(academicYears.organizationId, organizationId),
            input.academicYearId ? eq(academicYears.id, input.academicYearId) : eq(academicYears.isCurrent, true),
          ),
        )
        .limit(1);
      if (input.academicYearId && !year) {
        throw Errors.validation([{ path: 'academicYearId', code: 'invalid', message: 'Unknown academic year' }]);
      }
      const [enrollment] = year
        ? await tx
            .select({ id: enrollments.id })
            .from(enrollments)
            .where(
              and(
                eq(enrollments.organizationId, organizationId),
                eq(enrollments.studentId, student.id),
                eq(enrollments.academicYearId, year.id),
                eq(enrollments.status, 'active'),
              ),
            )
            .limit(1)
        : [];

      const accountId = await findOrCreateAccount(tx, {
        organizationId,
        branchId,
        studentId: student.id,
        currency: input.currency,
      });

      const [agreement] = await tx
        .insert(tuitionAgreements)
        .values({
          organizationId,
          branchId,
          accountId,
          studentId: student.id,
          academicYearId: year?.id ?? null,
          enrollmentId: enrollment?.id ?? null,
          responsibleGuardianId: input.responsibleGuardianId ?? null,
          title: input.title,
          currency: input.currency,
          grossAmountMinor: preview.grossAmountMinor,
          discountTotalMinor: preview.discountTotalMinor,
          netAmountMinor: preview.netAmountMinor,
          signedOn: input.signedOn ?? null,
          notes: input.notes ?? null,
          createdByMembershipId: actor.membershipId,
        })
        .returning({ id: tuitionAgreements.id });
      if (!agreement) throw new Error('Agreement insert failed');
      const agreementId = agreement.id;

      if (preview.discounts.length > 0) {
        await tx.insert(agreementDiscounts).values(
          preview.discounts.map((line, index) => ({
            organizationId,
            branchId,
            agreementId,
            sortOrder: index,
            category: line.category,
            label: line.label,
            kind: line.kind,
            percentageBps: line.percentageBps,
            fixedAmountMinor: line.fixedAmountMinor,
            amountMinor: line.amountMinor,
          })),
        );
      }

      const installmentIds: { id: string; sequenceNo: number; dueDate: string; amountMinor: number }[] = [];
      let planId: string | null = null;
      if (preview.schedule.length > 0) {
        const [plan] = await tx
          .insert(paymentPlans)
          .values({
            organizationId,
            branchId,
            agreementId,
            accountId,
            installmentCount: input.plan.installmentCount,
            firstDueDate: input.plan.firstDueDate,
            downPaymentMinor: input.plan.downPaymentMinor,
            totalMinor: preview.netAmountMinor,
            roundingUnitMinor: input.plan.roundingUnitMinor,
            remainderPlacement: input.plan.remainderPlacement,
            createdByMembershipId: actor.membershipId,
          })
          .returning({ id: paymentPlans.id });
        planId = plan!.id;
        const rows = await tx
          .insert(receivables)
          .values(
            preview.schedule.map((line) => ({
              organizationId,
              branchId,
              accountId,
              studentId: student.id,
              agreementId,
              paymentPlanId: planId,
              kind: 'installment' as const,
              sequenceNo: line.sequenceNo,
              category: line.isDownPayment ? ('down_payment' as const) : ('tuition' as const),
              description: line.isDownPayment ? 'Peşinat' : `${line.sequenceNo}. taksit`,
              currency: input.currency,
              amountMinor: line.amountMinor,
              dueDate: line.dueDate,
              createdByMembershipId: actor.membershipId,
            })),
          )
          .returning({
            id: receivables.id,
            sequenceNo: receivables.sequenceNo,
            dueDate: receivables.dueDate,
            amountMinor: receivables.amountMinor,
          });
        installmentIds.push(...rows.map((row) => ({ ...row, sequenceNo: row.sequenceNo ?? 0 })));
      }

      await this.audit.record(tx, {
        organizationId,
        branchId,
        actor: actor.auditActor(),
        action: 'agreement.created',
        resourceType: 'tuition_agreement',
        resourceId: agreementId,
        metadata: {
          studentId: student.id,
          currency: input.currency,
          grossAmountMinor: preview.grossAmountMinor,
          discountTotalMinor: preview.discountTotalMinor,
          netAmountMinor: preview.netAmountMinor,
          installmentCount: installmentIds.length,
        },
      });
      await this.outbox.publishMany(tx, [
        {
          organizationId,
          aggregateType: 'tuition_agreement',
          aggregateId: agreementId,
          eventType: DomainEvents.agreementCreated,
          payload: {
            agreementId,
            studentId: student.id,
            accountId,
            currency: input.currency,
            grossAmountMinor: preview.grossAmountMinor,
            netAmountMinor: preview.netAmountMinor,
          },
          actorUserId: actor.userId,
        },
        ...(planId
          ? [
              {
                organizationId,
                aggregateType: 'payment_plan',
                aggregateId: planId,
                eventType: DomainEvents.paymentPlanCreated,
                payload: { paymentPlanId: planId, agreementId, installmentCount: installmentIds.length },
                actorUserId: actor.userId,
              },
            ]
          : []),
        ...installmentIds.map((installment) => ({
          organizationId,
          aggregateType: 'receivable',
          aggregateId: installment.id,
          eventType: DomainEvents.installmentCreated,
          payload: {
            receivableId: installment.id,
            agreementId,
            accountId,
            sequenceNo: installment.sequenceNo,
            dueDate: installment.dueDate,
            amountMinor: installment.amountMinor,
            currency: input.currency,
          },
          actorUserId: actor.userId,
        })),
      ]);

      const [created] = await this.loadAgreements(tx, actor, { agreementId });
      if (!created) throw new Error('Created agreement not visible');
      return created;
    });
  }

  async get(actor: Actor, agreementId: string): Promise<Agreement> {
    return this.db.transaction(actor.tenantScope(), async (tx) => {
      const [agreement] = await this.loadAgreements(tx, actor, { agreementId });
      if (!agreement) throw Errors.notFound('Agreement');
      return agreement;
    });
  }

  /** Student finance overview: balances per account plus agreements. */
  async studentFinance(actor: Actor, studentId: string): Promise<StudentFinance> {
    const today = todayIn(actor.tenant().organization.timezone);
    return this.db.transaction(actor.tenantScope(), async (tx) => {
      const student = await loadStudentForFinance(tx, actor, studentId, 'finance.collections.read');
      const accountRows = await tx
        .select({
          accountId: financialAccounts.id,
          branchId: branches.id,
          branchName: branches.name,
          currency: financialAccounts.currency,
          totalDueMinor: sql<number>`(SELECT coalesce(sum(r.amount_minor), 0) FROM receivables r
            WHERE r.organization_id = ${ref(financialAccounts.organizationId)} AND r.account_id = ${ref(financialAccounts.id)}
              AND r.status <> 'cancelled')::bigint`,
          paidMinor: sql<number>`(SELECT coalesce(sum(r.allocated_minor), 0) FROM receivables r
            WHERE r.organization_id = ${ref(financialAccounts.organizationId)} AND r.account_id = ${ref(financialAccounts.id)}
              AND r.status <> 'cancelled')::bigint`,
          overdueMinor: sql<number>`(SELECT coalesce(sum(r.amount_minor - r.allocated_minor), 0) FROM receivables r
            WHERE r.organization_id = ${ref(financialAccounts.organizationId)} AND r.account_id = ${ref(financialAccounts.id)}
              AND r.status = 'open' AND r.due_date < ${today}::date)::bigint`,
          creditMinor: sql<number>`(SELECT coalesce(sum(p.amount_minor - p.allocated_minor - p.refunded_minor), 0) FROM payments p
            WHERE p.organization_id = ${ref(financialAccounts.organizationId)} AND p.account_id = ${ref(financialAccounts.id)}
              AND p.status = 'completed')::bigint`,
          nextDue: sql<{ dueDate: string; amountMinor: number } | null>`(SELECT json_build_object('dueDate', r.due_date, 'amountMinor', r.amount_minor - r.allocated_minor)
            FROM receivables r
            WHERE r.organization_id = ${ref(financialAccounts.organizationId)} AND r.account_id = ${ref(financialAccounts.id)}
              AND r.status = 'open' AND r.due_date >= ${today}::date
            ORDER BY r.due_date, r.sequence_no NULLS LAST LIMIT 1)`,
        })
        .from(financialAccounts)
        .innerJoin(branches, eq(branches.id, financialAccounts.branchId))
        .where(
          and(
            eq(financialAccounts.organizationId, actor.organizationId),
            eq(financialAccounts.studentId, student.id),
            branchPredicate(actor, 'finance.collections.read', financialAccounts.branchId),
          ),
        )
        .orderBy(asc(financialAccounts.currency));

      const accounts: AccountBalance[] = accountRows.map((row) => ({
        accountId: row.accountId,
        branch: { id: row.branchId, name: row.branchName },
        currency: row.currency,
        totalDueMinor: Number(row.totalDueMinor),
        paidMinor: Number(row.paidMinor),
        outstandingMinor: Number(row.totalDueMinor) - Number(row.paidMinor),
        overdueMinor: Number(row.overdueMinor),
        creditMinor: Number(row.creditMinor),
        nextDue: row.nextDue ? { dueDate: row.nextDue.dueDate, amountMinor: Number(row.nextDue.amountMinor) } : null,
      }));

      return {
        student: {
          id: student.id,
          fullName: `${student.firstName} ${student.lastName}`,
          studentNumber: student.studentNumber,
        },
        accounts,
        agreements: await this.loadAgreements(tx, actor, { studentId: student.id }),
      };
    });
  }

  private async loadAgreements(
    tx: Transaction,
    actor: Actor,
    filter: { agreementId?: string; studentId?: string },
  ): Promise<Agreement[]> {
    const rows = await tx
      .select({
        id: tuitionAgreements.id,
        studentId: tuitionAgreements.studentId,
        accountId: tuitionAgreements.accountId,
        branchId: branches.id,
        branchName: branches.name,
        title: tuitionAgreements.title,
        currency: tuitionAgreements.currency,
        grossAmountMinor: tuitionAgreements.grossAmountMinor,
        discountTotalMinor: tuitionAgreements.discountTotalMinor,
        netAmountMinor: tuitionAgreements.netAmountMinor,
        status: tuitionAgreements.status,
        signedOn: tuitionAgreements.signedOn,
        notes: tuitionAgreements.notes,
        createdAt: tuitionAgreements.createdAt,
        academicYearId: academicYears.id,
        academicYearName: academicYears.name,
        guardianId: guardians.id,
        guardianFirstName: guardians.firstName,
        guardianLastName: guardians.lastName,
        paidMinor: sql<number>`(SELECT coalesce(sum(r.allocated_minor), 0) FROM receivables r
          WHERE r.organization_id = ${ref(tuitionAgreements.organizationId)} AND r.agreement_id = ${ref(tuitionAgreements.id)}
            AND r.status <> 'cancelled')::bigint`,
        scheduledMinor: sql<number>`(SELECT coalesce(sum(r.amount_minor), 0) FROM receivables r
          WHERE r.organization_id = ${ref(tuitionAgreements.organizationId)} AND r.agreement_id = ${ref(tuitionAgreements.id)}
            AND r.status <> 'cancelled')::bigint`,
      })
      .from(tuitionAgreements)
      .innerJoin(branches, eq(branches.id, tuitionAgreements.branchId))
      .leftJoin(academicYears, eq(academicYears.id, tuitionAgreements.academicYearId))
      .leftJoin(guardians, eq(guardians.id, tuitionAgreements.responsibleGuardianId))
      .where(
        and(
          eq(tuitionAgreements.organizationId, actor.organizationId),
          filter.agreementId ? eq(tuitionAgreements.id, filter.agreementId) : undefined,
          filter.studentId ? eq(tuitionAgreements.studentId, filter.studentId) : undefined,
          branchPredicate(actor, 'finance.collections.read', tuitionAgreements.branchId),
        ),
      )
      .orderBy(desc(tuitionAgreements.createdAt));
    if (rows.length === 0) return [];

    const ids = rows.map((row) => row.id);
    const [discountRows, planRows] = await Promise.all([
      tx
        .select()
        .from(agreementDiscounts)
        .where(and(eq(agreementDiscounts.organizationId, actor.organizationId), inArray(agreementDiscounts.agreementId, ids)))
        .orderBy(asc(agreementDiscounts.sortOrder)),
      tx
        .select()
        .from(paymentPlans)
        .where(
          and(
            eq(paymentPlans.organizationId, actor.organizationId),
            inArray(paymentPlans.agreementId, ids),
            eq(paymentPlans.status, 'active'),
          ),
        ),
    ]);

    return rows.map((row) => {
      const plan = planRows.find((candidate) => candidate.agreementId === row.id);
      return {
        id: row.id,
        studentId: row.studentId,
        accountId: row.accountId,
        branch: { id: row.branchId, name: row.branchName },
        title: row.title,
        currency: row.currency,
        grossAmountMinor: row.grossAmountMinor,
        discountTotalMinor: row.discountTotalMinor,
        netAmountMinor: row.netAmountMinor,
        paidMinor: Number(row.paidMinor),
        outstandingMinor: Number(row.scheduledMinor) - Number(row.paidMinor),
        status: row.status,
        signedOn: row.signedOn,
        academicYear: row.academicYearId && row.academicYearName ? { id: row.academicYearId, name: row.academicYearName } : null,
        responsibleGuardian: row.guardianId
          ? { id: row.guardianId, name: `${row.guardianFirstName ?? ''} ${row.guardianLastName ?? ''}`.trim() }
          : null,
        discounts: discountRows
          .filter((discount) => discount.agreementId === row.id)
          .map((discount) => ({
            category: discount.category,
            label: discount.label,
            kind: discount.kind,
            percentageBps: discount.percentageBps,
            fixedAmountMinor: discount.fixedAmountMinor,
            amountMinor: discount.amountMinor,
          })),
        plan: plan
          ? {
              id: plan.id,
              installmentCount: plan.installmentCount,
              firstDueDate: plan.firstDueDate,
              downPaymentMinor: plan.downPaymentMinor,
              status: plan.status,
            }
          : null,
        notes: row.notes,
        createdAt: row.createdAt.toISOString(),
      };
    });
  }
}
