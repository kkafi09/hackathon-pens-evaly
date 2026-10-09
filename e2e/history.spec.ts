import { expect, test, type Page } from '@playwright/test';

async function setup(page: Page, withActive = false, withAnother = false) {
  const context = await (await page.request.get('/api/accounts/C02/context')).json();
  const email = context.interactions.find((item: any) => item.interaction_id === 'I0253');
  const reasons = [
    {
      code: 'low_confidence',
      stage: 'result',
      title: 'Rekomendasi discovery kebutuhan',
      message:
        'Confidence rekomendasi discovery kebutuhan 56%, di bawah batas aplikasi 60%. Pilihan ini perlu diperiksa oleh owner akun.',
      confidence: 0.56,
      threshold: 0.6,
      source_ids: ['I0253'],
    },
  ];
  const next = [
    {
      action: 'Discovery kebutuhan',
      owner: 'Lina Marlina',
      confirmations: [
        'Konfirmasi rencana tambahan 6 outlet dan jadwal pembukaannya.',
        'Konfirmasi paket untuk target 31 outlet.',
      ],
      expected_outcome: 'Kebutuhan yang cukup jelas untuk menyusun penawaran.',
    },
  ];
  const proof = [
    {
      id: 'I0253',
      node_id: 'I0253',
      label: email.subjek,
      source: 'interactions.jsonl',
      record: email,
      role: 'expansion',
      question_refs: ['intent'],
    },
  ];
  const run = {
    id: 'controlled-review-delete',
    account_id: 'C02',
    created_at: '2026-10-09T09:00:00Z',
    status: 'review',
    model: 'test-model',
    models: ['test-model'],
    calls: [],
    error: null,
    dataset_hash: 'test',
    rubric_version: 'test',
    review_reasons: reasons,
    next_steps: next,
    steps: [
      {
        id: 'result',
        title: 'Nilai & tindak lanjut',
        primitive: 'KODE + CHOICE',
        status: 'review',
        data: {},
        provenance: proof,
      },
    ],
    result: {
      title: 'Peluang ekspansi teridentifikasi',
      intent_label: 'Rencana konkret',
      intent: { confidence: 0.97 },
      action_label: 'Discovery kebutuhan',
      action: null,
      owner: { nama: 'Lina Marlina' },
      review_reasons: reasons,
      next_steps: next,
      evidence_ids: ['I0253'],
      provenance: proof,
      evaluated_provenance: proof,
      concerns: ['Belum ada deal tercatat.'],
      precedents: [],
      calculation: {
        additional_outlets: 6,
        current_outlets: 25,
        target_outlets: 31,
        gross_annual: 25200000,
        net_annual_scenario: 23940000,
        exceeds_package: true,
        formula: '6 × Rp350.000 × 12',
        assumptions: ['Estimasi skenario, bukan pendapatan pasti.'],
      },
    },
  };
  const state = {
    entries: withActive ? [run, { ...run, id: 'controlled-active', status: 'running' }] : [run],
    deletes: 0,
    fail: false,
  };
  if (withAnother) state.entries.push({ ...run, id: 'another-legacy-run' });
  await page.route('**/api/expansion-runs/another-legacy-run?*', (route) =>
    route.fulfill({ json: state.entries.find((entry) => entry.id === 'another-legacy-run') }),
  );
  await page.route('**/api/accounts/C02/expansion-runs?*', (route) =>
    route.fulfill({ json: state.entries }),
  );
  await page.route('**/api/expansion-runs/controlled-review-delete?*', (route) => {
    if (route.request().method() !== 'DELETE') return route.fulfill({ json: run });
    state.deletes++;
    if (state.fail)
      return route.fulfill({ status: 500, json: { detail: 'Penghapusan gagal. Coba kembali.' } });
    state.entries = state.entries.filter((entry) => entry.id !== run.id);
    return route.fulfill({ status: 204 });
  });
  await page.goto('/');
  await page.getByRole('combobox', { name: 'Cari semua node' }).fill('C02');
  await page.locator('.search-results').getByRole('option').first().click();
  await page.getByRole('button', { name: 'Sesuaikan tampilan' }).click();
  await page.waitForTimeout(600);
  await page.getByTestId('entity-C02').click();
  await page.getByRole('menuitem', { name: /Account Expansion/ }).click();
  return state;
}

test('readable review separates intent and action, then deletion resets the current result', async ({
  page,
}) => {
  const state = await setup(page);
  await page.getByRole('button', { name: /Lihat hasil tersimpan/ }).click();
  await page.locator('.history-row > button:first-child').first().click();
  await expect(page.getByRole('region', { name: 'Ringkasan analisis' })).toContainText(
    'Confidence niat 97%',
  );
  await expect(page.getByRole('region', { name: 'Ringkasan analisis' })).toContainText('56%');
  await page.getByRole('button', { name: 'Lihat penjelasan hasil' }).click();
  await expect(page.getByRole('region', { name: 'Alasan status analisis' })).toContainText('56%');
  await expect(page.getByRole('region', { name: 'Alasan status analisis' })).not.toContainText(
    'Belum ada deal',
  );
  await expect(page.getByRole('region', { name: 'Langkah berikutnya' })).toContainText('31 outlet');
  await expect(page.getByRole('region', { name: 'Langkah berikutnya' })).toContainText(
    'Lina Marlina',
  );
  await page.getByRole('button', { name: 'Buka tahap: Nilai & tindak lanjut' }).click();
  await expect(page.getByText('ALUR PENALARAN')).toBeVisible();
  await expect(page.getByTestId('entity-I0253')).toHaveAttribute('data-proof-role', 'expansion');
  await page.getByRole('button', { name: 'Kembali ke penjelasan hasil' }).click();
  await expect(page.getByRole('heading', { name: 'Penjelasan hasil' })).toBeFocused();
  await page.getByRole('button', { name: 'Hapus hasil ini' }).click();
  const dialog = page.getByRole('dialog', { name: 'Hapus hasil analisis?' });
  await expect(dialog).toContainText('C02');
  await expect(dialog).toContainText('Perlu ditinjau');
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  expect(state.deletes).toBe(0);
  await page.getByRole('button', { name: 'Hapus hasil ini' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate((el) => el.getBoundingClientRect().width <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: 'runtime/delete-result-mobile.png', fullPage: true });
  await dialog.getByRole('button', { name: 'Batal', exact: true }).click();
  expect(state.deletes).toBe(0);
  await page.getByRole('button', { name: 'Hapus hasil ini' }).click();
  const viewport = await page.locator('.react-flow__viewport').getAttribute('style');
  await dialog.getByRole('button', { name: 'Hapus permanen', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('region', { name: 'Ringkasan analisis' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Lihat hasil tersimpan/ })).toBeDisabled();
  await expect(page.locator('.entity.dimmed')).toHaveCount(0);
  await expect(page.locator('.entity.highlighted')).toHaveCount(0);
  await expect(page.locator('.react-flow__viewport')).toHaveAttribute('style', viewport!);
  expect(state.deletes).toBe(1);
});

test('history deletion preserves results on error and disables active runs', async ({ page }) => {
  const state = await setup(page, true);
  await page.getByRole('button', { name: /Lihat hasil tersimpan/ }).click();
  const deletes = page.locator('.delete-history');
  await expect(deletes).toHaveCount(2);
  await expect(deletes.nth(1)).toBeDisabled();
  state.fail = true;
  await deletes.first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Hapus permanen', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Penghapusan gagal');
  await expect(page.locator('.history-row')).toHaveCount(2);
  await dialog.getByRole('button', { name: 'Batal', exact: true }).click();
  state.fail = false;
  await deletes.first().click();
  await dialog.getByRole('button', { name: 'Hapus permanen', exact: true }).click();
  await expect(page.locator('.history-row')).toHaveCount(1);
  await expect(page.locator('.delete-history')).toBeDisabled();
});

test('sidebar tabs separate content and explanation has a visible destination', async ({
  page,
}) => {
  let calls = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes('expansion-runs')) calls++;
  });
  await setup(page);
  await page.getByRole('button', { name: /Lihat hasil tersimpan/ }).click();
  await page.locator('.history-row > button:first-child').first().click();
  await expect(page.getByRole('region', { name: 'Ringkasan analisis' })).toBeVisible();
  await expect(page.getByText('JEV · SYSTEM ONE')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Jalankan analisis baru' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Alasan status analisis' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Lihat penjelasan hasil' }).click();
  const heading = page.getByRole('heading', { name: 'Penjelasan hasil' });
  await expect(heading).toBeFocused();
  await expect(page.getByRole('button', { name: 'Tutup penjelasan' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await page.getByRole('button', { name: /Data & bukti/ }).click();
  await expect(page.getByText('Fakta dari data sumber')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Ringkasan analisis' })).toHaveCount(0);
  await expect(page.getByText('JEV · SYSTEM ONE')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Jalankan analisis baru' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Sumber analisis' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Bukti pendukung hasil', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Sumber analisis' })).toHaveCount(1);
  await expect(page.getByText('Fakta dari data sumber')).toHaveCount(0);
  await page.getByRole('button', { name: 'Workflow analisis', exact: true }).click();
  await expect(page.getByText('JEV · SYSTEM ONE')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Ringkasan analisis' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Hasil analisis', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Tutup penjelasan' })).toBeVisible();
  const viewport = await page.locator('.react-flow__viewport').getAttribute('style');
  await page.getByRole('button', { name: 'Buka tahap: Nilai & tindak lanjut' }).click();
  await expect(page.locator('#workflow-stage-result')).toBeFocused();
  await expect(page.locator('#workflow-stage-result')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.react-flow__viewport')).toHaveAttribute('style', viewport!);
  await page.getByRole('button', { name: 'Kembali ke penjelasan hasil' }).click();
  await expect(heading).toBeFocused();
  await page.getByRole('button', { name: 'Tutup penjelasan' }).click();
  await expect(page.getByRole('region', { name: 'Alasan status analisis' })).not.toBeVisible();
  const divider = await page
    .getByRole('separator', { name: 'Lebar sidebar analisis' })
    .boundingBox();
  await page.mouse.move(divider!.x + 5, divider!.y + 80);
  await page.mouse.down();
  await page.mouse.move(1430, divider!.y + 80);
  await page.mouse.up();
  expect((await page.locator('.workflow-panel').boundingBox())!.width).toBeCloseTo(320, 0);
  await page.getByRole('button', { name: 'Lihat penjelasan hasil' }).click();
  await expect(heading).toBeFocused();
  expect(
    await page.locator('.panel-scroll').evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  await expect
    .poll(async () => {
      const title = await heading.boundingBox();
      const area = await page.locator('.panel-scroll').boundingBox();
      return Math.abs(title!.y - area!.y);
    })
    .toBeLessThan(40);
  await page.screenshot({ path: 'runtime/sidebar-explanation-minimum.png' });
  await page.getByRole('button', { name: 'Tutup penjelasan' }).click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    await page.getByRole('button', { name: 'Lihat penjelasan hasil' }).click();
    await expect(heading).toBeFocused();
    expect(
      await page.locator('.panel-scroll').evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    await page.screenshot({ path: `runtime/sidebar-explanation-${colorScheme}.png` });
    await page.getByRole('button', { name: 'Tutup penjelasan' }).click();
  }
  expect(calls).toBe(0);
});

test('legacy result without opportunity stays readable and resets explanation for another run', async ({
  page,
}) => {
  const state = await setup(page, false, true);
  const old = state.entries[0];
  old.status = 'done';
  old.result.title = 'Belum ditemukan peluang dari data tersedia';
  old.result.intent_label = '';
  old.review_reasons = [];
  old.result.review_reasons = [];
  old.next_steps = [];
  old.result.next_steps = [];
  Object.assign(old.result, {
    has_opportunity: false,
    intent: null,
    action_label: 'Informasi belum cukup',
  });
  Object.assign(old.result.calculation, {
    additional_outlets: null,
    target_outlets: null,
    gross_annual: null,
    net_annual_scenario: null,
    exceeds_package: false,
    formula: '',
  });
  await page.getByRole('button', { name: /Lihat hasil tersimpan/ }).click();
  await page.locator('.history-row > button:first-child').first().click();
  await expect(page.getByRole('region', { name: 'Ringkasan analisis' })).toContainText(
    'Belum ditemukan peluang',
  );
  await page.getByRole('button', { name: 'Lihat penjelasan hasil' }).click();
  await expect(
    page.getByText('Hasil rubrik lama. Pertanyaan v2 belum dievaluasi pada hasil ini.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Workflow analisis', exact: true }).click();
  await page.getByRole('button', { name: /Lihat hasil tersimpan/ }).click();
  await page.locator('.history-row > button:first-child').nth(1).click();
  await expect(page.getByRole('button', { name: 'Lihat penjelasan hasil' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
});

test('source loading error is explained in the data tab without workflow controls', async ({
  page,
}) => {
  await page.route('**/api/accounts/C02/context?*', (route) =>
    route.fulfill({
      status: 503,
      json: { detail: 'Data sumber sedang tidak tersedia.' },
    }),
  );
  await setup(page);
  await page.getByRole('button', { name: /Data & bukti/ }).click();
  await expect(page.locator('.workflow-panel').getByRole('alert')).toContainText(
    'Data sumber sedang tidak tersedia',
  );
  await expect(page.getByText('Memuat data sumber…')).toHaveCount(0);
  await expect(page.getByText('JEV · SYSTEM ONE')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Jalankan analisis baru' })).toHaveCount(0);
});
