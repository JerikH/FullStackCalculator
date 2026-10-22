import type { Page } from '@playwright/test';
import { expect, nextCalculation, test } from './helpers/fixture.js';
import type { Calc } from './helpers/fixture.js';

/** Presses each character as its own key (`enter` treats a number as one token, which cannot spell `1.2.3`). */
async function type(calc: Calc, characters: string): Promise<void> {
  for (const character of characters) await calc.press(character);
}

/** Presses the keys and waits for the one answer they cause. */
async function enterAndAwait(page: Page, calc: Calc, sequence: string): Promise<void> {
  const answered = nextCalculation(page);
  await calc.enter(sequence);
  await answered;
}

test.describe('UC-UI-02 entry editing (RF-UI-03)', () => {
  test('a second decimal point is ignored', async ({ calc, requests }) => {
    await calc.goto();
    await type(calc, '1.2.3');
    await expect(calc.result()).toHaveText('1.23');
    expect(requests).toHaveLength(0);
  });

  test('the decimal point on a fresh display starts 0. and an unfinished point is kept', async ({ calc }) => {
    await calc.goto();
    await calc.press('.');
    await expect(calc.result()).toHaveText('0.');
    await type(calc, '50');
    await expect(calc.result()).toHaveText('0.50');
  });

  test('leading zeros collapse', async ({ calc }) => {
    await calc.goto();
    await type(calc, '007');
    await expect(calc.result()).toHaveText('7');
    await calc.press('C');
    await type(calc, '000');
    await expect(calc.result()).toHaveText('0');
    await type(calc, '.05');
    await expect(calc.result()).toHaveText('0.05');
  });

  test('the entry is capped at 34 digits: the 35th is ignored', async ({ calc }) => {
    await calc.goto();
    const digits = '1234567890123456789012345678901234';
    await type(calc, digits);
    // The display groups the integer part with commas.
    await expect.poll(async () => (await calc.resultText()).replaceAll(',', '')).toBe(digits);
    await calc.press('5');
    await calc.press('.');
    await expect.poll(async () => (await calc.resultText()).replaceAll(',', '')).toBe(`${digits}.`);
    await calc.press('9');
    await expect.poll(async () => (await calc.resultText()).replaceAll(',', '')).toBe(`${digits}.`);
  });

  test('the sign key toggles, and does nothing on 0', async ({ calc }) => {
    await calc.goto();
    await calc.press('±');
    await expect(calc.result()).toHaveText('0');
    await calc.press('5');
    await calc.press('±');
    await expect(calc.result()).toHaveText('−5');
    await calc.press('±');
    await expect(calc.result()).toHaveText('5');
  });

  test('backspace removes the last character and leaves 0 for a single digit or a lone negative digit', async ({
    calc,
  }) => {
    await calc.goto();
    await type(calc, '123');
    await calc.press('⌫');
    await expect(calc.result()).toHaveText('12');
    await calc.press('⌫');
    await calc.press('⌫');
    await expect(calc.result()).toHaveText('0');
    await calc.press('5');
    await calc.press('±');
    await expect(calc.result()).toHaveText('−5');
    await calc.press('⌫');
    await expect(calc.result()).toHaveText('0');
  });

  test('12. is sent as the operand 12', async ({ page, calc, requests }) => {
    await calc.goto();
    await type(calc, '12.');
    await expect(calc.result()).toHaveText('12.');
    await enterAndAwait(page, calc, '+ 3 =');
    await expect(calc.result()).toHaveText('15');
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ operation: 'add', operands: ['12', '3'], status: 200 });
  });

  test('C clears only the entry: the pending operator and left operand stay', async ({ page, calc, requests }) => {
    await calc.goto();
    await calc.enter('9 + 12');
    await expect(calc.result()).toHaveText('12');
    await calc.press('C');
    await expect(calc.result()).toHaveText('0');
    await expect(calc.expression()).toHaveText('9 +');
    await enterAndAwait(page, calc, '3 =');
    await expect(calc.result()).toHaveText('12');
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ operation: 'add', operands: ['9', '3'], status: 200 });
  });

  test('AC clears the entry, the pending operation and the expression but not the history', async ({
    page,
    calc,
    requests,
  }) => {
    await calc.goto();
    await enterAndAwait(page, calc, '2 + 3 =');
    await expect(calc.result()).toHaveText('5');
    await calc.enter('4 +');
    await expect(calc.expression()).toHaveText('4 +');
    await calc.press('AC');
    await expect(calc.result()).toHaveText('0');
    await expect(calc.expression()).toHaveText('');

    // No operator is pending any more: = is a no-op and the next entry is a plain number.
    await calc.enter('5 =');
    await expect(calc.result()).toHaveText('5');
    await expect(calc.expression()).toHaveText('');
    expect(requests).toHaveLength(1);

    await calc.openHistory();
    await expect(calc.historyRows()).toHaveText(['2 + 3 = 5']);
  });

  for (const clear of ['AC', 'C']) {
    test(`${clear} clears an error`, async ({ page, calc }) => {
      await calc.goto();
      await enterAndAwait(page, calc, '1 ÷ 0 =');
      await expect(calc.alert()).toContainText('Cannot divide by zero');
      await calc.press(clear);
      await expect(calc.alert()).toHaveText('');
      await expect(calc.result()).toHaveText('0');
      await expect(calc.expression()).toHaveText('');
    });
  }
});

test.describe('UC-UI-02 entry editing: results (RF-UI-03, RF-UI-04)', () => {
  test('a result becomes the first operand when an operator follows', async ({ page, calc, requests }) => {
    await calc.goto();
    await enterAndAwait(page, calc, '2 + 3 =');
    await expect(calc.result()).toHaveText('5');
    await calc.press('×');
    await expect(calc.expression()).toHaveText('5 ×');
    await enterAndAwait(page, calc, '4 =');
    await expect(calc.result()).toHaveText('20');
    expect(requests.at(-1)).toMatchObject({ operation: 'multiply', operands: ['5', '4'], status: 200 });
  });

  test('a digit after a result starts a fresh entry', async ({ page, calc, requests }) => {
    await calc.goto();
    await enterAndAwait(page, calc, '2 + 3 =');
    await expect(calc.result()).toHaveText('5');
    await calc.press('7');
    await expect(calc.result()).toHaveText('7');
    await enterAndAwait(page, calc, '+ 1 =');
    await expect(calc.result()).toHaveText('8');
    expect(requests.at(-1)).toMatchObject({ operation: 'add', operands: ['7', '1'], status: 200 });
  });

  test('the decimal point after a result starts 0.', async ({ page, calc }) => {
    await calc.goto();
    await enterAndAwait(page, calc, '2 + 3 =');
    await expect(calc.result()).toHaveText('5');
    await calc.press('.');
    await expect(calc.result()).toHaveText('0.');
  });

  test('backspace does nothing on a fresh result', async ({ page, calc }) => {
    await calc.goto();
    await enterAndAwait(page, calc, '2 + 3 =');
    await expect(calc.result()).toHaveText('5');
    await calc.press('⌫');
    // The sign key is the synchronisation point: both keys act on the same state in order.
    await calc.press('±');
    await expect(calc.result()).toHaveText('−5');
  });

  test('the sign key toggles a result and keeps the approximation marker of an inexact one', async ({ page, calc }) => {
    await calc.goto();
    await enterAndAwait(page, calc, '2 + 3 =');
    await calc.press('±');
    await expect(calc.result()).toHaveText('−5');

    await calc.press('AC');
    await enterAndAwait(page, calc, '1 ÷ 3 =');
    await expect(calc.result().getByTitle('Rounded to 34 significant digits')).toBeVisible();
    await calc.press('±');
    await expect(calc.result()).toContainText(`−0.${'3'.repeat(34)}`);
    await expect(calc.result().getByTitle('Rounded to 34 significant digits')).toBeVisible();
  });
});
