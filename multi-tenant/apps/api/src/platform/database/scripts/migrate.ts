import { getConfig } from '../../config/env.js';
import { runMigrations } from '../migrator.js';

const config = getConfig();
if (!config.DATABASE_MIGRATION_URL) {
  console.error('DATABASE_MIGRATION_URL (schema owner) is required to run migrations.');
  process.exit(1);
}

await runMigrations(config.DATABASE_MIGRATION_URL);
console.log('Migrations applied and permission catalog synced.');
