import { getConfig } from '../../config/env.js';
import { ensureRoles, recreateDatabase } from '../bootstrap.js';
import { runMigrations } from '../migrator.js';
import { seedDemoData } from '../seed/seed.js';

/**
 * Development only: drops and recreates the database, applies migrations and loads demo data.
 * Requires DATABASE_ADMIN_URL (a superuser or a role with CREATEROLE + CREATEDB).
 */
const config = getConfig();
const adminUrl = process.env.DATABASE_ADMIN_URL;
if (config.isProduction) {
  console.error('Refusing to reset a database in production.');
  process.exit(1);
}
if (!adminUrl || !config.DATABASE_MIGRATION_URL) {
  console.error('DATABASE_ADMIN_URL and DATABASE_MIGRATION_URL are required.');
  process.exit(1);
}

const owner = new URL(config.DATABASE_MIGRATION_URL);
const runtime = new URL(config.DATABASE_URL);
const system = new URL(config.DATABASE_SYSTEM_URL);
const database = owner.pathname.slice(1);

await ensureRoles(adminUrl, {
  owner: { name: owner.username, password: decodeURIComponent(owner.password) },
  runtime: { name: runtime.username, password: decodeURIComponent(runtime.password) },
  system: { name: system.username, password: decodeURIComponent(system.password) },
});
await recreateDatabase(adminUrl, database, owner.username, [runtime.username, system.username]);
await runMigrations(config.DATABASE_MIGRATION_URL);
await seedDemoData(config);
console.log(`Database "${database}" recreated, migrated and seeded.`);
