import { AsyncLocalStorage } from 'node:async_hooks';
import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { isUuid } from '../ids.js';
import { RUNTIME_DB, type Database, type TenantScope, type Transaction } from './types.js';

interface ActiveTenantTransaction {
  tx: Transaction;
  organizationId: string;
}

const activeTransaction = new AsyncLocalStorage<ActiveTenantTransaction>();

export function serializeBranchBoundary(boundary: TenantScope['branchBoundary']): string {
  if (boundary === '*') return '*';
  for (const id of boundary) {
    if (!isUuid(id)) throw new Error('Invalid branch id in tenant scope');
  }
  return boundary.join(',');
}

/**
 * Entry point for all tenant data access (runs as `app_runtime`, subject to RLS).
 *
 * Every call opens a transaction and sets the transaction-local tenant variables before running
 * the callback. Nested calls inside the callback reuse the same transaction, so services compose
 * into one atomic unit (domain change + audit record + outbox event).
 */
@Injectable()
export class TenantDatabase {
  constructor(@Inject(RUNTIME_DB) private readonly db: Database) {}

  async transaction<T>(scope: TenantScope, fn: (tx: Transaction) => Promise<T>): Promise<T> {
    const current = activeTransaction.getStore();
    if (current) {
      if (current.organizationId !== scope.organizationId) {
        throw new Error('Nested tenant transaction for a different organization');
      }
      return fn(current.tx);
    }
    return this.db.transaction(async (tx) => {
      await applyTenantScope(tx, scope);
      return activeTransaction.run({ tx, organizationId: scope.organizationId }, () => fn(tx));
    });
  }
}

export async function applyTenantScope(tx: Transaction, scope: TenantScope): Promise<void> {
  if (!isUuid(scope.organizationId)) throw new Error('Invalid organization id in tenant scope');
  if (scope.userId !== null && !isUuid(scope.userId)) throw new Error('Invalid user id in scope');
  await tx.execute(sql`
    SELECT set_config('app.org_id', ${scope.organizationId}, true),
           set_config('app.user_id', ${scope.userId ?? ''}, true),
           set_config('app.branch_ids', ${serializeBranchBoundary(scope.branchBoundary)}, true)
  `);
}
