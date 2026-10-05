import { Injectable } from '@nestjs/common';
import type { AuditLogItem, AuditLogQuery, Paginated } from '@repo/contracts';
import { and, count, desc, eq, gte, lt, sql } from 'drizzle-orm';
import { auditLogs, branches, users } from '../../platform/database/schema/index.js';
import { TenantDatabase } from '../../platform/database/tenant-database.service.js';
import type { Actor } from '../authorization/actor.js';
import { branchPredicate } from '../authorization/scope-filters.js';

@Injectable()
export class AuditLogService {
  constructor(private readonly db: TenantDatabase) {}

  async list(actor: Actor, query: AuditLogQuery): Promise<Paginated<AuditLogItem>> {
    return this.db.transaction(actor.tenantScope(), async (tx) => {
      const branchScope = branchPredicate(actor, 'audit.read', auditLogs.branchId);
      const conditions = [
        eq(auditLogs.organizationId, actor.organizationId),
        // Branch-scoped readers see branch events of their branches and organization-level events.
        branchScope ? sql`(${auditLogs.branchId} IS NULL OR ${branchScope})` : undefined,
        query.action ? sql`${auditLogs.action} LIKE ${`${query.action}%`}` : undefined,
        query.resourceType ? eq(auditLogs.resourceType, query.resourceType) : undefined,
        query.resourceId ? eq(auditLogs.resourceId, query.resourceId) : undefined,
        query.actorUserId ? eq(auditLogs.actorUserId, query.actorUserId) : undefined,
        query.from ? gte(auditLogs.occurredAt, sql`${query.from}::date`) : undefined,
        query.to ? lt(auditLogs.occurredAt, sql`${query.to}::date + 1`) : undefined,
      ];
      const where = and(...conditions);
      const [total] = await tx.select({ value: count() }).from(auditLogs).where(where);
      const rows = await tx
        .select({
          id: auditLogs.id,
          occurredAt: auditLogs.occurredAt,
          action: auditLogs.action,
          resourceType: auditLogs.resourceType,
          resourceId: auditLogs.resourceId,
          actorType: auditLogs.actorType,
          actorUserId: auditLogs.actorUserId,
          actorName: users.fullName,
          branchId: auditLogs.branchId,
          branchName: branches.name,
          changes: auditLogs.changes,
          metadata: auditLogs.metadata,
          requestId: auditLogs.requestId,
        })
        .from(auditLogs)
        .leftJoin(users, eq(users.id, auditLogs.actorUserId))
        .leftJoin(branches, eq(branches.id, auditLogs.branchId))
        .where(where)
        .orderBy(desc(auditLogs.occurredAt))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize);
      return {
        items: rows.map((row) => ({
          id: row.id,
          occurredAt: row.occurredAt.toISOString(),
          action: row.action,
          resourceType: row.resourceType,
          resourceId: row.resourceId,
          actor: { type: row.actorType, userId: row.actorUserId, name: row.actorName },
          branch: row.branchId && row.branchName ? { id: row.branchId, name: row.branchName } : null,
          changes: row.changes,
          metadata: row.metadata,
          requestId: row.requestId,
        })),
        page: query.page,
        pageSize: query.pageSize,
        total: total?.value ?? 0,
      };
    });
  }
}
