import type { Page } from '@playwright/test';
import { expectProblem, post } from './helpers/api.js';
import { expect, nextCalculation, test } from './helpers/fixture.js';
import type { Calc, RecordedCall } from './helpers/fixture.js';

/** Presses the keys and returns the service's answer to the request they cause. */
async function enterAndAwait(page: Page, calc: Calc, sequence: string): Promise<{ status: number; id: string }> {
  const answered = nextCalculation(page);
  await calc.enter(sequence);
  const response = await answered;
  return { status: response.status(), id: response.headers()['x-request-id'] ?? '' };
}

/** Asserts the alert shows this message and `Ref: <id>`, and the value line is empty. */
async function expectError(calc: Calc, message: string, id: string): Promise<void> {
  await expect(calc.alert().getByText(message, { exact: true })).toBeVisible();
  await expect(calc.alert().getByText(`Ref: ${id}`, { exact: true })).toBeVisible();
  await expect(calc.result()).toHaveText('');
}

function sent(requests: RecordedCall[]): [string, string[]][] {
  return requests.map((call) => [call.operation, call.operands]);
}

test.describe('UC-UI-01 errors (RF-UI-08)', () => {
  test('1 ÷ 0 = shows the division message and a Ref equal to the response X-Request-ID', async ({
    page,
    calc,
    requests,
  }) => {
    await calc.goto();
    const { status, id } = await enterAndAwait(page, calc, '1 ÷ 0 =');
    expect(status).toBe(422);
    expect(id).not.toBe('');
    await expectError(calc, 'Cannot divide by zero', id);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      operation: 'divide',
      operands: ['1', '0'],
      status: 422,
      responseRequestId: id,
    });
    // The alert carries nothing else: no server title or detail.
    await expect(calc.alert()).toHaveText(`Cannot divide by zero${'Ref: ' + id}`);
  });

  test('−1 √ shows the undefined-result message and a Ref equal to the response X-Request-ID', async ({
    page,
    calc,
    requests,
  }) => {
    await calc.goto();
    const { status, id } = await enterAndAwait(page, calc, '-1 √');
    expect(status).toBe(422);
    await expectError(calc, 'Result is undefined', id);
    expect(requests[0]).toMatchObject({ operation: 'sqrt', operands: ['-1'], status: 422, responseRequestId: id });
  });

  test('a failed calculation leaves no history entry', async ({ page, calc }) => {
    await calc.goto();
    await enterAndAwait(page, calc, '1 ÷ 0 =');
    await expect(calc.alert()).toContainText('Cannot divide by zero');
    await calc.openHistory();
    await expect(calc.page.getByText('No calculations yet')).toBeVisible();
    await expect(calc.historyRows()).toHaveCount(0);
  });

  test('the error alert is empty on a fresh page and after a successful calculation', async ({ page, calc }) => {
    await calc.goto();
    await expect(calc.alert()).toHaveText('');
    await enterAndAwait(page, calc, '1 + 1 =');
    await expect(calc.result()).toHaveText('2');
    await expect(calc.alert()).toHaveText('');
  });

  test('a digit after an error clears it and starts a fresh entry', async ({ page, calc, requests }) => {
    await calc.goto();
    await enterAndAwait(page, calc, '1 ÷ 0 =');
    await expect(calc.alert()).toContainText('Cannot divide by zero');
    await calc.press('7');
    await expect(calc.alert()).toHaveText('');
    await expect(calc.result()).toHaveText('7');
    await expect(calc.expression()).toHaveText('');
    // The failed division left no pending operator: the next operation starts from the new entry.
    const { status } = await enterAndAwait(page, calc, '+ 1 =');
    expect(status).toBe(200);
    await expect(calc.result()).toHaveText('8');
    expect(sent(requests).at(-1)).toEqual(['add', ['7', '1']]);
  });

  test('the decimal point after an error clears it and starts 0.', async ({ page, calc, requests }) => {
    await calc.goto();
    await enterAndAwait(page, calc, '1 ÷ 0 =');
    await expect(calc.alert()).toContainText('Cannot divide by zero');
    await calc.press('.');
    await expect(calc.alert()).toHaveText('');
    await expect(calc.result()).toHaveText('0.');
    await enterAndAwait(page, calc, '5 + 1 =');
    await expect(calc.result()).toHaveText('1.5');
    expect(sent(requests).at(-1)).toEqual(['add', ['0.5', '1']]);
  });

  test('recalling a history row after an error clears it and shows the recalled value', async ({
    page,
    calc,
    requests,
  }) => {
    await calc.goto();
    await enterAndAwait(page, calc, '2 + 3 =');
    await expect(calc.result()).toHaveText('5');
    await enterAndAwait(page, calc, '1 ÷ 0 =');
    await expect(calc.alert()).toContainText('Cannot divide by zero');
    await calc.openHistory();
    await calc.page.getByRole('button', { name: '2 + 3 = 5, use result', exact: true }).click();
    await expect(calc.alert()).toHaveText('');
    await expect(calc.result()).toHaveText('5');
    await enterAndAwait(page, calc, '× 4 =');
    await expect(calc.result()).toHaveText('20');
    expect(sent(requests).at(-1)).toEqual(['multiply', ['5', '4']]);
  });

  test.describe('fault injection: the service cannot be reached', () => {
    // The browser logs its own line for an aborted request; it is expected here and nowhere else.
    test.use({ allowConsole: [/Failed to load resource: net::ERR_FAILED/] });

    test('a network failure shows «Calculator service is unreachable» without a Ref', async ({ page, calc }) => {
      await page.route('**/api/v1/operations/**', (route) => route.abort('failed'));
      await calc.goto();
      await calc.enter('1 + 1 =');
      await expect(calc.alert()).toHaveText('Calculator service is unreachable');
      await expect(calc.result()).toHaveText('');
    });
  });

  test.describe('fault injection: an unexpected answer', () => {
    test('a 500 problem body shows the generic message and never the raw detail', async ({ page, calc }) => {
      const secret = 'stack trace at db.go:42';
      await page.route('**/api/v1/operations/**', (route) =>
        route.fulfill({
          status: 500,
          contentType: 'application/problem+json',
          headers: { 'x-request-id': 'injected-500' },
          body: JSON.stringify({
            type: 'urn:calculator:problem:internal-error',
            title: 'Internal server error',
            status: 500,
            detail: secret,
            instance: '/api/v1/operations/add',
            code: 'INTERNAL_ERROR',
            requestId: 'injected-500',
          }),
        }),
      );
      await calc.goto();
      await calc.enter('1 + 1 =');
      await expect(calc.alert().getByText('Something went wrong', { exact: true })).toBeVisible();
      await expect(calc.alert()).not.toContainText(secret);
      await expect(calc.alert()).not.toContainText('Internal server error');
    });

    test('a 500 answer that is not a problem shows the generic message and none of its body', async ({
      page,
      calc,
    }) => {
      await page.route('**/api/v1/operations/**', (route) =>
        route.fulfill({ status: 500, contentType: 'text/html', body: '<h1>upstream exploded</h1>' }),
      );
      await calc.goto();
      await calc.enter('1 + 1 =');
      await expect(calc.alert()).toHaveText('Something went wrong');
      await expect(calc.alert()).not.toContainText('exploded');
    });
  });
});

test.describe('UC-UI-01 errors: the service answers (RF-API-05)', () => {
  test('API: malformed JSON is 400 MALFORMED_REQUEST with a request id equal to the header', async ({ request }) => {
    const response = await post(request, 'add', '{"operands":["1",');
    await expectProblem(response, 400, 'MALFORMED_REQUEST');
  });

  test('API: a body above the service limit is 413 PAYLOAD_TOO_LARGE', async ({ request }) => {
    const body = JSON.stringify({ operands: ['1', '1'.repeat(5000)] });
    expect(body.length).toBeGreaterThan(5000);
    const response = await post(request, 'add', body);
    await expectProblem(response, 413, 'PAYLOAD_TOO_LARGE');
  });

  test('API: a content type other than JSON is 415 UNSUPPORTED_MEDIA_TYPE', async ({ request }) => {
    const response = await post(request, 'add', '{"operands":["1","2"]}', { 'content-type': 'text/plain' });
    await expectProblem(response, 415, 'UNSUPPORTED_MEDIA_TYPE');
  });
});
