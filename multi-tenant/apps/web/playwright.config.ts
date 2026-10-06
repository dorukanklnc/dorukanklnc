import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests against a running stack (API + web + seeded database).
 *
 * Locally: `pnpm infra:up && pnpm db:reset && pnpm dev`, then `pnpm test:e2e` (running servers are
 * reused; start the API with RATE_LIMIT_ENABLED=false, since every test signs in). In CI the
 * servers are started from production builds by `webServer` below.
 * PLAYWRIGHT_CHROMIUM_EXECUTABLE points at a preinstalled Chromium when browsers are not downloaded.
 */
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    locale: 'tr-TR',
    timezoneId: 'Europe/Istanbul',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.E2E_EXTERNAL_SERVERS
    ? undefined
    : [
        {
          command: 'pnpm --filter @repo/api start',
          cwd: '../..',
          url: 'http://localhost:4000/api/health/ready',
          reuseExistingServer: true,
          timeout: 60_000,
          // Every test signs in; the limiter itself is covered by the API integration suite.
          env: { RATE_LIMIT_ENABLED: 'false' },
        },
        {
          command: 'pnpm --filter @repo/web start',
          cwd: '../..',
          url: `${baseURL}/login`,
          reuseExistingServer: true,
          timeout: 120_000,
        },
      ],
});
