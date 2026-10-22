import { describe, expect, it } from 'vitest';
import { PROBLEM_CODES } from '@/shared/api';
import type { ApiError, ProblemCode } from '@/shared/api/types';
import { MESSAGES, PROBLEM_MESSAGES, toCalculatorError } from './messages';
import { deepFreeze } from './testing';

type ProblemError = Extract<ApiError, { kind: 'problem' }>;

const EXPECTED_COPY: Readonly<Record<ProblemCode, string>> = {
  MALFORMED_REQUEST: 'Invalid input',
  VALIDATION_FAILED: 'Invalid input',
  NOT_FOUND: 'Something went wrong',
  UNKNOWN_OPERATION: 'Something went wrong',
  METHOD_NOT_ALLOWED: 'Something went wrong',
  PAYLOAD_TOO_LARGE: 'Something went wrong',
  UNSUPPORTED_MEDIA_TYPE: 'Something went wrong',
  DIVISION_BY_ZERO: 'Cannot divide by zero',
  UNDEFINED_RESULT: 'Result is undefined',
  OVERFLOW: 'Result is out of range',
  RATE_LIMITED: 'Too many requests, try again shortly',
  INTERNAL_ERROR: 'Something went wrong',
  SERVICE_UNAVAILABLE: 'Calculator service is unreachable',
};

const SERVER_TITLE = 'Server supplied title text';
const SERVER_DETAIL = 'Server supplied detail text';

function problem(code: ProblemCode, requestId?: string): ProblemError {
  const base: ProblemError = { kind: 'problem', status: 400, code, title: SERVER_TITLE, detail: SERVER_DETAIL };
  return deepFreeze(requestId === undefined ? base : { ...base, requestId });
}

describe('problem copy', () => {
  it('has an entry for exactly the problem codes of the contract', () => {
    expect(Object.keys(PROBLEM_MESSAGES).sort()).toEqual([...PROBLEM_CODES].sort());
    expect(Object.keys(EXPECTED_COPY).sort()).toEqual([...PROBLEM_CODES].sort());
  });

  it('is frozen', () => {
    expect(Object.isFrozen(PROBLEM_MESSAGES)).toBe(true);
    expect(Object.isFrozen(MESSAGES)).toBe(true);
  });

  it.each(Object.entries(EXPECTED_COPY) as [ProblemCode, string][])('maps %s to %j', (code, message) => {
    expect(toCalculatorError(problem(code))).toEqual({ message });
    expect(PROBLEM_MESSAGES[code]).toBe(message);
  });

  it('gives the generic copy to a code outside the enum, including inherited names', () => {
    for (const code of ['constructor', 'toString', '__proto__', 'UNKNOWN']) {
      expect(toCalculatorError(problem(code as ProblemCode))).toEqual({ message: 'Something went wrong' });
    }
  });

  it('never shows the server title or detail', () => {
    for (const code of PROBLEM_CODES) {
      const text = JSON.stringify(toCalculatorError(problem(code, 'req-1')));
      expect(text).not.toContain(SERVER_TITLE);
      expect(text).not.toContain(SERVER_DETAIL);
    }
  });

  it('exposes only the message when the problem has no detail either', () => {
    const bare: ProblemError = { kind: 'problem', status: 429, code: 'RATE_LIMITED', title: SERVER_TITLE };
    expect(toCalculatorError(deepFreeze(bare))).toEqual({ message: 'Too many requests, try again shortly' });
  });
});

describe('errors without a problem code', () => {
  it('maps a network failure to the unreachable copy', () => {
    expect(toCalculatorError({ kind: 'network' })).toEqual({ message: 'Calculator service is unreachable' });
  });

  it('maps a timeout to the timed-out copy', () => {
    expect(toCalculatorError({ kind: 'timeout' })).toEqual({ message: 'Calculator service timed out' });
  });

  it('maps an unexpected response to the generic copy, with or without a status', () => {
    expect(toCalculatorError({ kind: 'unexpected' })).toEqual({ message: 'Something went wrong' });
    expect(toCalculatorError({ kind: 'unexpected', status: 502 })).toEqual({ message: 'Something went wrong' });
  });

  it('returns frozen errors', () => {
    for (const error of [
      problem('OVERFLOW', 'req-1'),
      { kind: 'network' },
      { kind: 'timeout' },
      { kind: 'unexpected' },
    ] as const) {
      expect(Object.isFrozen(toCalculatorError(error))).toBe(true);
    }
  });

  it('carries no request reference for them', () => {
    for (const error of [{ kind: 'network' }, { kind: 'timeout' }, { kind: 'unexpected', status: 500 }] as const) {
      expect(Object.keys(toCalculatorError(error))).toEqual(['message']);
    }
  });

  it('exposes the three fixed strings', () => {
    expect({ ...MESSAGES }).toEqual({
      unreachable: 'Calculator service is unreachable',
      timedOut: 'Calculator service timed out',
      generic: 'Something went wrong',
    });
  });
});

describe('request reference', () => {
  it('is carried when it matches the request-ID shape', () => {
    expect(toCalculatorError(problem('OVERFLOW', 'req-42'))).toEqual({
      message: 'Result is out of range',
      requestId: 'req-42',
    });
  });

  it.each(['a', 'A.b_c-9', 'abc123', '0'.repeat(128)])('is carried for %j', (requestId) => {
    expect(toCalculatorError(problem('INTERNAL_ERROR', requestId)).requestId).toBe(requestId);
  });

  it('is absent when the problem has none, and the object has only a message', () => {
    const result = toCalculatorError(problem('DIVISION_BY_ZERO'));
    expect(Object.keys(result)).toEqual(['message']);
    expect('requestId' in result).toBe(false);
  });

  it('is treated as unavailable when empty: no key at all', () => {
    const result = toCalculatorError(problem('DIVISION_BY_ZERO', ''));
    expect(Object.keys(result)).toEqual(['message']);
    expect('requestId' in result).toBe(false);
  });

  it.each([
    ['129 characters', '0'.repeat(129)],
    ['an embedded space', 'a b'],
    ['a leading space', ' abc'],
    ['a bidirectional override', 'a‮b'],
    ['a line feed inside', 'a\nb'],
    ['a trailing line feed', 'req-1\n'],
    ['a control character', 'a\u0007b'],
    ['a non-ASCII letter', 'café'],
    ['a slash', 'a/b'],
    ['a colon', 'a:b'],
    ['markup', '<b>1</b>'],
  ])('is treated as unavailable with %s', (_label, requestId) => {
    const result = toCalculatorError(problem('INTERNAL_ERROR', requestId));
    expect(Object.keys(result)).toEqual(['message']);
    expect(result.message).toBe('Something went wrong');
  });
});
