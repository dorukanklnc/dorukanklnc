import { Injectable } from '@nestjs/common';
import type { Dashboard } from '@repo/contracts';
import { and, asc, count, eq, gte, isNull, sql } from 'drizzle-orm';
import {
  academicYears,
  branches,
  classes,
  gradeLevels,
  invitations,
  memberships,
  students,
  teacherAssignments,
} from '../../platform/database/schema/index.js';
import { ref } from '../../platform/database/sql.js';
import { TenantDatabase } from '../../platform/database/tenant-database.service.js';
import type { Transaction } from '../../platform/database/types.js';
import { monthBounds, todayIn } from '../../finance/domain/dates.js';
import { FinanceSummaryService } from '../../finance/summary/finance-summary.service.js';
import { AuditLogService } from '../audit/audit-log.service.js';
import type { Actor } from '../authorization/actor.js';
import { assignedStudentsPredicate, branchPredicate } from '../authorization/scope-filters.js';

type TeachingClass = NonNullable<Dashboard['teaching']>['classes'][number];

/**
 * Role-aware dashboard: each section is computed only when the caller holds its permissions,
 * from live data. The client renders whatever sections arrive — no section, no widget.
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly db: TenantDatabase,
    private readonly finance: FinanceSummaryService,
    private readonly auditLogs: AuditLogService,
  ) {}

  async get(actor: Actor): Promise<Dashboard> {
    const today = todayIn(actor.tenant().organization.timezone);
    const dashboard: Dashboard = { asOf: today };

    const studentScope = actor.permissions.scopeOf('students.read');
    const [studentsSection, teaching, administration] = await this.db.transaction(actor.tenantScope(), (tx) =>
      Promise.all([
        studentScope === 'branch' || studentScope === 'organization' ? this.students(tx, actor, today) : null,
        actor.tenant().membership.personnelId && actor.can('academics.read') ? this.teaching(tx, actor) : null,
        actor.can('settings.users.read') ? this.administration(tx, actor) : null,
      ]),
    );
    if (studentsSection) dashboard.students = studentsSection;
    if (teaching) dashboard.teaching = teaching;
    if (administration) dashboard.administration = administration;

    if (actor.can('finance.reports.read')) {
      dashboard.finance = await this.finance.summary(actor, {});
    } else if (actor.can('finance.kpis.read')) {
      dashboard.financeKpis = await this.finance.kpis(actor, {});
    }
    if (actor.can('audit.read')) {
      dashboard.recentActivity = (await this.auditLogs.list(actor, { page: 1, pageSize: 8 })).items;
    }
    return dashboard;
  }

  private async students(tx: Transaction, actor: Actor, today: string) {
    const scope = branchPredicate(actor, 'students.read', students.branchId);
    const base = and(eq(students.organizationId, actor.organizationId), isNull(students.archivedAt), scope);
    const { start } = monthBounds(today);
    const [active] = await tx
      .select({ value: count() })
      .from(students)
      .where(and(base, eq(students.status, 'active')));
    const [created] = await tx
      .select({ value: count() })
      .from(students)
      .where(and(base, gte(students.createdAt, sql`${start}::date`)));
    // Incomplete: active students without a guardian or without a class this academic year.
    const [incomplete] = await tx
      .select({ value: count() })
      .from(students)
      .where(
        and(
          base,
          eq(students.status, 'active'),
          sql`(
            NOT EXISTS (SELECT 1 FROM student_guardians sg WHERE sg.organization_id = ${students.organizationId} AND sg.student_id = ${students.id})
            OR NOT EXISTS (
              SELECT 1 FROM class_enrollments ce JOIN classes c ON c.id = ce.class_id
              JOIN academic_years ay ON ay.id = c.academic_year_id
              WHERE ce.organization_id = ${students.organizationId} AND ce.student_id = ${students.id}
                AND ce.status = 'active' AND ay.is_current
            )
          )`,
        ),
      );
    const byBranch = await tx
      .select({
        id: branches.id,
        name: branches.name,
        activeCount: sql<number>`(
          SELECT count(*) FROM students s
          WHERE s.organization_id = ${ref(branches.organizationId)} AND s.branch_id = ${ref(branches.id)}
            AND s.status = 'active' AND s.archived_at IS NULL
        )::int`,
      })
      .from(branches)
      .where(
        and(
          eq(branches.organizationId, actor.organizationId),
          eq(branches.status, 'active'),
          branchPredicate(actor, 'students.read', branches.id),
        ),
      )
      .orderBy(asc(branches.name));
    return {
      activeCount: active?.value ?? 0,
      newThisMonth: created?.value ?? 0,
      incompleteRecords: incomplete?.value ?? 0,
      byBranch,
    };
  }

  private async teaching(tx: Transaction, actor: Actor) {
    const personnelId = actor.tenant().membership.personnelId!;
    const rows = await tx
      .select({
        id: classes.id,
        name: classes.name,
        branchId: branches.id,
        branchName: branches.name,
        gradeLevel: gradeLevels.name,
        role: teacherAssignments.role,
        subject: teacherAssignments.subject,
        studentCount: sql<number>`(
          SELECT count(*) FROM class_enrollments ce
          WHERE ce.organization_id = ${ref(classes.organizationId)} AND ce.class_id = ${ref(classes.id)} AND ce.status = 'active'
        )::int`,
      })
      .from(teacherAssignments)
      .innerJoin(classes, eq(classes.id, teacherAssignments.classId))
      .innerJoin(branches, eq(branches.id, classes.branchId))
      .innerJoin(academicYears, eq(academicYears.id, classes.academicYearId))
      .leftJoin(gradeLevels, eq(gradeLevels.id, classes.gradeLevelId))
      .where(
        and(
          eq(teacherAssignments.organizationId, actor.organizationId),
          eq(teacherAssignments.personnelId, personnelId),
          eq(academicYears.isCurrent, true),
          sql`(${teacherAssignments.endsOn} IS NULL OR ${teacherAssignments.endsOn} >= current_date)`,
        ),
      )
      .orderBy(asc(classes.name), asc(teacherAssignments.role));
    const [assigned] = await tx
      .select({ value: count() })
      .from(students)
      .where(
        and(
          eq(students.organizationId, actor.organizationId),
          isNull(students.archivedAt),
          assignedStudentsPredicate(actor, students.id),
        ),
      );
    // One entry per class: homeroom wins over subject; subjects are listed together.
    const byClass = new Map<string, TeachingClass>();
    for (const row of rows) {
      const existing = byClass.get(row.id);
      if (existing) {
        if (row.role === 'homeroom') existing.role = 'homeroom';
        if (row.subject && !existing.subject?.includes(row.subject)) {
          existing.subject = existing.subject ? `${existing.subject}, ${row.subject}` : row.subject;
        }
        continue;
      }
      byClass.set(row.id, {
        id: row.id,
        name: row.name,
        branch: { id: row.branchId, name: row.branchName },
        gradeLevel: row.gradeLevel,
        studentCount: row.studentCount,
        role: row.role,
        subject: row.subject,
      });
    }
    return { classes: [...byClass.values()], assignedStudentCount: assigned?.value ?? 0 };
  }

  private async administration(tx: Transaction, actor: Actor) {
    const [active] = await tx
      .select({ value: count() })
      .from(memberships)
      .where(and(eq(memberships.organizationId, actor.organizationId), eq(memberships.status, 'active')));
    const [pending] = await tx
      .select({ value: count() })
      .from(invitations)
      .where(
        and(
          eq(invitations.organizationId, actor.organizationId),
          eq(invitations.status, 'pending'),
          gte(invitations.expiresAt, sql`now()`),
        ),
      );
    const [branchCount] = await tx
      .select({ value: count() })
      .from(branches)
      .where(and(eq(branches.organizationId, actor.organizationId), eq(branches.status, 'active')));
    return {
      activeMembers: active?.value ?? 0,
      pendingInvitations: pending?.value ?? 0,
      branchCount: branchCount?.value ?? 0,
    };
  }
}
