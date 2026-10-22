import { OPERATIONS } from './operations';
import type { CalculatorAction, Digit, KeyCommand, KeyDefinition } from './types';

function key(
  id: string,
  label: string,
  ariaLabel: string,
  command: KeyCommand,
  variant: KeyDefinition['variant'],
  row: number,
  column: number,
  bindings: readonly string[],
  rowSpan: 1 | 2 = 1,
): KeyDefinition {
  return Object.freeze({
    id,
    label,
    ariaLabel,
    command: Object.freeze(command),
    variant,
    row,
    column,
    rowSpan,
    bindings: Object.freeze([...bindings]),
  });
}
function digit(d: Digit, row: number, column: number): KeyDefinition {
  return key(`digit-${d}`, d, d, { kind: 'digit', digit: d }, 'digit', row, column, [d]);
}
export const KEYPAD: readonly KeyDefinition[] = Object.freeze([
  key('all-clear', 'AC', 'AC, all clear', { kind: 'allClear' }, 'function', 1, 1, ['Escape']),
  key('clear-entry', 'C', 'clear entry', { kind: 'clearEntry' }, 'function', 1, 2, ['Delete']),
  key('backspace', '⌫', 'backspace', { kind: 'backspace' }, 'function', 1, 3, ['Backspace']),
  key('divide', OPERATIONS.divide.symbol, 'divide', { kind: 'binary', operation: 'divide' }, 'operator', 1, 4, ['/']),
  key('sqrt', OPERATIONS.sqrt.symbol, 'square root', { kind: 'unary', operation: 'sqrt' }, 'function', 2, 1, ['r']),
  key('power', 'xʸ', 'xʸ, power', { kind: 'binary', operation: 'power' }, 'operator', 2, 2, ['^']),
  key(
    'percentage',
    OPERATIONS.percentage.symbol,
    'percentage',
    { kind: 'unary', operation: 'percentage' },
    'function',
    2,
    3,
    ['%'],
  ),
  key('multiply', OPERATIONS.multiply.symbol, 'multiply', { kind: 'binary', operation: 'multiply' }, 'operator', 2, 4, [
    '*',
  ]),
  digit('7', 3, 1),
  digit('8', 3, 2),
  digit('9', 3, 3),
  key('subtract', OPERATIONS.subtract.symbol, 'subtract', { kind: 'binary', operation: 'subtract' }, 'operator', 3, 4, [
    '-',
  ]),
  digit('4', 4, 1),
  digit('5', 4, 2),
  digit('6', 4, 3),
  key('add', OPERATIONS.add.symbol, 'add', { kind: 'binary', operation: 'add' }, 'operator', 4, 4, ['+']),
  digit('1', 5, 1),
  digit('2', 5, 2),
  digit('3', 5, 3),
  key('equals', '=', 'equals', { kind: 'equals' }, 'equals', 5, 4, ['Enter', '='], 2),
  key('sign', '±', 'toggle sign', { kind: 'sign' }, 'function', 6, 1, ['n']),
  digit('0', 6, 2),
  key('decimal', '.', 'decimal point', { kind: 'decimal' }, 'digit', 6, 3, ['.', ',']),
]);
const commands = new Map(
  KEYPAD.flatMap((definition) => definition.bindings.map((binding) => [binding, definition.command] as const)),
);
export function commandForKey(key: string): KeyCommand | undefined {
  return commands.get(key);
}
export function actionForCommand(command: KeyCommand): CalculatorAction {
  switch (command.kind) {
    case 'digit':
      return { type: 'digitPressed', digit: command.digit };
    case 'decimal':
      return { type: 'decimalPointPressed' };
    case 'sign':
      return { type: 'signToggled' };
    case 'backspace':
      return { type: 'backspacePressed' };
    case 'clearEntry':
      return { type: 'entryCleared' };
    case 'allClear':
      return { type: 'allCleared' };
    case 'binary':
      return { type: 'binaryOperatorPressed', operator: command.operation };
    case 'unary':
      return { type: 'unaryOperatorPressed', operator: command.operation };
    case 'equals':
      return { type: 'equalsPressed' };
  }
}
