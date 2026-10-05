import { z } from 'zod';
import { refSchema, uuidSchema } from './common.js';

export const academicYearSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  startsOn: z.string(),
  endsOn: z.string(),
  status: z.enum(['planned', 'active', 'closed']),
  isCurrent: z.boolean(),
});
export type AcademicYear = z.infer<typeof academicYearSchema>;

export const gradeLevelSchema = z.object({
  id: uuidSchema,
  code: z.string(),
  name: z.string(),
  stage: z.enum(['preschool', 'primary', 'middle', 'high', 'other']),
  sortOrder: z.number().int(),
});
export type GradeLevel = z.infer<typeof gradeLevelSchema>;

export const classSummarySchema = z.object({
  id: uuidSchema,
  name: z.string(),
  branch: refSchema,
  academicYear: refSchema,
  gradeLevel: refSchema.nullable(),
  capacity: z.number().int().nullable(),
  studentCount: z.number().int(),
  homeroomTeacher: refSchema.nullable(),
});
export type ClassSummary = z.infer<typeof classSummarySchema>;

export const classListQuerySchema = z.object({
  branchId: uuidSchema.optional(),
  academicYearId: uuidSchema.optional(),
});
export type ClassListQuery = z.infer<typeof classListQuerySchema>;
