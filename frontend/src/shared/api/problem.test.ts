// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { isProblem, PROBLEM_CODES } from './problem';

const valid = {
  type: 'urn:calculator:problem:division-by-zero',
  title: 'Division by zero',
  status: 422,
  detail: 'the divisor must not be zero',
  instance: '/api/v1/operations/divide',
  code: 'DIVISION_BY_ZERO',
  requestId: 'req-42',
};

function without(key: string): unknown {
  return Object.fromEntries(Object.entries(valid).filter(([name]) => name !== key));
}

describe('isProblem', () => {
  it.each([
    ['a complete problem', valid],
    ['a problem without instance', without('instance')],
    [
      'a problem with field violations',
      { ...valid, errors: [{ field: 'operands[1]', reason: 'not a decimal number' }] },
    ],
    ['a problem with an extra unknown property', { ...valid, traceId: 'abc' }],
  ])('accepts %s', (_name, value) => {
    expect(isProblem(value)).toBe(true);
  });

  const rejected: [string, unknown][] = [
    ...['type', 'title', 'detail', 'requestId', 'code', 'status'].flatMap((key): [string, unknown][] => [
      [`${key} missing`, without(key)],
      [`${key} of the wrong type`, { ...valid, [key]: key === 'status' ? '422' : 42 }],
    ]),
    ['status 399', { ...valid, status: 399 }],
    ['status 600', { ...valid, status: 600 }],
    ['status 422.5', { ...valid, status: 422.5 }],
    ["status '422'", { ...valid, status: '422' }],
    ['an unknown code', { ...valid, code: 'MYSTERY' }],
    ['instance of the wrong type', { ...valid, instance: 1 }],
    ['errors that is not an array', { ...valid, errors: 'x' }],
    ['a violation without reason', { ...valid, errors: [{ field: 'f' }] }],
    ['a null violation', { ...valid, errors: [null] }],
    ['null', null],
    ['undefined', undefined],
    ['a string', 'oops'],
    ['an array', []],
    ['a number', 42],
  ];
  it.each(rejected)('rejects %s', (_name, value) => {
    expect(isProblem(value)).toBe(false);
  });
});

describe('PROBLEM_CODES', () => {
  it('lists the contract codes in contract order', () => {
    expect(PROBLEM_CODES).toEqual([
      'MALFORMED_REQUEST',
      'VALIDATION_FAILED',
      'NOT_FOUND',
      'UNKNOWN_OPERATION',
      'METHOD_NOT_ALLOWED',
      'PAYLOAD_TOO_LARGE',
      'UNSUPPORTED_MEDIA_TYPE',
      'DIVISION_BY_ZERO',
      'UNDEFINED_RESULT',
      'OVERFLOW',
      'RATE_LIMITED',
      'INTERNAL_ERROR',
      'SERVICE_UNAVAILABLE',
    ]);
  });

  it('has no duplicates', () => {
    expect(new Set(PROBLEM_CODES).size).toBe(PROBLEM_CODES.length);
  });
});
