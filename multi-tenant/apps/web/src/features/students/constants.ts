import { genderSchema, guardianRelationshipSchema, studentStatusSchema } from '@repo/contracts';

export const STUDENT_STATUSES = studentStatusSchema.options;
export const GENDERS = genderSchema.options;
export const GUARDIAN_RELATIONSHIPS = guardianRelationshipSchema.options;
