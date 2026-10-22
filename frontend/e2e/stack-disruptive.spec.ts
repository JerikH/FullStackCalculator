import { execFile } from 'node:child_process';
import { connect } from 'node:net';
import type { Socket } from 'node:net';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';
import type { APIRequestContext, APIResponse, TestInfo } from '@playwright/test';
import { EDGE_CSP, expectProblem, headerValues, post } from './helpers/api.js';
import { apiLogs, beginStopApi, inspect, replaceApiAtNewAddress, requireStack, startApi } from './helpers/compose.js';
import { test, expect, nextCalculation, pace } from './helpers/fixture.js';

const root = resolve(import.meta.dirname, '../..');
const run = promisify(execFile);

async function docker(args: string[]): Promise<string> {
  const { stdout } = await run('docker', args, { cwd: root, timeout: 30_000, maxBuffer: 16 * 1024 * 1024 });
  return stdout.trim();
}

async function compose(args: string[]): Promise<string> {
  // Match the shared helper's project and file selection, including controller overlays.
  const override = process.env.E2E_COMPOSE_OVERRIDE ?? '';
  return docker([
    'compose',
    '-p',
    process.env.COMPOSE_PROJECT_NAME ?? 'fullstackcalculator',
    '-f',
    resolve(root, 'compose.yaml'),
    ...(override === '' ? [] : ['-f', override]),
    ...args,
  ]);
}

async function startedAt(id: string): Promise<string> {
  return docker(['inspect', '--format', '{{.State.StartedAt}}', id]);
}

async function serving(request: APIRequestContext, timeout = 15_000): Promise<void> {
  await expect
    .poll(
      async () => {
        const healthy = (await inspect('api')).state.Health?.Status === 'healthy';
        const response = await request.get('/api/v1/operations', { timeout: 7000 });
        return healthy && response.status() === 200;
      },
      { timeout, intervals: [200, 400, 500] },
    )
    .toBe(true);
}

async function ensureServing(request: APIRequestContext, info: TestInfo): Promise<void> {
  requireStack();
  if (!(await inspect('api')).state.Running) await startApi();
  let lastStatus = 0;
  try {
    await expect
      .poll(
        async () => {
          const healthy = (await inspect('api')).state.Health?.Status === 'healthy';
          lastStatus = (await request.get('/api/v1/operations', { timeout: 7000 })).status();
          return healthy && lastStatus === 200;
        },
        { timeout: 15_000, intervals: [200, 400, 500] },
      )
      .toBe(true);
  } catch (error) {
    if (lastStatus !== 503) throw error;
    await compose(['restart', 'web']);
    info.annotations.push({ type: 'stale-upstream', description: 'web restarted after a plain start of api' });
    await serving(request);
  }
}

async function problem(response: APIResponse, status: number, code: string): Promise<void> {
  const body = await expectProblem(response, status, code);
  for (const key of ['type', 'title', 'detail', 'code', 'requestId'] as const)
    expect(typeof body[key], key).toBe('string');
  expect(typeof body.status).toBe('number');
  expect(headerValues(response, 'x-request-id')).toEqual([body.requestId]);
}

function policies(response: APIResponse): void {
  for (const [name, value] of Object.entries({
    'content-security-policy': EDGE_CSP,
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'permissions-policy': 'camera=(), microphone=(), geolocation=()',
    'cross-origin-opener-policy': 'same-origin',
  }))
    expect(headerValues(response, name), name).toEqual([value]);
}

interface ComposeConfig {
  services: {
    api: { stop_grace_period: string };
    web: { depends_on: { api: { condition: string; restart: boolean } } };
  };
}

// Each batch stays below the connection limit, so only the request-rate bucket decides.
async function burst(request: APIRequestContext): Promise<APIResponse[]> {
  const responses: APIResponse[] = [];
  for (let batch = 0; batch < 6; batch++) {
    responses.push(...(await Promise.all(Array.from({ length: 15 }, () => request.get('/api/v1/operations')))));
  }
  return responses;
}

function logRecord(line: string): { level?: string; path?: string; status?: number; request_id?: string } {
  if (line.trim().startsWith('{'))
    return JSON.parse(line) as { level?: string; path?: string; status?: number; request_id?: string };
  return {
    level: /\blevel=(\w+)/.exec(line)?.[1],
    path: /\bpath=(\S+)/.exec(line)?.[1],
    request_id: /\brequest_id=(\S+)/.exec(line)?.[1],
    status: /\bstatus=503\b/.test(line) ? 503 : undefined,
  };
}

test.describe('composed stack disruption and recovery', () => {
  test.describe.configure({ mode: 'serial' });
  test.beforeEach(async ({ request }, info) => {
    test.setTimeout(90_000);
    test.skip(
      process.env.E2E_STACK !== '1' || info.project.name !== 'chromium',
      'Runs alone and last with E2E_STACK=1 in chromium',
    );
    await ensureServing(request, info);
  });
  test.afterAll(async ({ request }, info) => {
    if (process.env.E2E_STACK !== '1' || info.project.name !== 'chromium') return;
    test.setTimeout(90_000);
    await ensureServing(request, info);
  });

  test('API: running containers enforce hardening, private listeners, tmpfs bounds and dependency restart', async () => {
    const config = JSON.parse(await compose(['config', '--format', 'json'])) as ComposeConfig;
    for (const service of ['api', 'web'] as const) {
      const container = await inspect(service);
      expect(container.hostConfig.ReadonlyRootfs).toBe(true);
      expect(container.hostConfig.CapDrop?.map((cap) => cap.toUpperCase())).toEqual(['ALL']);
      expect(container.hostConfig.SecurityOpt?.some((option) => /^no-new-privileges(?::|=|$)/i.test(option))).toBe(
        true,
      );
      expect(container.state.Health?.Status).toBe('healthy');
      const bindings = Object.entries(container.hostConfig.PortBindings ?? {}).flatMap(([port, entries]) =>
        (entries ?? []).filter((entry) => entry.HostPort !== '').map((entry) => ({ port, hostPort: entry.HostPort })),
      );
      if (service === 'api') {
        expect(bindings).toEqual([]);
        expect(container.config.Env).toContain('CALC_SHUTDOWN_DRAIN=2s');
        const grace = config.services.api.stop_grace_period;
        const seconds = /^(\d+(?:\.\d+)?)s$/.exec(grace)?.[1];
        if (container.hostConfig.StopTimeout != null)
          expect(container.hostConfig.StopTimeout).toBeGreaterThanOrEqual(20);
        else {
          expect(seconds).toBeDefined();
          expect(Number(seconds)).toBeGreaterThanOrEqual(20);
        }
      } else {
        expect(bindings.length).toBeGreaterThan(0);
        for (const binding of bindings)
          expect(binding).toEqual({ port: '8080/tcp', hostPort: process.env.WEB_PORT ?? '8080' });
        const mounts = await docker(['exec', container.id, 'grep', ' /tmp ', '/proc/mounts']);
        expect(mounts).toMatch(/\btmpfs\b.*\bsize=65536k\b/);
        const conf = await docker(['exec', container.id, 'grep', ' /etc/nginx/conf.d ', '/proc/mounts']);
        expect(conf).toMatch(/\btmpfs\b/);
      }
      expect(bindings.filter(({ port }) => /^(9091|8081)\//.test(port))).toEqual([]);
    }
    expect(config.services.web.depends_on.api).toMatchObject({ condition: 'service_healthy', restart: true });
  });

  test('API: twenty held connections stay pending and only the twenty-first API request is refused', async ({
    request,
    baseURL,
    page,
  }) => {
    // Refill the request-rate bucket before isolating the connection limit.
    await delay(3100);
    if (baseURL === undefined) throw new Error('baseURL is required');
    const target = new URL(baseURL);
    const sockets: { socket: Socket; received: boolean; closed: boolean; error?: string }[] = [];
    const started = Date.now();
    // Even assertion failure must release all held sockets before client_body_timeout.
    const watchdog = setTimeout(() => {
      for (const held of sockets) held.socket.destroy();
    }, 7500);
    try {
      for (let index = 0; index < 20; index++) {
        const socket = connect({ host: target.hostname, port: Number(target.port || '80') });
        const held: (typeof sockets)[number] = { socket, received: false, closed: false };
        sockets.push(held);
        socket.on('data', () => {
          held.received = true;
        });
        socket.on('close', () => {
          held.closed = true;
        });
        socket.on('error', (error) => {
          held.error = error.message;
        });
        await new Promise<void>((done, reject) => {
          socket.once('connect', () => {
            socket.write(
              `POST /api/v1/operations/add HTTP/1.1\r\nHost: ${target.host}\r\nContent-Type: application/json\r\nContent-Length: 100\r\n\r\n`,
              (error) => {
                if (error) reject(error);
                else done();
              },
            );
          });
          socket.once('error', reject);
          socket.once('close', () => {
            reject(new Error('held socket closed before connection was established'));
          });
        });
        await pace(page);
      }
      // An unrestricted probe completes after the writes, giving nginx time to process the held headers.
      expect((await request.get('/nginx-health', { timeout: 2000 })).status()).toBe(200);
      for (const held of sockets)
        expect({ received: held.received, closed: held.closed, error: held.error }).toEqual({
          received: false,
          closed: false,
          error: undefined,
        });
      await problem(
        await request.post('/api/v1/operations/add', { data: { operands: ['1', '2'] }, timeout: 2000 }),
        429,
        'RATE_LIMITED',
      );
      for (const path of ['/', '/nginx-health', '/healthz'])
        expect((await request.get(path, { timeout: 2000 })).status()).toBe(200);
      for (const held of sockets)
        expect({ received: held.received, closed: held.closed }).toEqual({ received: false, closed: false });
      expect(Date.now() - started).toBeLessThan(8000);
    } finally {
      clearTimeout(watchdog);
      for (const held of sockets) held.socket.destroy();
    }
    await expect
      .poll(async () => (await post(request, 'add', { operands: ['1', '2'] })).status(), {
        timeout: 5000,
        intervals: [100, 200],
      })
      .toBe(200);
  });

  test('API: a rate burst returns valid 429 problems while static files and probes stay available', async ({
    request,
  }) => {
    const responses = await burst(request);
    expect(responses).toHaveLength(90);
    const limited = responses.filter((response) => response.status() === 429);
    expect(limited.length).toBeGreaterThan(0);
    for (const response of limited) await problem(response, 429, 'RATE_LIMITED');
    const flood = burst(request);
    try {
      for (const path of ['/', '/theme-init.js', '/nginx-health', '/healthz', '/readyz'])
        expect((await request.get(path)).status(), path).toBe(200);
    } finally {
      await flood;
      // Refill before any later traffic test or restoration hook.
      await delay(3100);
    }
  });

  test('API: draining readiness passes through, stopped service gives edge problems, and a plain start restores service', async ({
    request,
    page,
  }, info) => {
    test.setTimeout(120_000);
    const since = new Date().toISOString();
    const started = Date.now();
    const stopping = await beginStopApi();
    // Observe rejection immediately even while the readiness poll runs.
    const exited = stopping.exited.then(() => Date.now() - started);
    void exited.catch(() => undefined);
    let drainingId = '';
    try {
      await expect
        .poll(
          async () => {
            const response = await request.get('/readyz', { timeout: 1000 });
            if (
              response.status() !== 503 ||
              !/^application\/json(?:;|$)/.test(response.headers()['content-type'] ?? '')
            )
              return false;
            const body = (await response.json()) as { status?: string };
            if (body.status !== 'draining') return false;
            expect(body).toEqual({
              status: 'draining',
              version: expect.stringMatching(/\S+/),
              commit: expect.stringMatching(/^(?:[a-fA-F0-9]{7,40}|unknown)$/),
            });
            policies(response);
            drainingId = response.headers()['x-request-id'] ?? '';
            return true;
          },
          { timeout: 4000, intervals: [100] },
        )
        .toBe(true);
    } finally {
      expect(await exited).toBeLessThan(25_000);
    }
    expect(drainingId).not.toBe('');
    expect((await inspect('api')).state.ExitCode).toBe(0);
    await expect
      .poll(
        async () => {
          const response = await request.get('/readyz', { timeout: 7000 });
          return (
            response.status() === 503 && response.headers()['content-type']?.startsWith('application/problem+json')
          );
        },
        { timeout: 30_000, intervals: [100, 200] },
      )
      .toBe(true);
    for (const path of ['/api/v1/operations', '/healthz', '/readyz']) {
      await pace(page);
      const response = await request.get(path, { timeout: 7000 });
      await problem(response, 503, 'SERVICE_UNAVAILABLE');
      policies(response);
      expect(headerValues(response, 'cache-control')).toEqual(['no-store']);
    }
    for (const path of ['/', '/nginx-health']) expect((await request.get(path)).status()).toBe(200);
    let sample = '';
    await expect
      .poll(
        async () => {
          sample =
            (await apiLogs(since)).split('\n').find((line) => {
              const record = logRecord(line);
              return record.request_id === drainingId && record.path === '/readyz' && record.status === 503;
            }) ?? '';
          return sample !== '';
        },
        { timeout: 5000, intervals: [100, 200, 400] },
      )
      .toBe(true);
    expect(logRecord(sample).level?.toLowerCase()).toBe('info');
    info.annotations.push({
      type: 'access-log-format',
      description: `${sample.trim().startsWith('{') ? 'JSON' : 'slog text'}; draining /readyz sample: ${sample}`,
    });
    await startApi();
    await ensureServing(request, info);
  });

  test('API: replacing api at a new address restarts web and restores proxying without manual restart', async ({
    request,
  }) => {
    const beforeApi = await inspect('api');
    const beforeStart = await startedAt((await inspect('web')).id);
    expect(beforeApi.networkIp).not.toBe('');
    await replaceApiAtNewAddress();
    const afterApi = await inspect('api');
    expect(afterApi.id).not.toBe(beforeApi.id);
    expect(afterApi.networkIp).not.toBe('');
    expect(afterApi.networkIp).not.toBe(beforeApi.networkIp);
    expect(await startedAt((await inspect('web')).id)).not.toBe(beforeStart);
    await serving(request, 15_000);
  });

  test('the UI still calculates correctly after stack recovery', async ({ page, calc }) => {
    await calc.goto();
    const pending = nextCalculation(page);
    await calc.enter('0.1 + 0.2 =');
    expect((await pending).status()).toBe(200);
    await expect(calc.result()).toHaveText('0.3');
  });
});
