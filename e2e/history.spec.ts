import { expect, test, type Page } from '@playwright/test';

async function setup(page: Page, withActive = false) {
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
  await page.route('**/api/accounts/C02/expansion-runs', (route) =>
    route.fulfill({ json: state.entries }),
  );
  await page.route('**/api/expansion-runs/controlled-review-delete', (route) => {
    if (route.request().method() !== 'DELETE') return route.fulfill({ json: run });
    state.deletes++;
    if (state.fail)
      return route.fulfill({ status: 500, json: { detail: 'Penghapusan gagal. Coba kembali.' } });
    state.entries = state.entries.filter((entry) => entry.id !== run.id);
    return route.fulfill({ status: 204 });
  });
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Cari akun' }).fill('C02');
  await page.locator('.search-results').getByRole('button').first().click();
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
  await page.getByRole('button', { name: 'Buka tahap terkait' }).click();
  await expect(page.getByText('ALUR PENALARAN')).toBeVisible();
  await expect(page.getByTestId('entity-I0253')).toHaveAttribute('data-proof-role', 'expansion');
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
