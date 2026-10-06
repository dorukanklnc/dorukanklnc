import { z } from 'zod';
import {
  isoDateSchema,
  optionalText,
  paginationQuerySchema,
  personNameSchema,
  phoneSchema,
  refSchema,
  searchTermSchema,
  sortDirectionSchema,
  turkishNationalIdSchema,
  uuidSchema,
} from './common.js';
import { emailSchema } from './auth.js';

export const studentStatusSchema = z.enum([
  'active',
  'inactive',
  'graduated',
  'withdrawn',
  'transferred',
]);
export type StudentStatus = z.infer<typeof studentStatusSchema>;

export const genderSchema = z.enum(['female', 'male', 'other', 'unspecified']);

export const guardianRelationshipSchema = z.enum([
  'mother',
  'father',
  'legal_guardian',
  'grandparent',
  'sibling',
  'other',
]);
export type GuardianRelationship = z.infer<typeof guardianRelationshipSchema>;

export const studentSortSchema = z.enum(['name', 'studentNumber', 'createdAt', 'status']);

export const studentListQuerySchema = paginationQuerySchema.extend({
  q: searchTermSchema.optional(),
  status: studentStatusSchema.optional(),
  branchId: uuidSchema.optional(),
  classId: uuidSchema.optional(),
  includeArchived: z.stringbool().optional(),
  sort: studentSortSchema.default('name'),
  direction: sortDirectionSchema.default('asc'),
});
export type StudentListQuery = z.infer<typeof studentListQuerySchema>;

export const studentListItemSchema = z.object({
  id: uuidSchema,
  studentNumber: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  fullName: z.string(),
  status: studentStatusSchema,
  branch: refSchema,
  className: z.string().nullable(),
  gradeLevelName: z.string().nullable(),
  enrolledOn: z.string().nullable(),
  /** Present only when the caller may read guardians. */
  primaryGuardian: z
    .object({ id: uuidSchema, fullName: z.string(), phone: z.string().nullable() })
    .nullable()
    .optional(),
  createdAt: z.string(),
  archivedAt: z.string().nullable(),
});
export type StudentListItem = z.infer<typeof studentListItemSchema>;

export const studentGuardianSchema = z.object({
  id: uuidSchema,
  fullName: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  relationship: guardianRelationshipSchema,
  isPrimaryContact: z.boolean(),
  isFinanciallyResponsible: z.boolean(),
});
export type StudentGuardian = z.infer<typeof studentGuardianSchema>;

export const studentDetailSchema = studentListItemSchema.extend({
  gender: genderSchema.nullable(),
  birthDate: z.string().nullable(),
  /**
   * Always masked (`•••••••1234`). The full value is only returned by the audited
   * `POST /students/:id/national-id/reveal` endpoint (`students.sensitive.read`).
   */
  nationalIdMasked: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  guardians: z.array(studentGuardianSchema).optional(),
  classes: z.array(refSchema),
  enrollment: z
    .object({
      id: uuidSchema,
      academicYear: refSchema,
      gradeLevel: refSchema.nullable(),
      status: z.string(),
      enrolledOn: z.string(),
    })
    .nullable(),
  updatedAt: z.string(),
});
export type StudentDetail = z.infer<typeof studentDetailSchema>;

export const guardianInputSchema = z.object({
  existingGuardianId: uuidSchema.optional(),
  firstName: personNameSchema,
  lastName: personNameSchema,
  phone: phoneSchema.optional(),
  email: emailSchema.optional(),
  nationalId: turkishNationalIdSchema.optional(),
  relationship: guardianRelationshipSchema,
  isPrimaryContact: z.boolean().default(false),
  isFinanciallyResponsible: z.boolean().default(false),
});
export type GuardianInput = z.infer<typeof guardianInputSchema>;

export const createStudentRequestSchema = z.object({
  branchId: uuidSchema,
  firstName: personNameSchema,
  lastName: personNameSchema,
  gender: genderSchema.optional(),
  birthDate: isoDateSchema.optional(),
  nationalId: turkishNationalIdSchema.optional(),
  email: emailSchema.optional(),
  phone: phoneSchema.optional(),
  address: optionalText(300),
  enrolledOn: isoDateSchema.optional(),
  academicYearId: uuidSchema.optional(),
  gradeLevelId: uuidSchema.optional(),
  classId: uuidSchema.optional(),
  guardians: z.array(guardianInputSchema).max(4).default([]),
});
export type CreateStudentRequest = z.infer<typeof createStudentRequestSchema>;

export const updateStudentRequestSchema = z.object({
  firstName: personNameSchema.optional(),
  lastName: personNameSchema.optional(),
  gender: genderSchema.nullable().optional(),
  birthDate: isoDateSchema.nullable().optional(),
  nationalId: turkishNationalIdSchema.nullable().optional(),
  email: emailSchema.nullable().optional(),
  phone: phoneSchema.nullable().optional(),
  address: z.string().trim().max(300).nullable().optional(),
  status: studentStatusSchema.optional(),
});
export type UpdateStudentRequest = z.infer<typeof updateStudentRequestSchema>;

export const guardianListItemSchema = z.object({
  id: uuidSchema,
  fullName: z.string(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  students: z.array(refSchema),
});
export type GuardianListItem = z.infer<typeof guardianListItemSchema>;

export const guardianListQuerySchema = paginationQuerySchema.extend({
  q: searchTermSchema.optional(),
});
export type GuardianListQuery = z.infer<typeof guardianListQuerySchema>;
