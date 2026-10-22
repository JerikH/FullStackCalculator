import { describe, expect, it } from 'vitest';
import { formatEntry, historyExpression, selectDisplay } from './selectors';
import { deepFreeze } from './testing';
import type { CalculatorState, HistoryEntry } from './types';

const BASE: CalculatorState = {
  entry: '0',
  entryMode: 'typing',
  accumulator: null,
  pendingOperator: null,
  inexact: false,
  status: 'idle',
  error: null,
  request: null,
  history: [],
  nextRequestId: 1,
};

function stateWith(overrides: Partial<CalculatorState>): CalculatorState {
  return deepFreeze({ ...BASE, ...overrides });
}

describe('formatEntry', () => {
  it.each([
    ['0', '0'],
    ['7', '7'],
    ['123', '123'],
    ['1234', '1,234'],
    ['100000', '100,000'],
    ['1000000', '1,000,000'],
    ['-12.5', '−12.5'],
    ['1234567.8900', '1,234,567.8900'],
    ['-1234.', '−1,234.'],
    ['1234.', '1,234.'],
    ['1000.5555', '1,000.5555'],
    ['0.000001', '0.000001'],
    ['0.1234567', '0.1234567'],
    ['-0', '−0'],
    ['-0.', '−0.'],
    ['0.', '0.'],
    ['1234567890123456789012345678901234', '1,234,567,890,123,456,789,012,345,678,901,234'],
  ])('formats %j as %j', (entry, expected) => {
    expect(formatEntry(entry)).toBe(expected);
  });

  it.each([
    ['1e+21', '1e+21'],
    ['1234E+5', '1234E+5'],
    ['123456789e3', '123456789e3'],
    ['1234.5678e-3', '1234.5678e-3'],
    ['-2.5e-10', '−2.5e-10'],
    ['-1234567e+8', '−1234567e+8'],
    ['-1.5E10', '−1.5E10'],
  ])('leaves the scientific value %j ungrouped as %j', (entry, expected) => {
    expect(formatEntry(entry)).toBe(expected);
  });

  it('never leaves an ASCII hyphen as the sign of a negative value', () => {
    for (const entry of ['-1', '-0', '-12.5', '-1234567', '-0.', '-1e+21', '-2.5e-10']) {
      const text = formatEntry(entry);
      expect(text.startsWith('−')).toBe(true);
      expect(text.startsWith('-')).toBe(false);
    }
  });

  it('keeps the exponent sign ASCII', () => {
    expect(formatEntry('1e-7')).toBe('1e-7');
    expect(formatEntry('-1e-7')).toBe('−1e-7');
  });

  it('does not change the digits of the integer part, only inserts commas', () => {
    expect(formatEntry('9007199254740993').replaceAll(',', '')).toBe('9007199254740993');
    expect(formatEntry('9007199254740993')).toBe('9,007,199,254,740,993');
  });
});

describe('selectDisplay', () => {
  it('shows the typed entry and the pending expression', () => {
    const display = selectDisplay(
      stateWith({ entry: '3', accumulator: '12', pendingOperator: 'multiply', entryMode: 'typing' }),
    );
    expect(display.value).toBe('3');
    expect(display.expression).toBe('12 ×');
  });

  it('shows no expression when no binary operator is pending', () => {
    expect(selectDisplay(stateWith({ entry: '42' })).expression).toBe('');
    expect(selectDisplay(stateWith({ entry: '42', accumulator: '5' })).expression).toBe('');
  });

  it('shows no expression when there is an operator but no accumulator', () => {
    expect(selectDisplay(stateWith({ pendingOperator: 'add' })).expression).toBe('');
  });

  it.each([
    ['add', '+'],
    ['subtract', '−'],
    ['multiply', '×'],
    ['divide', '÷'],
    ['power', '^'],
  ] as const)('writes the symbol of %s as %s', (pendingOperator, symbol) => {
    const display = selectDisplay(stateWith({ accumulator: '8', pendingOperator }));
    expect(display.expression).toBe(`8 ${symbol}`);
  });

  it('formats a negative accumulator with the minus sign', () => {
    const display = selectDisplay(stateWith({ entry: '-5', accumulator: '-5', pendingOperator: 'add' }));
    expect(display.expression).toBe('−5 +');
    expect(display.value).toBe('−5');
  });

  it('groups the accumulator and the entry', () => {
    const display = selectDisplay(stateWith({ entry: '1234567', accumulator: '1234', pendingOperator: 'divide' }));
    expect(display.expression).toBe('1,234 ÷');
    expect(display.value).toBe('1,234,567');
  });

  it('leaves a scientific accumulator ungrouped', () => {
    const display = selectDisplay(stateWith({ entry: '2', accumulator: '1.5e+21', pendingOperator: 'multiply' }));
    expect(display.expression).toBe('1.5e+21 ×');
  });

  it('shows an unfinished decimal point and trailing zeros', () => {
    expect(selectDisplay(stateWith({ entry: '12.' })).value).toBe('12.');
    expect(selectDisplay(stateWith({ entry: '1.200' })).value).toBe('1.200');
  });

  describe('size follows the formatted length', () => {
    it.each([
      ['0', 1, 'xl'],
      ['9999999', 9, 'xl'],
      ['12345678', 10, 'xl'],
      ['123456789', 11, 'lg'],
      ['-1234567', 10, 'xl'],
      ['-12345678', 11, 'lg'],
      ['12345678.12345', 16, 'lg'],
      ['-1234567.12345', 16, 'lg'],
      ['12345678.123456', 17, 'md'],
      ['1234567890123', 17, 'md'],
      ['1.2345678901234567e+21', 22, 'md'],
    ] as const)('%j (%i characters) is %s', (entry, length, size) => {
      const display = selectDisplay(stateWith({ entry }));
      expect(display.value).toHaveLength(length);
      expect(display.size).toBe(size);
    });
  });

  it('counts the sign and the commas, not the approximation marker', () => {
    const display = selectDisplay(stateWith({ entry: '12345678', inexact: true }));
    expect(display.value).toBe('12,345,678');
    expect(display.size).toBe('xl');
  });

  it('copies inexact, busy and error without putting the marker in the value', () => {
    const idle = selectDisplay(stateWith({ entry: '0.5', inexact: true }));
    expect(idle.inexact).toBe(true);
    expect(idle.busy).toBe(false);
    expect(idle.error).toBeNull();
    expect(idle.value).not.toContain('≈');

    const exact = selectDisplay(stateWith({ entry: '0.5' }));
    expect(exact.inexact).toBe(false);

    const busy = selectDisplay(stateWith({ status: 'busy' }));
    expect(busy.busy).toBe(true);

    const error = { message: 'Cannot divide by zero', requestId: 'req-1' };
    const failed = selectDisplay(stateWith({ status: 'error', error }));
    expect(failed.busy).toBe(false);
    expect(failed.error).toBe(error);
  });

  it('does not change the state it reads', () => {
    const state = stateWith({ entry: '1234', accumulator: '5', pendingOperator: 'add' });
    const before = JSON.stringify(state);
    selectDisplay(state);
    expect(JSON.stringify(state)).toBe(before);
  });
});

describe('historyExpression', () => {
  function entry(operation: HistoryEntry['operation'], operands: string[], result: string, inexact = false) {
    return deepFreeze<HistoryEntry>({ id: 'h-1', operation, operands, result, inexact });
  }

  it.each([
    [entry('multiply', ['12', '3'], '36'), '12 × 3 = 36'],
    [entry('subtract', ['5', '2'], '3'), '5 − 2 = 3'],
    [entry('add', ['2', '2'], '4'), '2 + 2 = 4'],
    [entry('divide', ['8', '2'], '4'), '8 ÷ 2 = 4'],
    [entry('power', ['2', '10'], '1024'), '2 ^ 10 = 1,024'],
    [entry('sqrt', ['16'], '4'), '√16 = 4'],
    [entry('percentage', ['50'], '0.5'), '50% = 0.5'],
  ])('writes %j as %j', (item, expected) => {
    expect(historyExpression(item)).toBe(expected);
  });

  it('uses the approximation sign for an inexact result', () => {
    expect(historyExpression(entry('divide', ['1', '3'], '0.3333333333333333333333333333333333', true))).toBe(
      '1 ÷ 3 ≈ 0.3333333333333333333333333333333333',
    );
    expect(historyExpression(entry('sqrt', ['2'], '1.4142135623730951', true))).toBe('√2 ≈ 1.4142135623730951');
    expect(historyExpression(entry('percentage', ['1'], '0.01', true))).toBe('1% ≈ 0.01');
  });

  it('writes negatives with the minus sign', () => {
    expect(historyExpression(entry('subtract', ['-5', '-3'], '-2'))).toBe('−5 − −3 = −2');
    expect(historyExpression(entry('sqrt', ['-0'], '0'))).toBe('√−0 = 0');
  });

  it('groups every number', () => {
    expect(historyExpression(entry('multiply', ['1234', '1000'], '1234000'))).toBe('1,234 × 1,000 = 1,234,000');
    expect(historyExpression(entry('percentage', ['1234567'], '12345.67'))).toBe('1,234,567% = 12,345.67');
  });

  it('keeps long scientific values ungrouped', () => {
    expect(historyExpression(entry('add', ['1e+21', '1'], '1e+21', true))).toBe('1e+21 + 1 ≈ 1e+21');
    expect(
      historyExpression(
        entry('multiply', ['-1.2345678901234567890123456789e-100', '2'], '-2.4691357802469135780246913578e-100'),
      ),
    ).toBe('−1.2345678901234567890123456789e-100 × 2 = −2.4691357802469135780246913578e-100');
  });
});
