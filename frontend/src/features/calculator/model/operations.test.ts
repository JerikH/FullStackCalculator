import { describe, expect, it } from 'vitest';
import type { OperationName } from '@/shared/api/types';
import { OPERATIONS, isBinaryOperation, isDecimal, isOperationName, isUnaryOperation } from './operations';

const CONTRACT_OPERATIONS = [
  'add',
  'subtract',
  'multiply',
  'divide',
  'power',
  'sqrt',
  'percentage',
] as const satisfies readonly OperationName[];

// Compile-time guard: fails to type-check when the contract gains an operation this list lacks.
type MissingOperations = Exclude<OperationName, (typeof CONTRACT_OPERATIONS)[number]>;
type MustBeTrue<T extends true> = T;
export type AllContractOperationsListed = MustBeTrue<[MissingOperations] extends [never] ? true : false>;

describe('OPERATIONS', () => {
  it('has exactly the operations of the contract', () => {
    expect(Object.keys(OPERATIONS).sort()).toEqual([...CONTRACT_OPERATIONS].sort());
  });

  it.each([
    ['add', '+', 2],
    ['subtract', '−', 2],
    ['multiply', '×', 2],
    ['divide', '÷', 2],
    ['power', '^', 2],
    ['sqrt', '√', 1],
    ['percentage', '%', 1],
  ] as const)('maps %s to symbol %s and arity %i', (operation, symbol, arity) => {
    expect(OPERATIONS[operation]).toEqual({ symbol, arity });
  });

  it('is frozen, entries included', () => {
    expect(Object.isFrozen(OPERATIONS)).toBe(true);
    for (const operation of CONTRACT_OPERATIONS) {
      expect(Object.isFrozen(OPERATIONS[operation])).toBe(true);
    }
  });
});

describe('isOperationName', () => {
  it.each(CONTRACT_OPERATIONS)('accepts %s', (operation) => {
    expect(isOperationName(operation)).toBe(true);
  });

  it.each(['', 'ADD', 'Add', ' add', 'add ', 'mod', '__proto__', 'constructor', 'toString', 'hasOwnProperty'])(
    'rejects the string %j',
    (value) => {
      expect(isOperationName(value)).toBe(false);
    },
  );

  it.each([undefined, null, 1, true, {}, [], ['add']])('rejects the non-string %j', (value) => {
    expect(isOperationName(value)).toBe(false);
  });
});

describe('isBinaryOperation and isUnaryOperation', () => {
  it.each(['add', 'subtract', 'multiply', 'divide', 'power'] as const)('%s is binary and not unary', (operation) => {
    expect(isBinaryOperation(operation)).toBe(true);
    expect(isUnaryOperation(operation)).toBe(false);
  });

  it.each(['sqrt', 'percentage'] as const)('%s is unary and not binary', (operation) => {
    expect(isUnaryOperation(operation)).toBe(true);
    expect(isBinaryOperation(operation)).toBe(false);
  });
});

describe('isDecimal', () => {
  it.each([
    '0',
    '-0',
    '7',
    '10',
    '-12.5',
    '0.1',
    '1.2300',
    '1e5',
    '1E+5',
    '2.5e-10',
    '-1e+21',
    '0e0',
    '1e-9999',
    '1'.repeat(128),
    '0.' + '1'.repeat(126),
    '-' + '1'.repeat(127),
  ])('accepts %j', (value) => {
    expect(isDecimal(value)).toBe(true);
  });

  it.each([
    '',
    '-',
    '--1',
    '01',
    '-01',
    '+1',
    '.5',
    '1.',
    '1.2.3',
    '1,000',
    ' 1',
    '1 ',
    '1\n',
    '\n1',
    'NaN',
    'Infinity',
    '-Infinity',
    '1e',
    '1e+',
    '1e1.5',
    '−1',
    '0x10',
    '1_000',
    '<b>1</b>',
    '1'.repeat(129),
    '0.' + '1'.repeat(127),
  ])('rejects %j', (value) => {
    expect(isDecimal(value)).toBe(false);
  });

  it.each([undefined, null, 1, 0.5, true, {}, [], ['1']])('rejects the non-string %j', (value) => {
    expect(isDecimal(value)).toBe(false);
  });
});
