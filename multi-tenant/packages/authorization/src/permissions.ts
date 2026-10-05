import type { ModuleKey } from './modules.js';
import type { Scope } from './scopes.js';

/**
 * Data sensitivity of what a permission unlocks. Used for UI badges, audit emphasis and future
 * policies (e.g. step-up authentication for `restricted`).
 */
export type Sensitivity = 'standard' | 'personal' | 'financial' | 'restricted';

export interface PermissionDefinition {
  readonly module: ModuleKey;
  /** Scopes this permission may be granted with, narrowest first. */
  readonly scopes: readonly Scope[];
  readonly sensitivity: Sensitivity;
  /** English description for documentation and admin tooling. UI labels come from i18n catalogs. */
  readonly description: string;
  /** Permissions that must also be held (at the same or a broader scope) for this one to be useful. */
  readonly dependsOn?: readonly string[];
}

/**
 * The permission catalog: RESOURCE.ACTION keys with the scopes they support.
 *
 * Adding a permission: add it here, give it a label in every web message catalog
 * (`permissions.<key>`), and run the catalog tests. The API syncs this catalog into the
 * `permissions` table during migrations/seeding.
 */
export const PERMISSIONS = {
  // ── Students & guardians ────────────────────────────────────────────────────────────────
  'students.read': {
    module: 'students',
    scopes: ['assigned', 'branch', 'organization'],
    sensitivity: 'personal',
    description: 'View student records: identity, enrollment and contact information.',
  },
  'students.create': {
    module: 'students',
    scopes: ['branch', 'organization'],
    sensitivity: 'personal',
    description: 'Register new students.',
    dependsOn: ['students.read'],
  },
  'students.update': {
    module: 'students',
    scopes: ['branch', 'organization'],
    sensitivity: 'personal',
    description: 'Edit student records.',
    dependsOn: ['students.read'],
  },
  'students.archive': {
    module: 'students',
    scopes: ['branch', 'organization'],
    sensitivity: 'personal',
    description: 'Archive student records. Financial history is always preserved.',
    dependsOn: ['students.read'],
  },
  'students.sensitive.read': {
    module: 'students',
    scopes: ['branch', 'organization'],
    sensitivity: 'restricted',
    description: 'View sensitive identifiers such as national ID numbers (unmasked).',
    dependsOn: ['students.read'],
  },
  'students.export': {
    module: 'students',
    scopes: ['branch', 'organization'],
    sensitivity: 'personal',
    description: 'Export student lists. Every export is audited.',
    dependsOn: ['students.read'],
  },
  'guardians.read': {
    module: 'students',
    scopes: ['assigned', 'branch', 'organization'],
    sensitivity: 'personal',
    description: 'View guardians and their contact details.',
  },
  'guardians.write': {
    module: 'students',
    scopes: ['branch', 'organization'],
    sensitivity: 'personal',
    description: 'Create and edit guardians and student–guardian relationships.',
    dependsOn: ['guardians.read'],
  },

  // ── Admissions ──────────────────────────────────────────────────────────────────────────
  'admissions.read': {
    module: 'admissions',
    scopes: ['own', 'branch', 'organization'],
    sensitivity: 'personal',
    description: 'View pre-registration leads and their follow-up history.',
  },
  'admissions.write': {
    module: 'admissions',
    scopes: ['own', 'branch', 'organization'],
    sensitivity: 'personal',
    description: 'Create and update leads, schedule follow-ups, change lead status.',
    dependsOn: ['admissions.read'],
  },
  'admissions.convert': {
    module: 'admissions',
    scopes: ['branch', 'organization'],
    sensitivity: 'personal',
    description: 'Convert a won lead into a student, guardians and an enrollment.',
    dependsOn: ['admissions.read', 'students.create'],
  },

  // ── Academics & attendance ──────────────────────────────────────────────────────────────
  'academics.read': {
    module: 'academics',
    scopes: ['assigned', 'branch', 'organization'],
    sensitivity: 'standard',
    description: 'View academic years, grade levels, classes and teacher assignments.',
  },
  'academics.manage': {
    module: 'academics',
    scopes: ['branch', 'organization'],
    sensitivity: 'standard',
    description: 'Manage classes, class rosters and teacher assignments.',
    dependsOn: ['academics.read'],
  },
  'attendance.read': {
    module: 'attendance',
    scopes: ['assigned', 'branch', 'organization'],
    sensitivity: 'personal',
    description: 'View attendance records.',
  },
  'attendance.write': {
    module: 'attendance',
    scopes: ['assigned', 'branch', 'organization'],
    sensitivity: 'personal',
    description: 'Take and correct attendance.',
    dependsOn: ['attendance.read'],
  },

  // ── Personnel ───────────────────────────────────────────────────────────────────────────
  'personnel.read': {
    module: 'personnel',
    scopes: ['branch', 'organization'],
    sensitivity: 'personal',
    description: 'View personnel records.',
  },
  'personnel.manage': {
    module: 'personnel',
    scopes: ['branch', 'organization'],
    sensitivity: 'personal',
    description: 'Create and edit personnel records.',
    dependsOn: ['personnel.read'],
  },

  // ── Finance / collections ───────────────────────────────────────────────────────────────
  'finance.collections.read': {
    module: 'finance',
    scopes: ['branch', 'organization'],
    sensitivity: 'financial',
    description: 'View student accounts, tuition agreements, installments, charges and balances.',
  },
  'finance.collections.write': {
    module: 'finance',
    scopes: ['branch', 'organization'],
    sensitivity: 'financial',
    description: 'Create tuition agreements, payment plans, discounts and additional charges.',
    dependsOn: ['finance.collections.read'],
  },
  'finance.payments.read': {
    module: 'finance',
    scopes: ['branch', 'organization'],
    sensitivity: 'financial',
    description: 'View payments and their allocations.',
  },
  'finance.payments.create': {
    module: 'finance',
    scopes: ['branch', 'organization'],
    sensitivity: 'financial',
    description: 'Record payments and allocate them to installments and charges.',
    dependsOn: ['finance.payments.read', 'finance.collections.read'],
  },
  'finance.payments.reverse': {
    module: 'finance',
    scopes: ['branch', 'organization'],
    sensitivity: 'financial',
    description: 'Reverse a completed payment. The original record is preserved.',
    dependsOn: ['finance.payments.read'],
  },
  'finance.refunds.create': {
    module: 'finance',
    scopes: ['branch', 'organization'],
    sensitivity: 'financial',
    description: 'Refund unallocated payment credit to the payer.',
    dependsOn: ['finance.payments.read'],
  },
  'finance.reports.read': {
    module: 'finance',
    scopes: ['branch', 'organization'],
    sensitivity: 'financial',
    description: 'Collections dashboard, aging, expected cash flow and finance reports.',
  },
  'finance.kpis.read': {
    module: 'finance',
    scopes: ['branch', 'organization'],
    sensitivity: 'financial',
    description: 'Aggregate finance KPIs without access to individual accounts.',
  },
  'finance.settings.manage': {
    module: 'finance',
    scopes: ['organization'],
    sensitivity: 'financial',
    description: 'Configure reminder rules, payment providers and finance defaults.',
  },

  // ── Reports ─────────────────────────────────────────────────────────────────────────────
  'reports.operational.read': {
    module: 'reports',
    scopes: ['branch', 'organization'],
    sensitivity: 'standard',
    description: 'Operational reports: enrollment, attendance and admissions analytics.',
  },

  // ── Administration ──────────────────────────────────────────────────────────────────────
  'settings.organization.manage': {
    module: 'administration',
    scopes: ['organization'],
    sensitivity: 'standard',
    description: 'Edit organization profile, modules and defaults.',
  },
  'settings.branches.manage': {
    module: 'administration',
    scopes: ['organization'],
    sensitivity: 'standard',
    description: 'Create and edit branches/campuses.',
  },
  'settings.users.read': {
    module: 'administration',
    scopes: ['branch', 'organization'],
    sensitivity: 'personal',
    description: 'View users, their roles and branch access.',
  },
  'settings.users.manage': {
    module: 'administration',
    scopes: ['branch', 'organization'],
    sensitivity: 'personal',
    description: 'Invite, suspend and reactivate users; assign roles and branches.',
    dependsOn: ['settings.users.read'],
  },
  'settings.roles.manage': {
    module: 'administration',
    scopes: ['organization'],
    sensitivity: 'standard',
    description: 'Create and edit custom roles.',
  },
  'settings.integrations.manage': {
    module: 'administration',
    scopes: ['organization'],
    sensitivity: 'restricted',
    description: 'Configure integrations such as payment and messaging providers.',
  },
  'audit.read': {
    module: 'administration',
    scopes: ['branch', 'organization'],
    sensitivity: 'personal',
    description: 'View the audit log.',
  },
} as const satisfies Record<string, PermissionDefinition>;

export type PermissionKey = keyof typeof PERMISSIONS;

export const PERMISSION_KEYS = Object.keys(PERMISSIONS) as PermissionKey[];

export function isPermissionKey(value: unknown): value is PermissionKey {
  return typeof value === 'string' && Object.hasOwn(PERMISSIONS, value);
}

export function getPermission(key: PermissionKey): PermissionDefinition {
  return PERMISSIONS[key];
}

/** The broadest scope a permission can be granted with. */
export function broadestAllowedScope(key: PermissionKey): Scope {
  const scopes: readonly Scope[] = PERMISSIONS[key].scopes;
  const last = scopes[scopes.length - 1];
  if (last === undefined) throw new Error(`Permission ${key} has no scopes`);
  return last;
}

export function isScopeAllowed(key: PermissionKey, scope: Scope): boolean {
  const scopes: readonly Scope[] = PERMISSIONS[key].scopes;
  return scopes.includes(scope);
}

export function permissionsOfModule(module: ModuleKey): PermissionKey[] {
  return PERMISSION_KEYS.filter((key) => PERMISSIONS[key].module === module);
}

/**
 * Platform staff permissions. Never stored in tenant roles; derived from `users.platform_role`.
 */
export const PLATFORM_PERMISSIONS = [
  'platform.organizations.manage',
  'platform.support.access',
  'platform.audit.read',
] as const;

export type PlatformPermission = (typeof PLATFORM_PERMISSIONS)[number];

export const PLATFORM_ROLES = {
  platform_admin: [
    'platform.organizations.manage',
    'platform.support.access',
    'platform.audit.read',
  ],
  platform_support: ['platform.support.access'],
} as const satisfies Record<string, readonly PlatformPermission[]>;

export type PlatformRole = keyof typeof PLATFORM_ROLES;

export function isPlatformRole(value: unknown): value is PlatformRole {
  return typeof value === 'string' && Object.hasOwn(PLATFORM_ROLES, value);
}

export function platformPermissionsOf(role: PlatformRole | null | undefined): PlatformPermission[] {
  return role ? [...PLATFORM_ROLES[role]] : [];
}
