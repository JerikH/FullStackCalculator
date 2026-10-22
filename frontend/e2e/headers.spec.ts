import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { APIResponse } from '@playwright/test';
import { EDGE_CSP, headerValues, post } from './helpers/api.js';
import { test, expect, pace } from './helpers/fixture.js';

const policies: Readonly<Record<string, string>> = {
  'content-security-policy': EDGE_CSP,
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'cross-origin-opener-policy': 'same-origin',
};

function security(response: APIResponse): void {
  for (const [name, value] of Object.entries(policies)) expect(headerValues(response, name), name).toEqual([value]);
  expect(headerValues(response, 'x-request-id')).toEqual([expect.stringMatching(/^[A-Za-z0-9._-]{1,128}$/)]);
  expect(headerValues(response, 'strict-transport-security')).toEqual([]);
  expect(response.headersArray().filter(({ name }) => /^access-control-/i.test(name))).toEqual([]);
  expect(headerValues(response, 'server')).toEqual(['nginx']);
}

test('API: every response class has one edge policy and the correct cache and media type', async ({
  request,
  page,
}) => {
  const snippet = await readFile(resolve(import.meta.dirname, '../../deploy/nginx/security-headers.conf'), 'utf8');
  for (const [name, value] of Object.entries(policies)) {
    const declarations = [...snippet.matchAll(/add_header\s+([^\s]+)\s+"([^"]*)"\s+always;/g)]
      .filter((match) => match[1]?.toLowerCase() === name)
      .map((match) => match[2]);
    expect(declarations, `disk policy ${name}`).toEqual([value]);
  }
  const index = await request.get('/index.html');
  expect(index.status()).toBe(200);
  const html = await index.text();
  const script = /<script\b[^>]*\bsrc="(\/assets\/[^" ]+\.js)"/.exec(html)?.[1];
  const stylesheet = /<link\b[^>]*href="([^" ]+\.css)"/.exec(html)?.[1];
  expect(script).toMatch(/^\/assets\/.+-[\w-]+\.js$/);
  expect(stylesheet).toMatch(/^\/assets\/.+-[\w-]+\.css$/);
  if (script === undefined || stylesheet === undefined) throw new Error('index.html must name hashed JS and CSS');
  await pace(page);
  const javascript = await request.get(script);
  const mapReference = /\/\/# sourceMappingURL=([^\s]+)/.exec(await javascript.text())?.[1];
  expect(mapReference).toBeDefined();
  if (mapReference === undefined) throw new Error('hashed script must name its source map');
  const mapPath = new URL(mapReference, javascript.url()).pathname;
  const cases: { path: string; status: number; cache: string; mime?: RegExp }[] = [
    { path: '/', status: 200, cache: 'no-cache', mime: /^text\/html/ },
    { path: '/index.html', status: 200, cache: 'no-cache', mime: /^text\/html/ },
    { path: '/theme-init.js', status: 200, cache: 'no-cache', mime: /^(text|application)\/javascript/ },
    ...[
      { path: script, mime: /^(text|application)\/javascript/ },
      { path: stylesheet, mime: /^text\/css/ },
      { path: mapPath, mime: /^application\/json/ },
    ].map((asset) => ({ ...asset, status: 200, cache: 'public, max-age=31536000, immutable' })),
    { path: '/nginx-health', status: 200, cache: 'no-store' },
    { path: '/api/v1/operations', status: 200, cache: 'no-store' },
    { path: '/api/v1/missing-route', status: 404, cache: 'no-store' },
    { path: '/healthz', status: 200, cache: 'no-store' },
    { path: '/readyz', status: 200, cache: 'no-store' },
  ];
  for (const entry of cases) {
    await pace(page);
    const response = await request.get(entry.path);
    expect(response.status(), entry.path).toBe(entry.status);
    security(response);
    expect(headerValues(response, 'cache-control'), entry.path).toEqual([entry.cache]);
    if (entry.mime) expect(headerValues(response, 'content-type')).toEqual([expect.stringMatching(entry.mime)]);
  }
  await pace(page);
  const missing = await request.get('/assets/missing-hash.js');
  expect(missing.status()).toBe(404);
  security(missing);
  expect(headerValues(missing, 'cache-control').join(',')).not.toContain('immutable');
  for (const [operation, operands, status] of [
    ['add', ['0.1', '0.2'], 200],
    ['divide', ['1', '0'], 422],
  ] as const) {
    await pace(page);
    const response = await post(request, operation, { operands });
    expect(response.status()).toBe(status);
    security(response);
    expect(headerValues(response, 'cache-control')).toEqual(['no-store']);
  }
});

test('the browser loads external theme bootstrap before the app without inline code or CSP errors', async ({
  calc,
  page,
}) => {
  await calc.goto();
  await expect(page.locator('script:not([src])')).toHaveCount(0);
  await expect(page.locator('[style]')).toHaveCount(0);
  expect(await page.locator('style').allTextContents()).toEqual([]);
  const scripts = await page.locator('script').evaluateAll((nodes) =>
    nodes.map((element) => {
      const node = element as HTMLScriptElement;
      return {
        src: node.getAttribute('src'),
        type: node.getAttribute('type'),
        async: node.async,
        defer: node.defer,
      };
    }),
  );
  const theme = scripts.findIndex((script) => script.src === '/theme-init.js');
  const app = scripts.findIndex((script) => script.type === 'module');
  expect(theme).toBeGreaterThanOrEqual(0);
  expect(app).toBeGreaterThan(theme);
  expect(scripts[theme]).toMatchObject({ async: false, defer: false, type: null });
});
