import { describe, expect, it } from 'vitest';
import { actionForCommand, commandForKey, KEYPAD } from './keypad';
import { OPERATIONS } from './operations';
import { deepFreeze } from './testing';
import type { CalculatorAction, Digit, KeyCommand } from './types';

const expected = deepFreeze([
  ['all-clear', 'AC', 'all clear', { kind: 'allClear' }, 'function', 1, 1, 1, ['Escape']],
  ['clear-entry', 'C', 'clear entry', { kind: 'clearEntry' }, 'function', 1, 2, 1, ['Delete']],
  ['backspace', '⌫', 'backspace', { kind: 'backspace' }, 'function', 1, 3, 1, ['Backspace']],
  ['divide', '÷', 'divide', { kind: 'binary', operation: 'divide' }, 'operator', 1, 4, 1, ['/']],
  ['sqrt', '√', 'square root', { kind: 'unary', operation: 'sqrt' }, 'function', 2, 1, 1, ['r']],
  ['power', 'xʸ', 'power', { kind: 'binary', operation: 'power' }, 'operator', 2, 2, 1, ['^']],
  ['percentage', '%', 'percentage', { kind: 'unary', operation: 'percentage' }, 'function', 2, 3, 1, ['%']],
  ['multiply', '×', 'multiply', { kind: 'binary', operation: 'multiply' }, 'operator', 2, 4, 1, ['*']],
  ['digit-7', '7', '7', { kind: 'digit', digit: '7' }, 'digit', 3, 1, 1, ['7']],
  ['digit-8', '8', '8', { kind: 'digit', digit: '8' }, 'digit', 3, 2, 1, ['8']],
  ['digit-9', '9', '9', { kind: 'digit', digit: '9' }, 'digit', 3, 3, 1, ['9']],
  ['subtract', '−', 'subtract', { kind: 'binary', operation: 'subtract' }, 'operator', 3, 4, 1, ['-']],
  ['digit-4', '4', '4', { kind: 'digit', digit: '4' }, 'digit', 4, 1, 1, ['4']],
  ['digit-5', '5', '5', { kind: 'digit', digit: '5' }, 'digit', 4, 2, 1, ['5']],
  ['digit-6', '6', '6', { kind: 'digit', digit: '6' }, 'digit', 4, 3, 1, ['6']],
  ['add', '+', 'add', { kind: 'binary', operation: 'add' }, 'operator', 4, 4, 1, ['+']],
  ['digit-1', '1', '1', { kind: 'digit', digit: '1' }, 'digit', 5, 1, 1, ['1']],
  ['digit-2', '2', '2', { kind: 'digit', digit: '2' }, 'digit', 5, 2, 1, ['2']],
  ['digit-3', '3', '3', { kind: 'digit', digit: '3' }, 'digit', 5, 3, 1, ['3']],
  ['equals', '=', 'equals', { kind: 'equals' }, 'equals', 5, 4, 2, ['Enter', '=']],
  ['sign', '±', 'toggle sign', { kind: 'sign' }, 'function', 6, 1, 1, ['n']],
  ['digit-0', '0', '0', { kind: 'digit', digit: '0' }, 'digit', 6, 2, 1, ['0']],
  ['decimal', '.', 'decimal point', { kind: 'decimal' }, 'digit', 6, 3, 1, ['.', ',']],
]);
describe('keypad', () => {
  it('matches every specified key in row-major order', () => {
    expect(
      KEYPAD.map((k) => [k.id, k.label, k.ariaLabel, k.command, k.variant, k.row, k.column, k.rowSpan, k.bindings]),
    ).toEqual(expected);
  });
  it('covers all cells once, with unique ids and bindings', () => {
    expect(KEYPAD).toHaveLength(23);
    expect(new Set(KEYPAD.map((k) => k.id)).size).toBe(23);
    const bindings = KEYPAD.flatMap((k) => k.bindings);
    expect(new Set(bindings).size).toBe(bindings.length);
    const cells = KEYPAD.flatMap((k) =>
      Array.from({ length: k.rowSpan }, (_, offset) => `${k.row + offset}:${k.column}`),
    );
    expect(cells).toHaveLength(24);
    expect(new Set(cells).size).toBe(24);
    for (let row = 1; row <= 6; row++) for (let col = 1; col <= 4; col++) expect(cells).toContain(`${row}:${col}`);
  });
  it('contains each digit and operation once and freezes its definitions', () => {
    expect(
      KEYPAD.filter((k) => k.command.kind === 'digit')
        .map((k) => k.label)
        .sort(),
    ).toEqual('0123456789'.split(''));
    for (const [operation, info] of Object.entries(OPERATIONS)) {
      expect(
        KEYPAD.filter(
          (k) => (k.command.kind === 'binary' || k.command.kind === 'unary') && k.command.operation === operation,
        ),
      ).toHaveLength(1);
      expect(
        KEYPAD.find(
          (k) => (k.command.kind === 'binary' || k.command.kind === 'unary') && k.command.operation === operation,
        )?.command.kind,
      ).toBe(info.arity === 2 ? 'binary' : 'unary');
    }
    expect(Object.isFrozen(KEYPAD)).toBe(true);
    for (const k of KEYPAD) for (const value of [k, k.command, k.bindings]) expect(Object.isFrozen(value)).toBe(true);
  });
  it('looks up every binding from its key', () => {
    for (const key of KEYPAD) for (const binding of key.bindings) expect(commandForKey(binding)).toBe(key.command);
  });
  it.each<[string, KeyCommand]>([
    ...'0123456789'.split('').map((d): [string, KeyCommand] => [d, { kind: 'digit', digit: d as Digit }]),
    ['.', { kind: 'decimal' }],
    [',', { kind: 'decimal' }],
    ['+', { kind: 'binary', operation: 'add' }],
    ['-', { kind: 'binary', operation: 'subtract' }],
    ['*', { kind: 'binary', operation: 'multiply' }],
    ['/', { kind: 'binary', operation: 'divide' }],
    ['^', { kind: 'binary', operation: 'power' }],
    ['%', { kind: 'unary', operation: 'percentage' }],
    ['r', { kind: 'unary', operation: 'sqrt' }],
    ['n', { kind: 'sign' }],
    ['Enter', { kind: 'equals' }],
    ['=', { kind: 'equals' }],
    ['Backspace', { kind: 'backspace' }],
    ['Delete', { kind: 'clearEntry' }],
    ['Escape', { kind: 'allClear' }],
  ])('binds keyboard key %j as specified', (key, command) => {
    expect(commandForKey(key)).toEqual(command);
  });
  it.each([' ', 'R', 'N', 'x', 'Tab', '__proto__', 'constructor', 'toString', '', 'Enter '])(
    'leaves %s unbound',
    (key) => {
      expect(commandForKey(key)).toBeUndefined();
    },
  );
  it.each<[KeyCommand, CalculatorAction]>([
    [
      { kind: 'digit', digit: '3' },
      { type: 'digitPressed', digit: '3' },
    ],
    [{ kind: 'decimal' }, { type: 'decimalPointPressed' }],
    [{ kind: 'sign' }, { type: 'signToggled' }],
    [{ kind: 'backspace' }, { type: 'backspacePressed' }],
    [{ kind: 'clearEntry' }, { type: 'entryCleared' }],
    [{ kind: 'allClear' }, { type: 'allCleared' }],
    [
      { kind: 'binary', operation: 'power' },
      { type: 'binaryOperatorPressed', operator: 'power' },
    ],
    [
      { kind: 'unary', operation: 'sqrt' },
      { type: 'unaryOperatorPressed', operator: 'sqrt' },
    ],
    [{ kind: 'equals' }, { type: 'equalsPressed' }],
  ])('maps %j exhaustively', (command, action) => {
    expect(actionForCommand(deepFreeze(command))).toEqual(action);
  });
});
