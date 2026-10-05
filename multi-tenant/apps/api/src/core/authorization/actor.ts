import {
  type AccessSubject,
  type ModuleKey,
  type PermissionKey,
  PermissionSet,
  type PlatformPermission,
  type PlatformRole,
  type ResourceAttributes,
  type Scope,
  branchBoundary,
  isWithinScope,
} from '@repo/authorization';
import { Errors } from '../../platform/errors/app-error.js';
import type { TenantScope } from '../../platform/database/types.js';

export interface ActorUser {
  id: string;
  email: string;
  fullName: string;
  platformRole: PlatformRole | null;
  locale: string | null;
}

export interface ActorOrganization {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  locale: string;
  defaultCurrency: string;
}

export interface ActorMembership {
  id: string;
  organizationId: string;
  title: string | null;
  allBranches: boolean;
  branchIds: readonly string[];
  personnelId: string | null;
  roles: readonly { id: string; key: string; name: string }[];
}

export interface TenantActor {
  organization: ActorOrganization;
  membership: ActorMembership;
}

/**
 * The authenticated caller, resolved on the server for every request.
 * Services receive an Actor and derive everything (tenant, branches, scopes) from it.
 */
export class Actor {
  constructor(
    readonly sessionId: string,
    readonly user: ActorUser,
    readonly organization: ActorOrganization | null,
    readonly membership: ActorMembership | null,
    readonly permissions: PermissionSet,
    readonly enabledModules: ReadonlySet<ModuleKey>,
    readonly platformPermissions: readonly PlatformPermission[],
  ) {}

  get userId(): string {
    return this.user.id;
  }

  /** The active tenant; throws when the session has no active organization. */
  tenant(): TenantActor {
    if (!this.organization || !this.membership) {
      throw Errors.conflict('AUTH_ORGANIZATION_REQUIRED', 'Select an organization first');
    }
    return { organization: this.organization, membership: this.membership };
  }

  get organizationId(): string {
    return this.tenant().organization.id;
  }

  get membershipId(): string {
    return this.tenant().membership.id;
  }

  /** Transaction-local RLS context for this actor. */
  tenantScope(): TenantScope {
    const { organization, membership } = this.tenant();
    return {
      organizationId: organization.id,
      userId: this.user.id,
      branchBoundary: branchBoundary(membership, this.permissions.hasOrganizationWideAccess()),
    };
  }

  get accessSubject(): AccessSubject {
    const { membership } = this.tenant();
    return {
      membershipId: membership.id,
      allBranches: membership.allBranches,
      branchIds: membership.branchIds,
    };
  }

  can(permission: PermissionKey, atLeast?: Scope): boolean {
    return this.permissions.has(permission, atLeast);
  }

  /** The caller's scope for a permission, or a 403 when the permission is not held at all. */
  scopeFor(permission: PermissionKey): Scope {
    const scope = this.permissions.scopeOf(permission);
    if (!scope) throw Errors.forbidden();
    return scope;
  }

  /** Record-level check; outside the scope means "not found" for the caller. */
  assertWithinScope(permission: PermissionKey, resource: ResourceAttributes, label: string): void {
    const scope = this.scopeFor(permission);
    if (!isWithinScope(scope, this.accessSubject, resource)) throw Errors.notFound(label);
  }

  /** Branch ids the caller may act in for a permission ('*' = all branches of the tenant). */
  branchesFor(permission: PermissionKey): '*' | readonly string[] {
    const scope = this.scopeFor(permission);
    const { membership } = this.tenant();
    if (scope === 'organization' || membership.allBranches) return '*';
    return membership.branchIds;
  }

  /** Validates that a branch chosen in a request is one the caller may act in. */
  assertBranchAllowed(permission: PermissionKey, branchId: string): void {
    const branches = this.branchesFor(permission);
    if (branches !== '*' && !branches.includes(branchId)) {
      throw Errors.unprocessable('BRANCH_NOT_ALLOWED', 'Branch is outside your access');
    }
  }

  hasPlatformPermission(permission: PlatformPermission): boolean {
    return this.platformPermissions.includes(permission);
  }

  /** Audit actor fields for this caller. */
  auditActor() {
    return {
      type: 'user' as const,
      userId: this.user.id,
      membershipId: this.membership?.id ?? null,
    };
  }
}
