import type { Page } from '@playwright/test';
import { expect, nextCalculation, test } from './helpers/fixture.js';

/** Presses the physical keys one after the other. */
async function typeKeys(page: Page, keys: readonly string[]): Promise<void> {
  for (const key of keys) await page.keyboard.press(key);
}

async function activeTag(page: Page): Promise<string> {
  return page.evaluate(() => document.activeElement?.tagName ?? '');
}

test.describe('keyboard input maps to the keypad (RF-UI-02, UC-UI-01)', () => {
  const cases: { keys: string[]; operation: string; operands: string[]; shown: string }[] = [
    { keys: ['0', '.', '1', '+', '0', '.', '2', '='], operation: 'add', operands: ['0.1', '0.2'], shown: '0.3' },
    { keys: ['5', ',', '5', '*', '2', 'Enter'], operation: 'multiply', operands: ['5.5', '2'], shown: '11' },
    { keys: ['9', '-', '4', '='], operation: 'subtract', operands: ['9', '4'], shown: '5' },
    { keys: ['8', '/', '4', 'Enter'], operation: 'divide', operands: ['8', '4'], shown: '2' },
    { keys: ['2', '^', '1', '0', '='], operation: 'power', operands: ['2', '10'], shown: '1,024' },
    { keys: ['1', '6', 'r'], operation: 'sqrt', operands: ['16'], shown: '4' },
    { keys: ['5', '0', '%'], operation: 'percentage', operands: ['50'], shown: '0.5' },
    { keys: ['3', 'n', '+', '4', '='], operation: 'add', operands: ['-3', '4'], shown: '1' },
  ];

  for (const c of cases) {
    test(`${c.keys.join(' ')} sends ${c.operation} ${JSON.stringify(c.operands)} and shows ${c.shown}`, async ({
      page,
      calc,
      requests,
    }) => {
      await calc.goto();
      const answered = nextCalculation(page);
      await typeKeys(page, c.keys);
      expect((await answered).status()).toBe(200);
      await expect(calc.result()).toHaveText(c.shown);
      expect(requests).toHaveLength(1);
      expect(requests[0]).toMatchObject({ operation: c.operation, operands: c.operands, status: 200 });
    });
  }

  test('the physical keyboard and the keypad send identical requests for the same sequence', async ({
    page,
    calc,
    requests,
  }) => {
    await calc.goto();
    let answered = nextCalculation(page);
    await typeKeys(page, ['1', '2', '*', '3', '=']);
    await answered;
    await expect(calc.result()).toHaveText('36');
    await typeKeys(page, ['Escape']);
    answered = nextCalculation(page);
    await calc.enter('12 × 3 =');
    await answered;
    await expect(calc.result()).toHaveText('36');
    expect(requests).toHaveLength(2);
    expect(requests[0]).toMatchObject({ operation: 'multiply', operands: ['12', '3'], status: 200 });
    expect(requests[1]).toMatchObject({ operation: requests[0]?.operation, operands: requests[0]?.operands });
  });

  test('Backspace, Delete and Escape edit the entry, the entry and everything', async ({ page, calc, requests }) => {
    await calc.goto();
    await typeKeys(page, ['1', '2', '3']);
    await expect(calc.result()).toHaveText('123');
    await page.keyboard.press('Backspace');
    await expect(calc.result()).toHaveText('12');
    await page.keyboard.press('Delete');
    await expect(calc.result()).toHaveText('0');
    await typeKeys(page, ['4', '+', '5']);
    await expect(calc.result()).toHaveText('5');
    await expect(calc.expression()).not.toHaveText('');
    await page.keyboard.press('Escape');
    await expect(calc.result()).toHaveText('0');
    await expect(calc.expression()).toHaveText('');
    expect(requests).toHaveLength(0);
  });

  test('keys without a binding are ignored: Space, uppercase R and N, letters', async ({ page, calc, requests }) => {
    await calc.goto();
    await typeKeys(page, ['4', ' ', 'R', 'N', 'x', 'a']);
    await expect(calc.result()).toHaveText('4');
    await page.keyboard.press('$');
    await expect(calc.result()).toHaveText('4');
    expect(requests).toHaveLength(0);
  });

  test('a handled key is consumed (preventDefault) and an unhandled one is not', async ({ page, calc }) => {
    await calc.goto();
    const outcome = await page.evaluate(() => {
      const press = (key: string): boolean => {
        const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
        document.body.dispatchEvent(event);
        return event.defaultPrevented;
      };
      return { handled: press('7'), unhandled: press('q'), space: press(' ') };
    });
    expect(outcome).toEqual({ handled: true, unhandled: false, space: false });
    await expect(calc.result()).toHaveText('7');
  });

  test('holding a digit repeats it, holding Enter evaluates once', async ({ page, calc, requests }) => {
    await calc.goto();
    await page.keyboard.down('7');
    await page.keyboard.down('7');
    await page.keyboard.down('7');
    await page.keyboard.up('7');
    await expect(calc.result()).toHaveText('777');
    await typeKeys(page, ['+', '1']);
    const answered = nextCalculation(page);
    await page.keyboard.down('Enter');
    await page.keyboard.down('Enter');
    await page.keyboard.down('Enter');
    await page.keyboard.up('Enter');
    await answered;
    await expect(calc.result()).toHaveText('778');
    expect(requests).toHaveLength(1);
  });
});

test.describe('focus, Enter and Space (RF-UI-02, UC-UI-01)', () => {
  test('Enter and Space on a focused key press that key once and are not also read as shortcuts', async ({
    page,
    calc,
    requests,
  }) => {
    await calc.goto();
    await calc.key('7').focus();
    await page.keyboard.press('Enter');
    await expect(calc.result()).toHaveText('7');
    await calc.key('5').focus();
    await page.keyboard.press(' ');
    await expect(calc.result()).toHaveText('75');
    await calc.key('+').focus();
    await page.keyboard.press('Enter');
    await expect(calc.expression()).toContainText('+');
    expect(requests).toHaveLength(0);
  });

  test('a pointer click on a key does not move focus, so Enter evaluates instead of pressing the key again', async ({
    page,
    calc,
    requests,
  }) => {
    await calc.goto();
    await calc.press('2');
    await calc.press('+');
    await calc.press('3');
    expect(['BODY', 'HTML']).toContain(await activeTag(page));
    const answered = nextCalculation(page);
    await page.keyboard.press('Enter');
    await answered;
    await expect(calc.result()).toHaveText('5');
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ operation: 'add', operands: ['2', '3'], status: 200 });
  });

  test('a click on a key leaves focus where it was', async ({ calc }) => {
    await calc.goto();
    await calc.key('7').focus();
    await calc.press('1');
    await expect(calc.key('7')).toBeFocused();
    await expect(calc.result()).toHaveText('1');
  });

  test('a tap on a key never leaves focus on it', async ({ page, calc, hasTouch }) => {
    test.skip(!hasTouch, 'taps need a touch context');
    await calc.goto();
    await calc.key('5').tap();
    await expect(calc.result()).toHaveText('5');
    expect(['BODY', 'HTML']).toContain(await activeTag(page));
    await calc.key('+').tap();
    await calc.key('3').tap();
    const answered = nextCalculation(page);
    await page.keyboard.press('Enter');
    await answered;
    await expect(calc.result()).toHaveText('8');
  });

  test('a click on a history row then Enter evaluates with the recalled value once', async ({
    page,
    calc,
    requests,
  }) => {
    await calc.goto();
    let answered = nextCalculation(page);
    await calc.enter('12 × 3 =');
    await answered;
    await calc.press('AC');
    await calc.press('9');
    await calc.press('+');
    await calc.openHistory();
    await expect(calc.historyRows()).toHaveText(['12 × 3 = 36']);
    // Opening the panel by clicking its summary focuses the summary; Enter there would toggle it.
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    });
    await calc.historyRows().first().click();
    expect(['BODY', 'HTML']).toContain(await activeTag(page));
    answered = nextCalculation(page);
    await page.keyboard.press('Enter');
    await answered;
    await expect(calc.result()).toHaveText('45');
    expect(requests).toHaveLength(2);
    expect(requests[1]).toMatchObject({ operation: 'add', operands: ['9', '36'], status: 200 });
  });

  test('Enter and Space on the History summary toggle it natively and do not evaluate', async ({
    page,
    calc,
    requests,
  }) => {
    await calc.goto();
    await typeKeys(page, ['5', '+']);
    const details = page.locator('details');
    const isOpen = (): Promise<boolean> => details.evaluate((element: HTMLDetailsElement) => element.open);
    const before = await isOpen();
    await calc.historySummary().focus();
    await page.keyboard.press('Enter');
    await expect.poll(isOpen).toBe(!before);
    await page.keyboard.press(' ');
    await expect.poll(isOpen).toBe(before);
    expect(requests).toHaveLength(0);
    await expect(calc.result()).toHaveText('5');
    await expect(calc.expression()).toContainText('+');
  });

  test('Enter on a focused theme radio does not evaluate; digits still reach the calculator', async ({
    page,
    calc,
    requests,
  }) => {
    await calc.goto();
    await typeKeys(page, ['2', '+', '3']);
    await page.getByRole('radio', { name: 'Light' }).focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press(' ');
    expect(requests).toHaveLength(0);
    await expect(page.getByRole('radio', { name: 'Light' })).toBeChecked();
    await page.keyboard.press('4');
    await expect(calc.result()).toHaveText('34');
    expect(requests).toHaveLength(0);
  });
});

test.describe('keyboard guards (RF-UI-02)', () => {
  test('Ctrl, Alt and Meta held with a bound key do nothing', async ({ page, calc, requests }) => {
    await calc.goto();
    await typeKeys(page, ['2', '+', '3']);
    for (const combination of ['Control+5', 'Alt+5', 'Meta+5', 'Control+Enter', 'Alt+Enter', 'Meta+Enter']) {
      await page.keyboard.press(combination);
    }
    await expect(calc.result()).toHaveText('3');
    expect(requests).toHaveLength(0);
    // The same keys without a modifier work: the guards, not the harness, held them back.
    const answered = nextCalculation(page);
    await page.keyboard.press('Enter');
    await answered;
    await expect(calc.result()).toHaveText('5');
    expect(requests).toHaveLength(1);
  });

  const editables: { name: string; markup: string }[] = [
    { name: 'a text input', markup: '<input type="text" id="fixture" />' },
    { name: 'a textarea', markup: '<textarea id="fixture"></textarea>' },
    { name: 'a contenteditable element', markup: '<div id="fixture" contenteditable="true" tabindex="0"></div>' },
    { name: 'an element with role textbox', markup: '<div id="fixture" role="textbox" tabindex="0"></div>' },
  ];

  for (const editable of editables) {
    test(`${editable.name} keeps its keys: the calculator ignores them`, async ({ page, calc, requests }) => {
      await calc.goto();
      await typeKeys(page, ['2', '+', '3']);
      // A fixture element that exists only in this test.
      await page.evaluate((markup) => {
        document.body.insertAdjacentHTML('beforeend', markup);
        document.getElementById('fixture')?.focus();
      }, editable.markup);
      await expect(page.locator('#fixture')).toBeFocused();
      await typeKeys(page, ['7', '*', '=', 'Enter', 'Backspace', 'Escape']);
      expect(requests).toHaveLength(0);
      await expect(calc.result()).toHaveText('3');
      await expect(calc.expression()).toContainText('+');
      // Back on the document, the same keys reach the calculator.
      await page.evaluate(() => {
        document.getElementById('fixture')?.blur();
      });
      await page.keyboard.press('4');
      await expect(calc.result()).toHaveText('34');
    });
  }

  test('a text input receives the typed characters', async ({ page, calc }) => {
    await calc.goto();
    await page.evaluate(() => {
      document.body.insertAdjacentHTML('beforeend', '<input type="text" id="fixture" />');
      document.getElementById('fixture')?.focus();
    });
    await page.keyboard.type('1+2');
    await expect(page.locator('#fixture')).toHaveValue('1+2');
    await expect(calc.result()).toHaveText('0');
  });

  test('keys typed during IME composition are ignored', async ({ page, calc, requests }) => {
    await calc.goto();
    const outcome = await page.evaluate(() => {
      const dispatch = (init: KeyboardEventInit): boolean => {
        const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
        document.body.dispatchEvent(event);
        return event.defaultPrevented;
      };
      return {
        composing: dispatch({ key: '5', isComposing: true }),
        // Safari confirms IME input with the legacy keyCode 229, which the application also checks.
        processKey: dispatch({ key: '5', keyCode: 229 }), // eslint-disable-line @typescript-eslint/no-deprecated -- legacy IME code under test
        composingEnter: dispatch({ key: 'Enter', isComposing: true }),
        plain: dispatch({ key: '6' }),
      };
    });
    expect(outcome).toEqual({ composing: false, processKey: false, composingEnter: false, plain: true });
    await expect(calc.result()).toHaveText('6');
    expect(requests).toHaveLength(0);
  });

  test('an event that was already prevented is ignored', async ({ page, calc }) => {
    await calc.goto();
    await page.evaluate(() => {
      const event = new KeyboardEvent('keydown', { key: '8', bubbles: true, cancelable: true });
      document.addEventListener(
        'keydown',
        (e) => {
          e.preventDefault();
        },
        { once: true, capture: true },
      );
      document.body.dispatchEvent(event);
    });
    await expect(calc.result()).toHaveText('0');
    await page.keyboard.press('8');
    await expect(calc.result()).toHaveText('8');
  });
});
