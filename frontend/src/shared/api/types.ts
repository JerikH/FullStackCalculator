import type { components } from './schema.gen';

export type OperationName = components['schemas']['OperationName'];
export type CalculationResult = components['schemas']['CalculationResult'];
export type Problem = components['schemas']['Problem'];
export type ProblemCode = components['schemas']['ProblemCode'];

/** Every way a call can fail. The client never throws. */
export type ApiError =
  | {
      kind: 'problem';
      status: number;
      code: ProblemCode;
      title: string;
      detail?: string;
      requestId?: string;
    }
  | { kind: 'network' }
  | { kind: 'timeout' }
  | { kind: 'aborted' }
  | { kind: 'unexpected'; status?: number };

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

export interface CalculatorApi {
  calculate(
    operation: OperationName,
    operands: readonly string[],
    options?: { signal?: AbortSignal },
  ): Promise<ApiResult<CalculationResult>>;
}
