import { defineConfig, devices } from '@playwright/test';

// Browser tests of the composed stack (nginx edge + Go service): `make up`, then `make e2e`.
// There is no webServer: the stack is started by compose, never by Playwright.
// The specs that disturb the stack (stop, recreate, flood, held connections) are in
// e2e/stack-disruptive.spec.ts; they run only with E2E_STACK=1, alone and last.
const disruptive = process.env.E2E_STACK === '1';
const ci = process.env.CI !== undefined && process.env.CI !== '';

export default defineConfig({
  testDir: './e2e',
  testMatch: disruptive ? 'stack-disruptive.spec.ts' : '*.spec.ts',
  testIgnore: disruptive ? [] : ['**/stack-disruptive.spec.ts'],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: ci,
  timeout: 30_000,
  globalTimeout: 540_000,
  expect: { timeout: 7_000 },
  outputDir: 'test-results',
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['json', { outputFile: 'test-results/report.json' }],
  ],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:8080',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
  ],
});
