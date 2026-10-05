import { Inject, Injectable } from '@nestjs/common';
import { SYSTEM_DB, type Database, type Transaction } from './types.js';

/**
 * Privileged database access (runs as `app_system`, explicit permissive RLS policies).
 *
 * Inject only where tenant context cannot exist yet or must span tenants: session validation,
 * login, invitation acceptance, password reset, platform provisioning, workers and webhooks.
 * Keep this list short — `grep SystemDatabase` is the audit trail of privileged access.
 */
@Injectable()
export class SystemDatabase {
  constructor(@Inject(SYSTEM_DB) readonly db: Database) {}

  transaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.db.transaction(fn);
  }
}
