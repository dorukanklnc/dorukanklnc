import { resetConfigCache } from '../../src/platform/config/env.js';
import { type TestApp, createTestApp } from '../support/app.js';

/**
 * The other suites run with the limiter disabled; this one boots an application with it enabled
 * and checks the brute-force protection of the credential endpoints.
 */
describe('rate limiting', () => {
  let t: TestApp;

  beforeAll(async () => {
    process.env.RATE_LIMIT_ENABLED = 'true';
    process.env.RATE_LIMIT_STORE = 'memory';
    resetConfigCache();
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
    process.env.RATE_LIMIT_ENABLED = 'false';
    resetConfigCache();
  });

  it('throttles repeated sign-in attempts with a localized error code', async () => {
    const client = t.client();
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await client.post('/api/v1/auth/login', {
        email: `ratelimit-${attempt}@unknown.test`,
        password: 'not-the-password',
      });
      statuses.push(response.status);
    }
    expect(statuses.every((status) => status === 401)).toBe(true);

    const blocked = await client.post('/api/v1/auth/login', {
      email: 'mudur@atlas.test',
      password: 'Demo!Parola2026',
    });
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('RATE_LIMITED');
    expect(blocked.headers['retry-after']).toBeDefined();
    expect(blocked.headers['set-cookie']).toBeUndefined();
  });

  it('throttles password reset requests independently', async () => {
    const client = t.client();
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const response = await client.post('/api/v1/auth/password/forgot', {
        email: 'mudur@atlas.test',
      });
      statuses.push(response.status);
    }
    expect(statuses.slice(0, 5).every((status) => status === 202)).toBe(true);
    expect(statuses[5]).toBe(429);
  });
});
