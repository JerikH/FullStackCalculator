import createClient from 'openapi-fetch';
import { isProblem, isRecord } from './problem';
import type { paths } from './schema.gen';
import type { ApiError, CalculationResult, CalculatorApi, OperationName } from './types';

export const DEFAULT_TIMEOUT_MS = 8000;

export interface CalculatorApiOptions {
  baseUrl: string;
  timeoutMs?: number;
  /** Defaults to a late-bound global fetch, so test interceptors installed after creation still apply. */
  fetch?: (request: Request) => Promise<Response>;
}

/** The configured base URL when set, otherwise the page origin. */
export function resolveBaseUrl(configured: string | undefined, origin: string): string {
  return configured === undefined || configured === '' ? origin : configured;
}

// The contract's Decimal: plain or scientific notation, at most 128 characters.
const DECIMAL = /^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?$/;

function isDecimal(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 128 && DECIMAL.test(value);
}

/** The result for the requested operation, rebuilt from the contract's fields only; null otherwise. */
function toCalculationResult(value: unknown, operation: OperationName): CalculationResult | null {
  if (!isRecord(value) || value.operation !== operation) return null;
  const { operands, result, inexact } = value;
  if (!Array.isArray(operands)) return null;
  const decimals: unknown[] = operands;
  if (!decimals.every(isDecimal) || !isDecimal(result) || typeof inexact !== 'boolean') return null;
  return { operation, operands: [...decimals], result, inexact };
}

interface Combined {
  readonly signal: AbortSignal;
  expired(): boolean;
  release(): void;
}

function combineSignals(caller: AbortSignal | undefined, timeoutMs: number): Combined {
  if (typeof AbortSignal.timeout === 'function' && (!caller || typeof AbortSignal.any === 'function')) {
    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = caller ? AbortSignal.any([caller, timeout]) : timeout;
    return { signal, expired: () => signal.reason === timeout.reason, release: () => undefined };
  }

  const controller = new AbortController();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const onAbort = () => {
    controller.abort(caller?.reason);
  };
  if (caller?.aborted) {
    controller.abort(caller.reason);
  } else {
    // The timer first: if arming it threw, no listener would be left on the caller's signal.
    timer = setTimeout(() => {
      // A caller abort that won the race must not be reported as a timeout.
      if (!controller.signal.aborted) {
        timedOut = true;
        controller.abort(new DOMException('The operation timed out.', 'TimeoutError'));
      }
    }, timeoutMs);
    caller?.addEventListener('abort', onAbort, { once: true });
  }
  return {
    signal: controller.signal,
    expired: () => timedOut,
    release: () => {
      clearTimeout(timer);
      caller?.removeEventListener('abort', onAbort);
    },
  };
}

function abortError(combined: Combined): ApiError {
  return { kind: combined.expired() ? 'timeout' : 'aborted' };
}

function toApiError(body: unknown, status: number): ApiError {
  // A body is trusted only if it is a contract problem that agrees with the HTTP status.
  if (!isProblem(body) || body.status !== status) return { kind: 'unexpected', status };
  return {
    kind: 'problem',
    status: body.status,
    code: body.code,
    title: body.title,
    detail: body.detail,
    requestId: body.requestId,
  };
}

export function createCalculatorApi({
  baseUrl,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetch: configuredFetch = (request) => globalThis.fetch(request),
}: CalculatorApiOptions): CalculatorApi {
  const client = createClient<paths>({ baseUrl });
  return {
    async calculate(operation, operands, options = {}) {
      let combined: Combined | undefined;
      let status: number | undefined;
      try {
        combined = combineSignals(options.signal, timeoutMs);
        const { data, error, response } = await client.POST('/api/v1/operations/{operation}', {
          params: { path: { operation } },
          body: { operands: [...operands] },
          signal: combined.signal,
          fetch: async (request) => {
            const received = await configuredFetch(request);
            status = received.status;
            return received;
          },
        });
        // A response that settles after the signal fired is stale: the caller has moved on.
        if (combined.signal.aborted) return { ok: false, error: abortError(combined) };
        if (response.ok) {
          const result = toCalculationResult(data, operation);
          return result
            ? { ok: true, data: result }
            : { ok: false, error: { kind: 'unexpected', status: response.status } };
        }
        return { ok: false, error: toApiError(error, response.status) };
      } catch (caught) {
        if (combined?.signal.aborted) return { ok: false, error: abortError(combined) };
        // Checked by name, not instanceof: the error may come from another realm.
        if (status !== undefined && isRecord(caught) && caught.name === 'SyntaxError') {
          return { ok: false, error: { kind: 'unexpected', status } };
        }
        return { ok: false, error: { kind: 'network' } };
      } finally {
        combined?.release();
      }
    },
  };
}
