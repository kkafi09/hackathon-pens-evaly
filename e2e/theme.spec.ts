import { expect, test } from '@playwright/test';

test('logo and light/dark themes follow the system and persist explicit choices', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page).toHaveTitle('Evaly — Context Graph');
  await expect(page.getByRole('img', { name: 'Evaly', exact: true })).toBeVisible();
  const logo = page.getByRole('img', { name: 'Evaly', exact: true });
  await expect(logo).toBeVisible();
  expect(
    await logo.evaluate(
      (element: HTMLImageElement) => element.complete && element.naturalWidth > 0,
    ),
  ).toBe(true);
  await expect(page.locator('.entity.account')).toHaveCount(45);
  const lightBackground = await page
    .locator('html')
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  await page.screenshot({ path: 'runtime/theme-light-desktop.png', fullPage: true });
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('img', { name: 'Evaly', exact: true })).toHaveAttribute(
    'src',
    '/evaly-logo-dark.svg',
  );
  const darkBackground = await page
    .locator('html')
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(darkBackground).not.toBe(lightBackground);
  expect(
    await page
      .locator('.react-flow__background')
      .evaluate((element) => getComputedStyle(element).backgroundColor),
  ).toBe('rgb(13, 28, 50)');
  await page.screenshot({ path: 'runtime/theme-dark-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Aktifkan mode terang' }).click();
  await expect(page.getByRole('img', { name: 'Evaly', exact: true })).toHaveAttribute(
    'src',
    '/evaly-logo.svg',
  );
  expect(await page.evaluate(() => localStorage.getItem('kasirnusa-theme'))).toBe('light');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('textbox', { name: 'Cari akun' }).fill('C02');
  await page.locator('.search-results').getByRole('button').first().click();
  await page.getByRole('button', { name: 'Sesuaikan tampilan' }).click();
  await page.waitForTimeout(600);
  await page.getByTestId('entity-C02').click();
  await expect(page.getByRole('menuitem', { name: /Churn Early/ })).toBeDisabled();
  await page.getByRole('menuitem', { name: /Account Expansion/ }).click();
  await page.getByRole('button', { name: /Data & bukti/ }).click();
  await expect(page.getByText('Tiket support · 9')).toBeVisible();
  await page.screenshot({ path: 'runtime/theme-light-workflow.png', fullPage: true });
  await page.getByRole('button', { name: 'Aktifkan mode gelap' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.screenshot({ path: 'runtime/theme-dark-workflow.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: 'Tutup workflow' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: 'runtime/theme-dark-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Tutup workflow' }).click();
  await page.getByRole('button', { name: 'Aktifkan mode terang' }).click();
  await page.screenshot({ path: 'runtime/theme-light-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
