import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  collectCsp,
  fulfillOk,
  recordRequests,
  resultText,
  shot,
  themeAttr,
  typeKeys,
  watchProblems,
  open,
} from './support';

// UC-UI-01…04 against the real Go service through Vite (desktop and touch share these flows).

async function clickKey(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name, exact: true }).click();
}

test.describe('operations through the real service', () => {
  const cases: {
    label: string;
    keys: string;
    operation: string;
    operands: string[];
    shown: string;
  }[] = [
    {
      label: 'add 0.1 + 0.2',
      keys: '0.1+0.2=',
      operation: 'add',
      operands: ['0.1', '0.2'],
      shown: '0.3',
    },
    {
      label: 'subtract 5 − 8',
      keys: '5-8=',
      operation: 'subtract',
      operands: ['5', '8'],
      shown: '−3',
    },
    {
      label: 'multiply 12 × 3',
      keys: '12*3=',
      operation: 'multiply',
      operands: ['12', '3'],
      shown: '36',
    },
    {
      label: 'divide 6 ÷ 4',
      keys: '6/4=',
      operation: 'divide',
      operands: ['6', '4'],
      shown: '1.5',
    },
    {
      label: 'power 2 ^ 10',
      keys: '2^10=',
      operation: 'power',
      operands: ['2', '10'],
      shown: '1,024',
    },
    {
      label: 'sqrt 16',
      keys: '16r',
      operation: 'sqrt',
      operands: ['16'],
      shown: '4',
    },
    {
      label: 'percentage 50 %',
      keys: '50%',
      operation: 'percentage',
      operands: ['50'],
      shown: '0.5',
    },
  ];
  for (const c of cases) {
    test(c.label, async ({ page }, info) => {
      const problems = await watchProblems(page);
      const requests = recordRequests(page);
      await open(page);
      await typeKeys(page, c.keys);
      await expect(page.locator('output[aria-label="Result"]')).toContainText(c.shown);
      expect(requests.at(-1)).toMatchObject({
        operation: c.operation,
        operands: c.operands,
        status: 200,
      });
      if (c.operation === 'sqrt') await shot(page, info, 'sqrt-result');
      await collectCsp(page, problems);
      expect(problems).toEqual({ console: [], pageErrors: [], csp: [] });
    });
  }

  test('chaining 2 + 3 × 4 = 20 sends add then multiply, with the expression line in between', async ({ page }) => {
    const requests = recordRequests(page);
    await open(page);
    await typeKeys(page, '2+3*');
    await expect(page.locator('output[aria-label="Result"]')).toContainText('5');
    await expect(page.getByText('5 ×', { exact: true })).toBeVisible();
    await typeKeys(page, '4=');
    await expect(page.locator('output[aria-label="Result"]')).toContainText('20');
    expect(requests.map((r) => [r.operation, r.operands])).toEqual([
      ['add', ['2', '3']],
      ['multiply', ['5', '4']],
    ]);
  });

  test('9 + 16 √ × 2 = chains after a unary result (U16)', async ({ page }) => {
    const requests = recordRequests(page);
    await open(page);
    await typeKeys(page, '9+16r');
    await expect(page.locator('output[aria-label="Result"]')).toContainText('4');
    await typeKeys(page, '*');
    await expect(page.locator('output[aria-label="Result"]')).toContainText('13');
    await typeKeys(page, '2=');
    await expect(page.locator('output[aria-label="Result"]')).toContainText('26');
    expect(requests.map((r) => [r.operation, r.operands])).toEqual([
      ['sqrt', ['16']],
      ['add', ['9', '4']],
      ['multiply', ['13', '2']],
    ]);
  });

  test('1 ÷ 3 shows the full 34-digit value with the rounded marker and its explanation', async ({ page }, info) => {
    await open(page);
    await typeKeys(page, '1/3=');
    const out = page.locator('output[aria-label="Result"]');
    await expect(out).toContainText('0.3333333333333333333333333333333333');
    await expect(out).toContainText('Rounded to 34 significant digits');
    await expect(out.locator('[title="Rounded to 34 significant digits"]')).toHaveCount(1);
    expect(await resultText(page)).toContain('0.' + '3'.repeat(34));
    await shot(page, info, 'inexact-34');
  });
});

test.describe('errors', () => {
  test('1 ÷ 0 shows the exact copy and a Ref equal to the response X-Request-ID, then recovers', async ({
    page,
  }, info) => {
    const problems = await watchProblems(page);
    const requests = recordRequests(page);
    await open(page);
    await typeKeys(page, '1/0=');
    const alert = page.getByRole('alert');
    await expect(alert).toContainText('Cannot divide by zero');
    const id = requests.at(-1)?.responseRequestId;
    expect(id).toBeTruthy();
    expect(requests.at(-1)?.status).toBe(422);
    await expect(alert).toContainText(`Ref: ${id ?? ''}`);
    expect(await resultText(page)).toBe('');
    await shot(page, info, 'error-division');
    await typeKeys(page, '7');
    await expect(alert).toHaveText('');
    await expect(page.locator('output[aria-label="Result"]')).toContainText('7');
    await collectCsp(page, problems);
    expect(problems.csp).toEqual([]);
  });

  test('the service cannot be reached → «Calculator service is unreachable»', async ({ page }) => {
    await page.route('**/api/v1/operations/**', (route) => route.abort('connectionrefused'));
    await open(page);
    await typeKeys(page, '1+1=');
    await expect(page.getByRole('alert')).toContainText('Calculator service is unreachable');
  });

  test('a body that is not a problem → «Something went wrong»', async ({ page }) => {
    await page.route('**/api/v1/operations/**', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'text/html',
        body: '<h1>oops</h1>',
      }),
    );
    await open(page);
    await typeKeys(page, '1+1=');
    await expect(page.getByRole('alert')).toContainText('Something went wrong');
    await expect(page.getByRole('alert')).not.toContainText('oops');
  });
});

test.describe('busy state, UC-UI-01 E5', () => {
  test('digits are ignored while busy, dimming is immediate, the spinner needs 150 ms, AC aborts and the late answer is dropped', async ({
    page,
  }, info) => {
    const requests = recordRequests(page);
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    await page.route('**/api/v1/operations/add', async (route) => {
      await gate;
      await route.continue().catch(() => undefined);
    });
    await open(page);
    await typeKeys(page, '2+3=');
    const display = page.locator('[aria-busy="true"]');
    await expect(display).toHaveCount(1);
    const digits = page.locator('output[aria-label="Result"] > span').last();
    expect(await digits.evaluate((el) => getComputedStyle(el).opacity)).toBe('0.6');
    await expect(page.getByText('Calculating')).toBeVisible();
    await shot(page, info, 'busy-spinner');
    await page.keyboard.press('9');
    await page.keyboard.press('+');
    expect(await resultText(page)).toBe('3');
    await page.keyboard.press('Escape');
    await expect(page.locator('[aria-busy="false"]')).toHaveCount(1);
    expect(await resultText(page)).toBe('0');
    await expect(page.getByText('Calculating')).toHaveCount(0);
    release?.();
    await page.waitForTimeout(600);
    expect(await resultText(page)).toBe('0');
    if (!(await page.locator('details').evaluate((el: HTMLDetailsElement) => el.open)))
      await page.getByText('History', { exact: true }).click();
    await expect(page.getByText('No calculations yet')).toBeVisible();
    expect(requests.length).toBeLessThanOrEqual(1);
  });

  test('the spinner is not shown for a fast answer', async ({ page }) => {
    await open(page);
    await typeKeys(page, '1+1=');
    await expect(page.locator('output[aria-label="Result"]')).toContainText('2');
    await expect(page.getByText('Calculating')).toHaveCount(0);
  });
});

test.describe('editing, UC-UI-02', () => {
  test('the 35th digit is ignored', async ({ page }) => {
    await open(page);
    await typeKeys(page, '1234567890'.repeat(3) + '1234' + '5');
    expect((await resultText(page)).replace(/,/g, '')).toBe('1234567890'.repeat(3) + '1234');
  });

  test('C clears only the entry, AC everything', async ({ page }) => {
    const requests = recordRequests(page);
    await open(page);
    await typeKeys(page, '9+12');
    await page.keyboard.press('Delete');
    expect(await resultText(page)).toBe('0');
    await typeKeys(page, '3=');
    await expect(page.locator('output[aria-label="Result"]')).toContainText('12');
    expect(requests.at(-1)).toMatchObject({
      operation: 'add',
      operands: ['9', '3'],
    });
    await typeKeys(page, '4+');
    await page.keyboard.press('Escape');
    expect(await resultText(page)).toBe('0');
    await expect(page.getByText(/^\d+ [+×−÷^]$/)).toHaveCount(0);
  });

  test('12. becomes the operand 12; ± and ⌫ edit the entry', async ({ page }) => {
    const requests = recordRequests(page);
    await open(page);
    await typeKeys(page, '12.');
    expect(await resultText(page)).toBe('12.');
    await typeKeys(page, '+3=');
    await expect(page.locator('output[aria-label="Result"]')).toContainText('15');
    expect(requests.at(-1)).toMatchObject({ operands: ['12', '3'] });
    await clickKey(page, 'toggle sign');
    expect(await resultText(page)).toBe('−15');
    await clickKey(page, 'backspace');
    expect(await resultText(page)).toBe('−15');
    await typeKeys(page, '8');
    expect(await resultText(page)).toBe('8'); // a digit replaces the fresh result
    await page.keyboard.press('Backspace');
    expect(await resultText(page)).toBe('0'); // backspace to the empty entry shows 0
  });
});

test.describe('history, UC-UI-03', () => {
  test('rows newest first, persisted across reload, recalled as a right operand, cleared; the cap is 20', async ({
    page,
  }, info) => {
    const requests = recordRequests(page);
    await open(page);
    await typeKeys(page, '12*3=');
    await expect(page.locator('output[aria-label="Result"]')).toContainText('36');
    await typeKeys(page, '16r');
    await expect(page.locator('output[aria-label="Result"]')).toContainText('4');
    await typeKeys(page, '50%');
    await expect(page.locator('output[aria-label="Result"]')).toContainText('0.5');
    const details = page.locator('details');
    if (!(await details.evaluate((el: HTMLDetailsElement) => el.open)))
      await page.getByText('History', { exact: true }).click();
    const rows = page.locator('details ol button');
    await expect(rows).toHaveText(['50% = 0.5', '√16 = 4', '12 × 3 = 36']);
    await shot(page, info, 'history-three');
    await page.reload();
    await page.getByRole('group', { name: 'Keypad' }).waitFor();
    await page.getByRole('group', { name: 'Keypad' }).waitFor();
    if (!(await page.locator('details').evaluate((el: HTMLDetailsElement) => el.open)))
      await page.getByText('History', { exact: true }).click();
    await expect(page.locator('details ol button')).toHaveText(['50% = 0.5', '√16 = 4', '12 × 3 = 36']);
    // recall as the right operand: 9 + [Use result 36] =
    await typeKeys(page, '9+');
    await page.getByRole('button', { name: 'Use result 36' }).click();
    expect(await resultText(page)).toBe('36');
    // a mouse recall leaves focus where it was: Enter evaluates instead of re-pressing the row
    await page.keyboard.press('Enter');
    await expect(page.locator('output[aria-label="Result"]')).toContainText('45');
    expect(requests.at(-1)).toMatchObject({
      operation: 'add',
      operands: ['9', '36'],
    });
    await page.getByRole('button', { name: 'Clear history' }).click();
    await expect(page.getByText('No calculations yet')).toBeVisible();
    // a mouse clear leaves focus alone: the next Enter must not toggle the summary
    await expect(page.getByText('History', { exact: true })).not.toBeFocused();
    await page.reload();
    await page.getByRole('group', { name: 'Keypad' }).waitFor();
    await page.getByRole('group', { name: 'Keypad' }).waitFor();
    if (!(await page.locator('details').evaluate((el: HTMLDetailsElement) => el.open)))
      await page.getByText('History', { exact: true }).click();
    await expect(page.getByText('No calculations yet')).toBeVisible();
  });

  test('21 successes keep the newest 20', async ({ page }) => {
    await open(page);
    for (let i = 0; i < 21; i += 1) {
      await typeKeys(page, `${String(i)}+1=`);
      await expect(page.locator('[aria-busy="false"] output[aria-label="Result"]')).toContainText(String(i + 1));
    }
    if (!(await page.locator('details').evaluate((el: HTMLDetailsElement) => el.open)))
      await page.getByText('History', { exact: true }).click();
    await expect(page.locator('details ol button')).toHaveCount(20);
    await expect(page.locator('details ol button').first()).toHaveText('20 + 1 = 21');
    await expect(page.locator('details ol button').last()).toHaveText('1 + 1 = 2');
  });

  test('corrupt stored history is ignored and the app works', async ({ page }) => {
    await page.addInitScript(() =>
      window.localStorage.setItem('calculator.history.v1', '{"version":1,"entries":[{"id":1}]}'),
    );
    await open(page);
    await typeKeys(page, '1+1=');
    await expect(page.locator('output[aria-label="Result"]')).toContainText('2');
  });
});

test.describe('keyboard', () => {
  test('Enter on a focused key presses that key once; a mouse click never moves focus', async ({ page }) => {
    const requests = recordRequests(page);
    await open(page);
    await page.keyboard.press('Tab'); // first focusable: theme radio group
    await page.getByRole('button', { name: '7', exact: true }).focus();
    await page.keyboard.press('Enter');
    expect(await resultText(page)).toBe('7');
    expect(requests).toHaveLength(0);
    await page.getByRole('button', { name: 'add', exact: true }).focus();
    await page.keyboard.press(' ');
    await page.getByRole('button', { name: '7', exact: true }).focus();
    await page.getByRole('button', { name: '1', exact: true }).click();
    await page.getByRole('button', { name: 'add', exact: true }).click();
    await page.getByRole('button', { name: '2', exact: true }).click();
    await page.getByRole('button', { name: '7', exact: true }).focus();
    await page.getByRole('button', { name: '1', exact: true }).click();
    await expect(page.getByRole('button', { name: '7', exact: true })).toBeFocused();
  });

  test('click 2 + 3 then Enter evaluates once', async ({ page }) => {
    const requests = recordRequests(page);
    await open(page);
    await clickKey(page, '2');
    await clickKey(page, 'add');
    await clickKey(page, '3');
    await page.keyboard.press('Enter');
    await expect(page.locator('output[aria-label="Result"]')).toContainText('5');
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      operation: 'add',
      operands: ['2', '3'],
    });
  });

  test('Enter on the History summary toggles it natively and does not evaluate', async ({ page }) => {
    const requests = recordRequests(page);
    await open(page);
    await typeKeys(page, '5+');
    const summary = page.getByText('History', { exact: true });
    await summary.focus();
    const before = await page.locator('details').evaluate((el: HTMLDetailsElement) => el.open);
    await page.keyboard.press('Enter');
    expect(await page.locator('details').evaluate((el: HTMLDetailsElement) => el.open)).toBe(!before);
    await page.keyboard.press(' ');
    expect(await page.locator('details').evaluate((el: HTMLDetailsElement) => el.open)).toBe(before);
    expect(requests).toHaveLength(0);
  });
});

test.describe('theme, UC-UI-04', () => {
  test('Dark persists across reload before first paint; arrows move the selection; System removes the attribute', async ({
    page,
  }, info) => {
    const problems = await watchProblems(page);
    await open(page);
    expect(await themeAttr(page)).toBeNull();
    await page.locator('label', { hasText: 'Dark' }).click();
    expect(await themeAttr(page)).toBe('dark');
    expect(await page.evaluate(() => window.localStorage.getItem('calculator.theme.v1'))).toBe('dark');
    await page.waitForTimeout(300); // let the 120 ms background transition settle before the capture
    await shot(page, info, 'theme-dark');
    await page.reload();
    await page.getByRole('group', { name: 'Keypad' }).waitFor();
    await page.getByRole('group', { name: 'Keypad' }).waitFor();
    expect(await themeAttr(page)).toBe('dark');
    await expect(page.getByRole('radio', { name: 'Dark' })).toBeChecked();
    await page.getByRole('radio', { name: 'Dark' }).focus();
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByRole('radio', { name: 'Light' })).toBeChecked();
    expect(await themeAttr(page)).toBe('light');
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByRole('radio', { name: 'System' })).toBeChecked();
    expect(await themeAttr(page)).toBeNull();
    expect(await page.evaluate(() => window.localStorage.getItem('calculator.theme.v1'))).toBe('system');
    await page.keyboard.press('5'); // calculator keys still work with a radio focused
    expect(await resultText(page)).toBe('5');
    await collectCsp(page, problems);
    expect(problems).toEqual({ console: [], pageErrors: [], csp: [] });
  });

  test('explicit Light wins over a dark OS preference; junk storage falls back to the system', async ({
    browser,
  }, info) => {
    const dark = await browser.newContext({
      colorScheme: 'dark',
      ...(info.project.use.viewport ? { viewport: info.project.use.viewport } : {}),
    });
    const page = await dark.newPage();
    await open(page);
    const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(await bg()).toBe('rgb(13, 17, 23)'); // system dark: --color-bg #0d1117
    await page.locator('label', { hasText: 'Light' }).click();
    expect(await bg()).toBe('rgb(244, 245, 247)'); // light chosen under a dark OS: #f4f5f7
    await page.reload();
    await page.getByRole('group', { name: 'Keypad' }).waitFor();
    await page.getByRole('group', { name: 'Keypad' }).waitFor();
    expect(await themeAttr(page)).toBe('light');
    expect(await bg()).toBe('rgb(244, 245, 247)');
    await page.evaluate(() => window.localStorage.setItem('calculator.theme.v1', 'purple'));
    await page.reload();
    await page.getByRole('group', { name: 'Keypad' }).waitFor();
    await page.getByRole('group', { name: 'Keypad' }).waitFor();
    expect(await themeAttr(page)).toBeNull();
    expect(await bg()).toBe('rgb(13, 17, 23)');
    await dark.close();
  });
});

test('a stubbed answer shows through the same path (fulfilled route)', async ({ page }) => {
  await page.route('**/api/v1/operations/divide', (route) =>
    route.fulfill(fulfillOk('divide', ['1', '3'], '0.3', true)),
  );
  await open(page);
  await typeKeys(page, '1/3=');
  await expect(page.locator('output[aria-label="Result"]')).toContainText('0.3');
});
