import {
  PERMISSIONS,
  getPermission,
  isPermissionKey,
  isScopeAllowed,
  type PermissionKey,
} from './permissions.js';
import type { RoleGrant } from './roles.js';
import { broaderScope, isScope, scopeCovers, type Scope } from './scopes.js';

export interface RawGrant {
  readonly permission: string;
  readonly scope: string;
}

export type PermissionRecord = Partial<Record<PermissionKey, Scope>>;

/**
 * The effective, immutable permission set of one membership.
 *
 * Built from the union of all role grants; for each permission the broadest granted scope wins.
 * Unknown permission keys, unknown scopes and scopes a permission does not support are dropped
 * (fail closed) — the API logs those as configuration problems.
 */
export class PermissionSet {
  private readonly grants: ReadonlyMap<PermissionKey, Scope>;

  private constructor(grants: Map<PermissionKey, Scope>) {
    this.grants = grants;
  }

  static empty(): PermissionSet {
    return new PermissionSet(new Map());
  }

  static fromGrants(grants: Iterable<RawGrant>): PermissionSet {
    const map = new Map<PermissionKey, Scope>();
    for (const { permission, scope } of grants) {
      if (!isPermissionKey(permission) || !isScope(scope) || !isScopeAllowed(permission, scope)) {
        continue;
      }
      const current = map.get(permission);
      map.set(permission, current ? broaderScope(current, scope) : scope);
    }
    return new PermissionSet(map);
  }

  /** Rehydrates a set serialized with {@link PermissionSet.toRecord} (e.g. on the client). */
  static fromRecord(record: Readonly<Record<string, string>>): PermissionSet {
    return PermissionSet.fromGrants(
      Object.entries(record).map(([permission, scope]) => ({ permission, scope })),
    );
  }

  get size(): number {
    return this.grants.size;
  }

  scopeOf(permission: PermissionKey): Scope | null {
    return this.grants.get(permission) ?? null;
  }

  /** True when the permission is held, optionally with at least the given scope. */
  has(permission: PermissionKey, atLeast?: Scope): boolean {
    const scope = this.grants.get(permission);
    if (!scope) return false;
    return atLeast ? scopeCovers(scope, atLeast) : true;
  }

  hasAll(permissions: readonly PermissionKey[]): boolean {
    return permissions.every((permission) => this.has(permission));
  }

  hasAny(permissions: readonly PermissionKey[]): boolean {
    return permissions.some((permission) => this.has(permission));
  }

  keys(): PermissionKey[] {
    return [...this.grants.keys()];
  }

  /** True when at least one permission is held at organization scope. */
  hasOrganizationWideAccess(): boolean {
    for (const scope of this.grants.values()) {
      if (scope === 'organization') return true;
    }
    return false;
  }

  /** Removes every permission belonging to a disabled module. */
  restrictToModules(enabledModules: ReadonlySet<string>): PermissionSet {
    const map = new Map<PermissionKey, Scope>();
    for (const [permission, scope] of this.grants) {
      if (enabledModules.has(PERMISSIONS[permission].module)) map.set(permission, scope);
    }
    return new PermissionSet(map);
  }

  toRecord(): PermissionRecord {
    return Object.fromEntries(this.grants);
  }

  toGrants(): RoleGrant[] {
    return [...this.grants].map(([permission, scope]) => ({ permission, scope }));
  }
}

/**
 * Privilege-escalation guard: returns every grant the actor may not hand out.
 *
 * A member can only delegate permissions they hold themselves, with a scope their own scope
 * covers. This applies to editing roles and to assigning roles to members.
 */
export function findEscalations(actor: PermissionSet, requested: Iterable<RoleGrant>): RoleGrant[] {
  const violations: RoleGrant[] = [];
  for (const grant of requested) {
    const held = actor.scopeOf(grant.permission);
    if (!held || !scopeCovers(held, grant.scope)) violations.push(grant);
  }
  return violations;
}

/**
 * Dependencies (`dependsOn`) a grant set fails to satisfy, e.g. a role that can record payments
 * but cannot read them. A dependency must be held with a scope that covers the dependent grant.
 */
export function findMissingDependencies(
  requested: readonly RoleGrant[],
): { permission: PermissionKey; missing: PermissionKey }[] {
  const set = PermissionSet.fromGrants(requested);
  const problems: { permission: PermissionKey; missing: PermissionKey }[] = [];
  for (const { permission, scope } of requested) {
    for (const dependency of getPermission(permission).dependsOn ?? []) {
      if (!isPermissionKey(dependency)) continue;
      const held = set.scopeOf(dependency);
      if (!held || !scopeCovers(held, scope)) problems.push({ permission, missing: dependency });
    }
  }
  return problems;
}
