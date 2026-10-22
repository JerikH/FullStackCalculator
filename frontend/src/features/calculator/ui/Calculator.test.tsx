import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  apiWrapper,
  createFakeApi,
  networkError,
  problem,
  success,
  timeoutError,
  unexpectedError,
} from '@/test/calculatorFake';
import type { FakeApi, FakeApiOptions, FakeCall } from '@/test/calculatorFake';
import type { ApiResult, CalculationResult } from '@/shared/api/types';
import { Calculator } from './Calculator';

type User = ReturnType<typeof userEvent.setup>;

const HISTORY_KEY = 'calculator.history.v1';
const ROUNDED = 'Rounded to 34 significant digits';
// 34 significant digits as the service returns them (a typed literal, never computed).
const THIRD = '0.3333333333333333333333333333333333';

afterEach(() => {
  vi.useRealTimers();
});

function setup(options?: FakeApiOptions) {
  const api = createFakeApi(options);
  const user = userEvent.setup();
  const view = render(<Calculator />, { wrapper: apiWrapper(api) });
  return { api, user, ...view };
}

async function press(user: User, ...names: string[]): Promise<void> {
  for (const name of names) await user.click(screen.getByRole('button', { name }));
}

function callAt(api: FakeApi, index: number): FakeCall {
  const call = api.calls[index];
  if (call === undefined) throw new Error(`No API call at index ${index}`);
  return call;
}

async function settle(api: FakeApi, index: number, result: ApiResult<CalculationResult>): Promise<void> {
  const call = callAt(api, index);
  await act(async () => {
    call.resolve(result);
    await Promise.resolve();
  });
}

function output(): HTMLElement {
  return screen.getByRole('status', { name: 'Result' });
}

function value(): string {
  return output().textContent;
}

function alertBox(): HTMLElement {
  return screen.getByRole('alert');
}

function rows(): string[] {
  return screen.queryAllByRole('listitem').map((item) => item.textContent);
}

function storedHistory(): unknown {
  const raw = window.localStorage.getItem(HISTORY_KEY);
  return raw === null ? null : (JSON.parse(raw) as unknown);
}

/** `1 ÷ 0 =` answered with the given failure; leaves the calculator in the error state. */
async function reachError(user: User, api: FakeApi, result: ApiResult<CalculationResult>, index = 0): Promise<void> {
  await press(user, '1', 'divide', '0', 'equals');
  expect(api.calls).toHaveLength(index + 1);
  await settle(api, index, result);
}

describe('Calculator flows', () => {
  it('starts at 0 with an empty expression, no request, an empty alert and the empty history', () => {
    const { api } = setup();
    expect(value()).toBe('0');
    expect(screen.getByText('No calculations yet')).toBeInTheDocument();
    expect(alertBox()).toBeEmptyDOMElement();
    expect(api.calls).toHaveLength(0);
  });

  it('calculates 2 + 3 = by clicking: sends add ["2","3"], shows the answer and adds one history row', async () => {
    const { api, user } = setup();
    await press(user, '2', 'add', '3');
    expect(api.calls).toHaveLength(0);
    expect(screen.getByText('2 +')).toBeInTheDocument();
    await press(user, 'equals');
    expect(api.calls).toHaveLength(1);
    expect(callAt(api, 0).operation).toBe('add');
    expect(callAt(api, 0).operands).toEqual(['2', '3']);
    expect(value()).toBe('3');

    await settle(api, 0, success('add', ['2', '3'], '5'));
    expect(value()).toBe('5');
    expect(rows()).toEqual(['2 + 3 = 5']);
    expect(screen.queryByText('2 +')).toBeNull();
    expect(api.calls).toHaveLength(1);
  });

  it('calculates 2 + 3 = from the keyboard with Enter and with the = key', async () => {
    const { api, user } = setup();
    await user.keyboard('2+3{Enter}');
    expect(api.calls).toHaveLength(1);
    expect(callAt(api, 0).operation).toBe('add');
    expect(callAt(api, 0).operands).toEqual(['2', '3']);
    await settle(api, 0, success('add', ['2', '3'], '5'));
    expect(value()).toBe('5');

    await user.keyboard('*4=');
    expect(api.calls).toHaveLength(2);
    expect(callAt(api, 1).operation).toBe('multiply');
    expect(callAt(api, 1).operands).toEqual(['5', '4']);
  });

  it('E10: ignores unbound keys and keys held with Ctrl, Alt or Meta', async () => {
    const { api, user } = setup();
    await user.keyboard('2+3');
    await user.keyboard('{Control>}{Enter}{/Control}');
    await user.keyboard('{Alt>}{Enter}{/Alt}');
    await user.keyboard('{Meta>}{Enter}{/Meta}');
    await user.keyboard('x R N ');
    expect(api.calls).toHaveLength(0);
    expect(value()).toBe('3');
  });

  it('maps the keyboard to the editing keys: Backspace, Delete and Escape', async () => {
    const { api, user } = setup();
    await user.keyboard('9+12');
    expect(value()).toBe('12');
    await user.keyboard('{Backspace}');
    expect(value()).toBe('1');
    await user.keyboard('{Delete}3=');
    expect(callAt(api, 0).operands).toEqual(['9', '3']);
    await user.keyboard('{Escape}');
    expect(api.calls[0]?.signal?.aborted).toBe(true);
    expect(value()).toBe('0');
  });

  it('regression: click 2, +, 3 then Enter on the page sends exactly one add ["2","3"]', async () => {
    const { api, user } = setup();
    await press(user, '2', 'add', '3');
    expect(document.body).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(api.calls).toHaveLength(1);
    expect(callAt(api, 0).operation).toBe('add');
    expect(callAt(api, 0).operands).toEqual(['2', '3']);
  });

  it('regression: Enter dispatched on window after clicks sends exactly one add ["2","3"]', async () => {
    const { api, user } = setup();
    await press(user, '2', 'add', '3');
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(api.calls).toHaveLength(1);
    expect(callAt(api, 0).operands).toEqual(['2', '3']);
  });

  it.each([
    ['Enter', '{Enter}'],
    ['Space', ' '],
  ])('E9: native activation: %s on the focused 7 key presses 7 once and does not evaluate', async (_name, keys) => {
    const { api, user } = setup();
    await press(user, '2', 'add');
    for (let step = 0; step < 9; step += 1) await user.tab();
    expect(screen.getByRole('button', { name: '7' })).toHaveFocus();
    await user.keyboard(keys);
    expect(value()).toBe('7');
    expect(api.calls).toHaveLength(0);
    expect(screen.getByText('2 +')).toBeInTheDocument();
  });

  it('E9: a key press with `=` still evaluates while a key button has focus', async () => {
    const { api, user } = setup();
    await press(user, '2', 'add', '3');
    for (let step = 0; step < 9; step += 1) await user.tab();
    await user.keyboard('=');
    expect(api.calls).toHaveLength(1);
    expect(callAt(api, 0).operands).toEqual(['2', '3']);
  });

  it('a click never moves focus: a separate element focused beforehand keeps it', async () => {
    const api = createFakeApi();
    const user = userEvent.setup();
    const Wrapper = apiWrapper(api);
    render(
      <Wrapper>
        <button type="button">Other</button>
        <Calculator />
      </Wrapper>,
    );
    screen.getByRole('button', { name: 'Other' }).focus();
    await press(user, '2');
    expect(screen.getByRole('button', { name: 'Other' })).toHaveFocus();
    expect(value()).toBe('2');
  });

  it('renders the 23-key keypad group, all enabled', () => {
    setup();
    const keys = within(screen.getByRole('group', { name: 'Keypad' })).getAllByRole('button');
    expect(keys).toHaveLength(23);
    for (const key of keys) expect(key).toBeEnabled();
  });
});

describe('UC-UI-01 extensions', () => {
  it('E1: a second binary operator after typing issues add ["2","3"], shows 5 and keeps the operator', async () => {
    const { api, user } = setup();
    await press(user, '2', 'add', '3', 'multiply');
    expect(api.calls).toHaveLength(1);
    expect(callAt(api, 0).operation).toBe('add');
    expect(callAt(api, 0).operands).toEqual(['2', '3']);
    await settle(api, 0, success('add', ['2', '3'], '5'));
    expect(value()).toBe('5');
    expect(screen.getByText('5 ×')).toBeInTheDocument();

    await press(user, '4', 'equals');
    expect(api.calls).toHaveLength(2);
    expect(callAt(api, 1).operation).toBe('multiply');
    expect(callAt(api, 1).operands).toEqual(['5', '4']);
    await settle(api, 1, success('multiply', ['5', '4'], '20'));
    expect(value()).toBe('20');
    expect(rows()).toEqual(['5 × 4 = 20', '2 + 3 = 5']);
  });

  it('E2: an operator right after another replaces it with no request (2 + × 3 = multiplies)', async () => {
    const { api, user } = setup();
    await press(user, '2', 'add', 'multiply');
    expect(api.calls).toHaveLength(0);
    expect(screen.getByText('2 ×')).toBeInTheDocument();
    await press(user, '3', 'equals');
    expect(api.calls).toHaveLength(1);
    expect(callAt(api, 0).operation).toBe('multiply');
    expect(callAt(api, 0).operands).toEqual(['2', '3']);
  });

  it('E3: = with a pending operator and no new entry (5 + =) issues add ["5","5"]', async () => {
    const { api, user } = setup();
    await press(user, '5', 'add', 'equals');
    expect(api.calls).toHaveLength(1);
    expect(callAt(api, 0).operation).toBe('add');
    expect(callAt(api, 0).operands).toEqual(['5', '5']);
  });

  it('E4: = with no pending operator does nothing', async () => {
    const { api, user } = setup();
    await press(user, 'equals');
    await user.keyboard('{Enter}=');
    expect(api.calls).toHaveLength(0);
    expect(value()).toBe('0');
    await press(user, '7', 'equals');
    expect(api.calls).toHaveLength(0);
    expect(value()).toBe('7');
  });

  it('chains a unary operator: 9 + 16 √ × 2 = sends sqrt ["16"], add ["9","4"], multiply ["13","2"]', async () => {
    const { api, user } = setup();
    await press(user, '9', 'add', '1', '6', 'square root');
    expect(api.calls).toHaveLength(1);
    expect(callAt(api, 0).operation).toBe('sqrt');
    expect(callAt(api, 0).operands).toEqual(['16']);
    await settle(api, 0, success('sqrt', ['16'], '4'));
    expect(value()).toBe('4');
    expect(screen.getByText('9 +')).toBeInTheDocument();

    await press(user, 'multiply');
    expect(api.calls).toHaveLength(2);
    expect(callAt(api, 1).operation).toBe('add');
    expect(callAt(api, 1).operands).toEqual(['9', '4']);
    await settle(api, 1, success('add', ['9', '4'], '13'));
    expect(value()).toBe('13');

    await press(user, '2', 'equals');
    expect(api.calls).toHaveLength(3);
    expect(callAt(api, 2).operation).toBe('multiply');
    expect(callAt(api, 2).operands).toEqual(['13', '2']);
    await settle(api, 2, success('multiply', ['13', '2'], '26'));
    expect(value()).toBe('26');
  });

  it('E5: keys other than AC are ignored while busy', async () => {
    const { api, user } = setup();
    await press(user, '2', 'add', '3', 'equals');
    expect(api.calls).toHaveLength(1);
    await press(user, '9', 'clear entry', 'add', 'toggle sign', 'backspace', 'decimal point', 'equals', 'square root');
    await user.keyboard('5+=');
    expect(api.calls).toHaveLength(1);
    expect(value()).toBe('3');
    expect(screen.getByText('2 +')).toBeInTheDocument();
    expect(output().closest('[aria-busy]')).toHaveAttribute('aria-busy', 'true');
  });

  it('E5: AC while pending aborts the request, resets the display and keeps history', async () => {
    const { api, user } = setup();
    await press(user, '2', 'add', '3', 'equals');
    await settle(api, 0, success('add', ['2', '3'], '5'));
    await press(user, '4', 'multiply', '6', 'equals');
    expect(api.calls).toHaveLength(2);
    expect(callAt(api, 1).signal?.aborted).toBe(false);

    await press(user, 'all clear');
    expect(callAt(api, 1).signal?.aborted).toBe(true);
    expect(value()).toBe('0');
    expect(screen.queryByText('4 ×')).toBeNull();
    expect(rows()).toEqual(['2 + 3 = 5']);
    expect(api.calls).toHaveLength(2);
  });

  it('E5: a late response of the aborted request changes nothing, even when a new request reuses number 1', async () => {
    const { api, user } = setup({ ignoreAbort: true });
    await press(user, '2', 'add', '3', 'equals');
    expect(api.calls).toHaveLength(1);
    await press(user, 'all clear');
    expect(callAt(api, 0).signal?.aborted).toBe(true);

    await settle(api, 0, success('add', ['2', '3'], '5'));
    expect(value()).toBe('0');
    expect(rows()).toEqual([]);

    // The model restarts request numbers after AC: the new request is number 1 again.
    await press(user, '6', 'add', '7', 'equals');
    expect(api.calls).toHaveLength(2);
    expect(callAt(api, 1).operands).toEqual(['6', '7']);
    await settle(api, 0, success('add', ['2', '3'], '5'));
    expect(value()).toBe('7');
    expect(rows()).toEqual([]);

    await settle(api, 1, success('add', ['6', '7'], '13'));
    expect(value()).toBe('13');
    expect(rows()).toEqual(['6 + 7 = 13']);
  });

  it.each([
    ['a problem with a request id', problem('DIVISION_BY_ZERO', 'req-abc.1'), 'Cannot divide by zero', 'req-abc.1'],
    ['a problem without a request id', problem('UNDEFINED_RESULT'), 'Result is undefined', undefined],
    ['an overflow problem', problem('OVERFLOW', 'req-2'), 'Result is out of range', 'req-2'],
    ['a rate limit', problem('RATE_LIMITED'), 'Too many requests, try again shortly', undefined],
    ['a validation problem', problem('VALIDATION_FAILED'), 'Invalid input', undefined],
    ['an unknown route problem', problem('NOT_FOUND'), 'Something went wrong', undefined],
    ['a network failure', networkError(), 'Calculator service is unreachable', undefined],
    ['a timeout', timeoutError(), 'Calculator service timed out', undefined],
    ['an unexpected response', unexpectedError(502), 'Something went wrong', undefined],
    ['an unexpected response without status', unexpectedError(), 'Something went wrong', undefined],
  ])('E6/E7: %s shows the fixed copy in the one alert region', async (_name, result, message, requestId) => {
    const { api, user } = setup();
    await reachError(user, api, result);
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(alertBox()).toHaveTextContent(message);
    if (requestId === undefined) expect(alertBox()).not.toHaveTextContent('Ref');
    else expect(alertBox()).toHaveTextContent(`Ref: ${requestId}`);
    expect(alertBox()).not.toHaveTextContent('server title');
    expect(alertBox()).not.toHaveTextContent('server detail');
    expect(value()).toBe('');
    expect(rows()).toEqual([]);
    expect(output().closest('[aria-busy]')).toHaveAttribute('aria-busy', 'false');
  });

  it('E6: a request id that is not id-shaped is dropped and nothing is rendered as markup', async () => {
    const { api, user } = setup();
    await reachError(user, api, problem('DIVISION_BY_ZERO', '<img-src=x>'));
    expect(alertBox()).toHaveTextContent('Cannot divide by zero');
    expect(alertBox()).not.toHaveTextContent('img');
    expect(alertBox().querySelector('img')).toBeNull();
  });

  describe('E6: an error is recovered by', () => {
    it('a digit', async () => {
      const { api, user } = setup();
      await reachError(user, api, problem('DIVISION_BY_ZERO', 'req-1'));
      await press(user, '5');
      expect(alertBox()).toBeEmptyDOMElement();
      expect(value()).toBe('5');
    });

    it('the decimal point', async () => {
      const { api, user } = setup();
      await reachError(user, api, problem('DIVISION_BY_ZERO', 'req-1'));
      await press(user, 'decimal point');
      expect(alertBox()).toBeEmptyDOMElement();
      expect(value()).toBe('0.');
    });

    it('C', async () => {
      const { api, user } = setup();
      await reachError(user, api, networkError());
      await press(user, 'clear entry');
      expect(alertBox()).toBeEmptyDOMElement();
      expect(value()).toBe('0');
    });

    it('AC', async () => {
      const { api, user } = setup();
      await reachError(user, api, timeoutError());
      await press(user, 'all clear');
      expect(alertBox()).toBeEmptyDOMElement();
      expect(value()).toBe('0');
    });

    it('a history recall', async () => {
      const { api, user } = setup();
      await press(user, '2', 'add', '3', 'equals');
      await settle(api, 0, success('add', ['2', '3'], '5'));
      await reachError(user, api, problem('DIVISION_BY_ZERO', 'req-9'), 1);
      expect(alertBox()).toHaveTextContent('Cannot divide by zero');
      expect(rows()).toEqual(['2 + 3 = 5']);

      await press(user, 'Use result 5');
      expect(alertBox()).toBeEmptyDOMElement();
      expect(value()).toBe('5');
      expect(api.calls).toHaveLength(2);
    });

    it('ignores operators, equals and sign while in error', async () => {
      const { api, user } = setup();
      await reachError(user, api, networkError());
      await press(user, 'add', 'equals', 'toggle sign', 'backspace', 'square root');
      expect(alertBox()).toHaveTextContent('Calculator service is unreachable');
      expect(api.calls).toHaveLength(1);
    });
  });

  it('E8: an inexact result shows every digit, the ≈ marker and the explanation', async () => {
    const { api, user } = setup();
    await press(user, '1', 'divide', '3', 'equals');
    await settle(api, 0, success('divide', ['1', '3'], THIRD, true));
    expect(output()).toHaveTextContent(THIRD);
    expect(output()).toHaveTextContent('≈');
    expect(output()).toHaveTextContent(ROUNDED);
    expect(screen.getByTitle(ROUNDED)).toBeInTheDocument();
    expect(rows()).toEqual([`1 ÷ 3 ≈ ${THIRD}`]);
  });

  it('a digit after an inexact result replaces it and clears the ≈ marker', async () => {
    const { api, user } = setup();
    await press(user, '1', 'divide', '3', 'equals');
    await settle(api, 0, success('divide', ['1', '3'], THIRD, true));
    await press(user, '8');
    expect(value()).toBe('8');
    expect(screen.queryByTitle(ROUNDED)).toBeNull();
  });

  it('E10: keys typed in an editable element are not handled', async () => {
    const api = createFakeApi();
    const user = userEvent.setup();
    const Wrapper = apiWrapper(api);
    render(
      <Wrapper>
        <input aria-label="Notes" />
        <Calculator />
      </Wrapper>,
    );
    await press(user, '2', 'add', '3');
    await user.click(screen.getByRole('textbox', { name: 'Notes' }));
    await user.keyboard('4{Enter}');
    expect(value()).toBe('3');
    expect(api.calls).toHaveLength(0);
    expect(screen.getByRole('textbox', { name: 'Notes' })).toHaveValue('4');
  });
});

describe('UC-UI-02 extensions', () => {
  it('E1: the 35th digit is ignored', async () => {
    const { user } = setup();
    await user.keyboard('1'.repeat(34));
    expect(value().replaceAll(',', '')).toBe('1'.repeat(34));
    await user.keyboard('2');
    expect(value().replaceAll(',', '')).toBe('1'.repeat(34));
  });

  it('E2: a digit replaces a fresh result, . gives 0. and backspace does nothing', async () => {
    const { api, user } = setup();
    await press(user, '2', 'add', '3', 'equals');
    await settle(api, 0, success('add', ['2', '3'], '5'));
    await press(user, 'backspace');
    expect(value()).toBe('5');
    await press(user, '7');
    expect(value()).toBe('7');

    await press(user, '4', 'multiply', '2', 'equals');
    await settle(api, 1, success('multiply', ['4', '2'], '8'));
    await press(user, 'decimal point');
    expect(value()).toBe('0.');
  });

  it('E2: the sign toggles on a result and keeps the ≈ marker', async () => {
    const { api, user } = setup();
    await press(user, '1', 'divide', '3', 'equals');
    await settle(api, 0, success('divide', ['1', '3'], THIRD, true));
    await press(user, 'toggle sign');
    expect(value()).toContain(`−${THIRD}`);
    expect(value()).toContain('≈');
    await press(user, 'toggle sign');
    expect(value()).toContain(THIRD);
    expect(value()).not.toContain('−');
    expect(value()).toContain('≈');
  });

  it('E2: the sign toggles a scientific result (1e+21) in place and keeps the ≈ marker', async () => {
    const { api, user } = setup();
    await press(user, '1', '0', 'power', '2', '1', 'equals');
    expect(callAt(api, 0).operation).toBe('power');
    expect(callAt(api, 0).operands).toEqual(['10', '21']);
    await settle(api, 0, success('power', ['10', '21'], '1e+21', true));
    expect(output()).toHaveTextContent('1e+21');
    await press(user, 'toggle sign');
    expect(output()).toHaveTextContent('−1e+21');
    expect(output()).toHaveTextContent('≈');
    await press(user, 'toggle sign');
    expect(output()).not.toHaveTextContent('−');
    expect(output()).toHaveTextContent('≈');
  });

  it('E3: the sign on 0 changes nothing and backspace on -5 gives 0', async () => {
    const { user } = setup();
    await press(user, 'toggle sign');
    expect(value()).toBe('0');
    await press(user, '5', 'toggle sign');
    expect(value()).toBe('−5');
    await press(user, 'backspace');
    expect(value()).toBe('0');
  });

  it('E4: 12. becomes an operand and is sent as 12', async () => {
    const { api, user } = setup();
    await press(user, '1', '2', 'decimal point');
    expect(value()).toBe('12.');
    await press(user, 'add', '3', 'equals');
    expect(callAt(api, 0).operands).toEqual(['12', '3']);
  });

  it('C resets only the entry; AC resets everything but history (9 + 12 C 3 = sends add ["9","3"])', async () => {
    const { api, user } = setup();
    await press(user, '9', 'add', '1', '2', 'clear entry');
    expect(value()).toBe('0');
    expect(screen.getByText('9 +')).toBeInTheDocument();
    await press(user, '3', 'equals');
    expect(callAt(api, 0).operands).toEqual(['9', '3']);
    await settle(api, 0, success('add', ['9', '3'], '12'));

    await press(user, '5', 'subtract', 'all clear');
    expect(value()).toBe('0');
    expect(screen.queryByText('5 −')).toBeNull();
    expect(rows()).toEqual(['9 + 3 = 12']);
  });
});

describe('UC-UI-03 extensions', () => {
  async function withSixTimesSix(): Promise<ReturnType<typeof setup>> {
    const context = setup();
    await press(context.user, '6', 'multiply', '6', 'equals');
    await settle(context.api, 0, success('multiply', ['6', '6'], '36'));
    return context;
  }

  it('recalls a result as the right operand: 9 + [Use result 36] = sends add ["9","36"]', async () => {
    const { api, user } = await withSixTimesSix();
    await press(user, '9', 'add', 'Use result 36');
    expect(value()).toBe('36');
    expect(api.calls).toHaveLength(1);
    await press(user, 'equals');
    expect(api.calls).toHaveLength(2);
    expect(callAt(api, 1).operation).toBe('add');
    expect(callAt(api, 1).operands).toEqual(['9', '36']);
  });

  it('a mouse recall followed by Enter on the page evaluates: focus did not stay on the row', async () => {
    const { api, user } = await withSixTimesSix();
    await press(user, '9', 'add', 'Use result 36');
    expect(screen.getByRole('button', { name: 'Use result 36' })).not.toHaveFocus();
    expect(document.body).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(api.calls).toHaveLength(2);
    expect(callAt(api, 1).operands).toEqual(['9', '36']);
  });

  it('E5: Clear history empties the list and storage but leaves the current calculation untouched', async () => {
    const { api, user } = await withSixTimesSix();
    await press(user, '1', 'add');
    expect(screen.getByText('1 +')).toBeInTheDocument();
    expect(rows()).toEqual(['6 × 6 = 36']);

    await press(user, 'Clear history');
    expect(rows()).toEqual([]);
    expect(screen.getByText('No calculations yet')).toBeInTheDocument();
    expect(storedHistory()).toEqual({ version: 1, entries: [] });
    expect(value()).toBe('1');
    expect(screen.getByText('1 +')).toBeInTheDocument();
    expect(api.calls).toHaveLength(1);
    // a mouse click leaves focus alone, so the next Enter evaluates instead of toggling the summary
    expect(screen.getByText('History')).not.toHaveFocus();

    await press(user, '2', 'equals');
    expect(callAt(api, 1).operands).toEqual(['1', '2']);
  });

  it('E6: recall and Clear history are ignored while busy', async () => {
    const { api, user } = await withSixTimesSix();
    await press(user, '2', 'add', '3', 'equals');
    expect(api.calls).toHaveLength(2);
    await press(user, 'Use result 36', 'Clear history');
    expect(value()).toBe('3');
    expect(rows()).toEqual(['6 × 6 = 36']);
    await settle(api, 1, success('add', ['2', '3'], '5'));
    expect(value()).toBe('5');
  });

  it('persists the history envelope after a success', async () => {
    const { api, user } = setup();
    expect(storedHistory()).toBeNull();
    await press(user, '2', 'add', '3', 'equals');
    expect(storedHistory()).toBeNull();
    await settle(api, 0, success('add', ['2', '3'], '5'));
    expect(storedHistory()).toEqual({
      version: 1,
      entries: [
        { id: expect.any(String) as unknown, operation: 'add', operands: ['2', '3'], result: '5', inexact: false },
      ],
    });
  });

  it('E7: a fresh render shows the same rows from storage', async () => {
    const first = setup();
    await press(first.user, '2', 'add', '3', 'equals');
    await settle(first.api, 0, success('add', ['2', '3'], '5'));
    await press(first.user, '1', 'divide', '3', 'equals');
    await settle(first.api, 1, success('divide', ['1', '3'], THIRD, true));
    const before = rows();
    expect(before).toEqual([`1 ÷ 3 ≈ ${THIRD}`, '2 + 3 = 5']);
    first.unmount();

    const second = setup();
    expect(rows()).toEqual(before);
    expect(second.api.calls).toHaveLength(0);
    expect(value()).toBe('0');
  });

  it('E3: corrupt stored history is ignored: the app starts empty and still calculates', async () => {
    window.localStorage.setItem(HISTORY_KEY, '{"version":1,"entries":[{"id":"a"}]}');
    const { api, user } = setup();
    expect(screen.getByText('No calculations yet')).toBeInTheDocument();
    expect(window.localStorage.getItem(HISTORY_KEY)).toBe('{"version":1,"entries":[{"id":"a"}]}');
    await press(user, '2', 'add', '3', 'equals');
    await settle(api, 0, success('add', ['2', '3'], '5'));
    expect(rows()).toEqual(['2 + 3 = 5']);
  });

  it('E4: blocked storage keeps history in memory and calculations unaffected', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const { api, user } = setup();
    await press(user, '2', 'add', '3', 'equals');
    await settle(api, 0, success('add', ['2', '3'], '5'));
    expect(value()).toBe('5');
    expect(rows()).toEqual(['2 + 3 = 5']);
  });
});

describe('busy spinner', () => {
  it('appears only after 150 ms of busy and not at 149 ms', async () => {
    vi.useFakeTimers();
    const api = createFakeApi();
    render(<Calculator />, { wrapper: apiWrapper(api) });
    for (const name of ['2', 'add', '3', 'equals']) fireEvent.click(screen.getByRole('button', { name }));
    expect(api.calls).toHaveLength(1);
    expect(screen.queryByText('Calculating')).toBeNull();

    act(() => {
      vi.advanceTimersByTime(149);
    });
    expect(screen.queryByText('Calculating')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByText('Calculating')).toBeInTheDocument();

    const call = callAt(api, 0);
    await act(async () => {
      call.resolve(success('add', ['2', '3'], '5'));
      await Promise.resolve();
    });
    expect(screen.queryByText('Calculating')).toBeNull();
    expect(value()).toBe('5');
  });

  it('does not appear when the answer arrives within 150 ms', async () => {
    vi.useFakeTimers();
    const api = createFakeApi();
    render(<Calculator />, { wrapper: apiWrapper(api) });
    for (const name of ['2', 'add', '3', 'equals']) fireEvent.click(screen.getByRole('button', { name }));
    act(() => {
      vi.advanceTimersByTime(100);
    });
    const call = callAt(api, 0);
    await act(async () => {
      call.resolve(success('add', ['2', '3'], '5'));
      await Promise.resolve();
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.queryByText('Calculating')).toBeNull();
  });
});
