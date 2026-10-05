import { Injectable } from '@nestjs/common';
import {
  PERMISSIONS,
  PERMISSION_KEYS,
  type RoleGrant,
  findEscalations,
  findMissingDependencies,
  getPermission,
  isPermissionKey,
  isScopeAllowed,
} from '@repo/authorization';
import type {
  CreateRoleRequest,
  Grant,
  PermissionCatalogItem,
  Role,
  UpdateRoleRequest,
} from '@repo/contracts';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { membershipRoles, memberships, rolePermissions, roles } from '../../platform/database/schema/index.js';
import { ref } from '../../platform/database/sql.js';
import { TenantDatabase } from '../../platform/database/tenant-database.service.js';
import type { Transaction } from '../../platform/database/types.js';
import { Errors } from '../../platform/errors/app-error.js';
import { AuditService, diffChanges } from '../audit/audit.service.js';
import type { Actor } from '../authorization/actor.js';

/** Turkish-aware slug for role keys: "Muhasebe Şefi" → "muhasebe-sefi". */
export function slugify(value: string): string {
  return value
    .toLocaleLowerCase('tr-TR')
    .replaceAll('ı', 'i')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

/**
 * Validates a grant set for a role edited by `actor`:
 * catalog scopes, `dependsOn` relations and privilege escalation (only grantable what you hold).
 */
export function validateGrants(actor: Actor, grants: readonly Grant[]): RoleGrant[] {
  const normalized: RoleGrant[] = [];
  const seen = new Set<string>();
  for (const grant of grants) {
    if (!isPermissionKey(grant.permission) || !isScopeAllowed(grant.permission, grant.scope)) {
      throw Errors.validation([
        {
          path: `grants.${grant.permission}`,
          code: 'invalid_scope',
          message: `Scope ${grant.scope} is not allowed for ${grant.permission}`,
        },
      ]);
    }
    if (seen.has(grant.permission)) {
      throw Errors.validation([
        { path: `grants.${grant.permission}`, code: 'duplicate', message: 'Duplicate permission' },
      ]);
    }
    seen.add(grant.permission);
    normalized.push({ permission: grant.permission, scope: grant.scope });
  }

  const missing = findMissingDependencies(normalized);
  if (missing.length > 0) {
    throw Errors.unprocessable(
      'ROLE_DEPENDENCY_MISSING',
      'Some permissions require other permissions',
      missing.map((problem) => ({
        path: `grants.${problem.permission}`,
        code: 'missing_dependency',
        message: problem.missing,
      })),
    );
  }

  assertNoEscalation(actor, normalized);
  return normalized;
}

/** Grants of disabled modules are inert and therefore never count as escalation. */
export function assertNoEscalation(actor: Actor, grants: readonly RoleGrant[]): void {
  const relevant = grants.filter((grant) => actor.enabledModules.has(getPermission(grant.permission).module));
  const escalations = findEscalations(actor.permissions, relevant);
  if (escalations.length > 0) {
    throw Errors.unprocessable(
      'ROLE_ESCALATION',
      'You cannot grant permissions you do not hold',
      escalations.map((grant) => ({
        path: `grants.${grant.permission}`,
        code: 'escalation',
        message: `${grant.permission}@${grant.scope}`,
      })),
    );
  }
}

@Injectable()
export class RolesService {
  constructor(
    private readonly db: TenantDatabase,
    private readonly audit: AuditService,
  ) {}

  catalog(): PermissionCatalogItem[] {
    return PERMISSION_KEYS.map((key) => ({
      key,
      module: PERMISSIONS[key].module,
      scopes: [...PERMISSIONS[key].scopes],
      sensitivity: PERMISSIONS[key].sensitivity,
      description: PERMISSIONS[key].description,
      dependsOn: [...(getPermission(key).dependsOn ?? [])],
    }));
  }

  async list(actor: Actor): Promise<Role[]> {
    return this.db.transaction(actor.tenantScope(), (tx) => this.loadRoles(tx, actor.organizationId));
  }

  async create(actor: Actor, input: CreateRoleRequest): Promise<Role> {
    const grants = validateGrants(actor, input.grants);
    return this.db.transaction(actor.tenantScope(), async (tx) => {
      const baseKey = slugify(input.name) || 'role';
      const existingKeys = await tx
        .select({ key: roles.key })
        .from(roles)
        .where(and(eq(roles.organizationId, actor.organizationId), sql`${roles.key} LIKE ${`${baseKey}%`}`));
      const taken = new Set(existingKeys.map((row) => row.key));
      let key = baseKey;
      for (let suffix = 2; taken.has(key); suffix++) key = `${baseKey}-${suffix}`;

      const [role] = await tx
        .insert(roles)
        .values({
          organizationId: actor.organizationId,
          key,
          name: input.name,
          description: input.description ?? null,
          isSystem: false,
        })
        .returning({ id: roles.id });
      if (!role) throw new Error('Role insert failed');
      await tx.insert(rolePermissions).values(
        grants.map((grant) => ({
          organizationId: actor.organizationId,
          roleId: role.id,
          permissionKey: grant.permission,
          scope: grant.scope,
        })),
      );
      await this.audit.record(tx, {
        organizationId: actor.organizationId,
        actor: actor.auditActor(),
        action: 'role.created',
        resourceType: 'role',
        resourceId: role.id,
        metadata: { name: input.name, grants },
      });
      return this.getRole(tx, actor.organizationId, role.id);
    });
  }

  async update(actor: Actor, roleId: string, input: UpdateRoleRequest): Promise<Role> {
    return this.db.transaction(actor.tenantScope(), async (tx) => {
      const role = await this.getRole(tx, actor.organizationId, roleId);
      if (role.isSystem) throw Errors.conflict('ROLE_SYSTEM_READONLY', 'Built-in roles are read-only');

      const changes = diffChanges(
        { name: role.name, description: role.description },
        {
          name: input.name ?? role.name,
          description: input.description === undefined ? role.description : input.description,
        },
      );
      if (changes) {
        await tx
          .update(roles)
          .set({
            name: input.name ?? role.name,
            description: input.description === undefined ? role.description : input.description,
          })
          .where(and(eq(roles.organizationId, actor.organizationId), eq(roles.id, roleId)));
      }

      let permissionChanges: Record<string, unknown> | null = null;
      if (input.grants) {
        const grants = validateGrants(actor, input.grants);
        const before = new Map<string, string>(role.grants.map((grant) => [grant.permission, grant.scope]));
        const after = new Map<string, string>(grants.map((grant) => [grant.permission, grant.scope]));
        const added = grants.filter((grant) => !before.has(grant.permission));
        const removed = role.grants.filter((grant) => !after.has(grant.permission));
        const rescoped = grants.filter(
          (grant) => before.has(grant.permission) && before.get(grant.permission) !== grant.scope,
        );
        if (added.length || removed.length || rescoped.length) {
          await tx
            .delete(rolePermissions)
            .where(and(eq(rolePermissions.organizationId, actor.organizationId), eq(rolePermissions.roleId, roleId)));
          await tx.insert(rolePermissions).values(
            grants.map((grant) => ({
              organizationId: actor.organizationId,
              roleId,
              permissionKey: grant.permission,
              scope: grant.scope,
            })),
          );
          await this.bumpMembersOfRole(tx, actor.organizationId, roleId);
          permissionChanges = { added, removed, rescoped };
        }
      }

      if (changes || permissionChanges) {
        await this.audit.record(tx, {
          organizationId: actor.organizationId,
          actor: actor.auditActor(),
          action: permissionChanges ? 'role.permissions_changed' : 'role.updated',
          resourceType: 'role',
          resourceId: roleId,
          changes,
          metadata: permissionChanges,
        });
      }
      return this.getRole(tx, actor.organizationId, roleId);
    });
  }

  async archive(actor: Actor, roleId: string): Promise<void> {
    await this.db.transaction(actor.tenantScope(), async (tx) => {
      const role = await this.getRole(tx, actor.organizationId, roleId);
      if (role.isSystem) throw Errors.conflict('ROLE_SYSTEM_READONLY', 'Built-in roles are read-only');
      if (role.memberCount > 0) throw Errors.conflict('ROLE_IN_USE', 'Role is assigned to members');
      await tx
        .update(roles)
        .set({ archivedAt: sql`now()` })
        .where(and(eq(roles.organizationId, actor.organizationId), eq(roles.id, roleId)));
      await this.audit.record(tx, {
        organizationId: actor.organizationId,
        actor: actor.auditActor(),
        action: 'role.archived',
        resourceType: 'role',
        resourceId: roleId,
      });
    });
  }

  /** Invalidates cached authorization of every member holding the role. */
  async bumpMembersOfRole(tx: Transaction, organizationId: string, roleId: string): Promise<void> {
    await tx
      .update(memberships)
      .set({ authzVersion: sql`${memberships.authzVersion} + 1` })
      .where(
        and(
          eq(memberships.organizationId, organizationId),
          inArray(
            memberships.id,
            tx
              .select({ id: membershipRoles.membershipId })
              .from(membershipRoles)
              .where(and(eq(membershipRoles.organizationId, organizationId), eq(membershipRoles.roleId, roleId))),
          ),
        ),
      );
  }

  async getRole(tx: Transaction, organizationId: string, roleId: string): Promise<Role> {
    const [role] = await this.loadRoles(tx, organizationId, roleId);
    if (!role) throw Errors.notFound('Role');
    return role;
  }

  private async loadRoles(tx: Transaction, organizationId: string, roleId?: string): Promise<Role[]> {
    const roleRows = await tx
      .select({
        id: roles.id,
        key: roles.key,
        name: roles.name,
        description: roles.description,
        isSystem: roles.isSystem,
        templateKey: roles.templateKey,
        createdAt: roles.createdAt,
        updatedAt: roles.updatedAt,
        memberCount: sql<number>`(
          SELECT count(*) FROM membership_roles mr
          JOIN memberships m ON m.id = mr.membership_id
          WHERE mr.organization_id = ${ref(roles.organizationId)} AND mr.role_id = ${ref(roles.id)}
            AND m.status <> 'suspended'
        )::int`,
      })
      .from(roles)
      .where(
        and(
          eq(roles.organizationId, organizationId),
          isNull(roles.archivedAt),
          roleId ? eq(roles.id, roleId) : undefined,
        ),
      )
      .orderBy(sql`${roles.isSystem} DESC`, asc(roles.name));
    if (roleRows.length === 0) return [];

    const grantRows = await tx
      .select({
        roleId: rolePermissions.roleId,
        permission: rolePermissions.permissionKey,
        scope: rolePermissions.scope,
      })
      .from(rolePermissions)
      .where(
        and(
          eq(rolePermissions.organizationId, organizationId),
          inArray(
            rolePermissions.roleId,
            roleRows.map((row) => row.id),
          ),
        ),
      );
    const grantsByRole = new Map<string, Grant[]>();
    for (const grant of grantRows) {
      const list = grantsByRole.get(grant.roleId) ?? [];
      list.push({ permission: grant.permission, scope: grant.scope });
      grantsByRole.set(grant.roleId, list);
    }
    const order = new Map(PERMISSION_KEYS.map((key, index) => [key as string, index]));
    return roleRows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      grants: (grantsByRole.get(row.id) ?? []).sort(
        (a, b) => (order.get(a.permission) ?? 0) - (order.get(b.permission) ?? 0),
      ),
    }));
  }
}
