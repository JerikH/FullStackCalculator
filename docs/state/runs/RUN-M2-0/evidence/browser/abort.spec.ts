import { expect, test } from '@playwright/test';
import { open, recordRequests, typeKeys, watchProblems } from './support';

// UI-FIX-01 (U29): an engine without AbortSignal.any and/or AbortSignal.timeout still gets a result, a caller abort
// (AC while busy) and the 8 s timeout, and never a display stuck busy. The APIs are removed before any page script runs.
const SCENARIOS = [
  { name: 'no AbortSignal.any', remove: ['any'] },
  { name: 'no AbortSignal.timeout', remove: ['timeout'] },
  { name: 'neither', remove: ['any', 'timeout'] },
] as const;

for (const scenario of SCENARIOS) {
  test.describe(scenario.name, () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript((names) => {
        for (const n of names) Reflect.deleteProperty(AbortSignal, n);
      }, scenario.remove);
    });

    test('0.1 + 0.2 = shows 0.3 and the display is not busy', async ({ page }) => {
      const problems = await watchProblems(page);
      const requests = recordRequests(page);
      await open(page);
      const removed = await page.evaluate((names) => names.map((n) => typeof (AbortSignal as never as Record<string, unknown>)[n]), [
        ...scenario.remove,
      ]);
      expect(removed).toEqual(scenario.remove.map(() => 'undefined'));
      await typeKeys(page, '0.1+0.2=');
      await expect(page.locator('output[aria-label="Result"]')).toContainText('0.3');
      await expect(page.locator('[aria-busy="false"] output[aria-label="Result"]')).toBeVisible();
      expect(requests.at(-1)).toMatchObject({ operation: 'add', operands: ['0.1', '0.2'], status: 200 });
      expect(problems.console).toEqual([]);
      expect(problems.pageErrors).toEqual([]);
    });

    test('AC while busy aborts quietly and the next calculation works', async ({ page }) => {
      const problems = await watchProblems(page);
      await page.route('**/api/v1/operations/**', () => {
        // never answered: the request stays pending until aborted
      });
      await open(page);
      await typeKeys(page, '1+1=');
      await expect(page.locator('[aria-busy="true"]')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.locator('[aria-busy="false"] output[aria-label="Result"]')).toBeVisible();
      await page.unroute('**/api/v1/operations/**');
      await typeKeys(page, '2+3=');
      await expect(page.locator('output[aria-label="Result"]')).toContainText('5');
      expect(problems.console).toEqual([]);
      expect(problems.pageErrors).toEqual([]);
    });

    test('a request that never answers ends with the timeout message after about 8 s', async ({ page }) => {
      test.setTimeout(30_000);
      await page.route('**/api/v1/operations/**', () => {
        // never answered
      });
      await open(page);
      await typeKeys(page, '1+1=');
      const started = Date.now();
      await expect(page.getByRole('alert')).toContainText('Calculator service timed out', { timeout: 15_000 });
      const elapsed = Date.now() - started;
      expect(elapsed).toBeGreaterThan(7000);
      await expect(page.locator('[aria-busy="false"]').first()).toBeVisible();
    });
  });
}
