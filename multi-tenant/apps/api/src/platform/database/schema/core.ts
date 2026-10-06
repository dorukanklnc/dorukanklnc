import { SCOPES } from '@repo/authorization';
import { membershipStatusSchema, platformRoleSchema } from '@repo/contracts';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  inet,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  citext,
  createdAt,
  currencyCheck,
  currencyCode,
  enumCheck,
  primaryId,
  timestamptz,
  updatedAt,
} from './_shared.js';

export const ORGANIZATION_STATUSES = ['active', 'suspended', 'archived'] as const;
export type OrganizationStatus = (typeof ORGANIZATION_STATUSES)[number];

export const USER_STATUSES = ['invited', 'active', 'disabled'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const INVITATION_STATUSES = ['pending', 'accepted', 'revoked', 'expired'] as const;
export const OUTBOX_STATUSES = ['pending', 'published', 'failed'] as const;
export const ACTOR_TYPES = ['user', 'system', 'support', 'webhook'] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

export interface OrganizationSettings {
  branding?: { primaryColor?: string; logoFileId?: string };
  finance?: { receiptPrefix?: string };
}

// ── Tenants ─────────────────────────────────────────────────────────────────────────────

export const organizations = pgTable(
  'organizations',
  {
    id: primaryId(),
    slug: citext().notNull(),
    name: text().notNull(),
    legalName: text(),
    status: text().$type<OrganizationStatus>().notNull().default('active'),
    planKey: text().notNull().default('standard'),
    locale: text().notNull().default('tr-TR'),
    timezone: text().notNull().default('Europe/Istanbul'),
    defaultCurrency: currencyCode().notNull().default('TRY'),
    settings: jsonb().$type<OrganizationSettings>().notNull().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('organizations_slug_uq').on(t.slug),
    enumCheck('organizations_status_ck', 'status', ORGANIZATION_STATUSES),
    currencyCheck('organizations_currency_ck', 'default_currency'),
  ],
);

export const branches = pgTable(
  'branches',
  {
    id: primaryId(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    code: text().notNull(),
    name: text().notNull(),
    status: text().$type<'active' | 'inactive'>().notNull().default('active'),
    city: text(),
    district: text(),
    address: text(),
    phone: text(),
    email: citext(),
    isHeadquarters: boolean().notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('branches_org_id_uq').on(t.organizationId, t.id),
    unique('branches_org_code_uq').on(t.organizationId, t.code),
    enumCheck('branches_status_ck', 'status', ['active', 'inactive']),
  ],
);

// ── Identity ────────────────────────────────────────────────────────────────────────────

export const users = pgTable(
  'users',
  {
    id: primaryId(),
    email: citext().notNull(),
    fullName: text().notNull(),
    phone: text(),
    passwordHash: text(),
    status: text().$type<UserStatus>().notNull().default('active'),
    platformRole: text().$type<'platform_admin' | 'platform_support'>(),
    locale: text(),
    emailVerifiedAt: timestamptz(),
    lastLoginAt: timestamptz(),
    passwordChangedAt: timestamptz(),
    failedLoginAttempts: integer().notNull().default(0),
    lockedUntil: timestamptz(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('users_email_uq').on(t.email),
    enumCheck('users_status_ck', 'status', USER_STATUSES),
    enumCheck('users_platform_role_ck', 'platform_role', platformRoleSchema.options, {
      nullable: true,
    }),
  ],
);

export const memberships = pgTable(
  'memberships',
  {
    id: primaryId(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    status: text()
      .$type<(typeof membershipStatusSchema.options)[number]>()
      .notNull()
      .default('invited'),
    allBranches: boolean().notNull().default(false),
    title: text(),
    /** Incremented on every change that affects effective permissions (cache invalidation). */
    authzVersion: integer().notNull().default(1),
    invitedByMembershipId: uuid(),
    invitedAt: timestamptz(),
    joinedAt: timestamptz(),
    suspendedAt: timestamptz(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('memberships_org_id_uq').on(t.organizationId, t.id),
    unique('memberships_org_user_uq').on(t.organizationId, t.userId),
    index('memberships_user_idx').on(t.userId),
    foreignKey({
      name: 'memberships_invited_by_fk',
      columns: [t.organizationId, t.invitedByMembershipId],
      foreignColumns: [t.organizationId, t.id],
    }),
    enumCheck('memberships_status_ck', 'status', membershipStatusSchema.options),
  ],
);

export const membershipBranches = pgTable(
  'membership_branches',
  {
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    membershipId: uuid().notNull(),
    branchId: uuid().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ name: 'membership_branches_pk', columns: [t.membershipId, t.branchId] }),
    foreignKey({
      name: 'membership_branches_membership_fk',
      columns: [t.organizationId, t.membershipId],
      foreignColumns: [memberships.organizationId, memberships.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'membership_branches_branch_fk',
      columns: [t.organizationId, t.branchId],
      foreignColumns: [branches.organizationId, branches.id],
    }),
    index('membership_branches_branch_idx').on(t.organizationId, t.branchId),
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    id: primaryId(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text().notNull(),
    csrfTokenHash: text().notNull(),
    activeOrganizationId: uuid().references(() => organizations.id, { onDelete: 'set null' }),
    activeMembershipId: uuid().references(() => memberships.id, { onDelete: 'set null' }),
    authMethod: text().notNull().default('password'),
    mfaVerifiedAt: timestamptz(),
    ip: inet(),
    userAgent: text(),
    createdAt: createdAt(),
    lastSeenAt: timestamptz().notNull().defaultNow(),
    idleExpiresAt: timestamptz().notNull(),
    absoluteExpiresAt: timestamptz().notNull(),
    revokedAt: timestamptz(),
    revokedReason: text(),
  },
  (t) => [
    uniqueIndex('sessions_token_hash_uq').on(t.tokenHash),
    index('sessions_user_active_idx')
      .on(t.userId)
      .where(sql`revoked_at IS NULL`),
  ],
);

export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    id: primaryId(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text().notNull(),
    expiresAt: timestamptz().notNull(),
    usedAt: timestamptz(),
    requestedIp: inet(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('password_reset_tokens_hash_uq').on(t.tokenHash),
    index('password_reset_tokens_user_idx').on(t.userId),
  ],
);

export const invitations = pgTable(
  'invitations',
  {
    id: primaryId(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    membershipId: uuid().notNull(),
    email: citext().notNull(),
    tokenHash: text().notNull(),
    status: text().$type<(typeof INVITATION_STATUSES)[number]>().notNull().default('pending'),
    expiresAt: timestamptz().notNull(),
    invitedByMembershipId: uuid(),
    acceptedAt: timestamptz(),
    lastSentAt: timestamptz().notNull().defaultNow(),
    sendCount: integer().notNull().default(1),
    createdAt: createdAt(),
  },
  (t) => [
    unique('invitations_org_id_uq').on(t.organizationId, t.id),
    uniqueIndex('invitations_token_hash_uq').on(t.tokenHash),
    uniqueIndex('invitations_pending_membership_uq')
      .on(t.membershipId)
      .where(sql`status = 'pending'`),
    foreignKey({
      name: 'invitations_membership_fk',
      columns: [t.organizationId, t.membershipId],
      foreignColumns: [memberships.organizationId, memberships.id],
    }),
    enumCheck('invitations_status_ck', 'status', INVITATION_STATUSES),
  ],
);

// ── Authorization ───────────────────────────────────────────────────────────────────────

/** Global permission catalog, synced from `@repo/authorization`. */
export const permissions = pgTable('permissions', {
  key: text().primaryKey(),
  module: text().notNull(),
  allowedScopes: text().array().notNull(),
  sensitivity: text().notNull(),
  description: text().notNull(),
  deprecatedAt: timestamptz(),
  updatedAt: updatedAt(),
});

export const roles = pgTable(
  'roles',
  {
    id: primaryId(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    key: text().notNull(),
    name: text().notNull(),
    description: text(),
    isSystem: boolean().notNull().default(false),
    templateKey: text(),
    archivedAt: timestamptz(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('roles_org_id_uq').on(t.organizationId, t.id),
    unique('roles_org_key_uq').on(t.organizationId, t.key),
  ],
);

export const rolePermissions = pgTable(
  'role_permissions',
  {
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    roleId: uuid().notNull(),
    permissionKey: text()
      .notNull()
      .references(() => permissions.key),
    scope: text().$type<(typeof SCOPES)[number]>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ name: 'role_permissions_pk', columns: [t.roleId, t.permissionKey] }),
    foreignKey({
      name: 'role_permissions_role_fk',
      columns: [t.organizationId, t.roleId],
      foreignColumns: [roles.organizationId, roles.id],
    }).onDelete('cascade'),
    enumCheck('role_permissions_scope_ck', 'scope', SCOPES),
  ],
);

export const membershipRoles = pgTable(
  'membership_roles',
  {
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    membershipId: uuid().notNull(),
    roleId: uuid().notNull(),
    assignedByMembershipId: uuid(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ name: 'membership_roles_pk', columns: [t.membershipId, t.roleId] }),
    foreignKey({
      name: 'membership_roles_membership_fk',
      columns: [t.organizationId, t.membershipId],
      foreignColumns: [memberships.organizationId, memberships.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'membership_roles_role_fk',
      columns: [t.organizationId, t.roleId],
      foreignColumns: [roles.organizationId, roles.id],
    }),
    index('membership_roles_role_idx').on(t.organizationId, t.roleId),
  ],
);

export const organizationModules = pgTable(
  'organization_modules',
  {
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    moduleKey: text().notNull(),
    enabled: boolean().notNull(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ name: 'organization_modules_pk', columns: [t.organizationId, t.moduleKey] }),
  ],
);

// ── Audit & events ──────────────────────────────────────────────────────────────────────

export type AuditChanges = Record<string, { before: unknown; after: unknown }>;

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: primaryId(),
    organizationId: uuid().references(() => organizations.id),
    branchId: uuid(),
    actorType: text().$type<ActorType>().notNull(),
    actorUserId: uuid(),
    actorMembershipId: uuid(),
    supportSessionId: uuid(),
    action: text().notNull(),
    resourceType: text().notNull(),
    resourceId: uuid(),
    changes: jsonb().$type<AuditChanges>(),
    metadata: jsonb().$type<Record<string, unknown>>(),
    ip: inet(),
    userAgent: text(),
    requestId: text(),
    occurredAt: timestamptz().notNull().defaultNow(),
  },
  (t) => [
    index('audit_logs_org_time_idx').on(t.organizationId, t.occurredAt.desc()),
    index('audit_logs_org_resource_idx').on(
      t.organizationId,
      t.resourceType,
      t.resourceId,
      t.occurredAt.desc(),
    ),
    index('audit_logs_org_actor_idx').on(t.organizationId, t.actorUserId, t.occurredAt.desc()),
    enumCheck('audit_logs_actor_type_ck', 'actor_type', ACTOR_TYPES),
  ],
);

export const outboxEvents = pgTable(
  'outbox_events',
  {
    id: primaryId(),
    organizationId: uuid().references(() => organizations.id),
    aggregateType: text().notNull(),
    aggregateId: uuid().notNull(),
    eventType: text().notNull(),
    eventVersion: integer().notNull().default(1),
    payload: jsonb().$type<Record<string, unknown>>().notNull(),
    metadata: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    occurredAt: timestamptz().notNull().defaultNow(),
    availableAt: timestamptz().notNull().defaultNow(),
    publishedAt: timestamptz(),
    status: text().$type<(typeof OUTBOX_STATUSES)[number]>().notNull().default('pending'),
    attempts: integer().notNull().default(0),
    lastError: text(),
  },
  (t) => [
    index('outbox_events_pending_idx')
      .on(t.availableAt)
      .where(sql`status = 'pending'`),
    index('outbox_events_org_type_idx').on(t.organizationId, t.eventType, t.occurredAt),
    enumCheck('outbox_events_status_ck', 'status', OUTBOX_STATUSES),
  ],
);

export const documentSequences = pgTable(
  'document_sequences',
  {
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    sequenceKey: text().notNull(),
    period: text().notNull().default(''),
    nextValue: integer().notNull(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({
      name: 'document_sequences_pk',
      columns: [t.organizationId, t.sequenceKey, t.period],
    }),
    check('document_sequences_next_value_ck', sql`next_value > 0`),
  ],
);
