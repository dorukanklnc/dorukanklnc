import { Injectable } from '@nestjs/common';
import type {
  CreateStudentRequest,
  GuardianInput,
  Paginated,
  StudentDetail,
  StudentListItem,
  StudentListQuery,
  UpdateStudentRequest,
} from '@repo/contracts';
import { type SQL, and, asc, count, desc, eq, isNull, sql } from 'drizzle-orm';
import { FieldEncryptionService } from '../../platform/crypto/field-encryption.service.js';
import {
  academicYears,
  branches,
  classEnrollments,
  classes,
  enrollments,
  gradeLevels,
  guardians,
  studentGuardians,
  students,
} from '../../platform/database/schema/index.js';
import { nextSequenceValue } from '../../platform/database/sequences.js';
import { ref } from '../../platform/database/sql.js';
import { TenantDatabase } from '../../platform/database/tenant-database.service.js';
import type { Transaction } from '../../platform/database/types.js';
import { Errors } from '../../platform/errors/app-error.js';
import { AuditService, createdChanges, diffChanges } from '../../core/audit/audit.service.js';
import type { Actor } from '../../core/authorization/actor.js';
import { branchPredicate, studentScopePredicate } from '../../core/authorization/scope-filters.js';
import { DomainEvents } from '../../core/outbox/events.js';
import { OutboxService } from '../../core/outbox/outbox.service.js';
import { todayIn } from '../../finance/domain/dates.js';

/** Turkish alphabetical order (C < Ç, I < İ, S < Ş …). Requires ICU collations (PostgreSQL ≥ 10). */
const TR = sql.raw('COLLATE "tr-x-icu"');

@Injectable()
export class StudentsService {
  constructor(
    private readonly db: TenantDatabase,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly encryption: FieldEncryptionService,
  ) {}

  // ── Queries ───────────────────────────────────────────────────────────────────────────

  async list(actor: Actor, query: StudentListQuery): Promise<Paginated<StudentListItem>> {
    return this.db.transaction(actor.tenantScope(), async (tx) => {
      const where = and(
        eq(students.organizationId, actor.organizationId),
        studentScopePredicate(actor, 'students.read', {
          studentId: students.id,
          branchId: students.branchId,
        }),
        query.includeArchived ? undefined : isNull(students.archivedAt),
        query.status ? eq(students.status, query.status) : undefined,
        query.branchId ? eq(students.branchId, query.branchId) : undefined,
        query.classId
          ? sql`EXISTS (SELECT 1 FROM class_enrollments ce WHERE ce.organization_id = ${students.organizationId}
              AND ce.student_id = ${students.id} AND ce.class_id = ${query.classId} AND ce.status = 'active')`
          : undefined,
        query.q
          ? sql`${students.searchText} LIKE '%' || app.search_normalize(${query.q}) || '%'`
          : undefined,
      );

      const direction = query.direction === 'desc' ? desc : asc;
      const orderBy: SQL[] =
        query.sort === 'studentNumber'
          ? [direction(sql`length(${students.studentNumber})`), direction(students.studentNumber)]
          : query.sort === 'createdAt'
            ? [direction(students.createdAt)]
            : query.sort === 'status'
              ? [direction(students.status), asc(sql`${students.lastName} ${TR}`)]
              : [
                  direction(sql`${students.lastName} ${TR}`),
                  direction(sql`${students.firstName} ${TR}`),
                ];

      const [total] = await tx.select({ value: count() }).from(students).where(where);
      const rows = await tx
        .select({ ...listColumns(actor), branchName: branches.name })
        .from(students)
        .innerJoin(branches, eq(branches.id, students.branchId))
        .where(where)
        .orderBy(...orderBy, asc(students.id))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize);

      return {
        items: rows.map((row) => toListItem(row, actor)),
        page: query.page,
        pageSize: query.pageSize,
        total: total?.value ?? 0,
      };
    });
  }

  async get(actor: Actor, studentId: string): Promise<StudentDetail> {
    return this.db.transaction(actor.tenantScope(), (tx) => this.load(tx, actor, studentId));
  }

  /** Explicit, audited reveal of the national ID (KVKK: purpose-bound access to identifiers). */
  async revealNationalId(actor: Actor, studentId: string): Promise<{ nationalId: string | null }> {
    return this.db.transaction(actor.tenantScope(), async (tx) => {
      const student = await this.load(tx, actor, studentId);
      actor.assertWithinScope(
        'students.sensitive.read',
        { branchIds: [student.branch.id] },
        'Student',
      );
      const [row] = await tx
        .select({ ciphertext: students.nationalIdCiphertext })
        .from(students)
        .where(and(eq(students.organizationId, actor.organizationId), eq(students.id, studentId)));
      const nationalId = row?.ciphertext ? this.encryption.decrypt(row.ciphertext) : null;
      await this.audit.record(tx, {
        organizationId: actor.organizationId,
        branchId: student.branch.id,
        actor: actor.auditActor(),
        action: 'student.national_id_revealed',
        resourceType: 'student',
        resourceId: studentId,
      });
      return { nationalId };
    });
  }

  // ── Commands ──────────────────────────────────────────────────────────────────────────

  async create(actor: Actor, input: CreateStudentRequest): Promise<StudentDetail> {
    actor.assertBranchAllowed('students.create', input.branchId);
    if (input.guardians.length > 0 && !actor.can('guardians.write')) throw Errors.forbidden();

    return this.db.transaction(actor.tenantScope(), async (tx) => {
      const placement = await this.resolvePlacement(tx, actor, input);
      const studentNumber = await nextSequenceValue(tx, {
        organizationId: actor.organizationId,
        key: 'student_number',
        start: 1001,
      });
      const protectedId = input.nationalId ? this.encryption.protect(input.nationalId) : null;

      const [created] = await tx
        .insert(students)
        .values({
          organizationId: actor.organizationId,
          branchId: input.branchId,
          studentNumber: String(studentNumber),
          firstName: input.firstName,
          lastName: input.lastName,
          gender: input.gender ?? null,
          birthDate: input.birthDate ?? null,
          nationalIdCiphertext: protectedId?.ciphertext ?? null,
          nationalIdHash: protectedId?.hash ?? null,
          nationalIdLast4: protectedId?.last4 ?? null,
          email: input.email ?? null,
          phone: input.phone ?? null,
          address: input.address ?? null,
          enrolledOn: input.enrolledOn ?? placement.enrolledOn,
          createdByMembershipId: actor.membershipId,
        })
        .returning({ id: students.id });
      if (!created) throw new Error('Student insert failed');
      const studentId = created.id;

      const guardianIds = await this.attachGuardians(tx, actor, studentId, input.guardians);

      let enrollmentId: string | null = null;
      if (placement.academicYearId) {
        const [enrollment] = await tx
          .insert(enrollments)
          .values({
            organizationId: actor.organizationId,
            branchId: input.branchId,
            studentId,
            academicYearId: placement.academicYearId,
            gradeLevelId: placement.gradeLevelId,
            enrolledOn: input.enrolledOn ?? placement.enrolledOn,
          })
          .returning({ id: enrollments.id });
        enrollmentId = enrollment?.id ?? null;
      }
      if (placement.classId) {
        await tx.insert(classEnrollments).values({
          organizationId: actor.organizationId,
          branchId: input.branchId,
          classId: placement.classId,
          studentId,
          startsOn: input.enrolledOn ?? placement.enrolledOn,
        });
      }

      await this.audit.record(tx, {
        organizationId: actor.organizationId,
        branchId: input.branchId,
        actor: actor.auditActor(),
        action: 'student.created',
        resourceType: 'student',
        resourceId: studentId,
        changes: createdChanges({
          studentNumber: String(studentNumber),
          firstName: input.firstName,
          lastName: input.lastName,
          branchId: input.branchId,
          ...(input.nationalId ? { nationalId: '[set]' } : {}),
        }),
        metadata: { guardianIds, classId: placement.classId, enrollmentId },
      });
      await this.outbox.publishMany(tx, [
        {
          organizationId: actor.organizationId,
          aggregateType: 'student',
          aggregateId: studentId,
          eventType: DomainEvents.studentCreated,
          payload: { studentId, branchId: input.branchId, studentNumber: String(studentNumber) },
          actorUserId: actor.userId,
        },
        ...(enrollmentId
          ? [
              {
                organizationId: actor.organizationId,
                aggregateType: 'student',
                aggregateId: studentId,
                eventType: DomainEvents.studentEnrolled,
                payload: {
                  studentId,
                  enrollmentId,
                  academicYearId: placement.academicYearId,
                  gradeLevelId: placement.gradeLevelId,
                  classId: placement.classId,
                },
                actorUserId: actor.userId,
              },
            ]
          : []),
      ]);
      return this.load(tx, actor, studentId);
    });
  }

  async update(
    actor: Actor,
    studentId: string,
    input: UpdateStudentRequest,
  ): Promise<StudentDetail> {
    return this.db.transaction(actor.tenantScope(), async (tx) => {
      const [current] = await tx
        .select({
          branchId: students.branchId,
          firstName: students.firstName,
          lastName: students.lastName,
          gender: students.gender,
          birthDate: students.birthDate,
          nationalIdHash: students.nationalIdHash,
          email: students.email,
          phone: students.phone,
          address: students.address,
          status: students.status,
        })
        .from(students)
        .where(
          and(
            eq(students.organizationId, actor.organizationId),
            eq(students.id, studentId),
            isNull(students.archivedAt),
            branchPredicate(actor, 'students.update', students.branchId),
          ),
        )
        .for('update');
      if (!current) throw Errors.notFound('Student');

      const next = {
        firstName: input.firstName ?? current.firstName,
        lastName: input.lastName ?? current.lastName,
        gender: input.gender === undefined ? current.gender : input.gender,
        birthDate: input.birthDate === undefined ? current.birthDate : input.birthDate,
        email: input.email === undefined ? current.email : input.email,
        phone: input.phone === undefined ? current.phone : input.phone,
        address: input.address === undefined ? current.address : input.address,
        status: input.status ?? current.status,
      };
      const { branchId, nationalIdHash, ...comparable } = current;
      const changes = diffChanges(comparable, next) ?? {};

      let nationalIdColumns = {};
      if (input.nationalId !== undefined) {
        const protectedId = input.nationalId ? this.encryption.protect(input.nationalId) : null;
        if ((protectedId?.hash ?? null) !== nationalIdHash) {
          nationalIdColumns = {
            nationalIdCiphertext: protectedId?.ciphertext ?? null,
            nationalIdHash: protectedId?.hash ?? null,
            nationalIdLast4: protectedId?.last4 ?? null,
          };
          changes.nationalId = { before: '[redacted]', after: '[redacted]' };
        }
      }

      if (Object.keys(changes).length > 0) {
        await tx
          .update(students)
          .set({ ...next, ...nationalIdColumns })
          .where(
            and(eq(students.organizationId, actor.organizationId), eq(students.id, studentId)),
          );
        await this.audit.record(tx, {
          organizationId: actor.organizationId,
          branchId,
          actor: actor.auditActor(),
          action: 'student.updated',
          resourceType: 'student',
          resourceId: studentId,
          changes,
        });
        await this.outbox.publish(tx, {
          organizationId: actor.organizationId,
          aggregateType: 'student',
          aggregateId: studentId,
          eventType: DomainEvents.studentUpdated,
          payload: { studentId, changedFields: Object.keys(changes) },
          actorUserId: actor.userId,
        });
      }
      return this.load(tx, actor, studentId);
    });
  }

  /** Archiving hides a student from daily work; financial history is untouched. */
  async archive(actor: Actor, studentId: string): Promise<void> {
    await this.db.transaction(actor.tenantScope(), async (tx) => {
      const [current] = await tx
        .select({ branchId: students.branchId })
        .from(students)
        .where(
          and(
            eq(students.organizationId, actor.organizationId),
            eq(students.id, studentId),
            isNull(students.archivedAt),
            branchPredicate(actor, 'students.archive', students.branchId),
          ),
        )
        .for('update');
      if (!current) throw Errors.notFound('Student');
      await tx
        .update(students)
        .set({ archivedAt: sql`now()` })
        .where(and(eq(students.organizationId, actor.organizationId), eq(students.id, studentId)));
      await this.audit.record(tx, {
        organizationId: actor.organizationId,
        branchId: current.branchId,
        actor: actor.auditActor(),
        action: 'student.archived',
        resourceType: 'student',
        resourceId: studentId,
      });
    });
  }

  // ── Internals ─────────────────────────────────────────────────────────────────────────

  private async load(tx: Transaction, actor: Actor, studentId: string): Promise<StudentDetail> {
    const [row] = await tx
      .select({
        ...listColumns(actor),
        branchName: branches.name,
        gender: students.gender,
        birthDate: students.birthDate,
        nationalIdLast4: students.nationalIdLast4,
        email: students.email,
        phone: students.phone,
        address: students.address,
        updatedAt: students.updatedAt,
      })
      .from(students)
      .innerJoin(branches, eq(branches.id, students.branchId))
      .where(
        and(
          eq(students.organizationId, actor.organizationId),
          eq(students.id, studentId),
          studentScopePredicate(actor, 'students.read', {
            studentId: students.id,
            branchId: students.branchId,
          }),
        ),
      )
      .limit(1);
    if (!row) throw Errors.notFound('Student');

    // Sequential on purpose: queries inside one transaction share a single connection.
    const classRows = await tx
      .select({ id: classes.id, name: classes.name })
      .from(classEnrollments)
      .innerJoin(classes, eq(classes.id, classEnrollments.classId))
      .innerJoin(academicYears, eq(academicYears.id, classes.academicYearId))
      .where(
        and(
          eq(classEnrollments.organizationId, actor.organizationId),
          eq(classEnrollments.studentId, studentId),
          eq(classEnrollments.status, 'active'),
          eq(academicYears.isCurrent, true),
        ),
      )
      .orderBy(asc(classes.name));
    const enrollmentRows = await tx
      .select({
        id: enrollments.id,
        status: enrollments.status,
        enrolledOn: enrollments.enrolledOn,
        academicYearId: academicYears.id,
        academicYearName: academicYears.name,
        gradeLevelId: gradeLevels.id,
        gradeLevelName: gradeLevels.name,
      })
      .from(enrollments)
      .innerJoin(academicYears, eq(academicYears.id, enrollments.academicYearId))
      .leftJoin(gradeLevels, eq(gradeLevels.id, enrollments.gradeLevelId))
      .where(
        and(
          eq(enrollments.organizationId, actor.organizationId),
          eq(enrollments.studentId, studentId),
        ),
      )
      .orderBy(desc(academicYears.isCurrent), desc(academicYears.startsOn))
      .limit(1);
    const guardianRows = await (actor.can('guardians.read')
      ? tx
          .select({
            id: guardians.id,
            firstName: guardians.firstName,
            lastName: guardians.lastName,
            phone: guardians.phone,
            email: guardians.email,
            relationship: studentGuardians.relationship,
            isPrimaryContact: studentGuardians.isPrimaryContact,
            isFinanciallyResponsible: studentGuardians.isFinanciallyResponsible,
          })
          .from(studentGuardians)
          .innerJoin(guardians, eq(guardians.id, studentGuardians.guardianId))
          .where(
            and(
              eq(studentGuardians.organizationId, actor.organizationId),
              eq(studentGuardians.studentId, studentId),
              isNull(guardians.archivedAt),
            ),
          )
          .orderBy(desc(studentGuardians.isPrimaryContact), asc(studentGuardians.createdAt))
      : null);
    const enrollment = enrollmentRows[0];

    return {
      ...toListItem(row, actor),
      gender: row.gender,
      birthDate: row.birthDate,
      nationalIdMasked: FieldEncryptionService.mask(row.nationalIdLast4),
      email: row.email,
      phone: row.phone,
      address: row.address,
      classes: classRows,
      enrollment: enrollment
        ? {
            id: enrollment.id,
            status: enrollment.status,
            enrolledOn: enrollment.enrolledOn,
            academicYear: { id: enrollment.academicYearId, name: enrollment.academicYearName },
            gradeLevel:
              enrollment.gradeLevelId && enrollment.gradeLevelName
                ? { id: enrollment.gradeLevelId, name: enrollment.gradeLevelName }
                : null,
          }
        : null,
      ...(guardianRows
        ? {
            guardians: guardianRows.map((guardian) => ({
              ...guardian,
              fullName: `${guardian.firstName} ${guardian.lastName}`,
            })),
          }
        : {}),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  /** Validates class / academic year / grade level choices and derives the enrollment. */
  private async resolvePlacement(tx: Transaction, actor: Actor, input: CreateStudentRequest) {
    const today = todayIn(actor.tenant().organization.timezone);
    if (input.classId) {
      const [klass] = await tx
        .select({
          branchId: classes.branchId,
          academicYearId: classes.academicYearId,
          gradeLevelId: classes.gradeLevelId,
          startsOn: academicYears.startsOn,
        })
        .from(classes)
        .innerJoin(academicYears, eq(academicYears.id, classes.academicYearId))
        .where(
          and(eq(classes.organizationId, actor.organizationId), eq(classes.id, input.classId)),
        );
      if (!klass || klass.branchId !== input.branchId) {
        throw Errors.validation([
          { path: 'classId', code: 'invalid_class', message: 'Class not found in branch' },
        ]);
      }
      return {
        classId: input.classId,
        academicYearId: klass.academicYearId,
        gradeLevelId: input.gradeLevelId ?? klass.gradeLevelId,
        enrolledOn: klass.startsOn > today ? klass.startsOn : today,
      };
    }

    const [year] = await tx
      .select({ id: academicYears.id, startsOn: academicYears.startsOn })
      .from(academicYears)
      .where(
        and(
          eq(academicYears.organizationId, actor.organizationId),
          input.academicYearId
            ? eq(academicYears.id, input.academicYearId)
            : eq(academicYears.isCurrent, true),
        ),
      )
      .limit(1);
    if (input.academicYearId && !year) {
      throw Errors.validation([
        { path: 'academicYearId', code: 'invalid', message: 'Unknown academic year' },
      ]);
    }
    if (input.gradeLevelId) {
      const [grade] = await tx
        .select({ id: gradeLevels.id })
        .from(gradeLevels)
        .where(
          and(
            eq(gradeLevels.organizationId, actor.organizationId),
            eq(gradeLevels.id, input.gradeLevelId),
          ),
        );
      if (!grade)
        throw Errors.validation([
          { path: 'gradeLevelId', code: 'invalid', message: 'Unknown grade level' },
        ]);
    }
    return {
      classId: null,
      academicYearId: year?.id ?? null,
      gradeLevelId: input.gradeLevelId ?? null,
      enrolledOn: year && year.startsOn > today ? year.startsOn : today,
    };
  }

  private async attachGuardians(
    tx: Transaction,
    actor: Actor,
    studentId: string,
    inputs: readonly GuardianInput[],
  ): Promise<string[]> {
    if (inputs.length === 0) return [];
    const hasPrimary = inputs.some((guardian) => guardian.isPrimaryContact);
    const hasPayer = inputs.some((guardian) => guardian.isFinanciallyResponsible);
    const ids: string[] = [];

    for (const [index, input] of inputs.entries()) {
      let guardianId = input.existingGuardianId;
      if (guardianId) {
        const [existing] = await tx
          .select({ id: guardians.id })
          .from(guardians)
          .where(
            and(
              eq(guardians.organizationId, actor.organizationId),
              eq(guardians.id, guardianId),
              isNull(guardians.archivedAt),
            ),
          );
        if (!existing)
          throw Errors.validation([
            { path: `guardians.${index}`, code: 'invalid', message: 'Unknown guardian' },
          ]);
      } else {
        const protectedId = input.nationalId ? this.encryption.protect(input.nationalId) : null;
        const [created] = await tx
          .insert(guardians)
          .values({
            organizationId: actor.organizationId,
            firstName: input.firstName,
            lastName: input.lastName,
            phone: input.phone ?? null,
            email: input.email ?? null,
            nationalIdCiphertext: protectedId?.ciphertext ?? null,
            nationalIdHash: protectedId?.hash ?? null,
            nationalIdLast4: protectedId?.last4 ?? null,
          })
          .returning({ id: guardians.id });
        guardianId = created!.id;
      }
      await tx.insert(studentGuardians).values({
        organizationId: actor.organizationId,
        studentId,
        guardianId,
        relationship: input.relationship,
        isPrimaryContact: input.isPrimaryContact || (!hasPrimary && index === 0),
        isFinanciallyResponsible: input.isFinanciallyResponsible || (!hasPayer && index === 0),
      });
      ids.push(guardianId);
    }
    return ids;
  }
}

/** Columns shared by list and detail; correlated subqueries use fully qualified references. */
function listColumns(actor: Actor) {
  return {
    id: students.id,
    studentNumber: students.studentNumber,
    firstName: students.firstName,
    lastName: students.lastName,
    status: students.status,
    branchId: students.branchId,
    enrolledOn: students.enrolledOn,
    createdAt: students.createdAt,
    archivedAt: students.archivedAt,
    className: sql<string | null>`(
      SELECT c.name FROM class_enrollments ce
      JOIN classes c ON c.id = ce.class_id
      JOIN academic_years ay ON ay.id = c.academic_year_id
      WHERE ce.organization_id = ${ref(students.organizationId)} AND ce.student_id = ${ref(students.id)}
        AND ce.status = 'active' AND ay.is_current
      ORDER BY ce.starts_on DESC LIMIT 1
    )`,
    gradeLevelName: sql<string | null>`(
      SELECT gl.name FROM enrollments e
      JOIN academic_years ay ON ay.id = e.academic_year_id
      JOIN grade_levels gl ON gl.id = e.grade_level_id
      WHERE e.organization_id = ${ref(students.organizationId)} AND e.student_id = ${ref(students.id)}
        AND e.status = 'active' AND ay.is_current
      LIMIT 1
    )`,
    primaryGuardian: actor.can('guardians.read')
      ? sql<{ id: string; fullName: string; phone: string | null } | null>`(
          SELECT json_build_object('id', g.id, 'fullName', g.first_name || ' ' || g.last_name, 'phone', g.phone)
          FROM student_guardians sg JOIN guardians g ON g.id = sg.guardian_id
          WHERE sg.organization_id = ${ref(students.organizationId)} AND sg.student_id = ${ref(students.id)}
            AND g.archived_at IS NULL
          ORDER BY sg.is_primary_contact DESC, sg.created_at
          LIMIT 1
        )`
      : sql<null>`NULL`,
  };
}

interface ListRow {
  id: string;
  studentNumber: string;
  firstName: string;
  lastName: string;
  status: StudentListItem['status'];
  branchId: string;
  branchName: string;
  enrolledOn: string | null;
  createdAt: Date;
  archivedAt: Date | null;
  className: string | null;
  gradeLevelName: string | null;
  primaryGuardian: { id: string; fullName: string; phone: string | null } | null;
}

function toListItem(row: ListRow, actor: Actor): StudentListItem {
  return {
    id: row.id,
    studentNumber: row.studentNumber,
    firstName: row.firstName,
    lastName: row.lastName,
    fullName: `${row.firstName} ${row.lastName}`,
    status: row.status,
    branch: { id: row.branchId, name: row.branchName },
    className: row.className,
    gradeLevelName: row.gradeLevelName,
    enrolledOn: row.enrolledOn,
    ...(actor.can('guardians.read') ? { primaryGuardian: row.primaryGuardian } : {}),
    createdAt: row.createdAt.toISOString(),
    archivedAt: row.archivedAt?.toISOString() ?? null,
  };
}
