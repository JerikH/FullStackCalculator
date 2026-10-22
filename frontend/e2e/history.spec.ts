import type { Page } from '@playwright/test';
import { expect, nextCalculation, pace, test } from './helpers/fixture.js';
import type { Calc } from './helpers/fixture.js';

const STORAGE_KEY = 'calculator.history.v1';

/** Presses the keys and waits for the one answer they cause. */
async function enterAndAwait(page: Page, calc: Calc, sequence: string): Promise<void> {
  const answered = nextCalculation(page);
  await calc.enter(sequence);
  await answered;
}

/** Reloads and waits for the keypad; the History panel keeps its default state for the viewport. */
async function reload(page: Page): Promise<void> {
  await page.reload();
  await page.getByRole('group', { name: 'Keypad' }).waitFor();
}

/**
 * Moves focus off whatever holds it. On the phone project the History summary keeps focus after it is opened by a
 * tap, and Enter on a focused summary toggles it natively (RF-UI-02) instead of reaching the calculator.
 */
async function releaseFocus(page: Page): Promise<void> {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
}

interface Stored {
  version: number;
  entries: { operation: string; operands: string[]; result: string; inexact: boolean }[];
}

async function storedHistory(page: Page): Promise<Stored | null> {
  const raw = await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY);
  return raw === null ? null : (JSON.parse(raw) as Stored);
}

test.describe('UC-UI-03 history (RF-UI-10)', () => {
  test('an empty history says so', async ({ calc }) => {
    await calc.goto();
    await calc.openHistory();
    await expect(calc.page.getByText('No calculations yet')).toBeVisible();
    await expect(calc.historyRows()).toHaveCount(0);
  });

  test('completed calculations are listed newest first, each named «<visible expression>, use result»', async ({
    page,
    calc,
  }) => {
    await calc.goto();
    await enterAndAwait(page, calc, '12 × 3 =');
    await enterAndAwait(page, calc, '16 √');
    await enterAndAwait(page, calc, '50 %');
    await expect(calc.result()).toHaveText('0.5');
    await calc.openHistory();
    const visible = ['50% = 0.5', '√16 = 4', '12 × 3 = 36'];
    await expect(calc.historyRows()).toHaveText(visible);
    for (const [index, text] of visible.entries()) {
      await expect(calc.historyRows().nth(index)).toHaveAccessibleName(`${text}, use result`);
    }
  });

  test('an inexact calculation reads with ≈ and the full value', async ({ page, calc }) => {
    await calc.goto();
    await enterAndAwait(page, calc, '1 ÷ 3 =');
    await calc.openHistory();
    await expect(calc.historyRows()).toHaveCount(1);
    await expect(calc.historyRows().first()).toHaveText(`1 ÷ 3 ≈ 0.${'3'.repeat(34)}`);
  });

  test('the list survives a reload and is stored as the results the service returned', async ({ page, calc }) => {
    await calc.goto();
    await enterAndAwait(page, calc, '5 − 8 =');
    await enterAndAwait(page, calc, '2 xʸ 10 =');
    await calc.openHistory();
    await expect(calc.historyRows()).toHaveText(['2 ^ 10 = 1,024', '5 − 8 = −3']);

    expect(await storedHistory(page)).toMatchObject({
      version: 1,
      entries: [
        { operation: 'power', operands: ['2', '10'], result: '1024', inexact: false },
        { operation: 'subtract', operands: ['5', '8'], result: '-3', inexact: false },
      ],
    });

    await reload(page);
    await calc.openHistory();
    await expect(calc.historyRows()).toHaveText(['2 ^ 10 = 1,024', '5 − 8 = −3']);
    // A reload starts a new calculation: the display is back to 0.
    await expect(calc.result()).toHaveText('0');
  });

  test('recalling a row puts its result in as the right operand of a pending operator', async ({
    page,
    calc,
    requests,
  }) => {
    await calc.goto();
    await enterAndAwait(page, calc, '12 × 3 =');
    await calc.press('AC');
    await calc.enter('9 +');
    await calc.openHistory();
    await calc.page.getByRole('button', { name: '12 × 3 = 36, use result', exact: true }).click();
    await expect(calc.result()).toHaveText('36');
    await expect(calc.expression()).toHaveText('9 +');

    const answered = nextCalculation(page);
    await calc.press('=');
    await answered;
    await expect(calc.result()).toHaveText('45');
    expect(requests).toHaveLength(2);
    expect(requests[1]).toMatchObject({ operation: 'add', operands: ['9', '36'], status: 200 });
  });

  test('a pointer recall leaves focus where it was, so Enter evaluates', async ({ page, calc, requests }) => {
    await calc.goto();
    await enterAndAwait(page, calc, '12 × 3 =');
    await calc.press('AC');
    await calc.enter('9 +');
    await calc.openHistory();
    await calc.page.getByRole('button', { name: '12 × 3 = 36, use result', exact: true }).click();
    await expect(calc.result()).toHaveText('36');
    await releaseFocus(page);

    const answered = nextCalculation(page);
    await page.keyboard.press('Enter');
    await answered;
    await expect(calc.result()).toHaveText('45');
    expect(requests.at(-1)).toMatchObject({ operation: 'add', operands: ['9', '36'], status: 200 });
  });

  test('recalling a row with no pending operator makes it the first operand', async ({ page, calc, requests }) => {
    await calc.goto();
    await enterAndAwait(page, calc, '5 − 8 =');
    await calc.press('AC');
    await calc.openHistory();
    await calc.page.getByRole('button', { name: '5 − 8 = −3, use result', exact: true }).click();
    // The raw result is the entry; the display only formats it.
    await expect(calc.result()).toHaveText('−3');
    await enterAndAwait(page, calc, '+ 1 =');
    await expect(calc.result()).toHaveText('−2');
    expect(requests.at(-1)).toMatchObject({ operation: 'add', operands: ['-3', '1'], status: 200 });
  });

  test('recalling an inexact row drops the approximation marker and keeps the raw value', async ({
    page,
    calc,
    requests,
  }) => {
    await calc.goto();
    await enterAndAwait(page, calc, '1 ÷ 3 =');
    await calc.press('AC');
    await calc.openHistory();
    await calc.historyRows().first().click();
    await expect(calc.result()).toHaveText(`0.${'3'.repeat(34)}`);
    await expect(calc.result().getByTitle('Rounded to 34 significant digits')).toHaveCount(0);
    await enterAndAwait(page, calc, '× 3 =');
    expect(requests.at(-1)).toMatchObject({
      operation: 'multiply',
      operands: [`0.${'3'.repeat(34)}`, '3'],
      status: 200,
    });
  });

  test('the history keeps the newest 20: the 21st calculation evicts the oldest', async ({ page, calc }) => {
    test.setTimeout(90_000);
    await calc.goto();
    for (let n = 1; n <= 21; n += 1) {
      await enterAndAwait(page, calc, `${n} + 1 =`);
      await pace(page);
    }
    await calc.openHistory();
    await expect(calc.historyRows()).toHaveCount(20);
    await expect(calc.historyRows().first()).toHaveText('21 + 1 = 22');
    await expect(calc.historyRows().last()).toHaveText('2 + 1 = 3');
    expect((await storedHistory(page))?.entries).toHaveLength(20);
  });

  test('Clear history empties the list and the stored value, and a reload keeps it empty', async ({ page, calc }) => {
    await calc.goto();
    await enterAndAwait(page, calc, '2 + 3 =');
    await enterAndAwait(page, calc, '16 √');
    await calc.openHistory();
    await expect(calc.historyRows()).toHaveCount(2);

    // A pointer click must not move focus (the next Enter has to evaluate).
    await releaseFocus(page);
    await calc.page.getByRole('button', { name: 'Clear history', exact: true }).click();
    await expect(calc.page.getByText('No calculations yet')).toBeVisible();
    await expect(calc.historySummary()).not.toBeFocused();
    // The calculation in progress is untouched.
    await expect(calc.result()).toHaveText('4');
    expect((await storedHistory(page))?.entries ?? []).toEqual([]);

    await reload(page);
    await calc.openHistory();
    await expect(calc.page.getByText('No calculations yet')).toBeVisible();
  });

  test('Clear history by keyboard moves focus to the History summary', async ({ page, calc }) => {
    await calc.goto();
    await enterAndAwait(page, calc, '2 + 3 =');
    await calc.openHistory();
    const clear = calc.page.getByRole('button', { name: 'Clear history', exact: true });
    await clear.focus();
    await page.keyboard.press('Enter');
    await expect(calc.page.getByText('No calculations yet')).toBeVisible();
    await expect(calc.historySummary()).toBeFocused();
  });

  const corrupt: Record<string, string> = {
    'text that is not JSON': 'not json {',
    'another version': JSON.stringify({ version: 2, entries: [] }),
    'an entry with missing fields': JSON.stringify({ version: 1, entries: [{ id: '1' }] }),
    'an entry with an operand that is not a decimal': JSON.stringify({
      version: 1,
      entries: [{ id: '1', operation: 'add', operands: ['1', 'x'], result: '2', inexact: false }],
    }),
  };
  for (const [name, value] of Object.entries(corrupt)) {
    test(`corrupt stored history (${name}) is ignored and the app works`, async ({ page, calc }) => {
      await page.addInitScript(
        (init: { key: string; stored: string }) => {
          window.localStorage.setItem(init.key, init.stored);
        },
        { key: STORAGE_KEY, stored: value },
      );
      await calc.goto();
      await calc.openHistory();
      await expect(calc.page.getByText('No calculations yet')).toBeVisible();
      await enterAndAwait(page, calc, '1 + 1 =');
      await expect(calc.result()).toHaveText('2');
      await expect(calc.historyRows()).toHaveText(['1 + 1 = 2']);
    });
  }
});
