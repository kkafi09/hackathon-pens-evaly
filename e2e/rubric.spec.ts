import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

execFileSync(process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python', [
  '-m',
  'backend.tests.ui_fixture',
]);
const fixture = JSON.parse(readFileSync('runtime/e2e-v2.json', 'utf-8'));
const validationFixtures = JSON.parse(readFileSync('runtime/e2e-validation.json', 'utf-8'));

async function open(page: Page, controlled = fixture) {
  await page.route('**/api/health?*', (route) => route.fulfill({ json: { jev_configured: true } }));
  await page.route(`**/api/accounts/${controlled.account_id}/expansion-runs?*`, (route) =>
    route.fulfill({ json: route.request().method() === 'POST' ? controlled : [] }),
  );
  await page.route(`**/api/expansion-runs/${controlled.id}?*`, (route) =>
    route.fulfill({ json: controlled }),
  );
  await page.goto('/');
  await page.getByRole('combobox', { name: 'Cari semua node' }).fill(controlled.account_id);
  await page.locator('.search-results').getByRole('option').first().click();
  await page.getByRole('button', { name: 'Sesuaikan tampilan' }).click();
  await page.waitForTimeout(400);
  await page.getByTestId(`entity-${controlled.account_id}`).click();
  await page.getByRole('menuitem', { name: /Account Expansion/ }).click();
}

test('v2 has nineteen evaluations, group evidence and preserves the graph viewport', async ({
  page,
}) => {
  test.setTimeout(60000);
  let evaluations = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes('expansion-runs')) evaluations++;
  });
  await open(page);
  await expect(page.locator('.workflow-step')).toHaveCount(7);
  expect(evaluations).toBe(0);
  await page.getByRole('button', { name: 'Jalankan analisis baru' }).click();
  await expect(page.getByRole('region', { name: 'Ringkasan analisis' })).toHaveCount(0);
  const groups = [
    ['Identifikasi peluang', 'OI', 4],
    ['Estimasi nilai', 'FE', 3],
    ['Hambatan dan kesiapan', 'BR', 4],
    ['Keterkaitan pipeline', 'PC', 3],
    ['Jalur bukti', 'EP', 5],
  ] as const;
  await page.waitForTimeout(350);
  const before = await page.locator('.react-flow__viewport').getAttribute('style');
  for (const [title, prefix, count] of groups) {
    await page.locator('.step-toggle').filter({ hasText: title }).click();
    for (let i = 1; i <= count; i++)
      await expect(page.getByTestId(`rubric-${prefix}-${i}`)).toBeVisible();
    await expect(page.locator('.react-flow__viewport')).toHaveAttribute('style', before!);
  }
  await page.getByRole('button', { name: 'Sorot sumber di graph EP-1', exact: true }).click();
  await expect(page.getByTestId('entity-I0253')).toHaveAttribute('data-proof-role', 'context');
  await page.getByRole('button', { name: 'Buka hasil analisis', exact: true }).click();
  await page.getByRole('button', { name: 'Lihat penjelasan hasil' }).click();
  await expect(page.getByRole('region', { name: 'Evaluasi rubrik' })).toBeVisible();
  await page
    .getByRole('region', { name: 'Evaluasi rubrik' })
    .locator('summary')
    .filter({ hasText: 'Identifikasi peluang' })
    .click();
  await expect(page.getByTestId('rubric-OI-3')).toContainText('Confidence penilaian 100%');
  await page.screenshot({ path: 'runtime/rubric-v2-desktop.png', fullPage: true });
});

test('v2 review conclusion is independent of OI-3 confidence and reports supporting counts', async ({
  page,
}) => {
  await open(page, validationFixtures.reviewed);
  await page.getByRole('button', { name: 'Jalankan analisis baru' }).click();
  await page.getByRole('button', { name: 'Buka hasil analisis', exact: true }).click();
  const summary = page.getByRole('region', { name: 'Ringkasan analisis' });
  await expect(summary).toContainText('Hasil perlu ditinjau');
  await expect(summary).toContainText('sebagian hasil belum terverifikasi');
  await expect(summary).toContainText('1 record pendukung · 1 sumber data berbeda');
  await expect(summary).toContainText('Belum dihitung');
  await expect(summary).toContainText('Usulan setelah verifikasi');
  await expect(summary).not.toContainText('100%');
  await expect(summary).not.toContainText('Confidence niat');
  const expectedScore = validationFixtures.reviewed.result.expansion_score.display_value
    .toFixed(1)
    .replace('.', ',');
  await expect(summary).toContainText(`Skor dukungan ekspansi: ${expectedScore}%`);
  await page.screenshot({ path: 'runtime/validation-review-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Lihat penjelasan hasil' }).click();
  const calculation = page.getByRole('region', { name: 'Bagaimana skor dihitung' });
  await expect(calculation.locator('[data-testid^="score-"]')).toHaveCount(19);
  await expect(page.getByTestId('score-FE-1')).toContainText(
    'Input estimasi outlet belum lolos pemeriksaan kode',
  );
  await expect(page.getByTestId('score-PC-1')).toContainText('Tidak berlaku');
  await page
    .getByRole('region', { name: 'Evaluasi rubrik' })
    .locator('summary')
    .filter({ hasText: 'Identifikasi peluang' })
    .click();
  await expect(page.getByTestId('rubric-OI-3')).toContainText('Confidence penilaian 100%');
  await expect(page.getByRole('region', { name: 'Langkah berikutnya' })).toContainText(
    'USULAN SETELAH VERIFIKASI',
  );
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Tutup penjelasan', exact: true }).click();
  await summary.scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'runtime/validation-review-mobile.png', fullPage: true });
});

test('v2 one source can finish with a limitation and no global confidence', async ({ page }) => {
  await open(page, validationFixtures.single);
  await page.getByRole('button', { name: 'Jalankan analisis baru' }).click();
  await page.getByRole('button', { name: 'Buka hasil analisis', exact: true }).click();
  const summary = page.getByRole('region', { name: 'Ringkasan analisis' });
  await expect(summary).toContainText('Sinyal ekspansi teridentifikasi');
  await expect(summary).toContainText('2 record pendukung · 1 sumber data berbeda');
  await expect(summary).toContainText('validasi lintas sumber belum terpenuhi');
  await expect(summary).not.toContainText('Hasil perlu ditinjau');
  await expect(summary).not.toContainText('100%');
  await expect(summary).toContainText('Skor dukungan ekspansi:');
});

test('motion is stable while polling, rapid navigation clears overlays, and reduced motion disables camera animation', async ({
  page,
}) => {
  const pending = structuredClone(fixture);
  pending.status = 'running';
  pending.result = null;
  pending.steps.forEach((step: any, i: number) => {
    step.status = i === 0 ? 'done' : i === 1 ? 'running' : 'waiting';
    if (i > 0) step.data = null;
  });
  Object.values(pending.rubric).forEach((item: any) => {
    item.answer = null;
    item.status = 'waiting';
  });
  await open(page, pending);
  await page.getByRole('button', { name: 'Jalankan analisis baru' }).click();
  await expect(page.getByRole('button', { name: 'Analisis berjalan' })).toBeVisible();
  const panel = page.locator('.workflow-panel');
  await page.waitForTimeout(300);
  const identity = await panel.evaluate((el) => {
    (el as HTMLElement).dataset.pollIdentity = 'same';
    return el.getAttribute('data-poll-identity');
  });
  await page.waitForTimeout(1200);
  await expect(panel).toHaveAttribute('data-poll-identity', identity!);
  await page.locator('.close-icon').focus();
  await page.locator('.panel-scroll').evaluate((el) => {
    el.scrollTop = 120;
  });
  await page.waitForTimeout(1200);
  await expect(page.locator('.close-icon')).toBeFocused();
  expect(await page.locator('.panel-scroll').evaluate((el) => el.scrollTop)).toBe(120);
  await page.getByRole('button', { name: /Data & bukti/ }).click();
  await page.getByRole('button', { name: 'Workflow analisis', exact: true }).click();
  await expect(page.getByText('ALUR PENALARAN')).toBeVisible();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'Tutup workflow' }).click();
  await expect(panel).toHaveCount(0);
  await expect(page.locator('.entity.dimmed')).toHaveCount(0);
  await expect(page.locator('.floating-menu')).toHaveCount(0);
  await page.getByTestId('entity-C02').click();
  await page.getByRole('menuitem', { name: /Account Expansion/ }).click();
  await expect(page.locator('.workflow-panel')).toHaveCSS('animation-name', 'none');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: /Data & bukti/ }).click();
  await expect(page.getByText('Tiket support · 9')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'runtime/rubric-v2-mobile.png', fullPage: true });
});
