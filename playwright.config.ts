import { defineConfig } from '@playwright/test';
const backendPort = process.env.E2E_BACKEND_PORT || '8000';
const frontendPort = process.env.E2E_FRONTEND_PORT || '5173';
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: `http://127.0.0.1:${frontendPort}`,
    viewport: { width: 1440, height: 1080 },
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: `"${process.platform === 'win32' ? '.venv\\Scripts\\python.exe' : '.venv/bin/python'}" -m uvicorn backend.app:app --host 127.0.0.1 --port ${backendPort}`,
      url: `http://127.0.0.1:${backendPort}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 60000,
    },
    {
      command: `bun run dev --port ${frontendPort}`,
      url: `http://127.0.0.1:${frontendPort}`,
      reuseExistingServer: !process.env.CI,
      timeout: 60000,
    },
  ],
});
