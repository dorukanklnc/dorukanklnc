import { Injectable } from '@nestjs/common';
import type { PermissionKey } from '@repo/authorization';
import type { AgingBucket, FinanceKpis, FinanceSummary, FinanceSummaryQuery } from '@repo/contracts';
import { type SQL, and, asc, between, eq, sql } from 'drizzle-orm';
import { branches, receivables, students } from '../../platform/database/schema/index.js';
import { TenantDatabase } from '../../platform/database/tenant-database.service.js';
import type { Transaction } from '../../platform/database/types.js';
import { Errors } from '../../platform/errors/app-error.js';
import type { Actor } from '../../core/authorization/actor.js';
import { AGING_BUCKETS } from '../domain/aging.js';
import { addDays, monthBounds, todayIn } from '../domain/dates.js';
import { receivableColumns, toReceivable } from '../receivables/receivables.service.js';

interface Context {
  organizationId: string;
  currency: string;
  timezone: string;
  today: string;
  monthStart: string;
  monthEnd: string;
  branchFilter: (alias: string) => SQL;
}

/**
 * Collections KPIs on operational data (PostgreSQL aggregates; see FINANCE_MODEL §9).
 * Every figure respects the caller's branch scope and RLS.
 */
@Injectable()
export class FinanceSummaryService {
  constructor(private readonly db: TenantDatabase) {}

  async kpis(actor: Actor, query: FinanceSummaryQuery): Promise<FinanceKpis> {
    const context = this.context(actor, query, 'finance.kpis.read');
    return this.db.transaction(actor.tenantScope(), async (tx) => {
      const totals = await this.totals(tx, context);
      return this.toKpis(context, totals);
    });
  }

  async summary(actor: Actor, query: FinanceSummaryQuery): Promise<FinanceSummary> {
    const context = this.context(actor, query, 'finance.reports.read');
    return this.db.transaction(actor.tenantScope(), async (tx) => {
      const [totals, aging, monthly, upcoming, topOverdue] = await Promise.all([
        this.totals(tx, context),
        this.aging(tx, context),
        this.monthly(tx, context),
        this.upcoming(tx, actor, context, query.branchId),
        this.topOverdue(tx, context),
      ]);
      return {
        ...this.toKpis(context, totals),
        dueTodayMinor: totals.dueToday,
        dueTodayCount: totals.dueTodayCount,
        overdueCount: totals.overdueCount,
        overdueAccountCount: totals.overdueAccounts,
        paymentsTodayMinor: totals.paymentsToday,
        paymentsTodayCount: totals.paymentsTodayCount,
        aging,
        monthly,
        upcoming,
        topOverdue,
      };
    });
  }

  private context(actor: Actor, query: FinanceSummaryQuery, permission: PermissionKey): Context {
    const organization = actor.tenant().organization;
    const allowed = actor.branchesFor(permission);
    if (query.branchId && allowed !== '*' && !allowed.includes(query.branchId)) {
      throw Errors.unprocessable('BRANCH_NOT_ALLOWED', 'Branch is outside your access');
    }
    const today = todayIn(organization.timezone);
    const { start, end } = monthBounds(today);
    const branchFilter = (alias: string): SQL => {
      const column = sql.raw(`${alias}.branch_id`);
      if (query.branchId) return sql`AND ${column} = ${query.branchId}::uuid`;
      if (allowed === '*') return sql``;
      if (allowed.length === 0) return sql`AND false`;
      return sql`AND ${column} IN (${sql.join(
        allowed.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})`;
    };
    return {
      organizationId: organization.id,
      currency: query.currency ?? organization.defaultCurrency,
      timezone: organization.timezone,
      today,
      monthStart: start,
      monthEnd: end,
      branchFilter,
    };
  }

  private async totals(tx: Transaction, c: Context) {
    const receivableTotals = await tx.execute<{
      overdue: number;
      overdue_count: number;
      overdue_accounts: number;
      due_today: number;
      due_today_count: number;
      expected_this_month: number;
      due_this_month: number;
      due_month_to_date: number;
      collected_on_due_month_to_date: number;
    }>(sql`
      SELECT
        coalesce(sum(r.amount_minor - r.allocated_minor) FILTER (WHERE r.status = 'open' AND r.due_date < ${c.today}::date), 0)::bigint AS overdue,
        count(*) FILTER (WHERE r.status = 'open' AND r.due_date < ${c.today}::date)::int AS overdue_count,
        count(DISTINCT r.account_id) FILTER (WHERE r.status = 'open' AND r.due_date < ${c.today}::date)::int AS overdue_accounts,
        coalesce(sum(r.amount_minor - r.allocated_minor) FILTER (WHERE r.status = 'open' AND r.due_date = ${c.today}::date), 0)::bigint AS due_today,
        count(*) FILTER (WHERE r.status = 'open' AND r.due_date = ${c.today}::date)::int AS due_today_count,
        coalesce(sum(r.amount_minor - r.allocated_minor) FILTER (WHERE r.status = 'open' AND r.due_date BETWEEN ${c.today}::date AND ${c.monthEnd}::date), 0)::bigint AS expected_this_month,
        coalesce(sum(r.amount_minor) FILTER (WHERE r.status <> 'cancelled' AND r.due_date BETWEEN ${c.monthStart}::date AND ${c.monthEnd}::date), 0)::bigint AS due_this_month,
        coalesce(sum(r.amount_minor) FILTER (WHERE r.status <> 'cancelled' AND r.due_date BETWEEN ${c.monthStart}::date AND ${c.today}::date), 0)::bigint AS due_month_to_date,
        coalesce(sum(r.allocated_minor) FILTER (WHERE r.status <> 'cancelled' AND r.due_date BETWEEN ${c.monthStart}::date AND ${c.today}::date), 0)::bigint AS collected_on_due_month_to_date
      FROM receivables r
      WHERE r.organization_id = ${c.organizationId} AND r.currency = ${c.currency} ${c.branchFilter('r')}
    `);
    const paymentTotals = await tx.execute<{
      payments_today: number;
      payments_today_count: number;
      collected_this_month: number;
    }>(sql`
      SELECT
        coalesce(sum(p.amount_minor) FILTER (WHERE p.local_date = ${c.today}::date), 0)::bigint AS payments_today,
        count(*) FILTER (WHERE p.local_date = ${c.today}::date)::int AS payments_today_count,
        coalesce(sum(p.amount_minor) FILTER (WHERE p.local_date BETWEEN ${c.monthStart}::date AND ${c.monthEnd}::date), 0)::bigint AS collected_this_month
      FROM (
        SELECT p.amount_minor, (p.received_at AT TIME ZONE ${c.timezone})::date AS local_date
        FROM payments p
        WHERE p.organization_id = ${c.organizationId} AND p.currency = ${c.currency}
          AND p.status = 'completed' ${c.branchFilter('p')}
      ) p
    `);
    const r = receivableTotals.rows[0];
    const p = paymentTotals.rows[0];
    return {
      overdue: Number(r?.overdue ?? 0),
      overdueCount: Number(r?.overdue_count ?? 0),
      overdueAccounts: Number(r?.overdue_accounts ?? 0),
      dueToday: Number(r?.due_today ?? 0),
      dueTodayCount: Number(r?.due_today_count ?? 0),
      expectedThisMonth: Number(r?.expected_this_month ?? 0),
      dueThisMonth: Number(r?.due_this_month ?? 0),
      dueMonthToDate: Number(r?.due_month_to_date ?? 0),
      collectedOnDueMonthToDate: Number(r?.collected_on_due_month_to_date ?? 0),
      paymentsToday: Number(p?.payments_today ?? 0),
      paymentsTodayCount: Number(p?.payments_today_count ?? 0),
      collectedThisMonth: Number(p?.collected_this_month ?? 0),
    };
  }

  private toKpis(c: Context, totals: Awaited<ReturnType<FinanceSummaryService['totals']>>): FinanceKpis {
    return {
      currency: c.currency,
      asOf: c.today,
      overdueMinor: totals.overdue,
      collectedThisMonthMinor: totals.collectedThisMonth,
      expectedThisMonthMinor: totals.expectedThisMonth,
      dueThisMonthMinor: totals.dueThisMonth,
      collectionRateThisMonth:
        totals.dueMonthToDate > 0 ? totals.collectedOnDueMonthToDate / totals.dueMonthToDate : null,
    };
  }

  private async aging(tx: Transaction, c: Context) {
    const result = await tx.execute<{ bucket: AgingBucket; amount: number; count: number }>(sql`
      SELECT
        CASE
          WHEN r.due_date >= ${c.today}::date THEN 'not_due'
          WHEN ${c.today}::date - r.due_date <= 30 THEN 'd1_30'
          WHEN ${c.today}::date - r.due_date <= 60 THEN 'd31_60'
          WHEN ${c.today}::date - r.due_date <= 90 THEN 'd61_90'
          ELSE 'd90_plus'
        END AS bucket,
        coalesce(sum(r.amount_minor - r.allocated_minor), 0)::bigint AS amount,
        count(*)::int AS count
      FROM receivables r
      WHERE r.organization_id = ${c.organizationId} AND r.currency = ${c.currency}
        AND r.status = 'open' ${c.branchFilter('r')}
      GROUP BY 1
    `);
    const byBucket = new Map(result.rows.map((row) => [row.bucket, row]));
    return AGING_BUCKETS.map((bucket) => ({
      bucket,
      amountMinor: Number(byBucket.get(bucket)?.amount ?? 0),
      count: Number(byBucket.get(bucket)?.count ?? 0),
    }));
  }

  /** Five past months, the current month and the next two: amount due vs. collected. */
  private async monthly(tx: Transaction, c: Context) {
    const result = await tx.execute<{ month: string; due: number; collected: number }>(sql`
      WITH months AS (
        SELECT generate_series(
          date_trunc('month', ${c.today}::date) - interval '5 months',
          date_trunc('month', ${c.today}::date) + interval '2 months',
          interval '1 month'
        )::date AS month
      )
      SELECT to_char(m.month, 'YYYY-MM') AS month,
        coalesce((
          SELECT sum(r.amount_minor) FROM receivables r
          WHERE r.organization_id = ${c.organizationId} AND r.currency = ${c.currency}
            AND r.status <> 'cancelled' AND date_trunc('month', r.due_date)::date = m.month ${c.branchFilter('r')}
        ), 0)::bigint AS due,
        coalesce((
          SELECT sum(p.amount_minor) FROM payments p
          WHERE p.organization_id = ${c.organizationId} AND p.currency = ${c.currency} AND p.status = 'completed'
            AND date_trunc('month', p.received_at AT TIME ZONE ${c.timezone})::date = m.month ${c.branchFilter('p')}
        ), 0)::bigint AS collected
      FROM months m
      ORDER BY m.month
    `);
    return result.rows.map((row) => ({
      month: row.month,
      dueMinor: Number(row.due),
      collectedMinor: Number(row.collected),
    }));
  }

  private async upcoming(tx: Transaction, actor: Actor, c: Context, branchId: string | undefined) {
    const allowed = actor.branchesFor('finance.reports.read');
    const rows = await tx
      .select(receivableColumns)
      .from(receivables)
      .innerJoin(students, eq(students.id, receivables.studentId))
      .innerJoin(branches, eq(branches.id, receivables.branchId))
      .where(
        and(
          eq(receivables.organizationId, c.organizationId),
          eq(receivables.currency, c.currency),
          eq(receivables.status, 'open'),
          between(receivables.dueDate, c.today, addDays(c.today, 14)),
          branchId ? eq(receivables.branchId, branchId) : undefined,
          allowed === '*' || branchId
            ? undefined
            : allowed.length === 0
              ? sql`false`
              : sql`${receivables.branchId} IN (${sql.join(
                  allowed.map((id) => sql`${id}::uuid`),
                  sql`, `,
                )})`,
        ),
      )
      .orderBy(asc(receivables.dueDate), asc(students.lastName))
      .limit(10);
    return rows.map((row) => toReceivable(row, c.today));
  }

  private async topOverdue(tx: Transaction, c: Context) {
    const result = await tx.execute<{
      id: string;
      first_name: string;
      last_name: string;
      student_number: string;
      overdue: number;
      oldest: string;
      count: number;
    }>(sql`
      SELECT s.id, s.first_name, s.last_name, s.student_number,
             sum(r.amount_minor - r.allocated_minor)::bigint AS overdue,
             min(r.due_date) AS oldest,
             count(*)::int AS count
      FROM receivables r
      JOIN students s ON s.organization_id = r.organization_id AND s.id = r.student_id
      WHERE r.organization_id = ${c.organizationId} AND r.currency = ${c.currency}
        AND r.status = 'open' AND r.due_date < ${c.today}::date ${c.branchFilter('r')}
      GROUP BY s.id, s.first_name, s.last_name, s.student_number
      ORDER BY overdue DESC, oldest ASC
      LIMIT 8
    `);
    return result.rows.map((row) => ({
      student: { id: row.id, fullName: `${row.first_name} ${row.last_name}`, studentNumber: row.student_number },
      overdueMinor: Number(row.overdue),
      oldestDueDate: row.oldest,
      overdueCount: Number(row.count),
    }));
  }
}
