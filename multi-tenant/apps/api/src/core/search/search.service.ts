import { Injectable } from '@nestjs/common';
import type { SearchQuery, SearchResponse, SearchResult } from '@repo/contracts';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import {
  academicYears,
  branches,
  classes,
  guardians,
  payments,
  studentGuardians,
  students,
} from '../../platform/database/schema/index.js';
import { ref } from '../../platform/database/sql.js';
import { TenantDatabase } from '../../platform/database/tenant-database.service.js';
import type { Transaction } from '../../platform/database/types.js';
import type { Actor } from '../authorization/actor.js';
import {
  assignedClassesPredicate,
  branchPredicate,
  guardianScopePredicate,
  studentScopePredicate,
} from '../authorization/scope-filters.js';

const amountFormatter = new Intl.NumberFormat('tr-TR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Permission-aware global search (⌘K). Each resource type is searched only when the caller
 * holds its read permission, with the same scope predicates as the list endpoints, so search can
 * never reveal anything the caller could not open. Turkish-insensitive matching via
 * `app.search_normalize` + trigram similarity for typos.
 */
@Injectable()
export class SearchService {
  constructor(private readonly db: TenantDatabase) {}

  async search(actor: Actor, query: SearchQuery): Promise<SearchResponse> {
    return this.db.transaction(actor.tenantScope(), async (tx) => {
      const groups: SearchResponse['groups'] = [];
      const add = (type: SearchResult['type'], items: SearchResult[]) => {
        if (items.length > 0) groups.push({ type, items });
      };
      if (actor.can('students.read')) add('student', await this.students(tx, actor, query));
      if (actor.can('guardians.read')) add('guardian', await this.guardians(tx, actor, query));
      if (actor.can('academics.read')) add('class', await this.classes(tx, actor, query));
      if (actor.can('finance.payments.read')) add('payment', await this.payments(tx, actor, query));
      return { query: query.q, groups };
    });
  }

  private async students(
    tx: Transaction,
    actor: Actor,
    query: SearchQuery,
  ): Promise<SearchResult[]> {
    const normalized = sql`app.search_normalize(${query.q})`;
    const rows = await tx
      .select({
        id: students.id,
        firstName: students.firstName,
        lastName: students.lastName,
        studentNumber: students.studentNumber,
        branchName: branches.name,
        className: sql<string | null>`(
          SELECT c.name FROM class_enrollments ce JOIN classes c ON c.id = ce.class_id
          JOIN academic_years ay ON ay.id = c.academic_year_id
          WHERE ce.organization_id = ${ref(students.organizationId)} AND ce.student_id = ${ref(students.id)}
            AND ce.status = 'active' AND ay.is_current LIMIT 1)`,
      })
      .from(students)
      .innerJoin(branches, eq(branches.id, students.branchId))
      .where(
        and(
          eq(students.organizationId, actor.organizationId),
          isNull(students.archivedAt),
          studentScopePredicate(actor, 'students.read', {
            studentId: students.id,
            branchId: students.branchId,
          }),
          sql`(${students.searchText} LIKE '%' || ${normalized} || '%' OR ${students.searchText} % ${normalized})`,
        ),
      )
      .orderBy(
        desc(sql`${students.searchText} LIKE ${normalized} || '%'`),
        desc(sql`similarity(${students.searchText}, ${normalized})`),
      )
      .limit(query.limit);
    return rows.map((row) => ({
      type: 'student' as const,
      id: row.id,
      title: `${row.firstName} ${row.lastName}`,
      subtitle: [`#${row.studentNumber}`, row.className, row.branchName]
        .filter(Boolean)
        .join(' · '),
      href: `/students/${row.id}`,
    }));
  }

  private async guardians(
    tx: Transaction,
    actor: Actor,
    query: SearchQuery,
  ): Promise<SearchResult[]> {
    const normalized = sql`app.search_normalize(${query.q})`;
    const rows = await tx
      .select({
        id: guardians.id,
        firstName: guardians.firstName,
        lastName: guardians.lastName,
        phone: guardians.phone,
      })
      .from(guardians)
      .where(
        and(
          eq(guardians.organizationId, actor.organizationId),
          isNull(guardians.archivedAt),
          guardianScopePredicate(actor, guardians.id),
          sql`(${guardians.searchText} LIKE '%' || ${normalized} || '%' OR ${guardians.searchText} % ${normalized})`,
        ),
      )
      .orderBy(desc(sql`similarity(${guardians.searchText}, ${normalized})`))
      .limit(query.limit);
    if (rows.length === 0) return [];

    // Link each guardian to one student the caller may open (separate query: no column
    // references inside select-list subqueries, see platform/database/sql.ts).
    const linked = actor.can('students.read')
      ? await tx
          .select({
            guardianId: studentGuardians.guardianId,
            id: students.id,
            firstName: students.firstName,
            lastName: students.lastName,
          })
          .from(studentGuardians)
          .innerJoin(students, eq(students.id, studentGuardians.studentId))
          .where(
            and(
              eq(studentGuardians.organizationId, actor.organizationId),
              inArray(
                studentGuardians.guardianId,
                rows.map((row) => row.id),
              ),
              isNull(students.archivedAt),
              studentScopePredicate(actor, 'students.read', {
                studentId: students.id,
                branchId: students.branchId,
              }),
            ),
          )
      : [];
    return rows.map((row) => {
      const student = linked.find((candidate) => candidate.guardianId === row.id);
      return {
        type: 'guardian' as const,
        id: row.id,
        title: `${row.firstName} ${row.lastName}`,
        subtitle:
          [student ? `Veli: ${student.firstName} ${student.lastName}` : null, row.phone]
            .filter(Boolean)
            .join(' · ') || null,
        href: student
          ? `/students/${student.id}?tab=guardians`
          : `/guardians?q=${encodeURIComponent(query.q)}`,
      };
    });
  }

  private async classes(
    tx: Transaction,
    actor: Actor,
    query: SearchQuery,
  ): Promise<SearchResult[]> {
    const scope = actor.scopeFor('academics.read');
    const rows = await tx
      .select({ id: classes.id, name: classes.name, branchName: branches.name })
      .from(classes)
      .innerJoin(branches, eq(branches.id, classes.branchId))
      .innerJoin(academicYears, eq(academicYears.id, classes.academicYearId))
      .where(
        and(
          eq(classes.organizationId, actor.organizationId),
          eq(academicYears.isCurrent, true),
          eq(classes.status, 'active'),
          scope === 'assigned'
            ? assignedClassesPredicate(actor, classes.id)
            : branchPredicate(actor, 'academics.read', classes.branchId),
          sql`app.search_normalize(${classes.name}) LIKE '%' || app.search_normalize(${query.q.replaceAll(' ', '')}) || '%'`,
        ),
      )
      .limit(query.limit);
    return rows.map((row) => ({
      type: 'class' as const,
      id: row.id,
      title: row.name,
      subtitle: row.branchName,
      href: `/students?classId=${row.id}`,
    }));
  }

  private async payments(
    tx: Transaction,
    actor: Actor,
    query: SearchQuery,
  ): Promise<SearchResult[]> {
    const normalized = sql`app.search_normalize(${query.q})`;
    const rows = await tx
      .select({
        id: payments.id,
        receiptNumber: payments.receiptNumber,
        amountMinor: payments.amountMinor,
        currency: payments.currency,
        status: payments.status,
        firstName: students.firstName,
        lastName: students.lastName,
      })
      .from(payments)
      .innerJoin(students, eq(students.id, payments.studentId))
      .where(
        and(
          eq(payments.organizationId, actor.organizationId),
          branchPredicate(actor, 'finance.payments.read', payments.branchId),
          sql`(${payments.receiptNumber} ILIKE ${`%${query.q}%`} OR ${students.searchText} LIKE '%' || ${normalized} || '%')`,
        ),
      )
      .orderBy(desc(payments.receivedAt))
      .limit(query.limit);
    return rows.map((row) => ({
      type: 'payment' as const,
      id: row.id,
      title: `${row.receiptNumber} · ${amountFormatter.format(row.amountMinor / 100)} ${row.currency}`,
      subtitle: `${row.firstName} ${row.lastName}${row.status === 'reversed' ? ' · ters kayıt' : ''}`,
      href: `/finance/payments/${row.id}`,
    }));
  }
}
