import type { ApiError, ProblemCode } from '@/shared/api/types';
import type { CalculatorError } from './types';

/** Fixed user-facing copy per problem code; server titles and details are never shown. */
export const PROBLEM_MESSAGES: Readonly<Record<ProblemCode, string>> = Object.freeze({
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
} satisfies Record<ProblemCode, string>);

/** The copy for failures that carry no problem code. */
export const MESSAGES: {
  readonly unreachable: string;
  readonly timedOut: string;
  readonly generic: string;
} = Object.freeze({
  unreachable: 'Calculator service is unreachable',
  timedOut: 'Calculator service timed out',
  generic: 'Something went wrong',
});

/** The copy for a code; a value outside the contract enum (only reachable through a cast) gets the generic copy. */
function problemMessage(code: ProblemCode): string {
  return Object.hasOwn(PROBLEM_MESSAGES, code) ? PROBLEM_MESSAGES[code] : MESSAGES.generic;
}

/** The pattern every request ID emitted by the edge or the service matches. */
const REQUEST_ID = /^[A-Za-z0-9._-]{1,128}$/;

/**
 * Maps a failed call to the error shown to the user. The request reference is carried only when
 * it has the request-ID shape; an empty, over-long or odd one counts as unavailable.
 */
export function toCalculatorError(error: Exclude<ApiError, { kind: 'aborted' }>): CalculatorError {
  switch (error.kind) {
    case 'problem':
      return Object.freeze(
        error.requestId !== undefined && REQUEST_ID.test(error.requestId)
          ? { message: problemMessage(error.code), requestId: error.requestId }
          : { message: problemMessage(error.code) },
      );
    case 'network':
      return Object.freeze({ message: MESSAGES.unreachable });
    case 'timeout':
      return Object.freeze({ message: MESSAGES.timedOut });
    case 'unexpected':
      return Object.freeze({ message: MESSAGES.generic });
  }
}
