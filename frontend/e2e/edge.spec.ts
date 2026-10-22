import type { APIResponse } from '@playwright/test';
import { expectProblem, headerValues, post } from './helpers/api.js';
import type { Problem } from './helpers/api.js';
import { apiLogs } from './helpers/compose.js';
import { test, expect, pace, nextCalculation } from './helpers/fixture.js';

async function problem(response: APIResponse, status: number, code: string): Promise<Problem> {
  const body = await expectProblem(response, status, code);
  for (const key of ['type', 'title', 'detail', 'code', 'requestId'] as const)
    expect(typeof body[key], key).toBe('string');
  expect(typeof body.status).toBe('number');
  expect(headerValues(response, 'x-request-id')).toEqual([body.requestId]);
  return body;
}

test.beforeEach(async ({ page }) => {
  await pace(page);
});

test('API: the edge preserves exact decimal service results', async ({ request }) => {
  const response = await post(request, 'add', { operands: ['0.1', '0.2'] });
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ operation: 'add', operands: ['0.1', '0.2'], result: '0.3', inexact: false });
});

test('API: service and edge body limits preserve problem provenance at every boundary', async ({ request, page }) => {
  for (const size of [5000, 1_048_576, 1_048_577]) {
    await pace(page);
    const prefix = '{"operands":["1","2"]';
    const data = prefix + ' '.repeat(size - prefix.length - 1) + '}';
    expect(Buffer.byteLength(data)).toBe(size);
    const body = await problem(
      await request.post('/api/v1/operations/add', {
        data,
        headers: { 'content-type': 'application/json', 'content-length': size.toString() },
      }),
      413,
      'PAYLOAD_TOO_LARGE',
    );
    if (size <= 1_048_576) expect(body.instance).toBe('/api/v1/operations/add');
    else expect(body.instance).toBeUndefined();
  }
  for (const path of ['/healthz', '/readyz']) {
    for (const size of [16_384, 16_385]) {
      await pace(page);
      const response = await request.get(path, {
        data: 'a'.repeat(size),
        headers: { 'content-length': size.toString() },
      });
      if (size === 16_385) await problem(response, 413, 'PAYLOAD_TOO_LARGE');
      else expect(response.status()).toBe(200);
    }
  }
});

test('API: application errors retain service problems, request ids and Allow', async ({ request, page }) => {
  const id = 'edge-service-divide';
  const division = await problem(
    await post(request, 'divide', { operands: ['1', '0'] }, { 'X-Request-ID': id }),
    422,
    'DIVISION_BY_ZERO',
  );
  expect(division).toEqual({
    type: 'urn:calculator:problem:division-by-zero',
    title: 'Division by zero',
    status: 422,
    detail: 'the divisor must not be zero',
    code: 'DIVISION_BY_ZERO',
    requestId: id,
    instance: '/api/v1/operations/divide',
  });
  await pace(page);
  await problem(
    await request.post('/api/v1/operations/add', { data: '{}', headers: { 'content-type': 'text/plain' } }),
    415,
    'UNSUPPORTED_MEDIA_TYPE',
  );
  await pace(page);
  await problem(
    await request.post('/api/v1/operations/add', { data: '{', headers: { 'content-type': 'application/json' } }),
    400,
    'MALFORMED_REQUEST',
  );
  await pace(page);
  const wrong = await request.get('/api/v1/operations/add');
  await problem(wrong, 405, 'METHOD_NOT_ALLOWED');
  expect(headerValues(wrong, 'allow')).toEqual(['POST']);
  await pace(page);
  await problem(await request.get('/api/v1/missing-route'), 404, 'NOT_FOUND');
});

const validId = 'Az09._-'.repeat(18) + 'AZ';
const ids = [validId, 'a'.repeat(129), 'with space', '<script>'];
for (const inbound of ids) {
  test(`API: request id ${JSON.stringify(inbound)} is validated before forwarding`, async ({ request }) => {
    const body = await problem(
      await request.get('/api/v1/missing-route', { headers: { 'X-Request-ID': inbound } }),
      404,
      'NOT_FOUND',
    );
    if (inbound === validId) {
      expect(inbound).toHaveLength(128);
      expect(body.requestId).toBe(inbound);
    } else {
      expect(body.requestId).not.toBe(inbound);
      expect(body.requestId).toMatch(/^[A-Za-z0-9._-]{1,128}$/);
    }
  });
}

test('API: validated request ids appear in service access logs', async ({ request, page }) => {
  const since = new Date().toISOString();
  try {
    await apiLogs(since);
  } catch (error) {
    test.skip(true, `Docker log access unavailable: ${String(error)}`);
    return;
  }
  for (const inbound of ids) {
    await pace(page);
    const body = await problem(
      await request.get('/api/v1/missing-route', { headers: { 'X-Request-ID': inbound } }),
      404,
      'NOT_FOUND',
    );
    await expect
      .poll(
        async () => {
          const logs = await apiLogs(since);
          return logs
            .split('\n')
            .some(
              (line) =>
                line.includes(`"request_id":"${body.requestId}"`) || line.includes(`request_id=${body.requestId}`),
            );
        },
        { timeout: 5000, intervals: [100, 200, 400] },
      )
      .toBe(true);
  }
});

test('API: admin paths stay private and OpenAPI is served as YAML', async ({ request, page }) => {
  for (const path of ['/metrics', '/debug/pprof/']) {
    await pace(page);
    const response = await request.get(path);
    expect(response.status()).toBe(404);
    expect(await response.text()).not.toMatch(
      /# (HELP|TYPE)|go_goroutines|Types of profiles available|goroutine profile/,
    );
  }
  await pace(page);
  const spec = await request.get('/api/v1/openapi.yaml');
  expect(spec.status()).toBe(200);
  expect(headerValues(spec, 'content-type')).toEqual([expect.stringMatching(/^application\/yaml/)]);
  expect(await spec.text()).toMatch(/^openapi: 3\.1\.0/m);
});

test('API: the large hashed script is gzipped only when requested', async ({ request, page }) => {
  const html = await (await request.get('/')).text();
  const script = /src="(\/assets\/[^" ]+\.js)"/.exec(html)?.[1];
  if (script === undefined) throw new Error('index.html must name its hashed script');
  await pace(page);
  const plain = await request.get(script, { headers: { 'accept-encoding': 'identity' } });
  expect(plain.status()).toBe(200);
  expect((await plain.body()).length).toBeGreaterThan(1024);
  expect(headerValues(plain, 'content-encoding')).toEqual([]);
  await pace(page);
  const compressed = await request.get(script, { headers: { 'accept-encoding': 'gzip' } });
  expect(compressed.status()).toBe(200);
  expect(headerValues(compressed, 'content-encoding')).toEqual(['gzip']);
  expect(headerValues(compressed, 'vary').join(',')).toMatch(/\bAccept-Encoding\b/i);
});

test('API: probes expose build metadata and readiness without caching', async ({ request, page }) => {
  for (const [path, status] of [
    ['/healthz', 'ok'],
    ['/readyz', 'ready'],
  ]) {
    if (path === undefined) throw new Error('probe path missing');
    await pace(page);
    const response = await request.get(path);
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({
      status,
      version: expect.stringMatching(/\S+/),
      commit: expect.stringMatching(/^(?:[a-fA-F0-9]{7,40}|unknown)$/),
    });
    expect(headerValues(response, 'cache-control')).toEqual(['no-store']);
  }
});

test('a UI calculation posts to the same origin and receives exactly one request id', async ({ calc, page }) => {
  await calc.goto();
  const pending = nextCalculation(page);
  await calc.enter('0.1 + 0.2 =');
  const response = await pending;
  expect(new URL(response.url()).origin).toBe(new URL(page.url()).origin);
  expect(response.request().method()).toBe('POST');
  expect(response.status()).toBe(200);
  expect(
    (await response.headersArray())
      .filter(({ name }) => name.toLowerCase() === 'x-request-id')
      .map(({ value }) => value),
  ).toEqual([expect.stringMatching(/^[A-Za-z0-9._-]{1,128}$/)]);
  await expect(calc.result()).toHaveText('0.3');
});
