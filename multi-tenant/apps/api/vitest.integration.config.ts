import { defineConfig } from 'vitest/config';

/**
 * Integration and security tests against a real PostgreSQL database.
 * The global setup creates an isolated database, applies migrations and seeds fixtures.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/support/global-setup.ts'],
    setupFiles: ['test/support/setup-env.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // Tests share one database; files run sequentially to keep fixtures deterministic.
    fileParallelism: false,
  },
});
