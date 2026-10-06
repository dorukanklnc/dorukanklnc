import { expect, test } from '@playwright/test';
import { USERS, apiAs, apiPost, login, uniqueSuffix } from './fixtures';

test.describe('authorization in the interface', () => {
  test('teachers never see finance and cannot open it by URL', async ({ page }) => {
    await login(page, USERS.atlasTeacher);
    const navigation = page.getByRole('navigation', { name: 'Ana menü' });
    await expect(navigation.getByRole('link', { name: 'Öğrenciler' })).toBeVisible();
    await expect(navigation.getByText('Finans')).toHaveCount(0);
    await expect(navigation.getByRole('link', { name: 'Tahsilat paneli' })).toHaveCount(0);

    await page.goto('/finance/payments');
    await expect(page.getByText('Bu sayfaya erişiminiz yok')).toBeVisible();
  });

  test('accountants have no administration screens', async ({ page }) => {
    await login(page, USERS.atlasAccountant);
    const navigation = page.getByRole('navigation', { name: 'Ana menü' });
    await expect(navigation.getByRole('link', { name: 'Kullanıcılar' })).toHaveCount(0);
    await page.goto('/admin/users');
    await expect(page.getByText('Bu sayfaya erişiminiz yok')).toBeVisible();
  });

  test('principals see aggregate finance KPIs but no individual finance screens', async ({
    page,
  }) => {
    await login(page, USERS.atlasPrincipal);
    await expect(page.getByText('Tahsilat oranı')).toBeVisible();
    await expect(
      page.getByRole('navigation', { name: 'Ana menü' }).getByRole('link', { name: 'Tahsilatlar' }),
    ).toHaveCount(0);
  });

  test("another tenant's records are not found, not forbidden", async ({ page, baseURL }) => {
    const nova = await apiAs(USERS.novaOwner, baseURL ?? 'http://localhost:3000');
    const response = await nova.get('/api/v1/students?pageSize=1');
    const body = (await response.json()) as { items: { id: string }[] };
    const novaStudentId = body.items[0]?.id;
    expect(novaStudentId).toBeTruthy();
    await nova.dispose();

    await login(page, USERS.atlasOwner);
    await page.goto(`/students/${novaStudentId}`);
    await expect(page.getByText('Sayfa bulunamadı')).toBeVisible();
  });

  test('switching organization reloads into the other tenant', async ({ page }) => {
    await login(page, USERS.multiOrg);
    const switcher = page.getByRole('button', { name: 'Kurum değiştir' });
    const current = (await switcher.textContent()) ?? '';
    const target = current.includes('Nova') ? 'Atlas Akademi' : 'Nova Koleji';
    await switcher.click();
    await page.getByRole('menuitem', { name: target }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('button', { name: 'Kurum değiştir' })).toContainText(target);
  });
});

test('command palette finds records Turkish-insensitively', async ({ page, baseURL }) => {
  // Own fixture with Turkish letters, independent of the demo data.
  const suffix = uniqueSuffix();
  const owner = await apiAs(USERS.atlasOwner, baseURL ?? 'http://localhost:3000');
  const branches = await (await owner.get('/api/v1/branches')).json();
  const branchId = (branches as { id: string }[])[0]?.id;
  await apiPost(owner, '/api/v1/students', {
    branchId,
    firstName: 'Işıl',
    lastName: `Çağlıyan${suffix}`,
  });
  await owner.dispose();

  await login(page, USERS.atlasOwner);
  await page.keyboard.press('Control+k');
  await page
    .getByPlaceholder('Öğrenci, veli, makbuz ara veya bir işlem seç…')
    .fill(`isil cagliyan${suffix.toLowerCase()}`);
  const option = page.getByRole('option', { name: new RegExp(`Işıl Çağlıyan${suffix}`) }).first();
  await expect(option).toBeVisible();
  await option.click();
  await expect(page).toHaveURL(/\/students\/[0-9a-f-]{36}/);
  await expect(page.getByRole('heading', { name: `Işıl Çağlıyan${suffix}` })).toBeVisible();
});
