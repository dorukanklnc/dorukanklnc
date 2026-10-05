import { Injectable } from '@nestjs/common';
import { isPermissionKey, isScope } from '@repo/authorization';
import type {
  InviteMemberRequest,
  Member,
  MemberListQuery,
  Paginated,
  UpdateMemberRequest,
} from '@repo/contracts';
import { and, asc, count, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import {
  branches,
  membershipBranches,
  membershipRoles,
  memberships,
  organizations,
  rolePermissions,
  roles,
  users,
} from '../../platform/database/schema/index.js';
import { SystemDatabase } from '../../platform/database/system-database.service.js';
import { TenantDatabase } from '../../platform/database/tenant-database.service.js';
import type { DbExecutor, Transaction } from '../../platform/database/types.js';
import { Errors } from '../../platform/errors/app-error.js';
import { AuditService } from '../audit/audit.service.js';
import { SessionService } from '../auth/session.service.js';
import type { Actor } from '../authorization/actor.js';
import { InvitationMailer } from '../organizations/invitation-mailer.js';
import { inviteMember, issueInvitation } from '../organizations/provisioning.js';
import { DomainEvents } from '../outbox/events.js';
import { OutboxService } from '../outbox/outbox.service.js';
import { assertNoEscalation } from '../roles/roles.service.js';

interface BranchAccess {
  allBranches: boolean;
  branchIds: readonly string[];
}

@Injectable()
export class MembersService {
  constructor(
    private readonly db: TenantDatabase,
    private readonly systemDb: SystemDatabase,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly mailer: InvitationMailer,
  ) {}

  // ── Queries ───────────────────────────────────────────────────────────────────────────

  async list(actor: Actor, query: MemberListQuery): Promise<Paginated<Member>> {
    return this.db.transaction(actor.tenantScope(), async (tx) => {
      const conditions = [eq(memberships.organizationId, actor.organizationId)];
      const branchesInScope = actor.branchesFor('settings.users.read');
      if (branchesInScope !== '*') {
        conditions.push(
          branchesInScope.length === 0
            ? sql`false`
            : sql`(${memberships.allBranches} OR EXISTS (
                SELECT 1 FROM membership_branches mb
                WHERE mb.organization_id = ${memberships.organizationId}
                  AND mb.membership_id = ${memberships.id}
                  AND mb.branch_id IN (${sql.join(
                    branchesInScope.map((id) => sql`${id}::uuid`),
                    sql`, `,
                  )})))`,
        );
      }
      if (query.status) conditions.push(eq(memberships.status, query.status));
      if (query.q) {
        conditions.push(
          sql`app.search_normalize(${users.fullName} || ' ' || ${users.email}) LIKE '%' || app.search_normalize(${query.q}) || '%'`,
        );
      }
      if (query.roleId) {
        conditions.push(
          sql`EXISTS (SELECT 1 FROM membership_roles mr WHERE mr.membership_id = ${memberships.id} AND mr.role_id = ${query.roleId})`,
        );
      }
      if (query.branchId) {
        conditions.push(
          sql`(${memberships.allBranches} OR EXISTS (SELECT 1 FROM membership_branches mb WHERE mb.membership_id = ${memberships.id} AND mb.branch_id = ${query.branchId}))`,
        );
      }
      const where = and(...conditions);

      const [total] = await tx
        .select({ value: count() })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(where);
      const rows = await tx
        .select({
          id: memberships.id,
          userId: memberships.userId,
          fullName: users.fullName,
          email: users.email,
          status: memberships.status,
          title: memberships.title,
          allBranches: memberships.allBranches,
          lastLoginAt: users.lastLoginAt,
          invitedAt: memberships.invitedAt,
          joinedAt: memberships.joinedAt,
        })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(where)
        .orderBy(asc(users.fullName))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize);

      const details = await this.loadRolesAndBranches(
        tx,
        actor.organizationId,
        rows.map((row) => row.id),
      );
      return {
        items: rows.map((row) => ({
          ...row,
          lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
          invitedAt: row.invitedAt?.toISOString() ?? null,
          joinedAt: row.joinedAt?.toISOString() ?? null,
          roles: (details.roles.get(row.id) ?? []).map(({ id, key, name }) => ({ id, key, name })),
          branches: details.branches.get(row.id) ?? [],
        })),
        page: query.page,
        pageSize: query.pageSize,
        total: total?.value ?? 0,
      };
    });
  }

  // ── Commands ──────────────────────────────────────────────────────────────────────────

  /**
   * Invites a member. Creating or finding the global identity requires the system role; every
   * organization-scoped lookup below filters explicitly by the actor's organization.
   */
  async invite(actor: Actor, input: InviteMemberRequest): Promise<Member> {
    const organizationId = actor.organizationId;
    this.assertBranchAssignmentAllowed(actor, input);

    const result = await this.systemDb.transaction(async (tx) => {
      await this.assertRolesGrantable(tx, actor, input.roleIds);
      await this.assertBranchesExist(tx, organizationId, input);

      const [existing] = await tx
        .select({ id: memberships.id })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(and(eq(memberships.organizationId, organizationId), eq(users.email, input.email)))
        .limit(1);
      if (existing) throw Errors.conflict('MEMBER_ALREADY_EXISTS', 'This person is already a member');

      const invited = await inviteMember(tx, {
        organizationId,
        email: input.email,
        fullName: input.fullName,
        title: input.title ?? null,
        roleIds: input.roleIds,
        allBranches: input.allBranches,
        branchIds: input.allBranches ? [] : input.branchIds,
        invitedByMembershipId: actor.membershipId,
      });
      await this.audit.record(tx, {
        organizationId,
        actor: actor.auditActor(),
        action: 'member.invited',
        resourceType: 'membership',
        resourceId: invited.membershipId,
        metadata: {
          roleIds: input.roleIds,
          allBranches: input.allBranches,
          branchIds: input.allBranches ? [] : input.branchIds,
        },
      });
      await this.outbox.publish(tx, {
        organizationId,
        aggregateType: 'membership',
        aggregateId: invited.membershipId,
        eventType: DomainEvents.memberInvited,
        payload: { membershipId: invited.membershipId, userId: invited.userId },
        actorUserId: actor.userId,
      });
      const [organization] = await tx
        .select({ name: organizations.name, locale: organizations.locale })
        .from(organizations)
        .where(eq(organizations.id, organizationId));
      return { invited, organization };
    });

    await this.mailer.send({
      email: input.email,
      inviteeName: input.fullName,
      organizationName: result.organization?.name ?? '',
      inviterName: actor.user.fullName,
      token: result.invited.token,
      locale: result.organization?.locale ?? null,
    });
    return this.get(actor, result.invited.membershipId);
  }

  async get(actor: Actor, membershipId: string): Promise<Member> {
    const page = await this.db.transaction(actor.tenantScope(), async (tx) => {
      const [row] = await tx
        .select({
          id: memberships.id,
          userId: memberships.userId,
          fullName: users.fullName,
          email: users.email,
          status: memberships.status,
          title: memberships.title,
          allBranches: memberships.allBranches,
          lastLoginAt: users.lastLoginAt,
          invitedAt: memberships.invitedAt,
          joinedAt: memberships.joinedAt,
        })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(and(eq(memberships.organizationId, actor.organizationId), eq(memberships.id, membershipId)))
        .limit(1);
      if (!row) throw Errors.notFound('Member');
      const details = await this.loadRolesAndBranches(tx, actor.organizationId, [row.id]);
      return {
        ...row,
        lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
        invitedAt: row.invitedAt?.toISOString() ?? null,
        joinedAt: row.joinedAt?.toISOString() ?? null,
        roles: (details.roles.get(row.id) ?? []).map(({ id, key, name }) => ({ id, key, name })),
        branches: details.branches.get(row.id) ?? [],
      };
    });
    return page;
  }

  async update(actor: Actor, membershipId: string, input: UpdateMemberRequest): Promise<Member> {
    await this.db.transaction(actor.tenantScope(), async (tx) => {
      const target = await this.loadTarget(tx, actor, membershipId);
      const isSelf = membershipId === actor.membershipId;
      const changesAccess =
        input.roleIds !== undefined || input.allBranches !== undefined || input.branchIds !== undefined;
      if (isSelf && changesAccess) {
        throw Errors.conflict('MEMBER_SELF_ACTION', 'You cannot change your own access');
      }
      this.assertCanManage(actor, target);

      const nextAccess: BranchAccess = {
        allBranches: input.allBranches ?? target.allBranches,
        branchIds: input.branchIds ?? target.branchIds,
      };
      const audit: Record<string, { before: unknown; after: unknown }> = {};

      if (input.allBranches !== undefined || input.branchIds !== undefined) {
        this.assertBranchAssignmentAllowed(actor, nextAccess);
        await this.assertBranchesExist(tx, actor.organizationId, nextAccess);
        await tx
          .delete(membershipBranches)
          .where(
            and(
              eq(membershipBranches.organizationId, actor.organizationId),
              eq(membershipBranches.membershipId, membershipId),
            ),
          );
        if (!nextAccess.allBranches && nextAccess.branchIds.length > 0) {
          await tx.insert(membershipBranches).values(
            nextAccess.branchIds.map((branchId) => ({
              organizationId: actor.organizationId,
              membershipId,
              branchId,
            })),
          );
        }
        audit.branchAccess = {
          before: { allBranches: target.allBranches, branchIds: target.branchIds },
          after: {
            allBranches: nextAccess.allBranches,
            branchIds: nextAccess.allBranches ? [] : nextAccess.branchIds,
          },
        };
      }

      if (input.roleIds !== undefined) {
        await this.assertRolesGrantable(tx, actor, input.roleIds);
        const removesOwner =
          target.roleKeys.includes('owner') && !(await this.rolesIncludeOwner(tx, actor, input.roleIds));
        if (removesOwner) await this.assertNotLastOwner(tx, actor.organizationId, membershipId);
        await tx
          .delete(membershipRoles)
          .where(
            and(
              eq(membershipRoles.organizationId, actor.organizationId),
              eq(membershipRoles.membershipId, membershipId),
            ),
          );
        await tx.insert(membershipRoles).values(
          input.roleIds.map((roleId) => ({
            organizationId: actor.organizationId,
            membershipId,
            roleId,
            assignedByMembershipId: actor.membershipId,
          })),
        );
        audit.roleIds = { before: target.roleIds, after: input.roleIds };
      }

      if (input.title !== undefined && input.title !== target.title) {
        audit.title = { before: target.title, after: input.title };
      }

      if (Object.keys(audit).length === 0) return;
      await tx
        .update(memberships)
        .set({
          allBranches: nextAccess.allBranches,
          ...(input.title !== undefined ? { title: input.title } : {}),
          authzVersion: sql`${memberships.authzVersion} + 1`,
        })
        .where(and(eq(memberships.organizationId, actor.organizationId), eq(memberships.id, membershipId)));
      await this.audit.record(tx, {
        organizationId: actor.organizationId,
        actor: actor.auditActor(),
        action: audit.roleIds ? 'member.roles_changed' : 'member.updated',
        resourceType: 'membership',
        resourceId: membershipId,
        changes: audit,
      });
    });
    return this.get(actor, membershipId);
  }

  async suspend(actor: Actor, membershipId: string): Promise<Member> {
    if (membershipId === actor.membershipId) {
      throw Errors.conflict('MEMBER_SELF_ACTION', 'You cannot suspend yourself');
    }
    await this.db.transaction(actor.tenantScope(), async (tx) => {
      const target = await this.loadTarget(tx, actor, membershipId);
      this.assertCanManage(actor, target);
      if (target.status === 'suspended') return;
      if (target.roleKeys.includes('owner')) {
        await this.assertNotLastOwner(tx, actor.organizationId, membershipId);
      }
      await tx
        .update(memberships)
        .set({
          status: 'suspended',
          suspendedAt: sql`now()`,
          authzVersion: sql`${memberships.authzVersion} + 1`,
        })
        .where(and(eq(memberships.organizationId, actor.organizationId), eq(memberships.id, membershipId)));
      await this.audit.record(tx, {
        organizationId: actor.organizationId,
        actor: actor.auditActor(),
        action: 'member.suspended',
        resourceType: 'membership',
        resourceId: membershipId,
        changes: { status: { before: target.status, after: 'suspended' } },
      });
    });
    // The suspended membership no longer resolves (authz context requires status = active);
    // revoking its sessions is cleanup that also ends active browser sessions immediately.
    await this.sessions.revokeForMembership(membershipId, 'membership_suspended');
    return this.get(actor, membershipId);
  }

  async reactivate(actor: Actor, membershipId: string): Promise<Member> {
    await this.db.transaction(actor.tenantScope(), async (tx) => {
      const target = await this.loadTarget(tx, actor, membershipId);
      this.assertCanManage(actor, target);
      if (target.status !== 'suspended') return;
      const nextStatus = target.joinedAt ? 'active' : 'invited';
      await tx
        .update(memberships)
        .set({
          status: nextStatus,
          suspendedAt: null,
          authzVersion: sql`${memberships.authzVersion} + 1`,
        })
        .where(and(eq(memberships.organizationId, actor.organizationId), eq(memberships.id, membershipId)));
      await this.audit.record(tx, {
        organizationId: actor.organizationId,
        actor: actor.auditActor(),
        action: 'member.reactivated',
        resourceType: 'membership',
        resourceId: membershipId,
        changes: { status: { before: 'suspended', after: nextStatus } },
      });
    });
    return this.get(actor, membershipId);
  }

  async resendInvitation(actor: Actor, membershipId: string): Promise<void> {
    const sent = await this.db.transaction(actor.tenantScope(), async (tx) => {
      const target = await this.loadTarget(tx, actor, membershipId);
      this.assertCanManage(actor, target);
      if (target.status !== 'invited') {
        throw Errors.conflict('CONFLICT', 'Only pending invitations can be resent');
      }
      const issued = await issueInvitation(tx, {
        organizationId: actor.organizationId,
        membershipId,
        email: target.email,
        invitedByMembershipId: actor.membershipId,
      });
      await this.audit.record(tx, {
        organizationId: actor.organizationId,
        actor: actor.auditActor(),
        action: 'member.invitation_resent',
        resourceType: 'membership',
        resourceId: membershipId,
      });
      return { issued, target };
    });
    await this.mailer.send({
      email: sent.target.email,
      inviteeName: sent.target.fullName,
      organizationName: actor.tenant().organization.name,
      inviterName: actor.user.fullName,
      token: sent.issued.token,
      locale: actor.tenant().organization.locale,
    });
  }

  // ── Rules ─────────────────────────────────────────────────────────────────────────────

  /** Branch-scoped administrators manage only members fully inside their own branches. */
  private assertCanManage(actor: Actor, target: BranchAccess): void {
    const branchesInScope = actor.branchesFor('settings.users.manage');
    if (branchesInScope === '*') return;
    const allowed = new Set(branchesInScope);
    if (target.allBranches || target.branchIds.length === 0 || !target.branchIds.every((id) => allowed.has(id))) {
      throw Errors.forbidden('This member is outside your branches');
    }
  }

  private assertBranchAssignmentAllowed(actor: Actor, access: BranchAccess): void {
    const branchesInScope = actor.branchesFor('settings.users.manage');
    if (branchesInScope === '*') return;
    if (access.allBranches) {
      throw Errors.unprocessable('BRANCH_NOT_ALLOWED', 'Only organization-wide admins can grant all branches');
    }
    const allowed = new Set(branchesInScope);
    if (!access.branchIds.every((id) => allowed.has(id))) {
      throw Errors.unprocessable('BRANCH_NOT_ALLOWED', 'Branch is outside your access');
    }
  }

  private async assertBranchesExist(
    db: DbExecutor,
    organizationId: string,
    access: BranchAccess,
  ): Promise<void> {
    if (access.allBranches || access.branchIds.length === 0) return;
    const unique = [...new Set(access.branchIds)];
    const found = await db
      .select({ id: branches.id })
      .from(branches)
      .where(
        and(
          eq(branches.organizationId, organizationId),
          inArray(branches.id, unique),
          eq(branches.status, 'active'),
        ),
      );
    if (found.length !== unique.length) {
      throw Errors.unprocessable('BRANCH_NOT_ALLOWED', 'Unknown or inactive branch');
    }
  }

  private async assertRolesGrantable(db: DbExecutor, actor: Actor, roleIds: readonly string[]): Promise<void> {
    const unique = [...new Set(roleIds)];
    const roleRows = await db
      .select({ id: roles.id })
      .from(roles)
      .where(and(eq(roles.organizationId, actor.organizationId), inArray(roles.id, unique), isNull(roles.archivedAt)));
    if (roleRows.length !== unique.length) {
      throw Errors.validation([{ path: 'roleIds', code: 'unknown_role', message: 'Unknown role' }]);
    }
    const grants = await db
      .select({ permission: rolePermissions.permissionKey, scope: rolePermissions.scope })
      .from(rolePermissions)
      .where(and(eq(rolePermissions.organizationId, actor.organizationId), inArray(rolePermissions.roleId, unique)));
    assertNoEscalation(
      actor,
      grants.flatMap((grant) =>
        isPermissionKey(grant.permission) && isScope(grant.scope)
          ? [{ permission: grant.permission, scope: grant.scope }]
          : [],
      ),
    );
  }

  private async rolesIncludeOwner(db: DbExecutor, actor: Actor, roleIds: readonly string[]): Promise<boolean> {
    if (roleIds.length === 0) return false;
    const [row] = await db
      .select({ value: count() })
      .from(roles)
      .where(
        and(
          eq(roles.organizationId, actor.organizationId),
          inArray(roles.id, [...roleIds]),
          eq(roles.templateKey, 'owner'),
          eq(roles.isSystem, true),
        ),
      );
    return (row?.value ?? 0) > 0;
  }

  /** An organization always keeps at least one active owner. */
  private async assertNotLastOwner(db: DbExecutor, organizationId: string, membershipId: string): Promise<void> {
    const [row] = await db
      .select({ value: count() })
      .from(membershipRoles)
      .innerJoin(roles, eq(roles.id, membershipRoles.roleId))
      .innerJoin(memberships, eq(memberships.id, membershipRoles.membershipId))
      .where(
        and(
          eq(membershipRoles.organizationId, organizationId),
          eq(roles.templateKey, 'owner'),
          eq(roles.isSystem, true),
          eq(memberships.status, 'active'),
          ne(memberships.id, membershipId),
        ),
      );
    if ((row?.value ?? 0) === 0) {
      throw Errors.conflict('LAST_OWNER', 'The organization must keep at least one owner');
    }
  }

  private async loadTarget(tx: Transaction, actor: Actor, membershipId: string) {
    const [row] = await tx
      .select({
        id: memberships.id,
        status: memberships.status,
        title: memberships.title,
        allBranches: memberships.allBranches,
        joinedAt: memberships.joinedAt,
        email: users.email,
        fullName: users.fullName,
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.organizationId, actor.organizationId), eq(memberships.id, membershipId)))
      .for('update', { of: memberships })
      .limit(1);
    if (!row) throw Errors.notFound('Member');
    const details = await this.loadRolesAndBranches(tx, actor.organizationId, [membershipId]);
    const memberRoles = details.roles.get(membershipId) ?? [];
    return {
      ...row,
      roleIds: memberRoles.map((role) => role.id),
      roleKeys: memberRoles.filter((role) => role.isSystem).map((role) => role.key),
      branchIds: (details.branches.get(membershipId) ?? []).map((branch) => branch.id),
    };
  }

  private async loadRolesAndBranches(db: DbExecutor, organizationId: string, membershipIds: string[]) {
    const rolesByMember = new Map<string, { id: string; key: string; name: string; isSystem: boolean }[]>();
    const branchesByMember = new Map<string, { id: string; name: string }[]>();
    if (membershipIds.length === 0) return { roles: rolesByMember, branches: branchesByMember };

    const [roleRows, branchRows] = await Promise.all([
      db
        .select({
          membershipId: membershipRoles.membershipId,
          id: roles.id,
          key: roles.key,
          name: roles.name,
          isSystem: roles.isSystem,
        })
        .from(membershipRoles)
        .innerJoin(roles, eq(roles.id, membershipRoles.roleId))
        .where(
          and(
            eq(membershipRoles.organizationId, organizationId),
            inArray(membershipRoles.membershipId, membershipIds),
          ),
        )
        .orderBy(asc(roles.name)),
      db
        .select({ membershipId: membershipBranches.membershipId, id: branches.id, name: branches.name })
        .from(membershipBranches)
        .innerJoin(branches, eq(branches.id, membershipBranches.branchId))
        .where(
          and(
            eq(membershipBranches.organizationId, organizationId),
            inArray(membershipBranches.membershipId, membershipIds),
          ),
        )
        .orderBy(asc(branches.name)),
    ]);
    for (const { membershipId, ...role } of roleRows) {
      rolesByMember.set(membershipId, [...(rolesByMember.get(membershipId) ?? []), role]);
    }
    for (const { membershipId, ...branch } of branchRows) {
      branchesByMember.set(membershipId, [...(branchesByMember.get(membershipId) ?? []), branch]);
    }
    return { roles: rolesByMember, branches: branchesByMember };
  }
}
