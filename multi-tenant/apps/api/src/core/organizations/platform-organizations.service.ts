import { Injectable } from '@nestjs/common';
import type { CreateOrganizationRequest, PlatformOrganization } from '@repo/contracts';
import { desc, sql } from 'drizzle-orm';
import { organizations } from '../../platform/database/schema/index.js';
import { ref } from '../../platform/database/sql.js';
import { SystemDatabase } from '../../platform/database/system-database.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { Actor } from '../authorization/actor.js';
import { DomainEvents } from '../outbox/events.js';
import { OutboxService } from '../outbox/outbox.service.js';
import { InvitationMailer } from './invitation-mailer.js';
import { inviteMember, provisionOrganization } from './provisioning.js';

/**
 * Platform console operations (platform staff only). Cross-tenant by nature → system role.
 */
@Injectable()
export class PlatformOrganizationsService {
  constructor(
    private readonly systemDb: SystemDatabase,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly mailer: InvitationMailer,
  ) {}

  async list(): Promise<PlatformOrganization[]> {
    const rows = await this.systemDb.db
      .select({
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        status: organizations.status,
        planKey: organizations.planKey,
        createdAt: organizations.createdAt,
        branchCount: sql<number>`(SELECT count(*) FROM branches b WHERE b.organization_id = ${ref(organizations.id)})::int`,
        memberCount: sql<number>`(SELECT count(*) FROM memberships m WHERE m.organization_id = ${ref(organizations.id)} AND m.status = 'active')::int`,
        studentCount: sql<number>`(SELECT count(*) FROM students s WHERE s.organization_id = ${ref(organizations.id)} AND s.archived_at IS NULL)::int`,
      })
      .from(organizations)
      .orderBy(desc(organizations.createdAt));
    return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
  }

  /** Flow 1: create the tenant, its first branch and invite the first administrator (owner). */
  async create(actor: Actor, input: CreateOrganizationRequest) {
    const result = await this.systemDb.transaction(async (tx) => {
      const provisioned = await provisionOrganization(tx, {
        name: input.name,
        slug: input.slug,
        legalName: input.legalName,
        timezone: input.timezone,
        defaultCurrency: input.defaultCurrency,
        planKey: input.planKey,
        firstBranch: input.firstBranch,
      });
      const invited = await inviteMember(tx, {
        organizationId: provisioned.organizationId,
        email: input.administrator.email,
        fullName: input.administrator.fullName,
        title: null,
        roleIds: [provisioned.roleIds.owner],
        allBranches: true,
        branchIds: [],
        invitedByMembershipId: null,
      });
      const actorFields = { type: 'user' as const, userId: actor.userId };
      await this.audit.record(tx, {
        organizationId: provisioned.organizationId,
        actor: actorFields,
        action: 'organization.created',
        resourceType: 'organization',
        resourceId: provisioned.organizationId,
        metadata: { slug: input.slug, planKey: input.planKey, platformAction: true },
      });
      await this.audit.record(tx, {
        organizationId: provisioned.organizationId,
        actor: actorFields,
        action: 'member.invited',
        resourceType: 'membership',
        resourceId: invited.membershipId,
        metadata: { role: 'owner', platformAction: true },
      });
      await this.outbox.publishMany(tx, [
        {
          organizationId: provisioned.organizationId,
          aggregateType: 'organization',
          aggregateId: provisioned.organizationId,
          eventType: DomainEvents.organizationCreated,
          payload: { organizationId: provisioned.organizationId, planKey: input.planKey },
          actorUserId: actor.userId,
        },
        {
          organizationId: provisioned.organizationId,
          aggregateType: 'membership',
          aggregateId: invited.membershipId,
          eventType: DomainEvents.memberInvited,
          payload: { membershipId: invited.membershipId, userId: invited.userId },
          actorUserId: actor.userId,
        },
      ]);
      return { provisioned, invited };
    });

    await this.mailer.send({
      email: input.administrator.email,
      inviteeName: input.administrator.fullName,
      organizationName: input.name,
      inviterName: actor.user.fullName,
      token: result.invited.token,
    });

    return {
      organizationId: result.provisioned.organizationId,
      branchId: result.provisioned.branchId,
      administratorMembershipId: result.invited.membershipId,
      invitationExpiresAt: result.invited.expiresAt.toISOString(),
    };
  }
}
