import { expect, test, type Page } from '@playwright/test';

async function openAccount(page: Page, id = 'C02') {
  await page.getByRole('textbox', { name: 'Cari akun' }).fill(id);
  await page.locator('.search-results').getByRole('button').first().click();
  const node = page.getByTestId(`entity-${id}`);
  await expect(node).toBeVisible();
  // Fit the focused graph before clicking the node at its actual zoomed position.
  await page.getByRole('button', { name: 'Sesuaikan tampilan' }).click();
  await page.waitForTimeout(600);
  await node.click();
  await expect(page.getByRole('menu')).toBeVisible();
}

test('graph, five options, locked tracks and account context', async ({ page }) => {
  let evaluationRequests = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes('expansion-runs'))
      evaluationRequests++;
  });
  await page.goto('/');
  await expect(page.locator('.entity.account')).toHaveCount(45, { timeout: 20000 });
  await openAccount(page);
  await expect(page.getByRole('menuitem')).toHaveCount(5);
  await expect(page.getByRole('menuitem', { name: /Churn Early/ })).toBeDisabled();
  await expect(page.getByRole('menuitem', { name: /Account Expansion/ })).toBeEnabled();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await page.getByTestId('entity-C02').click();
  await page.getByRole('menuitem', { name: /Account Expansion/ }).click();
  await expect(page.getByRole('complementary', { name: 'Account Expansion C02' })).toBeVisible();
  await expect(page.getByText('ALUR PENALARAN')).toBeVisible();
  expect(evaluationRequests).toBe(0);
  await page.getByRole('button', { name: /Data & bukti/ }).click();
  await expect(page.getByText('Tiket support · 9')).toBeVisible();
  await page.getByRole('button', { name: 'I0253' }).click();
  await expect(page.locator('.evidence-popover')).toContainText('Rencana cabang baru');
  await expect(page.getByTestId('entity-I0253')).toHaveClass(/highlighted/);
  await page.getByRole('button', { name: 'Tutup workflow' }).click();
  await expect(page.getByRole('complementary', { name: 'Account Expansion C02' })).toHaveCount(0);
  await expect(page.getByTestId('entity-C02')).toBeVisible();
});

test('completed analysis displays values, evidence and exports', async ({ page }) => {
  const context = await (await page.request.get('/api/accounts/C06/context')).json();
  const message = context.interactions.find((item: any) => item.interaction_id === 'I0300');
  const contract = context.contracts[0];
  const supporting = [
    {
      id: 'I0300',
      node_id: 'I0300',
      label: message.subjek,
      source: 'interactions.jsonl',
      record: message,
      role: 'expansion',
      question_refs: ['intent'],
      quote: '10 outlet',
    },
    {
      id: 'K-C06',
      node_id: 'K-C06',
      label: 'Kontrak C06',
      source: 'contracts_billing.csv',
      record: contract,
      role: 'calculation',
      question_refs: ['action'],
      fields: ['harga_per_outlet_bulan', 'diskon_pct'],
    },
  ];
  const ticket = context.tickets[0];
  const evaluated = [
    ...supporting.map((item) => ({ ...item, role: 'context' })),
    {
      id: ticket.ticket_id,
      node_id: ticket.ticket_id,
      label: ticket.judul,
      source: 'support_tickets.csv',
      record: ticket,
      role: 'context',
      question_refs: [ticket.ticket_id],
      assessments: { [ticket.ticket_id]: { type: 'noul', noul: 0.05 } },
    },
  ];

  const result = {
    title: 'Peluang ekspansi teridentifikasi',
    has_opportunity: true,
    intent_label: 'Permintaan penawaran',
    calculation: {
      additional_outlets: 10,
      current_outlets: 30,
      target_outlets: 40,
      gross_annual: 42000000,
      net_annual_scenario: 37800000,
      formula: '10 × Rp350.000 × 12',
      assumptions: ['Diskon existing diasumsikan tetap berlaku.'],
      exceeds_package: false,
    },
    action_label: 'Siapkan penawaran',
    action: null,
    owner: { nama: 'Wahyu Nugroho', jabatan: 'Account Manager' },
    concerns: ['I0300: Belum ada balasan tercatat'],
    evidence_ids: ['I0300', 'K-C06'],
    precedents: [],
    provenance: supporting,
    evaluated_provenance: evaluated,
  };
  const run = {
    id: 'browser-success',
    account_id: 'C06',
    created_at: '2026-10-09T03:00:00Z',
    status: 'done',
    model: 'controlled-browser-test-model',
    models: ['controlled-browser-test-model'],
    calls: [],
    steps: [
      {
        id: 'classification',
        title: 'Klasifikasi interaksi',
        primitive: 'CHOICE',
        status: 'done',
        data: {},
        provenance: evaluated,
      },
    ],
    gateway: 'openrouter',
    error: null,
    dataset_hash: 'browser-test',
    rubric_version: 'test',
    result,
  };
  await page.route('**/api/accounts/C06/expansion-runs', (route) =>
    route.fulfill({ json: route.request().method() === 'POST' ? run : [] }),
  );
  await page.goto('/');
  await openAccount(page, 'C06');
  await page.getByRole('menuitem', { name: /Account Expansion/ }).click();
  await page.getByRole('button', { name: 'Jalankan analisis baru' }).click();
  await page.getByRole('button', { name: 'Buka hasil analisis' }).click();
  await expect(page.getByTestId('entity-I0300')).toHaveAttribute('data-proof-role', 'expansion');
  await expect(page.getByTestId('entity-K-C06')).toHaveAttribute('data-proof-role', 'calculation');
  await expect(page.locator('.entity.dimmed').first()).toBeVisible();
  await page.locator('.proof-card').filter({ hasText: 'I0300' }).locator('summary').click();
  await expect(page.locator('.proof-card mark').first()).toHaveText('10 outlet');
  await page.getByRole('button', { name: 'Semua data yang dievaluasi', exact: true }).click();
  await expect(page.getByTestId(`entity-${ticket.ticket_id}`)).toHaveAttribute(
    'data-proof-role',
    'context',
  );
  await page.getByRole('button', { name: 'Bukti pendukung hasil', exact: true }).click();

  await expect(page.getByText(/^Rp\s*42\.000\.000$/)).toBeVisible();
  await expect(page.getByText(/^Rp\s*37\.800\.000$/)).toBeVisible();
  await expect(page.getByText('I0300: Belum ada balasan tercatat', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ringkasan Markdown' })).toHaveAttribute(
    'href',
    '/api/expansion-runs/browser-success/export/md',
  );
  await page.getByRole('button', { name: 'I0300', exact: true }).click();
  await expect(page.locator('.evidence-popover')).toContainText('Ekspansi Jakarta 2027');
});

test('prospects are disabled and search filters accounts', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Cari akun' }).fill('P01');
  await page.locator('.search-results').getByRole('button').first().click();
  await page.getByRole('button', { name: 'Sesuaikan tampilan' }).click();
  await page.waitForTimeout(600);
  await page.getByTestId('entity-P01').click();
  await expect(page.getByRole('menuitem', { name: /Account Expansion/ })).toBeDisabled();
  await expect(page.getByText('Analisis ini untuk pelanggan existing')).toBeVisible();
});

test('failed API is visible and real stored responses can be replayed', async ({ page }) => {
  const created = '2026-10-09T03:00:00+00:00';
  const failed = {
    id: 'test-failed',
    account_id: 'C06',
    created_at: created,
    status: 'failed',
    model: null,
    dataset_hash: 'fixture',
    rubric_version: 'test',
    models: [],
    calls: [],
    result: null,
    error: 'OPENROUTER_API_KEY belum diatur.',
    steps: [
      { id: 'context', title: 'Kumpulkan konteks', primitive: 'DATA', status: 'done', data: {} },
      {
        id: 'classification',
        title: 'Klasifikasi interaksi',
        primitive: 'CHOICE',
        status: 'failed',
        data: null,
      },
    ],
  };
  const history = [
    { ...failed, id: 'test-replay', model: 'controlled-browser-test-model', status: 'done' },
  ];
  const replay = {
    ...failed,
    id: 'test-replay',
    model: 'controlled-browser-test-model',
    models: ['controlled-browser-test-model'],
    status: 'done',
    error: null,
    stale: true,
  };
  await page.route('**/api/accounts/C06/expansion-runs', async (route) =>
    route.fulfill({ json: route.request().method() === 'POST' ? failed : history }),
  );
  await page.route('**/api/expansion-runs/test-replay', async (route) =>
    route.fulfill({ json: replay }),
  );
  await page.goto('/');
  await openAccount(page, 'C06');
  await page.getByRole('menuitem', { name: /Account Expansion/ }).click();
  await page.getByRole('button', { name: 'Jalankan analisis baru' }).click();
  await expect(page.getByRole('alert')).toContainText('OPENROUTER_API_KEY');
  await page.getByRole('button', { name: /Lihat hasil tersimpan/ }).click();
  await page.locator('.history-list').getByRole('button').first().click();
  await expect(page.getByText('Pemutaran ulang hasil', { exact: true })).toBeVisible();
  await expect(page.getByText(/Hasil ini menggunakan versi dataset berbeda/)).toBeVisible();
});

test('mobile workflow is usable without overflowing viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Cari akun' }).fill('C06');
  await page.locator('.search-results').getByRole('button').first().click();
  await page.getByRole('button', { name: 'Sesuaikan tampilan' }).click();
  await page.waitForTimeout(600);
  await page.getByTestId('entity-C06').click();
  await page.getByRole('menuitem', { name: /Account Expansion/ }).click();
  await expect(page.getByRole('button', { name: 'Tutup workflow' })).toBeVisible();
  const box = await page.locator('.workflow-panel').boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
});

test('running stages preserve viewport and missing graph records open saved snapshots', async ({
  page,
}) => {
  const context = await (await page.request.get('/api/accounts/C02/context')).json();
  const message = context.interactions.find((item: any) => item.interaction_id === 'I0253');
  const evidence = {
    id: 'I0253',
    node_id: 'I0253',
    label: message.subjek,
    source: 'interactions.jsonl',
    record: message,
    role: 'context',
    question_refs: ['I0253'],
  };
  const removed = {
    ...evidence,
    id: 'saved-only',
    node_id: null,
    label: 'Snapshot lama',
    record: { isi: 'Bukti asli tersimpan walaupun node sudah tidak ada.' },
  };
  const run = {
    id: 'controlled-running',
    account_id: 'C02',
    created_at: '2026-10-09T03:00:00Z',
    status: 'running',
    model: null,
    models: [],
    gateway: 'openrouter',
    calls: [],
    result: null,
    error: null,
    dataset_hash: 'test',
    rubric_version: 'test',
    steps: [
      {
        id: 'context',
        title: 'Kumpulkan konteks',
        primitive: 'DATA',
        status: 'done',
        data: {},
        provenance: [evidence],
      },
      {
        id: 'classification',
        title: 'Klasifikasi interaksi',
        primitive: 'CHOICE',
        status: 'running',
        data: null,
        provenance: [removed],
      },
    ],
  };
  await page.route('**/api/health', (route) =>
    route.fulfill({ json: { jev_configured: true, gateway: 'openrouter' } }),
  );
  await page.route('**/api/accounts/C02/expansion-runs', (route) =>
    route.fulfill({ json: route.request().method() === 'POST' ? run : [] }),
  );
  await page.route('**/api/expansion-runs/controlled-running', (route) =>
    route.fulfill({ json: run }),
  );
  await page.goto('/');
  await openAccount(page);
  await page.getByRole('menuitem', { name: /Account Expansion/ }).click();
  await page.getByRole('button', { name: 'Jalankan analisis baru' }).click();
  await expect(page.getByTestId('entity-I0253')).toHaveAttribute('data-proof-role', 'context');
  await page.waitForTimeout(700);
  const before = await page.locator('.react-flow__viewport').getAttribute('style');
  await page.getByRole('button', { name: /CHOICE Klasifikasi interaksi/ }).click();
  await expect(page.locator('.react-flow__viewport')).toHaveAttribute('style', before!);
  await page.locator('.proof-card summary').click();
  await page.getByRole('button', { name: 'Buka bukti saved-only', exact: true }).click();
  await expect(page.locator('.evidence-popover')).toContainText(
    'Bukti asli tersimpan walaupun node sudah tidak ada.',
  );
  await expect(page.getByTestId('entity-saved-only')).toHaveCount(0);
  await page.getByRole('button', { name: 'Tutup bukti', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('complementary', { name: 'Account Expansion C02' })).toBeVisible();
  await page.screenshot({ path: 'runtime/openrouter-highlight-mobile.png', fullPage: true });
  const overflow = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
    elements: Array.from(document.querySelectorAll('body *'))
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width && r.left < window.innerWidth && r.right > window.innerWidth + 1;
      })
      .map((el) => ({
        tag: el.tagName,
        class: el.className,
        width: el.getBoundingClientRect().width,
      }))
      .slice(0, 12),
  }));
  expect(overflow.width, JSON.stringify(overflow)).toBeLessThanOrEqual(overflow.viewport);
  await page.getByRole('button', { name: 'Tutup workflow' }).click();
  await expect(page.locator('.entity.dimmed')).toHaveCount(0);
});
