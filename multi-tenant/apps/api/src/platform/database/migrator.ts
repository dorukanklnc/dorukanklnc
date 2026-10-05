import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDatabase, createPool } from './connection.js';
import { syncPermissionCatalog } from './permission-catalog.js';

export const MIGRATIONS_FOLDER = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../drizzle',
);

/** Applies pending migrations as the schema owner, then syncs the permission catalog. */
export async function runMigrations(connectionString: string): Promise<void> {
  const pool = createPool({ connectionString, max: 1, applicationName: 'campusos-migrate' });
  try {
    const db = createDatabase(pool);
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    await syncPermissionCatalog(db);
  } finally {
    await pool.end();
  }
}
