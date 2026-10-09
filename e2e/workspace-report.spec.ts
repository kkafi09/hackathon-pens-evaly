import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const fixture = JSON.parse(readFileSync('runtime/e2e-v2.json', 'utf8'));

test('global search selects real account contexts and discards stale responses', async ({
  page,
}) => {
  await page.goto('/');
  const search = page.getByRole('combobox', { name: 'Cari semua node' });
  await search.fill('FEAT-01');
  await expect(page.getByRole('option').first()).toContainText('FEAT-01');
  await page.keyboard.press('Enter');
  await expect(page.getByText('Pilih konteks akun untuk FEAT-01')).toBeVisible();
  await page
    .locator('.search-account-choice')
    .getByRole('button', { name: /C02 ·/ })
    .click();
  await expect(page.locator('.evidence-popover')).toContainText('FEAT-01');
  await page.getByRole('button', { name: 'Tutup bukti' }).click();
  const found = await (await page.request.get('/api/graph/search?q=I0253')).json();
  await page.route('**/api/graph/search?*', async (route) => {
    const query = new URL(route.request().url()).searchParams.get('q');
    if (query === 'failure')
      return route.fulfill({ status: 500, json: { detail: 'Pencarian tidak tersedia.' } });
    if (query === 'empty') return route.fulfill({ json: { items: [], total: 0 } });
    if (query === 'old') await new Promise((resolve) => setTimeout(resolve, 650));
    return route
      .fulfill({
        json: {
          ...found,
          items: found.items.map((hit: any) => ({
            ...hit,
            label: query === 'old' ? 'Old response' : 'Newest response',
          })),
        },
      })
      .catch(() => {});
  });
  const started = page.waitForRequest((request) => request.url().includes('q=old'));
  await search.fill('old');
  await started;
  await search.fill('new');
  await expect(page.getByRole('option').first()).toContainText('Newest response');
  await page.waitForTimeout(700);
  await expect(page.getByRole('option').first()).not.toContainText('Old response');
  await search.fill('failure');
  await expect(page.getByRole('alert')).toContainText('Pencarian tidak tersedia');
  await search.fill('empty');
  await expect(page.getByText('Node tidak ditemukan')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.global-results')).toHaveCount(0);
});

test('full canvas, global node search and resizable analysis sidebar preserve viewport', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.entity.account')).toHaveCount(45);
  await expect(
    page.locator('.metrics,.avatar,.react-flow__minimap,.page-heading,.page-footer'),
  ).toHaveCount(0);
  const canvas = await page.locator('.graph-canvas').boundingBox();
  expect(canvas!.height).toBeGreaterThan(800);
  const viewport = await page.locator('.react-flow__viewport').getAttribute('style');
  const search = page.getByRole('combobox', { name: 'Cari semua node' });
  await search.fill('Sidoarjo');
  const result = page.getByRole('option').filter({ hasText: 'I0253' });
  await expect(result).toContainText('isi');
  await expect(page.locator('.entity.account')).toHaveCount(45);
  await expect(page.locator('.react-flow__viewport')).toHaveAttribute('style', viewport!);
  await result.click();
  await expect(page.locator('.evidence-popover')).toContainText('I0253');
  await expect(page.getByTestId('entity-I0253')).toHaveClass(/highlighted/);
  await page.getByRole('button', { name: 'Tutup bukti' }).click();
  await search.fill('C02');
  await expect(page.getByRole('option').first()).toContainText('C02');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Tutup bukti' }).click();
  await page.getByRole('button', { name: 'Sesuaikan tampilan' }).click();
  await page.waitForTimeout(400);
  await page.getByTestId('entity-C02').click();
  await page.getByRole('menuitem', { name: /Account Expansion/ }).click();
  const panel = page.getByRole('complementary', { name: 'Account Expansion C02' });
  await expect(panel).toBeVisible();
  const main = await page.locator('.full-canvas').boundingBox();
  expect(Math.abs((await panel.boundingBox())!.width / main!.width - 1 / 3)).toBeLessThan(0.01);
  await page.waitForTimeout(350);
  const position = await page.locator('.react-flow__viewport').getAttribute('style');
  const divider = page.getByRole('separator', { name: 'Lebar sidebar analisis' });
  await divider.focus();
  await page.keyboard.press('ArrowLeft');
  expect((await panel.boundingBox())!.width).toBeGreaterThan(main!.width / 3);
  await expect(page.locator('.react-flow__viewport')).toHaveAttribute('style', position!);
  const bounds = await divider.boundingBox();
  await page.mouse.move(bounds!.x + 5, bounds!.y + 100);
  await page.mouse.down();
  await page.mouse.move(bounds!.x - 100, bounds!.y + 100);
  await page.mouse.up();
  expect(
    Number(await page.evaluate(() => localStorage.getItem('evaly-panel-ratio'))),
  ).toBeGreaterThan(35);
  await divider.focus();
  await page.keyboard.press('Home');
  expect(Math.abs((await panel.boundingBox())!.width / main!.width - 1 / 3)).toBeLessThan(0.01);
  await page.screenshot({ path: 'runtime/full-canvas-sidebar.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(divider).not.toBeVisible();
  expect((await panel.boundingBox())!.width).toBe(390);
  await page.screenshot({ path: 'runtime/full-canvas-mobile.png' });
});

test('report table preserves choices, downloads PDFs, replays and deletes without evaluation', async ({
  page,
}) => {
  let evaluations = 0;
  page.on('request', (r) => {
    if (r.method() === 'POST' && /accounts\/.*\/expansion-runs/.test(r.url())) evaluations++;
  });
  let rows = Array.from({ length: 26 }, (_, i) => ({
    id: `report-${i}`,
    account_id: 'C02',
    account_name: 'TB Sinar Jaya',
    created_at: '2026-10-09T09:00:00Z',
    status: i === 25 ? 'running' : 'done',
    model: 'controlled',
    rubric_version: 'expansion-v2.0',
    dataset_hash: 'test',
    title: fixture.result.validation_summary.title,
    validation_summary: fixture.result.validation_summary,
    expansion_score: fixture.result.expansion_score,
    intent_label: fixture.result.intent_label,
    net_annual_scenario: 23940000,
    action_label: fixture.result.action_label,
  }));
  await page.route('**/api/expansion-runs?*', (route) => {
    const url = new URL(route.request().url());
    const offset = Number(url.searchParams.get('offset'));
    const filtered = rows.filter(
      (r) => !url.searchParams.get('status') || r.status === url.searchParams.get('status'),
    );
    return route.fulfill({
      json: {
        items: filtered.slice(offset, offset + 25),
        total: filtered.length,
        limit: 25,
        offset,
      },
    });
  });
  await page.route('**/api/expansion-runs/report-*', (route) => {
    const id = route.request().url().split('/').pop()!;
    if (route.request().method() === 'DELETE') {
      rows = rows.filter((r) => r.id !== id);
      return route.fulfill({ status: 204 });
    }
    return route.fulfill({ json: { ...fixture, id } });
  });
  await page.route('**/api/expansion-runs/**/export/pdf', (route) =>
    route.fulfill({ contentType: 'application/pdf', body: '%PDF-1.7\ncontrolled' }),
  );
  await page.route('**/api/expansion-runs/export/pdf', (route) =>
    route.fulfill({ contentType: 'application/pdf', body: '%PDF-1.7\ncontrolled' }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Report', exact: true }).click();
  await expect(page.locator('.report-table tbody tr')).toHaveCount(25);
  await page.getByRole('checkbox', { name: 'Pilih report report-0', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Pilih report report-1', exact: true }).check();
  await page.getByRole('button', { name: 'Berikutnya', exact: true }).click();
  await expect(
    page.getByRole('checkbox', { name: 'Pilih report report-25', exact: true }),
  ).toBeDisabled();
  await expect(page.getByRole('button', { name: /Unduh PDF pilihan/ })).toContainText('2/50');
  const bulk = page.waitForEvent('download');
  await page.getByRole('button', { name: /Unduh PDF pilihan/ }).click();
  expect((await bulk).suggestedFilename()).toBe('evaly-reports.pdf');
  await page.getByRole('button', { name: 'Sebelumnya', exact: true }).click();
  await expect(
    page.getByRole('checkbox', { name: 'Pilih report report-0', exact: true }),
  ).toBeChecked();
  const single = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Unduh PDF report-0', exact: true }).click();
  await single;
  await page.getByRole('button', { name: 'Hapus report report-0', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('TB Sinar Jaya');
  await dialog.getByRole('button', { name: 'Batal', exact: true }).click();
  await page.getByRole('button', { name: 'Hapus report report-0', exact: true }).click();
  await dialog.getByRole('button', { name: 'Hapus permanen', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Buka report report-0', exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByRole('button', { name: /Unduh PDF pilihan/ })).toContainText('1/50');
  await page.screenshot({ path: 'runtime/report-table.png' });
  await page.getByRole('button', { name: 'Buka report report-1', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Account Expansion C02' })).toBeVisible();
  await page.getByRole('button', { name: 'Lihat penjelasan hasil' }).click();
  await expect(page.getByRole('region', { name: 'Evaluasi rubrik' })).toBeVisible();
  expect(evaluations).toBe(0);
});
