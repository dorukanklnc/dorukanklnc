import {
  MODULE_KEYS,
  ROLE_TEMPLATES,
  ROLE_TEMPLATE_KEYS,
  type RoleTemplateKey,
} from '@repo/authorization';
import { and, eq, sql } from 'drizzle-orm';
import { generateToken, hashToken } from '../../platform/crypto/tokens.js';
import {
  branches,
  invitations,
  membershipBranches,
  membershipRoles,
  memberships,
  organizationModules,
  organizations,
  rolePermissions,
  roles,
  users,
} from '../../platform/database/schema/index.js';
import type { DbExecutor } from '../../platform/database/types.js';
import { PLAN_MODULES, type PlanKey } from './plans.js';

export const INVITATION_TTL_DAYS = 7;

export interface ProvisionOrganizationInput {
  name: string;
  slug: string;
  legalName?: string | undefined;
  timezone: string;
  locale?: string;
  defaultCurrency: string;
  planKey: PlanKey;
  firstBranch: { code: string; name: string };
}

export interface ProvisionedOrganization {
  organizationId: string;
  branchId: string;
  roleIds: Record<RoleTemplateKey, string>;
}

/**
 * Creates a tenant with its first branch, module switches and read-only copies of every role
 * template. Pure data operation on the given executor (system role, explicit organization ids);
 * used by platform provisioning and by the demo seed.
 */
export async function provisionOrganization(
  db: DbExecutor,
  input: ProvisionOrganizationInput,
): Promise<ProvisionedOrganization> {
  const locale = input.locale ?? 'tr-TR';
  const [organization] = await db
    .insert(organizations)
    .values({
      name: input.name,
      slug: input.slug,
      legalName: input.legalName ?? null,
      timezone: input.timezone,
      locale,
      defaultCurrency: input.defaultCurrency,
      planKey: input.planKey,
    })
    .returning({ id: organizations.id });
  if (!organization) throw new Error('Organization insert failed');
  const organizationId = organization.id;

  const [branch] = await db
    .insert(branches)
    .values({
      organizationId,
      code: input.firstBranch.code,
      name: input.firstBranch.name,
      isHeadquarters: true,
    })
    .returning({ id: branches.id });
  if (!branch) throw new Error('Branch insert failed');

  const enabled = new Set(PLAN_MODULES[input.planKey]);
  await db.insert(organizationModules).values(
    MODULE_KEYS.map((moduleKey) => ({
      organizationId,
      moduleKey,
      enabled: enabled.has(moduleKey),
    })),
  );

  const language = locale.toLowerCase().startsWith('en') ? 'en' : 'tr';
  const roleIds = {} as Record<RoleTemplateKey, string>;
  for (const key of ROLE_TEMPLATE_KEYS) {
    const template = ROLE_TEMPLATES[key];
    const [role] = await db
      .insert(roles)
      .values({
        organizationId,
        key: template.key,
        name: template.name[language],
        description: template.description[language],
        isSystem: true,
        templateKey: template.key,
      })
      .returning({ id: roles.id });
    if (!role) throw new Error('Role insert failed');
    roleIds[key] = role.id;
    await db.insert(rolePermissions).values(
      template.grants.map((grant) => ({
        organizationId,
        roleId: role.id,
        permissionKey: grant.permission,
        scope: grant.scope,
      })),
    );
  }

  return { organizationId, branchId: branch.id, roleIds };
}

export interface InviteMemberInput {
  organizationId: string;
  email: string;
  fullName: string;
  title?: string | null | undefined;
  roleIds: readonly string[];
  allBranches: boolean;
  branchIds: readonly string[];
  invitedByMembershipId: string | null;
}

export interface InvitedMember {
  userId: string;
  membershipId: string;
  invitationId: string;
  token: string;
  expiresAt: Date;
  /** True when the e-mail already had an account (the invitee keeps their password). */
  existingUser: boolean;
}

/**
 * Finds or creates the global identity for an e-mail and creates an invited membership with roles,
 * branch access and a single-use invitation token. Requires the system role (global users table).
 * Callers must have validated roles/branches against the organization beforehand.
 */
export async function inviteMember(
  db: DbExecutor,
  input: InviteMemberInput,
): Promise<InvitedMember> {
  const email = input.email.trim().toLowerCase();
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  let userId = existing?.id;
  if (!userId) {
    const [created] = await db
      .insert(users)
      .values({ email, fullName: input.fullName, status: 'invited' })
      .returning({ id: users.id });
    if (!created) throw new Error('User insert failed');
    userId = created.id;
  }

  const [membership] = await db
    .insert(memberships)
    .values({
      organizationId: input.organizationId,
      userId,
      status: 'invited',
      allBranches: input.allBranches,
      title: input.title ?? null,
      invitedByMembershipId: input.invitedByMembershipId,
      invitedAt: sql`now()`,
    })
    .returning({ id: memberships.id });
  if (!membership) throw new Error('Membership insert failed');

  if (input.roleIds.length > 0) {
    await db.insert(membershipRoles).values(
      input.roleIds.map((roleId) => ({
        organizationId: input.organizationId,
        membershipId: membership.id,
        roleId,
        assignedByMembershipId: input.invitedByMembershipId,
      })),
    );
  }
  if (!input.allBranches && input.branchIds.length > 0) {
    await db.insert(membershipBranches).values(
      input.branchIds.map((branchId) => ({
        organizationId: input.organizationId,
        membershipId: membership.id,
        branchId,
      })),
    );
  }

  const issued = await issueInvitation(db, {
    organizationId: input.organizationId,
    membershipId: membership.id,
    email,
    invitedByMembershipId: input.invitedByMembershipId,
  });

  return { userId, membershipId: membership.id, existingUser: Boolean(existing), ...issued };
}

/** Creates a fresh invitation token for a membership, revoking any pending one. */
export async function issueInvitation(
  db: DbExecutor,
  input: {
    organizationId: string;
    membershipId: string;
    email: string;
    invitedByMembershipId: string | null;
  },
): Promise<{ invitationId: string; token: string; expiresAt: Date }> {
  await db
    .update(invitations)
    .set({ status: 'revoked' })
    .where(
      and(
        eq(invitations.organizationId, input.organizationId),
        eq(invitations.membershipId, input.membershipId),
        eq(invitations.status, 'pending'),
      ),
    );
  const token = generateToken();
  const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 86_400_000);
  const [invitation] = await db
    .insert(invitations)
    .values({
      organizationId: input.organizationId,
      membershipId: input.membershipId,
      email: input.email,
      tokenHash: hashToken(token),
      expiresAt,
      invitedByMembershipId: input.invitedByMembershipId,
    })
    .returning({ id: invitations.id });
  if (!invitation) throw new Error('Invitation insert failed');
  return { invitationId: invitation.id, token, expiresAt };
}
