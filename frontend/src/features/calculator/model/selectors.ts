import type { CalculatorState, DisplayModel, HistoryEntry } from './types';
import { OPERATIONS } from './operations';

const MINUS = '−';
const APPROXIMATELY = '≈';

/**
 * Presentation only: U+2212 for a negative sign, `,` grouping on the integer part, the fraction
 * (trailing zeros and an unfinished point included) kept as typed. Scientific values are only
 * re-signed. The text is never parsed back into an operand.
 */
export function formatEntry(entry: string): string {
  const negative = entry.startsWith('-');
  const body = negative ? entry.slice(1) : entry;
  const sign = negative ? MINUS : '';
  if (/[eE]/.test(body)) return sign + body;
  const point = body.indexOf('.');
  const integer = point === -1 ? body : body.slice(0, point);
  const rest = point === -1 ? '' : body.slice(point);
  return sign + group(integer) + rest;
}

/** Inserts `,` every three digits from the right, in one linear pass. */
function group(digits: string): string {
  const head = digits.length % 3 || 3;
  let out = digits.slice(0, head);
  for (let index = head; index < digits.length; index += 3) out += ',' + digits.slice(index, index + 3);
  return out;
}

function sizeFor(value: string): DisplayModel['size'] {
  if (value.length <= 10) return 'xl';
  if (value.length <= 16) return 'lg';
  return 'md';
}

export function selectDisplay(state: CalculatorState): DisplayModel {
  const value = formatEntry(state.entry);
  const expression =
    state.accumulator !== null && state.pendingOperator !== null
      ? `${formatEntry(state.accumulator)} ${OPERATIONS[state.pendingOperator].symbol}`
      : '';
  return {
    value,
    expression,
    size: sizeFor(value),
    inexact: state.inexact,
    busy: state.status === 'busy',
    error: state.error,
  };
}

/** History item text: `12 × 3 = 36`, `√16 = 4`, `50% = 0.5`; `≈` replaces `=` for an inexact result. */
export function historyExpression(entry: HistoryEntry): string {
  const [first = '', second = ''] = entry.operands;
  const left = formatEntry(first);
  const result = formatEntry(entry.result);
  const equality = entry.inexact ? APPROXIMATELY : '=';
  switch (entry.operation) {
    case 'sqrt':
      return `${OPERATIONS.sqrt.symbol}${left} ${equality} ${result}`;
    case 'percentage':
      return `${left}${OPERATIONS.percentage.symbol} ${equality} ${result}`;
    case 'add':
    case 'subtract':
    case 'multiply':
    case 'divide':
    case 'power':
      return `${left} ${OPERATIONS[entry.operation].symbol} ${formatEntry(second)} ${equality} ${result}`;
  }
}
