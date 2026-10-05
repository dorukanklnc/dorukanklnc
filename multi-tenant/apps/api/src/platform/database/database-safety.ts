import { sql } from 'drizzle-orm';
import type { Database } from './types.js';

type RoleFacts = {
  role: string;
  rolsuper: boolean;
  rolbypassrls: boolean;
  owned_tables: number;
};

/**
 * Refuses to run with database roles that would silently bypass row-level security:
 * superusers, BYPASSRLS roles and table owners. Both runtime pools must also be distinct roles.
 */
export async function assertSafeDatabaseRoles(runtime: Database, system: Database): Promise<void> {
  const inspect = async (db: Database): Promise<RoleFacts> => {
    const result = await db.execute<RoleFacts>(sql`
      SELECT current_user AS role, r.rolsuper, r.rolbypassrls,
             (SELECT count(*) FROM pg_tables
               WHERE schemaname = 'public' AND tableowner = current_user)::int AS owned_tables
      FROM pg_roles r WHERE r.rolname = current_user
    `);
    const facts = result.rows[0];
    if (!facts) throw new Error('Unable to inspect database role');
    return facts;
  };

  const [runtimeFacts, systemFacts] = await Promise.all([inspect(runtime), inspect(system)]);
  for (const [pool, facts] of [
    ['DATABASE_URL', runtimeFacts],
    ['DATABASE_SYSTEM_URL', systemFacts],
  ] as const) {
    if (facts.rolsuper || facts.rolbypassrls || facts.owned_tables > 0) {
      throw new Error(
        `${pool} connects as "${facts.role}", which bypasses row-level security ` +
          `(superuser=${facts.rolsuper}, bypassrls=${facts.rolbypassrls}, owned tables=${facts.owned_tables}). ` +
          'Use the app_runtime / app_system roles (see docs/architecture/MULTITENANCY.md).',
      );
    }
  }
  if (runtimeFacts.role === systemFacts.role) {
    throw new Error('DATABASE_URL and DATABASE_SYSTEM_URL must use different roles');
  }
}
