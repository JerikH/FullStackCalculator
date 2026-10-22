import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

// Control of the composed stack for the specs that disturb it (e2e/stack-disruptive.spec.ts). Docker is called with
// an argument array, never through a shell. `docker compose stop` is not used: `web` must stay up while `api` stops,
// so `api` is stopped by its container id.

const execFileAsync = promisify(execFile);

const root = resolve(import.meta.dirname, '..', '..', '..');
const composeFile = resolve(root, 'compose.yaml');
// An extra compose file layered over compose.yaml (a scratch override used by the mutation checks).
const composeOverride = process.env.E2E_COMPOSE_OVERRIDE ?? '';
const project = process.env.COMPOSE_PROJECT_NAME ?? 'fullstackcalculator';

export type Service = 'api' | 'web';

/** Anything that changes the stack runs alone (`E2E_STACK=1`, the disruptive spec); reading it is always allowed. */
export function requireStack(): void {
  if (process.env.E2E_STACK !== '1') {
    throw new Error('stack control is available only with E2E_STACK=1 (the disruptive spec, run alone and last)');
  }
}

async function docker(args: string[], timeoutMs = 60_000): Promise<string> {
  const { stdout } = await execFileAsync('docker', args, {
    timeout: timeoutMs,
    maxBuffer: 16 * 1024 * 1024,
    cwd: root,
  });
  return stdout.trim();
}

function compose(args: string[], timeoutMs = 120_000, extraFiles: string[] = []): Promise<string> {
  const files = ['-f', composeFile, ...(composeOverride === '' ? [] : ['-f', composeOverride])];
  for (const file of extraFiles) files.push('-f', file);
  return docker(['compose', '-p', project, ...files, ...args], timeoutMs);
}

/** The id of the service's container, running or not. */
export async function containerId(service: Service): Promise<string> {
  const id = await compose(['ps', '-a', '-q', service]);
  if (id === '' || id.includes('\n'))
    throw new Error(`expected one ${service} container in project ${project}, got «${id}»`);
  return id;
}

export interface ContainerInfo {
  readonly id: string;
  readonly state: { Status: string; Running: boolean; ExitCode: number; Health?: { Status: string } };
  readonly hostConfig: {
    ReadonlyRootfs: boolean;
    CapDrop: string[] | null;
    SecurityOpt: string[] | null;
    Tmpfs: Record<string, string> | null;
    PortBindings: Record<string, { HostIp: string; HostPort: string }[] | null> | null;
    StopTimeout?: number | null;
  };
  readonly config: { Env: string[]; Healthcheck?: { Test: string[] } };
  readonly networkIp: string;
}

export async function inspect(service: Service): Promise<ContainerInfo> {
  const id = await containerId(service);
  const raw = JSON.parse(await docker(['inspect', id])) as {
    Id: string;
    State: ContainerInfo['state'];
    HostConfig: ContainerInfo['hostConfig'];
    Config: ContainerInfo['config'];
    NetworkSettings: { Networks: Record<string, { IPAddress: string }> };
  }[];
  const first = raw[0];
  if (first === undefined) throw new Error(`docker inspect returned nothing for ${service}`);
  const ip = Object.values(first.NetworkSettings.Networks)[0]?.IPAddress ?? '';
  return { id: first.Id, state: first.State, hostConfig: first.HostConfig, config: first.Config, networkIp: ip };
}

/** Polls the container's health status until it is `healthy`; a bounded wait, never a fixed sleep. */
export async function waitHealthy(service: Service, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let status = 'unknown';
  while (Date.now() < deadline) {
    status = (await inspect(service)).state.Health?.Status ?? 'none';
    if (status === 'healthy') return;
    await new Promise((done) => setTimeout(done, 500));
  }
  throw new Error(`${service} not healthy after ${timeoutMs.toString()} ms (last status ${status})`);
}

/** Stops the api container alone and returns its id; `web` stays up. The stop waits for the container to exit. */
export async function stopApi(): Promise<string> {
  requireStack();
  const id = await containerId('api');
  await docker(['stop', id], 60_000);
  return id;
}

/** Starts a stopped api container (or recreates a missing one) and waits for it to be healthy. */
export async function startApi(): Promise<void> {
  requireStack();
  await compose(['up', '-d', '--no-build', '--no-recreate', 'api']);
  await waitHealthy('api');
}

/** `docker compose up -d --force-recreate api`: a new container with a new address; `web` restarts by itself. */
export async function recreateApi(): Promise<void> {
  requireStack();
  await compose(['up', '-d', '--no-build', '--force-recreate', 'api']);
  await waitHealthy('api');
  await waitHealthy('web');
}

/**
 * Replaces api with a container that has a changed configuration (a variable the service ignores, new on every call) AND a different address, through a plain
 * `docker compose up -d` (web included, so `depends_on.api.restart: true` applies). The old address is held by a
 * placeholder container while api is replaced: without it Docker hands the freed address to the new container and
 * a stale upstream could not be told from a fresh one. A named `up api` would not restart web.
 */
export async function replaceApiAtNewAddress(): Promise<void> {
  requireStack();
  const holder = `${project}-address-holder`;
  const directory = await mkdtemp(join(tmpdir(), 'calculator-e2e-'));
  const override = join(directory, 'api-config.yaml');
  await writeFile(override, `services:\n  api:\n    environment:\n      E2E_REPLACEMENT: "${Date.now().toString()}"\n`);
  try {
    await stopApi();
    await docker(['rm', '-f', holder]).catch(() => '');
    await docker(['run', '-d', '--name', holder, '--network', `${project}_default`, 'alpine:3', 'sleep', '300']);
    await compose(['up', '-d', '--no-build'], 120_000, [override]);
    await waitHealthy('api');
    await waitHealthy('web');
  } finally {
    await docker(['rm', '-f', holder]).catch(() => '');
    await rm(directory, { recursive: true, force: true });
  }
}

/**
 * Begins `docker stop` of the api container without waiting: the caller observes the drain window (readiness 503 for
 * `CALC_SHUTDOWN_DRAIN`) while `exited` settles when the container has stopped.
 */
export async function beginStopApi(): Promise<{ id: string; exited: Promise<string> }> {
  requireStack();
  const id = await containerId('api');
  return { id, exited: docker(['stop', id], 60_000) };
}

/** The api service's log lines since a point in time (RFC 3339), as text. */
export async function apiLogs(since: string): Promise<string> {
  return compose(['logs', '--no-color', '--no-log-prefix', '--since', since, 'api']);
}
