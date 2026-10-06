import { type APIRequestContext, type Page, expect, request } from '@playwright/test';

export const DEMO_PASSWORD = 'Demo!Parola2026';

export const USERS = {
  atlasOwner: 'sahip@atlas.test',
  atlasPrincipal: 'mudur@atlas.test',
  atlasAccountant: 'muhasebe@atlas.test',
  atlasTeacher: 'ogretmen@atlas.test',
  novaOwner: 'sahip@nova.test',
  multiOrg: 'danisman@campusos.test',
  platformAdmin: 'platform@campusos.test',
} as const;

/** Signs in through the real login form. */
export async function login(page: Page, email: string, password = DEMO_PASSWORD) {
  await page.goto('/login');
  await page.getByLabel('E-posta').fill(email);
  await page.getByLabel('Şifre', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

/** An authenticated API client (cookies + CSRF header), for test setup only. */
export async function apiAs(email: string, baseURL: string): Promise<APIRequestContext> {
  const context = await request.newContext({ baseURL });
  const response = await context.post('/api/v1/auth/login', {
    data: { email, password: DEMO_PASSWORD },
  });
  expect(response.ok()).toBeTruthy();
  return context;
}

/** A short unique suffix so repeated runs never collide on seeded data. */
export function uniqueSuffix(): string {
  return Date.now().toString(36).slice(-5).toUpperCase();
}
