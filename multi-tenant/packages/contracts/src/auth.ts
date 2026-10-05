import { MODULE_KEYS, PLATFORM_PERMISSIONS, SCOPES } from '@repo/authorization';
import { z } from 'zod';
import { refSchema, uuidSchema } from './common.js';

/**
 * Password policy: 10–128 characters. Length beats complexity rules (NIST SP 800-63B);
 * breached-password screening is planned.
 */
export const passwordSchema = z.string().min(10).max(128);

export const emailSchema = z.email().max(254);

export const loginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const platformRoleSchema = z.enum(['platform_admin', 'platform_support']);

export const membershipSummarySchema = z.object({
  membershipId: uuidSchema,
  organizationId: uuidSchema,
  organizationName: z.string(),
  organizationSlug: z.string(),
  status: z.enum(['invited', 'active', 'suspended']),
});
export type MembershipSummary = z.infer<typeof membershipSummarySchema>;

export const sessionUserSchema = z.object({
  id: uuidSchema,
  email: z.string(),
  fullName: z.string(),
  platformRole: platformRoleSchema.nullable(),
  locale: z.string().nullable(),
});

export const activeOrganizationSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  slug: z.string(),
  timezone: z.string(),
  locale: z.string(),
  defaultCurrency: z.string(),
});

export const activeMembershipSchema = z.object({
  id: uuidSchema,
  title: z.string().nullable(),
  allBranches: z.boolean(),
  branchIds: z.array(uuidSchema),
  roles: z.array(z.object({ id: uuidSchema, key: z.string(), name: z.string() })),
  personnelId: uuidSchema.nullable(),
});

/** Everything the web app needs to compose a permission-aware UI. */
export const sessionSchema = z.object({
  user: sessionUserSchema,
  memberships: z.array(membershipSummarySchema),
  activeOrganization: activeOrganizationSchema.nullable(),
  activeMembership: activeMembershipSchema.nullable(),
  /** Effective permissions: permission key → broadest scope. */
  permissions: z.record(z.string(), z.enum(SCOPES)),
  platformPermissions: z.array(z.enum(PLATFORM_PERMISSIONS)),
  enabledModules: z.array(z.enum(MODULE_KEYS)),
  /** Branches the member can work in (all branches when allBranches). */
  branches: z.array(refSchema.extend({ code: z.string() })),
});
export type Session = z.infer<typeof sessionSchema>;

export const switchOrganizationRequestSchema = z.object({ organizationId: uuidSchema });
export type SwitchOrganizationRequest = z.infer<typeof switchOrganizationRequestSchema>;

export const forgotPasswordRequestSchema = z.object({ email: emailSchema });
export type ForgotPasswordRequest = z.infer<typeof forgotPasswordRequestSchema>;

export const resetPasswordRequestSchema = z.object({
  token: z.string().min(20).max(200),
  password: passwordSchema,
});
export type ResetPasswordRequest = z.infer<typeof resetPasswordRequestSchema>;

export const changePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: passwordSchema,
});
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;

export const invitationPreviewSchema = z.object({
  organizationName: z.string(),
  email: z.string(),
  fullName: z.string().nullable(),
  /** True when the invitee must choose a name and password (no usable account yet). */
  requiresAccountSetup: z.boolean(),
  expiresAt: z.string(),
});
export type InvitationPreview = z.infer<typeof invitationPreviewSchema>;

export const acceptInvitationRequestSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  password: passwordSchema.optional(),
});
export type AcceptInvitationRequest = z.infer<typeof acceptInvitationRequestSchema>;

export const acceptInvitationResponseSchema = z.object({
  /** True when a session was created (new account); false when the user must sign in. */
  signedIn: z.boolean(),
  organizationId: uuidSchema,
});
export type AcceptInvitationResponse = z.infer<typeof acceptInvitationResponseSchema>;

export const activeSessionSchema = z.object({
  id: uuidSchema,
  current: z.boolean(),
  createdAt: z.string(),
  lastSeenAt: z.string(),
  ip: z.string().nullable(),
  userAgent: z.string().nullable(),
});
export type ActiveSession = z.infer<typeof activeSessionSchema>;
