import { Inject, Injectable } from '@nestjs/common';
import { CORE_MODULES, type ModuleKey, PermissionSet, isModuleKey } from '@repo/authorization';
import { and, eq, isNull } from 'drizzle-orm';
import type { Logger } from 'pino';
import { LOGGER } from '../../platform/logging/logging.module.js';
import {
  branches,
  membershipBranches,
  membershipRoles,
  memberships,
  organizationModules,
  organizations,
  personnel,
  rolePermissions,
  roles,
} from '../../platform/database/schema/index.js';
import { SystemDatabase } from '../../platform/database/system-database.service.js';
import type { ActorMembership, ActorOrganization } from './actor.js';

export interface MembershipContext {
  organization: ActorOrganization;
  membership: ActorMembership;
  permissions: PermissionSet;
  enabledModules: ReadonlySet<ModuleKey>;
}

const CACHE_TTL_MS = 60_000;
const CACHE_MAX_ENTRIES = 10_000;

/**
 * Resolves a membership's effective authorization context (roles → permissions, branch access,
 * personnel link, enabled modules). Part of the authentication pipeline, so it runs before any
 * tenant context exists and uses the system role.
 *
 * Results are cached per (membership, authz_version): every change that affects authorization
 * increments `memberships.authz_version`, which makes stale entries unreachable immediately.
 */
@Injectable()
export class AuthorizationContextService {
  private readonly cache = new Map<string, { value: MembershipContext; expiresAt: number }>();

  constructor(
    private readonly systemDb: SystemDatabase,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  async resolve(membershipId: string, authzVersion: number): Promise<MembershipContext | null> {
    const key = `${membershipId}:${authzVersion}`;
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    const value = await this.load(membershipId);
    if (!value) return null;
    if (this.cache.size >= CACHE_MAX_ENTRIES) {
      const oldest = this.cache.keys().next().value;
      if (oldest) this.cache.delete(oldest);
    }
    this.cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    return value;
  }

  clear(): void {
    this.cache.clear();
  }

  private async load(membershipId: string): Promise<MembershipContext | null> {
    const db = this.systemDb.db;
    const [row] = await db
      .select({
        membershipId: memberships.id,
        organizationId: memberships.organizationId,
        status: memberships.status,
        allBranches: memberships.allBranches,
        title: memberships.title,
        orgName: organizations.name,
        orgSlug: organizations.slug,
        orgTimezone: organizations.timezone,
        orgLocale: organizations.locale,
        orgCurrency: organizations.defaultCurrency,
        orgStatus: organizations.status,
      })
      .from(memberships)
      .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
      .where(eq(memberships.id, membershipId))
      .limit(1);

    if (!row || row.status !== 'active' || row.orgStatus !== 'active') return null;
    const organizationId = row.organizationId;

    const [grantRows, branchRows, personnelRows, moduleRows] = await Promise.all([
      db
        .select({
          roleId: roles.id,
          roleKey: roles.key,
          roleName: roles.name,
          permission: rolePermissions.permissionKey,
          scope: rolePermissions.scope,
        })
        .from(membershipRoles)
        .innerJoin(
          roles,
          and(eq(roles.id, membershipRoles.roleId), eq(roles.organizationId, organizationId)),
        )
        .leftJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
        .where(and(eq(membershipRoles.membershipId, membershipId), isNull(roles.archivedAt))),
      db
        .select({ branchId: membershipBranches.branchId })
        .from(membershipBranches)
        .innerJoin(branches, eq(branches.id, membershipBranches.branchId))
        .where(
          and(eq(membershipBranches.membershipId, membershipId), eq(branches.status, 'active')),
        ),
      db
        .select({ id: personnel.id })
        .from(personnel)
        .where(
          and(
            eq(personnel.organizationId, organizationId),
            eq(personnel.membershipId, membershipId),
            isNull(personnel.archivedAt),
          ),
        )
        .limit(1),
      db
        .select({ moduleKey: organizationModules.moduleKey, enabled: organizationModules.enabled })
        .from(organizationModules)
        .where(eq(organizationModules.organizationId, organizationId)),
    ]);

    const roleMap = new Map<string, { id: string; key: string; name: string }>();
    const grants: { permission: string; scope: string }[] = [];
    for (const grantRow of grantRows) {
      roleMap.set(grantRow.roleId, {
        id: grantRow.roleId,
        key: grantRow.roleKey,
        name: grantRow.roleName,
      });
      if (grantRow.permission && grantRow.scope) {
        grants.push({ permission: grantRow.permission, scope: grantRow.scope });
      }
    }

    const enabledModules = new Set<ModuleKey>(CORE_MODULES);
    for (const moduleRow of moduleRows) {
      if (!isModuleKey(moduleRow.moduleKey)) continue;
      if (moduleRow.enabled) enabledModules.add(moduleRow.moduleKey);
      else if (!CORE_MODULES.includes(moduleRow.moduleKey))
        enabledModules.delete(moduleRow.moduleKey);
    }

    const permissions = PermissionSet.fromGrants(grants).restrictToModules(enabledModules);
    if (permissions.size < new Set(grants.map((grant) => grant.permission)).size) {
      this.logger.debug(
        { membershipId },
        'Some role grants were ignored (invalid or disabled module)',
      );
    }

    return {
      organization: {
        id: organizationId,
        name: row.orgName,
        slug: row.orgSlug,
        timezone: row.orgTimezone,
        locale: row.orgLocale,
        defaultCurrency: row.orgCurrency,
      },
      membership: {
        id: row.membershipId,
        organizationId,
        title: row.title,
        allBranches: row.allBranches,
        branchIds: branchRows.map((branchRow) => branchRow.branchId),
        personnelId: personnelRows[0]?.id ?? null,
        roles: [...roleMap.values()],
      },
      permissions,
      enabledModules,
    };
  }
}
