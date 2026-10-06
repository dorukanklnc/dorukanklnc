import { genderSchema, guardianRelationshipSchema, studentStatusSchema } from '@repo/contracts';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { citext, createdAt, enumCheck, primaryId, timestamptz, updatedAt } from './_shared.js';
import { branches, memberships, organizations } from './core.js';

export const ACADEMIC_YEAR_STATUSES = ['planned', 'active', 'closed'] as const;
export const GRADE_STAGES = ['preschool', 'primary', 'middle', 'high', 'other'] as const;
export const ENROLLMENT_STATUSES = ['active', 'completed', 'withdrawn', 'transferred'] as const;
export const TEACHER_ROLES = ['homeroom', 'subject'] as const;
export const EMPLOYMENT_TYPES = ['full_time', 'part_time', 'contractor'] as const;

export type StudentStatus = (typeof studentStatusSchema.options)[number];
export type Gender = (typeof genderSchema.options)[number];
export type GuardianRelationship = (typeof guardianRelationshipSchema.options)[number];

export const academicYears = pgTable(
  'academic_years',
  {
    id: primaryId(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    name: text().notNull(),
    startsOn: date({ mode: 'string' }).notNull(),
    endsOn: date({ mode: 'string' }).notNull(),
    status: text().$type<(typeof ACADEMIC_YEAR_STATUSES)[number]>().notNull().default('planned'),
    isCurrent: boolean().notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('academic_years_org_id_uq').on(t.organizationId, t.id),
    unique('academic_years_org_name_uq').on(t.organizationId, t.name),
    uniqueIndex('academic_years_current_uq')
      .on(t.organizationId)
      .where(sql`is_current`),
    check('academic_years_dates_ck', sql`ends_on > starts_on`),
    enumCheck('academic_years_status_ck', 'status', ACADEMIC_YEAR_STATUSES),
  ],
);

export const gradeLevels = pgTable(
  'grade_levels',
  {
    id: primaryId(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    code: text().notNull(),
    name: text().notNull(),
    stage: text().$type<(typeof GRADE_STAGES)[number]>().notNull(),
    sortOrder: integer().notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    unique('grade_levels_org_id_uq').on(t.organizationId, t.id),
    unique('grade_levels_org_code_uq').on(t.organizationId, t.code),
    enumCheck('grade_levels_stage_ck', 'stage', GRADE_STAGES),
  ],
);

export const personnel = pgTable(
  'personnel',
  {
    id: primaryId(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    branchId: uuid().notNull(),
    membershipId: uuid(),
    firstName: text().notNull(),
    lastName: text().notNull(),
    position: text(),
    department: text(),
    employmentType: text().$type<(typeof EMPLOYMENT_TYPES)[number]>(),
    email: citext(),
    phone: text(),
    hireDate: date({ mode: 'string' }),
    status: text().$type<'active' | 'inactive'>().notNull().default('active'),
    searchText: text().generatedAlwaysAs(
      sql`app.search_normalize(first_name || ' ' || last_name || ' ' || coalesce(position, ''))`,
    ),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: timestamptz(),
  },
  (t) => [
    unique('personnel_org_id_uq').on(t.organizationId, t.id),
    uniqueIndex('personnel_org_membership_uq')
      .on(t.organizationId, t.membershipId)
      .where(sql`membership_id IS NOT NULL`),
    foreignKey({
      name: 'personnel_branch_fk',
      columns: [t.organizationId, t.branchId],
      foreignColumns: [branches.organizationId, branches.id],
    }),
    foreignKey({
      name: 'personnel_membership_fk',
      columns: [t.organizationId, t.membershipId],
      foreignColumns: [memberships.organizationId, memberships.id],
    }),
    index('personnel_search_trgm_idx').using('gin', t.searchText.op('gin_trgm_ops')),
    enumCheck('personnel_status_ck', 'status', ['active', 'inactive']),
    enumCheck('personnel_employment_type_ck', 'employment_type', EMPLOYMENT_TYPES, {
      nullable: true,
    }),
  ],
);

export const students = pgTable(
  'students',
  {
    id: primaryId(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    branchId: uuid().notNull(),
    studentNumber: text().notNull(),
    firstName: text().notNull(),
    lastName: text().notNull(),
    gender: text().$type<Gender>(),
    birthDate: date({ mode: 'string' }),
    /** AES-256-GCM ciphertext (see FieldEncryptionService). */
    nationalIdCiphertext: text(),
    /** HMAC-SHA-256 blind index for exact-match lookups and uniqueness. */
    nationalIdHash: text(),
    nationalIdLast4: text(),
    status: text().$type<StudentStatus>().notNull().default('active'),
    enrolledOn: date({ mode: 'string' }),
    email: citext(),
    phone: text(),
    address: text(),
    customFields: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    searchText: text().generatedAlwaysAs(
      sql`app.search_normalize(first_name || ' ' || last_name || ' ' || student_number)`,
    ),
    createdByMembershipId: uuid(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: timestamptz(),
  },
  (t) => [
    unique('students_org_id_uq').on(t.organizationId, t.id),
    unique('students_org_number_uq').on(t.organizationId, t.studentNumber),
    uniqueIndex('students_org_national_id_uq')
      .on(t.organizationId, t.nationalIdHash)
      .where(sql`national_id_hash IS NOT NULL`),
    foreignKey({
      name: 'students_branch_fk',
      columns: [t.organizationId, t.branchId],
      foreignColumns: [branches.organizationId, branches.id],
    }),
    index('students_org_branch_status_idx').on(t.organizationId, t.branchId, t.status),
    index('students_org_name_idx').on(t.organizationId, t.lastName, t.firstName),
    index('students_search_trgm_idx').using('gin', t.searchText.op('gin_trgm_ops')),
    enumCheck('students_status_ck', 'status', studentStatusSchema.options),
    enumCheck('students_gender_ck', 'gender', genderSchema.options, { nullable: true }),
  ],
);

export const guardians = pgTable(
  'guardians',
  {
    id: primaryId(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    firstName: text().notNull(),
    lastName: text().notNull(),
    phone: text(),
    email: citext(),
    occupation: text(),
    address: text(),
    nationalIdCiphertext: text(),
    nationalIdHash: text(),
    nationalIdLast4: text(),
    customFields: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    searchText: text().generatedAlwaysAs(
      sql`app.search_normalize(first_name || ' ' || last_name || ' ' || coalesce(phone, ''))`,
    ),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: timestamptz(),
  },
  (t) => [
    unique('guardians_org_id_uq').on(t.organizationId, t.id),
    uniqueIndex('guardians_org_national_id_uq')
      .on(t.organizationId, t.nationalIdHash)
      .where(sql`national_id_hash IS NOT NULL`),
    index('guardians_org_phone_idx').on(t.organizationId, t.phone),
    index('guardians_search_trgm_idx').using('gin', t.searchText.op('gin_trgm_ops')),
  ],
);

export const studentGuardians = pgTable(
  'student_guardians',
  {
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    studentId: uuid().notNull(),
    guardianId: uuid().notNull(),
    relationship: text().$type<GuardianRelationship>().notNull(),
    isPrimaryContact: boolean().notNull().default(false),
    isFinanciallyResponsible: boolean().notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ name: 'student_guardians_pk', columns: [t.studentId, t.guardianId] }),
    foreignKey({
      name: 'student_guardians_student_fk',
      columns: [t.organizationId, t.studentId],
      foreignColumns: [students.organizationId, students.id],
    }),
    foreignKey({
      name: 'student_guardians_guardian_fk',
      columns: [t.organizationId, t.guardianId],
      foreignColumns: [guardians.organizationId, guardians.id],
    }),
    index('student_guardians_guardian_idx').on(t.organizationId, t.guardianId),
    enumCheck(
      'student_guardians_relationship_ck',
      'relationship',
      guardianRelationshipSchema.options,
    ),
  ],
);

export const enrollments = pgTable(
  'enrollments',
  {
    id: primaryId(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    branchId: uuid().notNull(),
    studentId: uuid().notNull(),
    academicYearId: uuid().notNull(),
    gradeLevelId: uuid(),
    status: text().$type<(typeof ENROLLMENT_STATUSES)[number]>().notNull().default('active'),
    enrolledOn: date({ mode: 'string' }).notNull(),
    endedOn: date({ mode: 'string' }),
    endReason: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('enrollments_org_id_uq').on(t.organizationId, t.id),
    uniqueIndex('enrollments_active_uq')
      .on(t.organizationId, t.studentId, t.academicYearId)
      .where(sql`status = 'active'`),
    foreignKey({
      name: 'enrollments_branch_fk',
      columns: [t.organizationId, t.branchId],
      foreignColumns: [branches.organizationId, branches.id],
    }),
    foreignKey({
      name: 'enrollments_student_fk',
      columns: [t.organizationId, t.studentId],
      foreignColumns: [students.organizationId, students.id],
    }),
    foreignKey({
      name: 'enrollments_year_fk',
      columns: [t.organizationId, t.academicYearId],
      foreignColumns: [academicYears.organizationId, academicYears.id],
    }),
    foreignKey({
      name: 'enrollments_grade_fk',
      columns: [t.organizationId, t.gradeLevelId],
      foreignColumns: [gradeLevels.organizationId, gradeLevels.id],
    }),
    enumCheck('enrollments_status_ck', 'status', ENROLLMENT_STATUSES),
  ],
);

export const classes = pgTable(
  'classes',
  {
    id: primaryId(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    branchId: uuid().notNull(),
    academicYearId: uuid().notNull(),
    gradeLevelId: uuid(),
    name: text().notNull(),
    capacity: integer(),
    status: text().$type<'active' | 'archived'>().notNull().default('active'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('classes_org_id_uq').on(t.organizationId, t.id),
    unique('classes_name_uq').on(t.organizationId, t.academicYearId, t.branchId, t.name),
    foreignKey({
      name: 'classes_branch_fk',
      columns: [t.organizationId, t.branchId],
      foreignColumns: [branches.organizationId, branches.id],
    }),
    foreignKey({
      name: 'classes_year_fk',
      columns: [t.organizationId, t.academicYearId],
      foreignColumns: [academicYears.organizationId, academicYears.id],
    }),
    foreignKey({
      name: 'classes_grade_fk',
      columns: [t.organizationId, t.gradeLevelId],
      foreignColumns: [gradeLevels.organizationId, gradeLevels.id],
    }),
    check('classes_capacity_ck', sql`capacity IS NULL OR capacity > 0`),
    enumCheck('classes_status_ck', 'status', ['active', 'archived']),
  ],
);

export const classEnrollments = pgTable(
  'class_enrollments',
  {
    id: primaryId(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    branchId: uuid().notNull(),
    classId: uuid().notNull(),
    studentId: uuid().notNull(),
    status: text().$type<'active' | 'ended'>().notNull().default('active'),
    startsOn: date({ mode: 'string' }).notNull(),
    endsOn: date({ mode: 'string' }),
    createdAt: createdAt(),
  },
  (t) => [
    unique('class_enrollments_org_id_uq').on(t.organizationId, t.id),
    uniqueIndex('class_enrollments_active_uq')
      .on(t.organizationId, t.classId, t.studentId)
      .where(sql`status = 'active'`),
    foreignKey({
      name: 'class_enrollments_class_fk',
      columns: [t.organizationId, t.classId],
      foreignColumns: [classes.organizationId, classes.id],
    }),
    foreignKey({
      name: 'class_enrollments_student_fk',
      columns: [t.organizationId, t.studentId],
      foreignColumns: [students.organizationId, students.id],
    }),
    foreignKey({
      name: 'class_enrollments_branch_fk',
      columns: [t.organizationId, t.branchId],
      foreignColumns: [branches.organizationId, branches.id],
    }),
    index('class_enrollments_student_idx').on(t.organizationId, t.studentId),
    enumCheck('class_enrollments_status_ck', 'status', ['active', 'ended']),
  ],
);

export const teacherAssignments = pgTable(
  'teacher_assignments',
  {
    id: primaryId(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    branchId: uuid().notNull(),
    classId: uuid().notNull(),
    personnelId: uuid().notNull(),
    role: text().$type<(typeof TEACHER_ROLES)[number]>().notNull(),
    subject: text(),
    startsOn: date({ mode: 'string' }).notNull(),
    endsOn: date({ mode: 'string' }),
    createdAt: createdAt(),
  },
  (t) => [
    unique('teacher_assignments_org_id_uq').on(t.organizationId, t.id),
    foreignKey({
      name: 'teacher_assignments_class_fk',
      columns: [t.organizationId, t.classId],
      foreignColumns: [classes.organizationId, classes.id],
    }),
    foreignKey({
      name: 'teacher_assignments_personnel_fk',
      columns: [t.organizationId, t.personnelId],
      foreignColumns: [personnel.organizationId, personnel.id],
    }),
    foreignKey({
      name: 'teacher_assignments_branch_fk',
      columns: [t.organizationId, t.branchId],
      foreignColumns: [branches.organizationId, branches.id],
    }),
    index('teacher_assignments_personnel_idx').on(t.organizationId, t.personnelId),
    index('teacher_assignments_class_idx').on(t.organizationId, t.classId),
    enumCheck('teacher_assignments_role_ck', 'role', TEACHER_ROLES),
  ],
);
