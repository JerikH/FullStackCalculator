import { test as base, expect } from '@playwright/test';
import type { Locator, Page, Request, Response } from '@playwright/test';

/** Path prefix of the calculation endpoints; the operation name follows it. */
export const OPERATIONS_PATH = '/api/v1/operations/';

/** The browser logs «Failed to load resource» for every 4xx/5xx; the error paths under test produce them. */
const NETWORK_NOISE = /^Failed to load resource: the server responded with a status of [45]\d\d/;

/** What the page reported while a test ran; the fixture asserts all three are empty at the end. */
export interface Problems {
  readonly console: string[];
  readonly pageErrors: string[];
  readonly csp: string[];
}

/** One calculation request the page made, with the answer's request id. */
export interface RecordedCall {
  readonly operation: string;
  readonly operands: string[];
  status: number;
  readonly requestId: string | null;
  responseRequestId: string | null;
}

/** Accessible names of the keypad (frontend/src/features/calculator/model/keypad.ts), by what a person reads. */
const KEY_NAMES: Readonly<Record<string, string>> = {
  '+': 'add',
  '−': 'subtract',
  '-': 'subtract',
  '×': 'multiply',
  '*': 'multiply',
  '÷': 'divide',
  '/': 'divide',
  '=': 'equals',
  xʸ: 'xʸ, power',
  '√': 'square root',
  '%': 'percentage',
  '±': 'toggle sign',
  '.': 'decimal point',
  AC: 'AC, all clear',
  C: 'clear entry',
  '⌫': 'backspace',
};

/** The calculator as a person uses it: the keypad buttons and the display. */
export class Calc {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /** Opens the app and waits until React has rendered the keypad. */
  async goto(path = '/'): Promise<Response | null> {
    const response = await this.page.goto(path);
    await this.page.getByRole('group', { name: 'Keypad' }).waitFor();
    return response;
  }

  key(name: string): Locator {
    return this.page.getByRole('button', { name: KEY_NAMES[name] ?? name, exact: true });
  }

  async press(name: string): Promise<void> {
    await this.key(name).click();
  }

  /**
   * Presses a sequence written as people write it, separated by spaces: `0.1 + 0.2 =`, `2 xʸ 10 =`, `16 √`,
   * `5 −`. A number is pressed digit by digit; a leading `-` presses the sign key after the digits.
   */
  async enter(sequence: string): Promise<void> {
    for (const token of sequence.split(/\s+/).filter((t) => t !== '')) {
      if (/^-?[0-9]*\.?[0-9]*$/.test(token) && /[0-9.]/.test(token)) {
        const negative = token.startsWith('-');
        for (const char of negative ? token.slice(1) : token) await this.press(char);
        if (negative) await this.press('±');
      } else {
        await this.press(token);
      }
    }
  }

  /** The result line, as read by a screen reader. */
  result(): Locator {
    return this.page.locator('output[aria-label="Result"]');
  }

  /** The expression line above the alert (the first paragraph of the display). */
  expression(): Locator {
    return this.page.locator('[aria-busy]').locator('p').first();
  }

  /** The error alert: the message and `Ref: <request id>` once a calculation failed. */
  alert(): Locator {
    return this.page.getByRole('alert');
  }

  /** The History panel: a `<details>` whose summary reads «History». */
  historySummary(): Locator {
    return this.page.getByText('History', { exact: true });
  }

  /** The history rows, newest first; each is a button named `<expression>, use result`. */
  historyRows(): Locator {
    return this.page.getByRole('button', { name: /, use result$/ });
  }

  /** Opens the History panel when it is closed (it is open by default from 768 px up). */
  async openHistory(): Promise<void> {
    const details = this.page.locator('details');
    if (!(await details.evaluate((element: HTMLDetailsElement) => element.open))) await this.historySummary().click();
  }

  async resultText(): Promise<string> {
    return ((await this.result().textContent()) ?? '').replace(/\s+/g, ' ').trim();
  }
}

interface Fixtures {
  /** Console errors, page errors and CSP violations; asserted empty when the test ends. */
  problems: Problems;
  /** Console messages that are expected (and only those) by this test. */
  allowConsole: RegExp[];
  /** Every calculation request the page makes, in order. */
  requests: RecordedCall[];
  calc: Calc;
}

/**
 * The `test` every spec imports. A test fails on any console error, uncaught page error or CSP violation, except the
 * browser's own network-failure line for a 4xx/5xx and the patterns the test lists in `allowConsole`.
 */
export const test = base.extend<Fixtures>({
  allowConsole: [[], { option: true }],

  problems: [
    async ({ page, allowConsole }, provide) => {
      const problems: Problems = { console: [], pageErrors: [], csp: [] };
      await page.addInitScript(() => {
        const target = window as unknown as { __csp: string[] };
        target.__csp = [];
        document.addEventListener('securitypolicyviolation', (event) => {
          target.__csp.push(`${event.violatedDirective} ${event.blockedURI}`);
        });
      });
      page.on('console', (message) => {
        if (message.type() !== 'error') return;
        const text = message.text();
        if (NETWORK_NOISE.test(text) || allowConsole.some((pattern) => pattern.test(text))) return;
        problems.console.push(text);
      });
      page.on('pageerror', (error) => problems.pageErrors.push(error.message));
      await provide(problems);
      if (!page.isClosed()) {
        const seen = await page
          .evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? [])
          .catch(() => [] as string[]);
        problems.csp.push(...seen);
      }
      expect(problems, 'console errors, page errors and CSP violations').toEqual({
        console: [],
        pageErrors: [],
        csp: [],
      });
    },
    { auto: true },
  ],

  requests: async ({ page }, provide) => {
    const calls: RecordedCall[] = [];
    const pending = new Map<Request, RecordedCall>();
    page.on('request', (request) => {
      const { pathname } = new URL(request.url());
      if (!pathname.startsWith(OPERATIONS_PATH)) return;
      const body = request.postDataJSON() as { operands: string[] };
      const call: RecordedCall = {
        operation: pathname.slice(OPERATIONS_PATH.length),
        operands: body.operands,
        status: 0,
        requestId: request.headers()['x-request-id'] ?? null,
        responseRequestId: null,
      };
      pending.set(request, call);
      calls.push(call);
    });
    page.on('response', (response) => {
      const call = pending.get(response.request());
      if (!call) return;
      call.status = response.status();
      call.responseRequestId = response.headers()['x-request-id'] ?? null;
    });
    await provide(calls);
  },

  calc: async ({ page }, provide) => {
    await provide(new Calc(page));
  },
});

export { expect };

/** Waits for the next calculation response and returns it; start it before the click that causes it. */
export function nextCalculation(page: Page): Promise<Response> {
  return page.waitForResponse((response) => new URL(response.url()).pathname.startsWith(OPERATIONS_PATH));
}

/** A pause that keeps API-heavy loops under the edge's 20 requests per second (no synchronisation by sleeping). */
export async function pace(page: Page, milliseconds = 70): Promise<void> {
  await page.waitForTimeout(milliseconds);
}
