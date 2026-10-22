import { defineConfig, devices } from '@playwright/test';

// Ad hoc real-browser checks for RUN-M1-8 (the committed E2E suite belongs to OPS-E2E-01). Run through run-piece.sh.
const baseURL = process.env.E2E_URL ?? 'http://127.0.0.1:4123';
const out = process.env.E2E_OUT ?? 'results';

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  timeout: 30_000,
  expect: { timeout: 7_000 },
  fullyParallel: false,
  workers: 2,
  reporter: [['line'], ['json', { outputFile: `${out}/report-${process.env.E2E_PIECE ?? 'piece'}.json` }]],
  outputDir: `${out}/artifacts`,
  use: { baseURL, trace: 'off', screenshot: 'off' },
  projects: [
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
  ],
});
