import {
  type ModuleKey,
  type PermissionKey,
  PermissionSet,
  type PlatformPermission,
  isModuleKey,
} from '@repo/authorization';
import type { Session } from '@repo/contracts';

/**
 * What the current member may see, derived from the server-issued session. The UI uses it to
 * hide what is not permitted; the API enforces the same rules independently on every request.
 */
export interface AccessContext {
  readonly permissions: PermissionSet;
  readonly enabledModules: ReadonlySet<ModuleKey>;
  readonly platformPermissions: ReadonlySet<PlatformPermission>;
  readonly hasOrganization: boolean;
}

export interface AccessRequirement {
  /** Every one of these tenant permissions. */
  readonly all?: readonly PermissionKey[];
  /** At least one of these tenant permissions. */
  readonly any?: readonly PermissionKey[];
  /** The module must be enabled for the organization. */
  readonly module?: ModuleKey;
  /** A platform (staff) permission; tenant permissions are ignored for such routes. */
  readonly platform?: PlatformPermission;
}

export function accessFromSession(session: Session): AccessContext {
  return {
    permissions: PermissionSet.fromRecord(session.permissions),
    enabledModules: new Set(session.enabledModules.filter(isModuleKey)),
    platformPermissions: new Set(session.platformPermissions),
    hasOrganization: session.activeOrganization !== null,
  };
}

export function canAccess(requirement: AccessRequirement, access: AccessContext): boolean {
  if (requirement.platform) return access.platformPermissions.has(requirement.platform);
  if (!access.hasOrganization) return false;
  if (requirement.module && !access.enabledModules.has(requirement.module)) return false;
  if (requirement.all && !access.permissions.hasAll(requirement.all)) return false;
  if (requirement.any && !access.permissions.hasAny(requirement.any)) return false;
  return true;
}

/** Access rules per screen; they mirror the permissions the screen's API endpoints require. */
export const ROUTE_ACCESS = {
  dashboard: {},
  students: { module: 'students', all: ['students.read'] },
  guardians: { module: 'students', all: ['guardians.read'] },
  classes: { module: 'academics', all: ['academics.read'] },
  collections: { module: 'finance', all: ['finance.reports.read'] },
  receivables: { module: 'finance', all: ['finance.collections.read'] },
  payments: { module: 'finance', all: ['finance.payments.read'] },
  users: { module: 'administration', all: ['settings.users.read'] },
  roles: { module: 'administration', any: ['settings.users.read', 'settings.roles.manage'] },
  branches: { module: 'administration', all: ['settings.branches.manage'] },
  organization: { module: 'administration', all: ['settings.organization.manage'] },
  audit: { module: 'administration', all: ['audit.read'] },
  platformOrganizations: { platform: 'platform.organizations.manage' },
} as const satisfies Record<string, AccessRequirement>;

export type RouteKey = keyof typeof ROUTE_ACCESS;
