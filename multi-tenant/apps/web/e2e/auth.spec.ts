import { expect, test } from '@playwright/test';
import { USERS, login } from './fixtures';

test.describe('authentication', () => {
  test('redirects anonymous visitors to the login page and back after sign-in', async ({
    page,
  }) => {
    await page.goto('/students');
    await expect(page).toHaveURL(/\/login\?next=%2Fstudents/);
    await page.getByLabel('E-posta').fill(USERS.atlasOwner);
    await page.getByLabel('Şifre', { exact: true }).fill('Demo!Parola2026');
    await page.getByRole('button', { name: 'Giriş yap' }).click();
    await expect(page).toHaveURL(/\/students$/);
    await expect(page.getByRole('heading', { name: 'Öğrenciler' })).toBeVisible();
  });

  test('gives the same answer for a wrong password and an unknown account', async ({ page }) => {
    for (const email of [USERS.atlasOwner, 'nobody@unknown.test']) {
      await page.goto('/login');
      await page.getByLabel('E-posta').fill(email);
      await page.getByLabel('Şifre', { exact: true }).fill('wrong-password-123');
      await page.getByRole('button', { name: 'Giriş yap' }).click();
      await expect(page.locator('form').getByRole('alert')).toHaveText(
        'E-posta veya şifre hatalı ya da hesap geçici olarak kilitli.',
      );
    }
  });

  test('does not follow external redirect targets', async ({ page }) => {
    await page.goto('/login?next=//evil.example/steal');
    await page.getByLabel('E-posta').fill(USERS.atlasOwner);
    await page.getByLabel('Şifre', { exact: true }).fill('Demo!Parola2026');
    await page.getByRole('button', { name: 'Giriş yap' }).click();
    await expect(page).toHaveURL(/localhost:3000\/dashboard$/);
  });

  test('signs out and protects pages afterwards', async ({ page }) => {
    await login(page, USERS.atlasAccountant);
    await page.getByRole('button', { name: 'Kullanıcı menüsü' }).click();
    await page.getByRole('menuitem', { name: 'Çıkış yap', exact: true }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto('/finance');
    await expect(page).toHaveURL(/\/login/);
  });

  test('platform staff land on the platform console', async ({ page }) => {
    await login(page, USERS.platformAdmin);
    await expect(page).toHaveURL(/\/platform\/organizations$/);
    await expect(page.getByRole('cell', { name: /Atlas Akademi/ })).toBeVisible();
  });

  test('switches the interface language', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Dil' }).click();
    await page.getByRole('menuitem', { name: 'English' }).click();
    await expect(page.getByRole('heading', { name: 'Sign in to your account' })).toBeVisible();
    await page.getByRole('button', { name: 'Language' }).click();
    await page.getByRole('menuitem', { name: 'Türkçe' }).click();
    await expect(page.getByRole('heading', { name: 'Hesabınıza giriş yapın' })).toBeVisible();
  });
});
