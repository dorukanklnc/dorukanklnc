import { asOwner } from '../support/database.js';

/**
 * Guards against a new table forgetting row-level security: every table that carries an
 * organization_id must have RLS enabled AND forced, plus at least one policy.
 */
describe('row-level security coverage', () => {
  it('forces RLS on every tenant-owned table', async () => {
    const problems = await asOwner(async (db) => {
      const { rows } = await db.query<{
        table_name: string;
        rls: boolean;
        forced: boolean;
        policies: number;
      }>(`
        SELECT c.relname AS table_name, c.relrowsecurity AS rls, c.relforcerowsecurity AS forced,
               (SELECT count(*) FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname)::int AS policies
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'
          AND EXISTS (
            SELECT 1 FROM information_schema.columns col
            WHERE col.table_schema = 'public' AND col.table_name = c.relname AND col.column_name = 'organization_id'
          )
      `);
      expect(rows.length).toBeGreaterThan(25);
      return rows
        .filter((row) => !row.rls || !row.forced || row.policies === 0)
        .map((row) => row.table_name);
    });
    expect(problems).toEqual([]);
  });

  it('enables RLS on every table except the global permission catalog', async () => {
    const unprotected = await asOwner(async (db) => {
      const { rows } = await db.query<{ table_name: string }>(`
        SELECT c.relname AS table_name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity
      `);
      return rows.map((row) => row.table_name);
    });
    expect(unprotected).toEqual(['permissions']);
  });

  it('runs the application roles without superuser or BYPASSRLS', async () => {
    const roles = await asOwner(async (db) => {
      const { rows } = await db.query<{
        rolname: string;
        rolsuper: boolean;
        rolbypassrls: boolean;
      }>(
        "SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname IN ('app_runtime', 'app_system', 'app_owner')",
      );
      return rows;
    });
    expect(roles).toHaveLength(3);
    for (const role of roles) {
      expect(role.rolsuper, role.rolname).toBe(false);
      expect(role.rolbypassrls, role.rolname).toBe(false);
    }
  });
});
