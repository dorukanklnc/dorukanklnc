import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type * as schema from './schema/index.js';

export type Database = NodePgDatabase<typeof schema>;
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
/** Anything queries can run on: the pool-backed database or an open transaction. */
export type DbExecutor = Database | Transaction;

/** Tenant context applied to PostgreSQL session variables for row-level security. */
export interface TenantScope {
  organizationId: string;
  /** Null for system actors (jobs acting for a tenant). */
  userId: string | null;
  /** '*' or the explicit list of branch ids (coarse RLS boundary). */
  branchBoundary: '*' | readonly string[];
}

export const RUNTIME_POOL = Symbol('RUNTIME_POOL');
export const SYSTEM_POOL = Symbol('SYSTEM_POOL');
export const RUNTIME_DB = Symbol('RUNTIME_DB');
export const SYSTEM_DB = Symbol('SYSTEM_DB');
