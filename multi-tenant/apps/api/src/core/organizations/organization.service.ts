import { Injectable } from '@nestjs/common';
import { MODULE_KEYS, isModuleKey } from '@repo/authorization';
import type { Organization, UpdateOrganizationRequest } from '@repo/contracts';
import { eq } from 'drizzle-orm';
import { organizationModules, organizations } from '../../platform/database/schema/index.js';
import { TenantDatabase } from '../../platform/database/tenant-database.service.js';
import { Errors } from '../../platform/errors/app-error.js';
import { AuditService, diffChanges } from '../audit/audit.service.js';
import type { Actor } from '../authorization/actor.js';

@Injectable()
export class OrganizationService {
  constructor(
    private readonly db: TenantDatabase,
    private readonly audit: AuditService,
  ) {}

  async current(actor: Actor): Promise<Organization> {
    return this.db.transaction(actor.tenantScope(), async (tx) => {
      const [organization] = await tx
        .select()
        .from(organizations)
        .where(eq(organizations.id, actor.organizationId))
        .limit(1);
      if (!organization) throw Errors.notFound('Organization');
      const modules = await tx
        .select({ key: organizationModules.moduleKey, enabled: organizationModules.enabled })
        .from(organizationModules)
        .where(eq(organizationModules.organizationId, actor.organizationId));
      const enabledByKey = new Map(modules.map((module) => [module.key, module.enabled]));
      return {
        id: organization.id,
        name: organization.name,
        legalName: organization.legalName,
        slug: organization.slug,
        status: organization.status,
        planKey: organization.planKey,
        locale: organization.locale,
        timezone: organization.timezone,
        defaultCurrency: organization.defaultCurrency,
        modules: MODULE_KEYS.filter(isModuleKey).map((key) => ({
          key,
          enabled: actor.enabledModules.has(key) || enabledByKey.get(key) === true,
        })),
        createdAt: organization.createdAt.toISOString(),
      };
    });
  }

  async update(actor: Actor, input: UpdateOrganizationRequest): Promise<Organization> {
    await this.db.transaction(actor.tenantScope(), async (tx) => {
      const [before] = await tx
        .select({
          name: organizations.name,
          legalName: organizations.legalName,
          timezone: organizations.timezone,
        })
        .from(organizations)
        .where(eq(organizations.id, actor.organizationId))
        .for('update');
      if (!before) throw Errors.notFound('Organization');
      const after = {
        name: input.name ?? before.name,
        legalName: input.legalName === undefined ? before.legalName : input.legalName,
        timezone: input.timezone ?? before.timezone,
      };
      const changes = diffChanges(before, after);
      if (!changes) return;
      await tx.update(organizations).set(after).where(eq(organizations.id, actor.organizationId));
      await this.audit.record(tx, {
        organizationId: actor.organizationId,
        actor: actor.auditActor(),
        action: 'organization.updated',
        resourceType: 'organization',
        resourceId: actor.organizationId,
        changes,
      });
    });
    return this.current(actor);
  }
}
