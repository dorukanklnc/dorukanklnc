import { Injectable } from '@nestjs/common';
import type { AcademicYear, ClassListQuery, ClassSummary, GradeLevel } from '@repo/contracts';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import {
  academicYears,
  branches,
  classes,
  gradeLevels,
} from '../../platform/database/schema/index.js';
import { ref } from '../../platform/database/sql.js';
import { TenantDatabase } from '../../platform/database/tenant-database.service.js';
import type { Actor } from '../../core/authorization/actor.js';
import { assignedClassesPredicate, branchPredicate } from '../../core/authorization/scope-filters.js';

@Injectable()
export class AcademicsService {
  constructor(private readonly db: TenantDatabase) {}

  /** Organization metadata used by forms; not sensitive. */
  async years(actor: Actor): Promise<AcademicYear[]> {
    return this.db.transaction(actor.tenantScope(), (tx) =>
      tx
        .select({
          id: academicYears.id,
          name: academicYears.name,
          startsOn: academicYears.startsOn,
          endsOn: academicYears.endsOn,
          status: academicYears.status,
          isCurrent: academicYears.isCurrent,
        })
        .from(academicYears)
        .where(eq(academicYears.organizationId, actor.organizationId))
        .orderBy(desc(academicYears.startsOn)),
    );
  }

  async gradeLevels(actor: Actor): Promise<GradeLevel[]> {
    return this.db.transaction(actor.tenantScope(), (tx) =>
      tx
        .select({
          id: gradeLevels.id,
          code: gradeLevels.code,
          name: gradeLevels.name,
          stage: gradeLevels.stage,
          sortOrder: gradeLevels.sortOrder,
        })
        .from(gradeLevels)
        .where(eq(gradeLevels.organizationId, actor.organizationId))
        .orderBy(asc(gradeLevels.sortOrder)),
    );
  }

  /** Classes within the caller's `academics.read` scope (teachers: only their classes). */
  async classes(actor: Actor, query: ClassListQuery): Promise<ClassSummary[]> {
    const scope = actor.scopeFor('academics.read');
    return this.db.transaction(actor.tenantScope(), async (tx) => {
      const rows = await tx
        .select({
          id: classes.id,
          name: classes.name,
          capacity: classes.capacity,
          branchId: branches.id,
          branchName: branches.name,
          academicYearId: academicYears.id,
          academicYearName: academicYears.name,
          gradeLevelId: gradeLevels.id,
          gradeLevelName: gradeLevels.name,
          studentCount: sql<number>`(
            SELECT count(*) FROM class_enrollments ce
            WHERE ce.organization_id = ${ref(classes.organizationId)}
              AND ce.class_id = ${ref(classes.id)} AND ce.status = 'active'
          )::int`,
          homeroomId: sql<string | null>`(
            SELECT p.id FROM teacher_assignments ta JOIN personnel p ON p.id = ta.personnel_id
            WHERE ta.organization_id = ${ref(classes.organizationId)}
              AND ta.class_id = ${ref(classes.id)} AND ta.role = 'homeroom'
            ORDER BY ta.starts_on DESC LIMIT 1
          )`,
          homeroomName: sql<string | null>`(
            SELECT p.first_name || ' ' || p.last_name FROM teacher_assignments ta JOIN personnel p ON p.id = ta.personnel_id
            WHERE ta.organization_id = ${ref(classes.organizationId)}
              AND ta.class_id = ${ref(classes.id)} AND ta.role = 'homeroom'
            ORDER BY ta.starts_on DESC LIMIT 1
          )`,
        })
        .from(classes)
        .innerJoin(branches, eq(branches.id, classes.branchId))
        .innerJoin(academicYears, eq(academicYears.id, classes.academicYearId))
        .leftJoin(gradeLevels, eq(gradeLevels.id, classes.gradeLevelId))
        .where(
          and(
            eq(classes.organizationId, actor.organizationId),
            eq(classes.status, 'active'),
            query.branchId ? eq(classes.branchId, query.branchId) : undefined,
            query.academicYearId
              ? eq(classes.academicYearId, query.academicYearId)
              : eq(academicYears.isCurrent, true),
            scope === 'assigned'
              ? assignedClassesPredicate(actor, classes.id)
              : branchPredicate(actor, 'academics.read', classes.branchId),
          ),
        )
        .orderBy(asc(branches.name), asc(classes.name));
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        capacity: row.capacity,
        branch: { id: row.branchId, name: row.branchName },
        academicYear: { id: row.academicYearId, name: row.academicYearName },
        gradeLevel: row.gradeLevelId && row.gradeLevelName ? { id: row.gradeLevelId, name: row.gradeLevelName } : null,
        studentCount: row.studentCount,
        homeroomTeacher: row.homeroomId && row.homeroomName ? { id: row.homeroomId, name: row.homeroomName } : null,
      }));
    });
  }
}
