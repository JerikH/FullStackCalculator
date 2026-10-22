import type { Page } from '@playwright/test';
import { expect, nextCalculation, test } from './helpers/fixture.js';

/** The operation and operands of every request the page made, in order. */
function sent(requests: { operation: string; operands: string[] }[]): [string, string[]][] {
  return requests.map((call) => [call.operation, call.operands]);
}

/** Presses the keys and waits for the one answer they cause. */
async function pressAndAwait(page: Page, press: () => Promise<void>): Promise<void> {
  const answered = nextCalculation(page);
  await press();
  await answered;
}

test.describe('UC-UI-01 chaining (RF-UI-04)', () => {
  test('2 + 3 × 4 = issues add then multiply and shows 20', async ({ page, calc, requests }) => {
    await calc.goto();
    await calc.enter('2 + 3');
    await expect(calc.expression()).toHaveText('2 +');
    expect(requests).toHaveLength(0);

    // The second binary operator issues the pending addition; its result is the running accumulator.
    await pressAndAwait(page, () => calc.press('×'));
    await expect(calc.result()).toHaveText('5');
    await expect(calc.expression()).toHaveText('5 ×');
    expect(sent(requests)).toEqual([['add', ['2', '3']]]);

    await calc.enter('4');
    await expect(calc.expression()).toHaveText('5 ×');
    await pressAndAwait(page, () => calc.press('='));
    await expect(calc.result()).toHaveText('20');
    await expect(calc.expression()).toHaveText('');
    expect(sent(requests)).toEqual([
      ['add', ['2', '3']],
      ['multiply', ['5', '4']],
    ]);
    expect(requests.map((call) => call.status)).toEqual([200, 200]);
  });

  test('5 + = issues add with the same operand twice and shows 10', async ({ page, calc, requests }) => {
    await calc.goto();
    await calc.enter('5 +');
    await expect(calc.expression()).toHaveText('5 +');
    await pressAndAwait(page, () => calc.press('='));
    await expect(calc.result()).toHaveText('10');
    expect(sent(requests)).toEqual([['add', ['5', '5']]]);
  });

  test('2 + × 3 = replaces the operator and issues one multiply', async ({ page, calc, requests }) => {
    await calc.goto();
    await calc.enter('2 +');
    await expect(calc.expression()).toHaveText('2 +');
    await calc.press('×');
    await expect(calc.expression()).toHaveText('2 ×');
    expect(requests).toHaveLength(0);

    await calc.enter('3');
    await pressAndAwait(page, () => calc.press('='));
    await expect(calc.result()).toHaveText('6');
    expect(sent(requests)).toEqual([['multiply', ['2', '3']]]);
  });

  test('9 + 16 √ × 2 = chains after a unary result: (9 + 4) × 2', async ({ page, calc, requests }) => {
    await calc.goto();
    await calc.enter('9 +');
    await pressAndAwait(page, () => calc.enter('16 √'));
    await expect(calc.result()).toHaveText('4');
    await expect(calc.expression()).toHaveText('9 +');

    // An operator after a unary result issues the pending operation instead of replacing it.
    await pressAndAwait(page, () => calc.press('×'));
    await expect(calc.result()).toHaveText('13');
    await expect(calc.expression()).toHaveText('13 ×');
    await calc.enter('2');
    await pressAndAwait(page, () => calc.press('='));
    await expect(calc.result()).toHaveText('26');
    expect(sent(requests)).toEqual([
      ['sqrt', ['16']],
      ['add', ['9', '4']],
      ['multiply', ['13', '2']],
    ]);
  });

  test('= without a pending operator does nothing', async ({ calc, requests }) => {
    await calc.goto();
    await calc.enter('5 =');
    await expect(calc.result()).toHaveText('5');
    // The next key is a synchronisation point: had `=` sent a request, the display would be busy or changed.
    await calc.press('+');
    await expect(calc.expression()).toHaveText('5 +');
    expect(requests).toHaveLength(0);
  });
});
