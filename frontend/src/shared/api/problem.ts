import type { Problem, ProblemCode } from './types';

/** Every problem code of the contract, in contract order. */
export const PROBLEM_CODES = [
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
] as const satisfies readonly ProblemCode[];

// Compile-time guard against a missing code: this alias fails to type-check if the contract gains
// a code that the list above lacks (the `satisfies` clause covers the opposite direction).
type MissingCodes = Exclude<ProblemCode, (typeof PROBLEM_CODES)[number]>;
type MustBeTrue<T extends true> = T;
export type AllProblemCodesListed = MustBeTrue<[MissingCodes] extends [never] ? true : false>;

const codes: ReadonlySet<string> = new Set(PROBLEM_CODES);

/** A non-null, non-array object. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFieldViolation(value: unknown): boolean {
  return isRecord(value) && typeof value.field === 'string' && typeof value.reason === 'string';
}

/** Runtime guard for error bodies: only what matches the contract is trusted. */
export function isProblem(value: unknown): value is Problem {
  if (!isRecord(value)) return false;
  const { type, title, status, detail, instance, code, requestId, errors } = value;
  return (
    typeof type === 'string' &&
    typeof title === 'string' &&
    typeof status === 'number' &&
    Number.isInteger(status) &&
    status >= 400 &&
    status <= 599 &&
    typeof detail === 'string' &&
    (instance === undefined || typeof instance === 'string') &&
    typeof code === 'string' &&
    codes.has(code) &&
    typeof requestId === 'string' &&
    (errors === undefined || (Array.isArray(errors) && errors.every(isFieldViolation)))
  );
}
