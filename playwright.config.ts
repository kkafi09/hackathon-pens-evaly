import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:5173',
    viewport: { width: 1440, height: 1080 },
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: `${process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python'} -m uvicorn backend.app:app --host 127.0.0.1 --port 8000`,
      url: 'http://127.0.0.1:8000/api/health',
      reuseExistingServer: !process.env.CI,
      timeout: 60000,
    },
    {
      command: 'bun run dev',
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 60000,
    },
  ],
});
