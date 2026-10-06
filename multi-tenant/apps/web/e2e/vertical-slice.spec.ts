import { expect, test } from '@playwright/test';
import { USERS, login, uniqueSuffix } from './fixtures';

/**
 * The MVP's first vertical slice, end to end through the UI:
 * login → organization context → role-based navigation → student list → create student →
 * tuition agreement with installments → record payment → balance updates → audit trail.
 */
test('collections vertical slice', async ({ page }) => {
  const suffix = uniqueSuffix();
  const lastName = `Testoğlu${suffix}`;

  await test.step('sign in into the organization context', async () => {
    await login(page, USERS.atlasOwner);
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('button', { name: 'Kurum değiştir' })).toContainText(
      'Atlas Akademi',
    );
    const navigation = page.getByRole('navigation', { name: 'Ana menü' });
    await expect(navigation.getByRole('link', { name: 'Tahsilat paneli' })).toBeVisible();
  });

  await test.step('create a student with a guardian', async () => {
    await page
      .getByRole('navigation', { name: 'Ana menü' })
      .getByRole('link', { name: 'Öğrenciler' })
      .click();
    await page.getByRole('button', { name: 'Öğrenci ekle' }).first().click();
    const sheet = page.getByRole('dialog', { name: 'Yeni öğrenci' });
    await sheet.getByRole('textbox', { name: 'Ad', exact: true }).first().fill('Ece');
    await sheet.getByRole('textbox', { name: 'Soyad', exact: true }).first().fill(lastName);
    await sheet
      .getByRole('combobox', { name: 'Şube', exact: true })
      .selectOption({ label: 'Kadıköy Kampüsü' });
    await sheet.getByRole('textbox', { name: 'Ad', exact: true }).nth(1).fill('Mert');
    await sheet.getByRole('textbox', { name: 'Soyad', exact: true }).nth(1).fill(lastName);
    await sheet
      .getByRole('textbox', { name: /Telefon/ })
      .nth(1)
      .fill('+90 532 000 00 00');
    await sheet.getByRole('button', { name: 'Öğrenciyi kaydet' }).click();
    await expect(page).toHaveURL(/\/students\/[0-9a-f-]{36}$/);
    await expect(page.getByRole('heading', { name: `Ece ${lastName}` })).toBeVisible();
  });

  await test.step('create a tuition agreement and generate installments', async () => {
    await page.getByRole('tab', { name: 'Finans' }).click();
    await page.getByRole('button', { name: 'Ödeme planı oluştur' }).first().click();
    const sheet = page.getByRole('dialog', { name: 'Eğitim sözleşmesi ve ödeme planı' });
    await sheet.getByRole('textbox', { name: /Brüt ücret/ }).fill('300.000');
    await sheet.getByRole('button', { name: 'İndirim ekle' }).click();
    await sheet.getByRole('textbox', { name: /Değer/ }).fill('10');
    await sheet.getByRole('button', { name: 'Devam' }).click();
    await sheet.getByRole('spinbutton', { name: /Taksit sayısı/ }).fill('6');
    await sheet.getByRole('button', { name: 'Devam' }).click();
    // Server-side preview: 300.000 − %10 = 270.000 → 6 × 45.000.
    await expect(sheet.getByText('₺270.000,00')).toBeVisible();
    await expect(sheet.getByRole('row')).toHaveCount(1 + 6);
    await sheet.getByRole('button', { name: 'Sözleşmeyi oluştur' }).click();
    await expect(page.getByText('Sözleşme ve 6 taksit oluşturuldu')).toBeVisible();
    await expect(page.getByText('6. taksit')).toBeVisible();
  });

  await test.step('record a payment and see the balance update', async () => {
    await page.getByRole('button', { name: 'Tahsilat al' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Tahsilat al' });
    await dialog.getByRole('textbox', { name: /^Tutar/ }).fill('50.000');
    await dialog.getByRole('button', { name: 'Tahsilatı kaydet' }).click();
    await expect(page.getByText(/Tahsilat kaydedildi · TAH-/)).toBeVisible();
    // FIFO allocation: the first installment is paid, 5.000 goes to the second.
    await expect(page.getByText('Ödendi').first()).toBeVisible();
    await expect(page.getByText('Kısmi ödendi')).toBeVisible();
    const balance = page.locator('dl').first();
    await expect(balance).toContainText('₺270.000,00');
    await expect(balance).toContainText('₺50.000,00');
    await expect(balance).toContainText('₺220.000,00');
  });

  await test.step('the payment and agreement are in the audit trail', async () => {
    await page.goto('/admin/audit');
    const feed = page.locator('ol');
    await expect(feed.getByText('Tahsilat kaydedildi').first()).toBeVisible();
    await expect(feed.getByText('Sözleşme oluşturuldu').first()).toBeVisible();
    await expect(feed.getByText('Öğrenci oluşturuldu').first()).toBeVisible();
  });
});
