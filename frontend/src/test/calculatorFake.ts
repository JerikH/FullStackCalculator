import { createElement, StrictMode } from 'react';
import type { ReactNode } from 'react';
import { CalculatorApiProvider } from '@/shared/api/CalculatorApiProvider';
import type {
  ApiError,
  ApiResult,
  CalculationResult,
  CalculatorApi,
  OperationName,
  ProblemCode,
} from '@/shared/api/types';

export interface FakeCall {
  readonly operation: OperationName;
  /** A copy of the operands as the caller passed them. */
  readonly operands: readonly string[];
  readonly signal: AbortSignal | undefined;
  /** Settles this call; later calls to it are ignored. */
  resolve(result: ApiResult<CalculationResult>): void;
}

export interface FakeApi extends CalculatorApi {
  readonly calls: readonly FakeCall[];
}

export interface FakeApiOptions {
  /**
   * A misbehaving transport: the promise keeps waiting after the signal aborts, so only the caller's own
   * guards keep a stale answer out. By default an abort settles the call like the real client does.
   */
  readonly ignoreAbort?: boolean;
}

/** A typed API fake without MSW, fetch or arithmetic: each call is settled by the test. */
export function createFakeApi(options: FakeApiOptions = {}): FakeApi {
  const calls: FakeCall[] = [];
  return {
    calls,
    calculate(operation, operands, callOptions) {
      const signal = callOptions?.signal;
      return new Promise<ApiResult<CalculationResult>>((resolve) => {
        calls.push({ operation, operands: [...operands], signal, resolve });
        if (options.ignoreAbort !== true) {
          signal?.addEventListener('abort', () => {
            resolve(abortedError());
          });
        }
      });
    },
  };
}

/** A successful answer; the result is always a literal supplied by the test, never computed. */
export function success(
  operation: OperationName,
  operands: readonly string[],
  result: string,
  inexact = false,
): ApiResult<CalculationResult> {
  return { ok: true, data: { operation, operands: [...operands], result, inexact } };
}

function failure(error: ApiError): ApiResult<CalculationResult> {
  return { ok: false, error };
}

export function problem(code: ProblemCode, requestId?: string, status = 400): ApiResult<CalculationResult> {
  return failure({
    kind: 'problem',
    status,
    code,
    title: 'server title that must never be shown',
    detail: 'server detail that must never be shown',
    ...(requestId === undefined ? {} : { requestId }),
  });
}

export function networkError(): ApiResult<CalculationResult> {
  return failure({ kind: 'network' });
}

export function timeoutError(): ApiResult<CalculationResult> {
  return failure({ kind: 'timeout' });
}

export function unexpectedError(status?: number): ApiResult<CalculationResult> {
  return failure(status === undefined ? { kind: 'unexpected' } : { kind: 'unexpected', status });
}

export function abortedError(): ApiResult<CalculationResult> {
  return failure({ kind: 'aborted' });
}

/** A wrapper component providing the fake API, inside StrictMode unless `strict` is false. */
export function apiWrapper(api: CalculatorApi, { strict = true }: { strict?: boolean } = {}) {
  return function ApiWrapper({ children }: { children: ReactNode }) {
    const provided = createElement(CalculatorApiProvider, { api, children });
    return strict ? createElement(StrictMode, null, provided) : provided;
  };
}
