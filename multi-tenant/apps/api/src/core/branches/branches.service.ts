import { Injectable } from '@nestjs/common';
import type { Branch, CreateBranchRequest, UpdateBranchRequest } from '@repo/contracts';
import { and, asc, eq, sql } from 'drizzle-orm';
import { branches } from '../../platform/database/schema/index.js';
import { ref } from '../../platform/database/sql.js';
import { TenantDatabase } from '../../platform/database/tenant-database.service.js';
import { Errors } from '../../platform/errors/app-error.js';
import { AuditService, createdChanges, diffChanges } from '../audit/audit.service.js';
import type { Actor } from '../authorization/actor.js';

const branchColumns = {
  id: branches.id,
  code: branches.code,
  name: branches.name,
  status: branches.status,
  city: branches.city,
  district: branches.district,
  address: branches.address,
  phone: branches.phone,
  email: branches.email,
  isHeadquarters: branches.isHeadquarters,
  createdAt: branches.createdAt,
  studentCount: sql<number>`(SELECT count(*) FROM students s WHERE s.organization_id = ${ref(branches.organizationId)} AND s.branch_id = ${ref(branches.id)} AND s.archived_at IS NULL AND s.status = 'active')::int`,
  memberCount: sql<number>`(SELECT count(*) FROM membership_branches mb JOIN memberships m ON m.id = mb.membership_id WHERE mb.organization_id = ${ref(branches.organizationId)} AND mb.branch_id = ${ref(branches.id)} AND m.status = 'active')::int`,
};

type BranchRow = { createdAt: Date } & Omit<Branch, 'createdAt'>;

function toBranch(row: BranchRow): Branch {
  return { ...row, createdAt: row.createdAt.toISOString() };
}

@Injectable()
export class BranchesService {
  constructor(
    private readonly db: TenantDatabase,
    private readonly audit: AuditService,
  ) {}

  /** Branches within the caller's branch boundary (RLS) — used for selectors and settings. */
  async list(actor: Actor): Promise<Branch[]> {
    return this.db.transaction(actor.tenantScope(), async (tx) => {
      const rows = await tx
        .select(branchColumns)
        .from(branches)
        .where(eq(branches.organizationId, actor.organizationId))
        .orderBy(asc(branches.name));
      return rows.map(toBranch);
    });
  }

  async create(actor: Actor, input: CreateBranchRequest): Promise<Branch> {
    return this.db.transaction(actor.tenantScope(), async (tx) => {
      const [created] = await tx
        .insert(branches)
        .values({
          organizationId: actor.organizationId,
          code: input.code,
          name: input.name,
          city: input.city ?? null,
          district: input.district ?? null,
          address: input.address ?? null,
          phone: input.phone ?? null,
          email: input.email ?? null,
        })
        .returning({ id: branches.id });
      if (!created) throw new Error('Branch insert failed');
      await this.audit.record(tx, {
        organizationId: actor.organizationId,
        branchId: created.id,
        actor: actor.auditActor(),
        action: 'branch.created',
        resourceType: 'branch',
        resourceId: created.id,
        changes: createdChanges({ code: input.code, name: input.name }),
      });
      return this.get(tx, actor, created.id);
    });
  }

  async update(actor: Actor, branchId: string, input: UpdateBranchRequest): Promise<Branch> {
    return this.db.transaction(actor.tenantScope(), async (tx) => {
      const [before] = await tx
        .select({
          name: branches.name,
          city: branches.city,
          district: branches.district,
          address: branches.address,
          phone: branches.phone,
          email: branches.email,
          status: branches.status,
          isHeadquarters: branches.isHeadquarters,
        })
        .from(branches)
        .where(and(eq(branches.organizationId, actor.organizationId), eq(branches.id, branchId)))
        .for('update');
      if (!before) throw Errors.notFound('Branch');
      if (input.status === 'inactive' && before.isHeadquarters) {
        throw Errors.unprocessable('VALIDATION_FAILED', 'The headquarters branch cannot be deactivated');
      }
      const after = {
        name: input.name ?? before.name,
        city: input.city === undefined ? before.city : input.city,
        district: input.district === undefined ? before.district : input.district,
        address: input.address === undefined ? before.address : input.address,
        phone: input.phone === undefined ? before.phone : input.phone,
        email: input.email === undefined ? before.email : input.email,
        status: input.status ?? before.status,
      };
      const { isHeadquarters: _hq, ...comparable } = before;
      const changes = diffChanges(comparable, after);
      if (changes) {
        await tx.update(branches).set(after).where(eq(branches.id, branchId));
        await this.audit.record(tx, {
          organizationId: actor.organizationId,
          branchId,
          actor: actor.auditActor(),
          action: 'branch.updated',
          resourceType: 'branch',
          resourceId: branchId,
          changes,
        });
      }
      return this.get(tx, actor, branchId);
    });
  }

  private async get(
    tx: Parameters<Parameters<TenantDatabase['transaction']>[1]>[0],
    actor: Actor,
    branchId: string,
  ): Promise<Branch> {
    const [row] = await tx
      .select(branchColumns)
      .from(branches)
      .where(and(eq(branches.organizationId, actor.organizationId), eq(branches.id, branchId)))
      .limit(1);
    if (!row) throw Errors.notFound('Branch');
    return toBranch(row);
  }
}
