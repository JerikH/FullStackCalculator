import { expect, test } from '@playwright/test';
import { collectCsp, recordRequests, resultText, shot, watchProblems, open } from './support';

// Touch flows on mobile-chromium (Pixel 7): taps only.
test.use({ hasTouch: true });

test('tap 12 × 3 =, 1 ÷ 3 ≈, recall, an error with Ref, a theme change and a reload', async ({ page }, info) => {
  const problems = await watchProblems(page);
  const requests = recordRequests(page);
  await open(page);
  const tap = async (name: string) => page.getByRole('button', { name, exact: true }).tap();
  const out = page.locator('output[aria-label="Result"]');
  for (const name of ['1', '2', 'multiply', '3', 'equals']) await tap(name);
  await expect(out).toContainText('36');
  expect(requests.at(-1)).toMatchObject({
    operation: 'multiply',
    operands: ['12', '3'],
    status: 200,
  });
  for (const name of ['AC, all clear', '1', 'divide', '3', 'equals']) await tap(name);
  await expect(out).toContainText('0.3333333333333333333333333333333333');
  await expect(out).toContainText('Rounded to 34 significant digits');
  await shot(page, info, 'touch-inexact');
  // history is collapsed on a phone; open it and recall 36 as the right operand of 9 +
  await page.getByText('History', { exact: true }).tap();
  await expect(page.locator('details ol button')).toHaveText([
    '1 ÷ 3 ≈ 0.3333333333333333333333333333333333',
    '12 × 3 = 36',
  ]);
  await shot(page, info, 'touch-history-open');
  await tap('AC, all clear');
  await tap('9');
  await tap('add');
  await page.getByRole('button', { name: '12 × 3 = 36, use result' }).tap();
  await expect(out).toContainText('36');
  await tap('equals');
  await expect(out).toContainText('45');
  expect(requests.at(-1)).toMatchObject({
    operation: 'add',
    operands: ['9', '36'],
  });
  // error
  for (const name of ['AC, all clear', '1', 'divide', '0', 'equals']) await tap(name);
  await expect(page.getByRole('alert')).toContainText('Cannot divide by zero');
  expect(requests.at(-1)?.status).toBe(422);
  await expect(page.getByRole('alert')).toContainText(`Ref: ${requests.at(-1)?.responseRequestId ?? 'missing'}`);
  await shot(page, info, 'touch-error');
  // theme
  await page.getByText('Dark', { exact: true }).tap();
  expect(await page.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe('dark');
  await page.waitForTimeout(300);
  await shot(page, info, 'touch-dark');
  await page.reload();
  await page.getByRole('group', { name: 'Keypad' }).waitFor();
  expect(await page.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe('dark');
  await page.getByText('History', { exact: true }).tap();
  await expect(page.locator('details ol button')).toHaveCount(3);
  expect(await resultText(page)).toBe('0');
  await collectCsp(page, problems);
  expect(problems).toEqual({ console: [], pageErrors: [], csp: [] });
});

test('a tap on a key never leaves focus on it (mousedown is prevented)', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: '5', exact: true }).tap();
  const focused = await page.evaluate(() => document.activeElement?.tagName ?? '');
  expect(['BODY', 'HTML']).toContain(focused);
});
