import type { OperationName } from '@/shared/api/types';
import type { BinaryOperation, UnaryOperation } from './types';

export interface OperationInfo {
  /** The contract catalog symbol, used in the pending expression and in history text. */
  readonly symbol: string;
  readonly arity: 1 | 2;
}

/** Every contract operation with its catalog symbol and arity. */
const TABLE = {
  add: { symbol: '+', arity: 2 },
  subtract: { symbol: '−', arity: 2 },
  multiply: { symbol: '×', arity: 2 },
  divide: { symbol: '÷', arity: 2 },
  power: { symbol: '^', arity: 2 },
  sqrt: { symbol: '√', arity: 1 },
  percentage: { symbol: '%', arity: 1 },
} as const satisfies Record<OperationName, OperationInfo>;

for (const info of Object.values(TABLE)) Object.freeze(info);
export const OPERATIONS: Readonly<typeof TABLE> = Object.freeze(TABLE);

const names: ReadonlySet<string> = new Set(Object.keys(OPERATIONS));

export function isOperationName(value: unknown): value is OperationName {
  return typeof value === 'string' && names.has(value);
}

export function isBinaryOperation(operation: OperationName): operation is BinaryOperation {
  return OPERATIONS[operation].arity === 2;
}

export function isUnaryOperation(operation: OperationName): operation is UnaryOperation {
  return OPERATIONS[operation].arity === 1;
}

/** The contract Decimal: JSON-number syntax, at most 128 characters. */
const DECIMAL = /^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?$/;
export const MAX_DECIMAL_LENGTH = 128;

export function isDecimal(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MAX_DECIMAL_LENGTH && DECIMAL.test(value);
}
