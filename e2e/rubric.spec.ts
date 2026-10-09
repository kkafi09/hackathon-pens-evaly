import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

execFileSync(process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python', [
  '-m',
  'backend.tests.ui_fixture',
]);
const fixture = JSON.parse(readFileSync('runtime/e2e-v2.json', 'utf-8'));

async function open(page: Page, controlled = fixture) {
  await page.route('**/api/health', (route) => route.fulfill({ json: { jev_configured: true } }));
  await page.route('**/api/accounts/C02/expansion-runs', (route) =>
    route.fulfill({ json: route.request().method() === 'POST' ? controlled : [] }),
  );
  await page.route(`**/api/expansion-runs/${controlled.id}`, (route) =>
    route.fulfill({ json: controlled }),
  );
  await page.goto('/');
  await page.getByRole('combobox', { name: 'Cari semua node' }).fill('C02');
  await page.locator('.search-results').getByRole('option').first().click();
  await page.getByRole('button', { name: 'Sesuaikan tampilan' }).click();
  await page.waitForTimeout(400);
  await page.getByTestId('entity-C02').click();
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
  await expect(page.getByRole('region', { name: 'Ringkasan analisis' })).toContainText(
    /Rp\s*25\.200\.000/,
  );
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
  await page.getByRole('button', { name: 'Sorot data EP-1', exact: true }).click();
  await expect(page.getByTestId('entity-I0253')).toHaveAttribute('data-proof-role', 'context');
  await page.getByRole('button', { name: 'Buka hasil analisis', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Evaluasi rubrik' })).toBeVisible();
  await page
    .getByRole('region', { name: 'Evaluasi rubrik' })
    .locator('summary')
    .filter({ hasText: 'Identifikasi peluang' })
    .click();
  await expect(page.getByTestId('rubric-OI-3')).toContainText('Confidence penilaian 100%');
  await page.screenshot({ path: 'runtime/rubric-v2-desktop.png', fullPage: true });
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
