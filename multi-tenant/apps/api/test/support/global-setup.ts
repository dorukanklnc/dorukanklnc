import {
  ensureRoles,
  recreateDatabase,
  dropDatabase,
} from '../../src/platform/database/bootstrap.js';
import { runMigrations } from '../../src/platform/database/migrator.js';
import { parseConfig } from '../../src/platform/config/env.js';
import { seedDemoData } from '../../src/platform/database/seed/seed.js';
import { TEST_DATABASE, TEST_ENV, applyTestEnvironment } from './environment.js';

/** Creates a fresh database, applies all migrations and loads the fictional demo tenants. */
export async function setup(): Promise<void> {
  applyTestEnvironment();
  await ensureRoles(TEST_ENV.adminUrl, TEST_ENV.roles);
  await recreateDatabase(TEST_ENV.adminUrl, TEST_DATABASE, TEST_ENV.roles.owner.name, [
    TEST_ENV.roles.runtime.name,
    TEST_ENV.roles.system.name,
  ]);
  await runMigrations(TEST_ENV.ownerUrl);
  await seedDemoData(parseConfig(process.env), { log: () => undefined });
}

export async function teardown(): Promise<void> {
  if (process.env.KEEP_TEST_DATABASE === 'true') return;
  await dropDatabase(TEST_ENV.adminUrl, TEST_DATABASE);
}
