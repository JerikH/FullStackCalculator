import type { Page, Request, Response, TestInfo } from '@playwright/test';

export const API_PATH = '/api/v1/operations/';

/** Collects console errors, page errors and CSP violations of a page from the first navigation on. */
export interface Problems {
  console: string[];
  pageErrors: string[];
  csp: string[];
}

export async function watchProblems(page: Page): Promise<Problems> {
  const problems: Problems = { console: [], pageErrors: [], csp: [] };
  await page.addInitScript(() => {
    const w = window as unknown as { __csp: string[] };
    w.__csp = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      w.__csp.push(`${event.violatedDirective} ${event.blockedURI}`);
    });
  });
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    // The browser itself logs «Failed to load resource … 4xx/5xx» for every non-2xx answer; the error paths
    // under test produce exactly those, so they are network noise, not application console errors.
    if (/^Failed to load resource: the server responded with a status of [45]\d\d/.test(message.text())) return;
    problems.console.push(message.text());
  });
  page.on('pageerror', (error) => problems.pageErrors.push(error.message));
  return problems;
}

export async function collectCsp(page: Page, problems: Problems): Promise<void> {
  const seen = await page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? []);
  problems.csp.push(...seen);
}

/** Types keys through the physical keyboard (one key per character; `Enter` etc. by name via `keys`). */
export async function typeKeys(page: Page, text: string): Promise<void> {
  for (const char of text) await page.keyboard.press(char);
}

export function value(page: Page) {
  return page.getByRole('status', { name: 'Result' }).or(page.locator('output[aria-label="Result"]'));
}

export async function resultText(page: Page): Promise<string> {
  return ((await page.locator('output[aria-label="Result"]').textContent()) ?? '').replace(/\s+/g, ' ').trim();
}

export async function themeAttr(page: Page): Promise<string | null> {
  return page.evaluate(() => document.documentElement.getAttribute('data-theme'));
}

/** Records every operation request (path operation + posted operands) and its response request id. */
export interface Recorded {
  operation: string;
  operands: string[];
  status: number;
  requestId: string | null;
  responseRequestId: string | null;
}

export function recordRequests(page: Page): Recorded[] {
  const list: Recorded[] = [];
  const pending = new Map<Request, Recorded>();
  page.on('request', (request) => {
    if (!request.url().includes(API_PATH)) return;
    const body = request.postDataJSON() as { operands: string[] };
    const entry: Recorded = {
      operation: request.url().split(API_PATH)[1] ?? '',
      operands: body.operands,
      status: 0,
      requestId: request.headers()['x-request-id'] ?? null,
      responseRequestId: null,
    };
    pending.set(request, entry);
    list.push(entry);
  });
  page.on('response', (response: Response) => {
    const entry = pending.get(response.request());
    if (!entry) return;
    entry.status = response.status();
    entry.responseRequestId = response.headers()['x-request-id'] ?? null;
  });
  return list;
}

export async function shot(page: Page, info: TestInfo, name: string): Promise<void> {
  const dir = process.env.E2E_SHOTS ?? 'results/shots';
  await page.screenshot({
    path: `${dir}/${info.project.name}-${name}.png`,
    fullPage: true,
  });
}

/** A contract-shaped answer for route.fulfill, so layout cases can show chosen values. */
export function fulfillOk(operation: string, operands: string[], result: string, inexact: boolean) {
  return {
    status: 200,
    contentType: 'application/json',
    headers: { 'x-request-id': 'route-fulfilled' },
    body: JSON.stringify({ operation, operands, result, inexact }),
  };
}

export function fulfillProblem(status: number, code: string, requestId: string) {
  return {
    status,
    contentType: 'application/problem+json',
    headers: { 'x-request-id': requestId },
    body: JSON.stringify({
      type: 'about:blank',
      title: 'Problem',
      status,
      detail: 'detail',
      code,
      requestId,
    }),
  };
}

export async function setStoredTheme(page: Page, theme: string | null): Promise<void> {
  await page.addInitScript((value) => {
    if (value === null) return;
    window.localStorage.setItem('calculator.theme.v1', value);
  }, theme);
}

/** Navigates and waits until React has mounted (the dev server loads modules lazily after `load`). */
export async function open(page: Page, path = '/'): Promise<Response | null> {
  const response = await page.goto(path);
  await page.getByRole('group', { name: 'Keypad' }).waitFor();
  await page.waitForTimeout(150);
  return response;
}
