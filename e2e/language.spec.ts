import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

execFileSync(process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python', [
  '-m',
  'backend.tests.ui_fixture',
]);
const fixture = JSON.parse(readFileSync('runtime/e2e-validation.json', 'utf-8')).reviewed;

test('language switches preserve context, results, original evidence and the viewport', async ({
  page,
}) => {
  test.setTimeout(60000);
  let analyses = 0;
  await page.route('**/api/health?*', (route) => route.fulfill({ json: { jev_configured: true } }));
  await page.route(`**/api/accounts/${fixture.account_id}/expansion-runs?*`, (route) => {
    if (route.request().method() === 'POST') analyses++;
    return route.fulfill({ json: route.request().method() === 'POST' ? fixture : [] });
  });
  fixture.result.validation_summary.limitations.push('Catatan arsip yang belum dipetakan');
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'id');
  await page.getByRole('combobox', { name: 'Cari semua node' }).fill(fixture.account_id);
  await page.locator('.search-results').getByRole('option').first().click();
  await page.getByRole('button', { name: 'Sesuaikan tampilan' }).click();
  await page.waitForTimeout(400);
  await page.getByTestId(`entity-${fixture.account_id}`).click();
  await page.getByRole('menuitem', { name: /Account Expansion/ }).click();
  await page.getByRole('button', { name: 'Jalankan analisis baru' }).click();
  await page.getByRole('button', { name: 'Buka hasil analisis', exact: true }).click();
  await page.getByRole('button', { name: 'Lihat penjelasan hasil' }).click();
  await page.waitForTimeout(400);
  const scoreTable = page.getByRole('region', { name: 'Bagaimana skor dihitung' }).locator('table');
  await expect(scoreTable.locator('th')).toHaveText([
    'Parameter',
    'Kontribusi mentah',
    'Penelusuran',
  ]);
  await expect(scoreTable.locator('tbody tr')).toHaveCount(19);
  await expect(page.getByTestId('score-OI-1').locator('td')).toHaveCount(3);
  const viewport = await page.locator('.react-flow__viewport').getAttribute('style');
  await page.getByRole('combobox', { name: 'Bahasa', exact: true }).selectOption('en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  const summary = page.getByRole('region', { name: 'Analysis summary' });
  await expect(summary).toContainText('Result needs review');
  const englishTable = page
    .getByRole('region', { name: 'How the score is calculated' })
    .locator('table');
  await expect(englishTable.locator('th')).toHaveText([
    'Parameter',
    'Raw contribution',
    'Traceability',
  ]);
  await expect(page.getByTestId('score-OI-1').locator('td').nth(1)).toHaveText(
    new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(
      fixture.result.expansion_score.parameters[0].raw_value * 100,
    ) + '%',
  );
  await expect(summary).toContainText('Original text: Catatan arsip yang belum dipetakan');
  await expect(summary).toContainText(
    `Expansion support score: ${fixture.result.expansion_score.display_value.toFixed(1)}%`,
  );
  await expect(
    page.getByRole('heading', { name: 'How the score is calculated', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('region', { name: 'How the score is calculated' })).toContainText(
    'Evidence and traceability',
  );
  await expect(page.getByTestId('score-OI-1')).toContainText(
    'Does the data show expansion signals',
  );
  await expect(page.locator('.react-flow__viewport')).toHaveAttribute('style', viewport!);
  await expect(page.getByRole('link', { name: 'Markdown summary' })).toHaveAttribute(
    'href',
    /lang=en/,
  );
  await expect(page.getByRole('link', { name: 'Opportunities CSV' })).toHaveAttribute(
    'href',
    /lang=en/,
  );
  const originalQuote = fixture.result.provenance[0].quote;
  if (originalQuote)
    await expect(page.getByText(originalQuote, { exact: true }).first()).toBeAttached();
  await page.screenshot({ path: 'runtime/language-en-result.png', fullPage: true });
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('id');
  await expect(page.getByRole('region', { name: 'Ringkasan analisis' })).toContainText(
    'Hasil perlu ditinjau',
  );
  await expect(
    page.getByRole('heading', { name: 'Bagaimana skor dihitung', exact: true }),
  ).toBeVisible();
  expect(analyses).toBe(1);
  await page.getByRole('combobox', { name: 'Bahasa', exact: true }).selectOption('en');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('combobox', { name: 'Search all nodes' })).toBeVisible();
  expect(analyses).toBe(1);
});

test('language switches during a running analysis without submitting another analysis', async ({
  page,
}) => {
  let analyses = 0;
  const active = {
    ...fixture,
    status: 'running',
    result: null,
    steps: fixture.steps.map((step: object) => ({ ...step, status: 'running' })),
  };
  await page.route('**/api/health?*', (route) => route.fulfill({ json: { jev_configured: true } }));
  await page.route(`**/api/accounts/${fixture.account_id}/expansion-runs?*`, (route) => {
    if (route.request().method() === 'POST') analyses++;
    return route.fulfill({ json: route.request().method() === 'POST' ? active : [] });
  });
  await page.route(`**/api/expansion-runs/${fixture.id}?*`, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 250));
    return route.fulfill({ json: active });
  });
  await page.goto('/');
  await page.getByRole('combobox', { name: 'Cari semua node' }).fill(fixture.account_id);
  await page.locator('.search-results').getByRole('option').first().click();
  await page.waitForTimeout(400);
  await page.getByTestId(`entity-${fixture.account_id}`).click();
  await page.getByRole('menuitem', { name: /Account Expansion/ }).click();
  await page.getByRole('button', { name: 'Jalankan analisis baru' }).click();
  await page.getByRole('combobox', { name: 'Bahasa', exact: true }).selectOption('en');
  await expect(page.getByRole('button', { name: 'Analysis running' })).toBeDisabled();
  await page.waitForTimeout(1400);
  await expect(page.getByRole('button', { name: 'Analysis running' })).toBeVisible();
  expect(analyses).toBe(1);
});

test('language selector remains usable in both themes and responsive layouts', async ({ page }) => {
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme });
    for (const width of [1440, 851, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      const selector = page.locator('.language-select');
      await expect(selector).toBeVisible();
      await selector.selectOption('en');
      await page.getByRole('button', { name: 'Report', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Analysis reports' })).toBeVisible();
      await page.getByRole('button', { name: 'Graph', exact: true }).click();
      const geometry = await page.evaluate(() => {
        const brand = document.querySelector('.brand')!.getBoundingClientRect();
        const controls = document.querySelector('.header-right')!.getBoundingClientRect();
        return {
          overlap: brand.right > controls.left,
          overflow: document.documentElement.scrollWidth > innerWidth,
        };
      });
      expect(geometry).toEqual({ overlap: false, overflow: false });
      await page.locator('header').screenshot({ path: `runtime/language-${theme}-${width}.png` });
    }
  }
  await page.evaluate(() => localStorage.setItem('evaly-language', 'invalid'));
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'id');
});
