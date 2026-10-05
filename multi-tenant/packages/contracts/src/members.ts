import { z } from 'zod';
import { paginationQuerySchema, refSchema, searchTermSchema, uuidSchema } from './common.js';
import { emailSchema } from './auth.js';

export const membershipStatusSchema = z.enum(['invited', 'active', 'suspended']);
export type MembershipStatus = z.infer<typeof membershipStatusSchema>;

export const memberSchema = z.object({
  id: uuidSchema,
  userId: uuidSchema,
  fullName: z.string(),
  email: z.string(),
  status: membershipStatusSchema,
  title: z.string().nullable(),
  allBranches: z.boolean(),
  branches: z.array(refSchema),
  roles: z.array(refSchema.extend({ key: z.string() })),
  lastLoginAt: z.string().nullable(),
  invitedAt: z.string().nullable(),
  joinedAt: z.string().nullable(),
});
export type Member = z.infer<typeof memberSchema>;

export const memberListQuerySchema = paginationQuerySchema.extend({
  q: searchTermSchema.optional(),
  status: membershipStatusSchema.optional(),
  roleId: uuidSchema.optional(),
  branchId: uuidSchema.optional(),
});
export type MemberListQuery = z.infer<typeof memberListQuerySchema>;

const branchAccessShape = {
  allBranches: z.boolean(),
  branchIds: z.array(uuidSchema).max(200),
};

export const inviteMemberRequestSchema = z
  .object({
    email: emailSchema,
    fullName: z.string().trim().min(2).max(120),
    title: z.string().trim().max(80).optional(),
    roleIds: z.array(uuidSchema).min(1).max(20),
    ...branchAccessShape,
  })
  .refine((value) => value.allBranches || value.branchIds.length > 0, {
    message: 'Select at least one branch or grant access to all branches',
    path: ['branchIds'],
  });
export type InviteMemberRequest = z.infer<typeof inviteMemberRequestSchema>;

export const updateMemberRequestSchema = z
  .object({
    title: z.string().trim().max(80).nullable().optional(),
    roleIds: z.array(uuidSchema).min(1).max(20).optional(),
    allBranches: z.boolean().optional(),
    branchIds: z.array(uuidSchema).max(200).optional(),
  })
  .refine(
    (value) =>
      value.allBranches === undefined ||
      value.allBranches ||
      (value.branchIds !== undefined && value.branchIds.length > 0),
    { message: 'Select at least one branch or grant access to all branches', path: ['branchIds'] },
  );
export type UpdateMemberRequest = z.infer<typeof updateMemberRequestSchema>;
