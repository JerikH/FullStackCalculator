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

function isCalculationResult(value: unknown, operation: OperationName): value is CalculationResult {
  return (
    isRecord(value) &&
    value.operation === operation &&
    Array.isArray(value.operands) &&
    value.operands.every((operand) => typeof operand === 'string') &&
    typeof value.result === 'string' &&
    typeof value.inexact === 'boolean'
  );
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
      const timeout = AbortSignal.timeout(timeoutMs);
      const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
      let status: number | undefined;
      try {
        const { data, error, response } = await client.POST('/api/v1/operations/{operation}', {
          params: { path: { operation } },
          body: { operands: [...operands] },
          signal,
          fetch: async (request) => {
            const received = await configuredFetch(request);
            status = received.status;
            return received;
          },
        });
        if (response.ok) {
          return isCalculationResult(data, operation)
            ? { ok: true, data }
            : { ok: false, error: { kind: 'unexpected', status: response.status } };
        }
        return { ok: false, error: toApiError(error, response.status) };
      } catch (caught) {
        // AbortSignal.any keeps the reason of the first source that aborted.
        if (signal.aborted) {
          return { ok: false, error: { kind: signal.reason === timeout.reason ? 'timeout' : 'aborted' } };
        }
        // Checked by name, not instanceof: the error may come from another realm.
        if (status !== undefined && isRecord(caught) && caught.name === 'SyntaxError') {
          return { ok: false, error: { kind: 'unexpected', status } };
        }
        return { ok: false, error: { kind: 'network' } };
      }
    },
  };
}
