// @vitest-environment node
import { delay, http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, expectTypeOf, it } from 'vitest';
import { createCalculatorApi, DEFAULT_TIMEOUT_MS, resolveBaseUrl } from './calculatorApi';
import { PROBLEM_CODES } from './problem';
import type { ApiError, OperationName } from './types';

const BASE = 'http://calculator.test';
const ENDPOINT = `${BASE}/api/v1/operations/:operation`;

const server = setupServer();
// Created before server.listen() runs: proves the default fetch is late-bound.
const api = createCalculatorApi({ baseUrl: BASE, timeoutMs: 100 });

beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' });
});
afterEach(() => {
  server.resetHandlers();
});
afterAll(() => {
  server.close();
});

const problemBody = {
  type: 'urn:calculator:problem:division-by-zero',
  title: 'Division by zero',
  status: 422,
  detail: 'the divisor must not be zero',
  instance: '/api/v1/operations/divide',
  code: 'DIVISION_BY_ZERO',
  requestId: 'req-42',
};

const addResult = { operation: 'add', operands: ['0.1', '0.2'], result: '0.3', inexact: false };

function respondWith(init: () => Response): void {
  server.use(http.post(ENDPOINT, init));
}

function problemResponse(body: Record<string, unknown>, status: number): Response {
  return HttpResponse.json(body, { status, headers: { 'Content-Type': 'application/problem+json' } });
}

function without(key: string): Record<string, unknown> {
  return Object.fromEntries(Object.entries(problemBody).filter(([name]) => name !== key));
}

describe('calculate: success', () => {
  it('posts the operands as JSON and returns the typed result', async () => {
    server.use(
      http.post(ENDPOINT, async ({ request, params }) => {
        expect(request.method).toBe('POST');
        expect(request.headers.get('content-type')).toContain('application/json');
        expect(params.operation).toBe('add');
        expect(await request.json()).toEqual({ operands: ['0.1', '0.2'] });
        return HttpResponse.json(addResult);
      }),
    );
    expect(await api.calculate('add', ['0.1', '0.2'])).toEqual({ ok: true, data: addResult });
  });

  it('does not mutate or retain the caller operands array', async () => {
    const operands = Object.freeze(['1', '2']);
    let received: unknown;
    server.use(
      http.post(ENDPOINT, async ({ request }) => {
        received = await request.json();
        return HttpResponse.json({ ...addResult, operands: ['1', '2'], result: '3' });
      }),
    );
    const result = await api.calculate('add', operands);
    expect(result.ok).toBe(true);
    expect(received).toEqual({ operands: ['1', '2'] });
    expect(operands).toEqual(['1', '2']);
    expect(Object.isFrozen(operands)).toBe(true);
  });
});

describe('calculate: problems', () => {
  it.each(PROBLEM_CODES.map((code, index) => [code, index % 2 === 0 ? 422 : 503] as const))(
    'returns the %s problem (HTTP %i) with every field',
    async (code, status) => {
      const body = { ...problemBody, code, status, title: `Title of ${code}` };
      respondWith(() => problemResponse(body, status));
      expect(await api.calculate('divide', ['1', '0'])).toEqual({
        ok: false,
        error: {
          kind: 'problem',
          status,
          code,
          title: `Title of ${code}`,
          detail: 'the divisor must not be zero',
          requestId: 'req-42',
        },
      });
    },
  );

  it('does not trust a problem with an unknown code', async () => {
    respondWith(() => problemResponse({ ...problemBody, code: 'MYSTERY' }, 422));
    expect(await api.calculate('divide', ['1', '0'])).toEqual({
      ok: false,
      error: { kind: 'unexpected', status: 422 },
    });
  });

  it.each([
    ['without requestId', without('requestId')],
    ['without detail', without('detail')],
    ["with status '422'", { ...problemBody, status: '422' }],
  ])('does not trust a problem %s', async (_name, body) => {
    respondWith(() => problemResponse(body, 422));
    expect(await api.calculate('divide', ['1', '0'])).toEqual({
      ok: false,
      error: { kind: 'unexpected', status: 422 },
    });
  });

  it('does not trust a problem whose status differs from the HTTP status', async () => {
    respondWith(() => problemResponse({ ...problemBody, status: 400 }, 502));
    expect(await api.calculate('divide', ['1', '0'])).toEqual({
      ok: false,
      error: { kind: 'unexpected', status: 502 },
    });
  });
});

describe('calculate: unexpected responses', () => {
  it('reports an HTML error page as unexpected', async () => {
    respondWith(
      () => new Response('<html>Bad gateway</html>', { status: 502, headers: { 'Content-Type': 'text/html' } }),
    );
    expect(await api.calculate('add', ['1', '2'])).toEqual({ ok: false, error: { kind: 'unexpected', status: 502 } });
  });

  it('reports a JSON error body that is not a problem as unexpected', async () => {
    respondWith(() => HttpResponse.json({ message: 'boom' }, { status: 500 }));
    expect(await api.calculate('add', ['1', '2'])).toEqual({ ok: false, error: { kind: 'unexpected', status: 500 } });
  });

  it.each([
    ['a wrong shape', () => HttpResponse.json({ result: 3 }), 200],
    ['another operation', () => HttpResponse.json({ ...addResult, operation: 'subtract' }), 200],
    ['a result that is not a contract Decimal', () => HttpResponse.json({ ...addResult, result: 'NaN' }), 200],
    ['a result over 128 characters', () => HttpResponse.json({ ...addResult, result: '1'.repeat(129) }), 200],
    ['an operand that is not a Decimal', () => HttpResponse.json({ ...addResult, operands: ['0.1', '1,5'] }), 200],
    ['operands that are not an array', () => HttpResponse.json({ ...addResult, operands: '0.1' }), 200],
    ['a non-boolean inexact flag', () => HttpResponse.json({ ...addResult, inexact: 'false' }), 200],
    ['an array body', () => HttpResponse.json([addResult]), 200],
    ['an empty body', () => new Response(null, { status: 200 }), 200],
    ['a 204', () => new Response(null, { status: 204 }), 204],
    [
      'an unparsable JSON body',
      () => new Response('not json', { status: 200, headers: { 'Content-Type': 'application/json' } }),
      200,
    ],
  ])('reports a 2xx with %s as unexpected', async (_name, init, status) => {
    respondWith(init);
    expect(await api.calculate('add', ['0.1', '0.2'])).toEqual({
      ok: false,
      error: { kind: 'unexpected', status },
    });
  });

  it('returns only the contract fields of a result', async () => {
    respondWith(
      () =>
        new Response(`{"__proto__":{"polluted":true},"extra":1,${JSON.stringify(addResult).slice(1)}`, {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    const result = await api.calculate('add', ['0.1', '0.2']);
    expect(result).toEqual({ ok: true, data: addResult });
    expect(result.ok && Object.keys(result.data)).toEqual(['operation', 'operands', 'result', 'inexact']);
    expect(result.ok && Object.getPrototypeOf(result.data)).toBe(Object.prototype);
  });

  it('accepts scientific notation results', async () => {
    const big = { operation: 'power', operands: ['10', '40'], result: '1E+40', inexact: false };
    respondWith(() => HttpResponse.json(big));
    expect(await api.calculate('power', ['10', '40'])).toEqual({ ok: true, data: big });
  });

  it('classifies a parse failure by error name, not by instanceof', async () => {
    const foreign = createCalculatorApi({
      baseUrl: BASE,
      fetch: () => {
        const response = new Response('{}', {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Content-Length': '2' },
        });
        // A parse error raised in another realm is not an instance of this realm's SyntaxError.
        response.json = () => Promise.reject({ name: 'SyntaxError', message: 'foreign realm' }); // eslint-disable-line @typescript-eslint/prefer-promise-reject-errors -- deliberately not an Error instance
        return Promise.resolve(response);
      },
    });
    expect(await foreign.calculate('add', ['1', '2'])).toEqual({
      ok: false,
      error: { kind: 'unexpected', status: 200 },
    });
  });
});

describe('calculate: transport failures', () => {
  it('reports a network failure', async () => {
    respondWith(() => HttpResponse.error());
    expect(await api.calculate('add', ['1', '2'])).toEqual({ ok: false, error: { kind: 'network' } });
  });

  it('reports a fetch that rejects with a non-Error value as a network failure', async () => {
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- deliberately a non-Error rejection
    const rejecting = createCalculatorApi({ baseUrl: BASE, fetch: () => Promise.reject('x') });
    expect(await rejecting.calculate('add', ['1', '2'])).toEqual({ ok: false, error: { kind: 'network' } });
  });

  it('reports a fetch that throws synchronously as a network failure', async () => {
    const throwing = createCalculatorApi({
      baseUrl: BASE,
      fetch: () => {
        throw new TypeError('boom');
      },
    });
    expect(await throwing.calculate('add', ['1', '2'])).toEqual({ ok: false, error: { kind: 'network' } });
  });

  it('times out when the server never answers', async () => {
    server.use(
      http.post(ENDPOINT, async () => {
        await delay('infinite');
        return HttpResponse.json(addResult);
      }),
    );
    expect(await api.calculate('add', ['1', '2'])).toEqual({ ok: false, error: { kind: 'timeout' } });
  });

  it('applies the timeout when a caller signal is also given', async () => {
    server.use(
      http.post(ENDPOINT, async () => {
        await delay('infinite');
        return HttpResponse.json(addResult);
      }),
    );
    const controller = new AbortController();
    expect(await api.calculate('add', ['1', '2'], { signal: controller.signal })).toEqual({
      ok: false,
      error: { kind: 'timeout' },
    });
  });

  it('times out when the headers arrive but the body never finishes', async () => {
    const stalled = createCalculatorApi({
      baseUrl: BASE,
      timeoutMs: 50,
      fetch: (request) =>
        Promise.resolve(
          new Response(
            new ReadableStream({
              start(controller) {
                request.signal.addEventListener('abort', () => {
                  controller.error(request.signal.reason);
                });
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        ),
    });
    expect(await stalled.calculate('add', ['1', '2'])).toEqual({ ok: false, error: { kind: 'timeout' } });
  });
});

describe('calculate: caller abort', () => {
  it('reports an abort in flight', async () => {
    server.use(
      http.post(ENDPOINT, async () => {
        await delay('infinite');
        return HttpResponse.json(addResult);
      }),
    );
    const patient = createCalculatorApi({ baseUrl: BASE, timeoutMs: 5000 });
    const controller = new AbortController();
    const pending = patient.calculate('add', ['1', '2'], { signal: controller.signal });
    setTimeout(() => {
      controller.abort();
    }, 20);
    expect(await pending).toEqual({ ok: false, error: { kind: 'aborted' } });
  });

  it('reports a response whose body finishes after the caller aborted as aborted', async () => {
    const controller = new AbortController();
    const late = createCalculatorApi({
      baseUrl: BASE,
      timeoutMs: 5000,
      fetch: () => {
        const response = new Response(JSON.stringify(addResult), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
        // The caller moves on while the body is being read; the body still arrives intact.
        response.text = () => {
          controller.abort();
          return Promise.resolve(JSON.stringify(addResult));
        };
        return Promise.resolve(response);
      },
    });
    expect(await late.calculate('add', ['0.1', '0.2'], { signal: controller.signal })).toEqual({
      ok: false,
      error: { kind: 'aborted' },
    });
  });

  it('reports a signal aborted before the call without reaching the server', async () => {
    let calls = 0;
    server.use(
      http.post(ENDPOINT, () => {
        calls += 1;
        return HttpResponse.json(addResult);
      }),
    );
    const controller = new AbortController();
    controller.abort();
    expect(await api.calculate('add', ['1', '2'], { signal: controller.signal })).toEqual({
      ok: false,
      error: { kind: 'aborted' },
    });
    expect(calls).toBe(0);
  });

  it('reports a timeout when it fires before a later caller abort (first source wins)', async () => {
    const controller = new AbortController();
    const racing = createCalculatorApi({
      baseUrl: BASE,
      timeoutMs: 30,
      fetch: (request) =>
        new Promise<Response>((_resolve, reject) => {
          request.signal.addEventListener('abort', () => {
            controller.abort();
            // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- like real fetch, reject with the signal's reason
            reject(request.signal.reason);
          });
        }),
    });
    expect(await racing.calculate('add', ['1', '2'], { signal: controller.signal })).toEqual({
      ok: false,
      error: { kind: 'timeout' },
    });
  });

  it('reports an abort when the caller aborts while a timeout is pending', async () => {
    const controller = new AbortController();
    const racing = createCalculatorApi({
      baseUrl: BASE,
      timeoutMs: 5000,
      fetch: (request) =>
        new Promise<Response>((_resolve, reject) => {
          request.signal.addEventListener('abort', () => {
            // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- like real fetch, reject with the signal's reason
            reject(request.signal.reason);
          });
          controller.abort();
        }),
    });
    expect(await racing.calculate('add', ['1', '2'], { signal: controller.signal })).toEqual({
      ok: false,
      error: { kind: 'aborted' },
    });
  });
});

describe('configuration', () => {
  it('defaults the timeout to 8 seconds', () => {
    expect(DEFAULT_TIMEOUT_MS).toBe(8000);
  });

  it('resolves the base URL', () => {
    expect(resolveBaseUrl('http://api.test', 'http://page.test')).toBe('http://api.test');
    expect(resolveBaseUrl('', 'http://page.test')).toBe('http://page.test');
    expect(resolveBaseUrl(undefined, 'http://page.test')).toBe('http://page.test');
  });
});

describe('contract types', () => {
  it('mirrors the generated schema', () => {
    expectTypeOf<OperationName>().toEqualTypeOf<
      'add' | 'subtract' | 'multiply' | 'divide' | 'power' | 'sqrt' | 'percentage'
    >();
    expectTypeOf<ApiError['kind']>().toEqualTypeOf<'problem' | 'network' | 'timeout' | 'aborted' | 'unexpected'>();
  });
});
