import type { Page } from '@playwright/test';
import { expectProblem, post } from './helpers/api.js';
import { expect, nextCalculation, test } from './helpers/fixture.js';
import type { Calc } from './helpers/fixture.js';

interface Answer {
  operation: string;
  operands: string[];
  result: string;
  inexact: boolean;
}

const ROUNDED = 'Rounded to 34 significant digits';

/** Presses the sequence and returns the service's answer to the request its last key causes. */
async function calculate(page: Page, calc: Calc, sequence: string): Promise<{ status: number; answer: Answer }> {
  const response = nextCalculation(page);
  await calc.enter(sequence);
  const settled = await response;
  return { status: settled.status(), answer: (await settled.json()) as Answer };
}

test.describe('UC-UI-01 operations through the real service', () => {
  const cases: { keys: string; operation: string; operands: string[]; result: string; shown: string }[] = [
    { keys: '0.1 + 0.2 =', operation: 'add', operands: ['0.1', '0.2'], result: '0.3', shown: '0.3' },
    { keys: '5 − 7.5 =', operation: 'subtract', operands: ['5', '7.5'], result: '-2.5', shown: '−2.5' },
    { keys: '-3 × 4 =', operation: 'multiply', operands: ['-3', '4'], result: '-12', shown: '−12' },
    { keys: '10 ÷ 4 =', operation: 'divide', operands: ['10', '4'], result: '2.5', shown: '2.5' },
    { keys: '2 xʸ 10 =', operation: 'power', operands: ['2', '10'], result: '1024', shown: '1,024' },
    { keys: '16 √', operation: 'sqrt', operands: ['16'], result: '4', shown: '4' },
    { keys: '50 %', operation: 'percentage', operands: ['50'], result: '0.5', shown: '0.5' },
  ];

  for (const c of cases) {
    test(`${c.keys} sends ${c.operation} ${JSON.stringify(c.operands)} and shows ${c.shown}`, async ({
      page,
      calc,
      requests,
    }) => {
      await calc.goto();
      const { status, answer } = await calculate(page, calc, c.keys);
      expect(status).toBe(200);
      expect(answer).toEqual({ operation: c.operation, operands: c.operands, result: c.result, inexact: false });
      await expect(calc.result()).toHaveText(c.shown);
      expect(requests).toHaveLength(1);
      expect(requests[0]).toMatchObject({ operation: c.operation, operands: c.operands, status: 200 });
    });
  }

  test('an exact result carries no approximation marker', async ({ page, calc }) => {
    await calc.goto();
    await calculate(page, calc, '0.1 + 0.2 =');
    await expect(calc.result()).toHaveText('0.3');
    await expect(calc.result().getByTitle(ROUNDED)).toHaveCount(0);
  });

  test('1 ÷ 3 = shows the full 34-digit value with the approximation marker and its explanation', async ({
    page,
    calc,
    requests,
  }) => {
    await calc.goto();
    const { status, answer } = await calculate(page, calc, '1 ÷ 3 =');
    expect(status).toBe(200);
    expect(answer.inexact).toBe(true);
    expect(answer.result).toBe(`0.${'3'.repeat(34)}`);
    expect(requests[0]).toMatchObject({ operation: 'divide', operands: ['1', '3'], status: 200 });
    await expect(calc.result()).toContainText(answer.result);
    await expect(calc.result().getByTitle(ROUNDED)).toBeVisible();
    await expect(calc.result().getByText('≈')).toBeVisible();
    // The marker's accessible text, read in order before the digits.
    await expect(calc.result()).toHaveText(`≈${ROUNDED}. ${answer.result}`);
  });

  test('2 √ shows the service value of √2 with the approximation marker', async ({ page, calc, requests }) => {
    await calc.goto();
    const { status, answer } = await calculate(page, calc, '2 √');
    expect(status).toBe(200);
    expect(answer).toMatchObject({ operation: 'sqrt', operands: ['2'], inexact: true });
    expect(requests[0]).toMatchObject({ operation: 'sqrt', operands: ['2'], status: 200 });
    // One integer digit: the display shows the answer's string as it is.
    await expect(calc.result()).toContainText(answer.result);
    await expect(calc.result().getByTitle(ROUNDED)).toBeVisible();
  });
});

test.describe('UC-UI-01 operations through the real service: contract edges', () => {
  test('API: an operand in exponent syntax within range is accepted and echoed unchanged', async ({ request }) => {
    const response = await post(request, 'add', { operands: ['1e5', '2'] });
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({
      operation: 'add',
      operands: ['1e5', '2'],
      result: '100002',
      inexact: false,
    });
  });

  for (const operand of ['1e99999', 'NaN', '0x10', '+1', '.5', '1.', '01', '1e', '', ' 1']) {
    test(`API: the operand ${JSON.stringify(operand)} is rejected with VALIDATION_FAILED`, async ({ request }) => {
      const response = await post(request, 'add', { operands: [operand, '2'] });
      const problem = await expectProblem(response, 400, 'VALIDATION_FAILED');
      expect(problem.errors).toEqual([expect.objectContaining({ field: 'operands[0]' })]);
    });
  }

  test('API: an operand sent as a JSON number instead of a string is rejected with VALIDATION_FAILED', async ({
    request,
  }) => {
    const response = await post(request, 'add', { operands: [1, '2'] });
    await expectProblem(response, 400, 'VALIDATION_FAILED');
  });

  test('API: the wrong number of operands is rejected with VALIDATION_FAILED', async ({ request }) => {
    await expectProblem(await post(request, 'add', { operands: ['1'] }), 400, 'VALIDATION_FAILED');
    await expectProblem(await post(request, 'sqrt', { operands: ['1', '2'] }), 400, 'VALIDATION_FAILED');
  });

  test('API: 9.99e6144 × 10 overflows with 422 OVERFLOW', async ({ request }) => {
    const response = await post(request, 'multiply', { operands: ['9.99e6144', '10'] });
    await expectProblem(response, 422, 'OVERFLOW');
  });

  test('API: 0 xʸ 0 is 1 and exact', async ({ request }) => {
    const response = await post(request, 'power', { operands: ['0', '0'] });
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ operation: 'power', operands: ['0', '0'], result: '1', inexact: false });
  });

  test('API: a negative base with a fractional exponent is 422 UNDEFINED_RESULT', async ({ request }) => {
    const response = await post(request, 'power', { operands: ['-8', '0.5'] });
    await expectProblem(response, 422, 'UNDEFINED_RESULT');
  });

  test('API: dividing by zero is 422 DIVISION_BY_ZERO', async ({ request }) => {
    await expectProblem(await post(request, 'divide', { operands: ['1', '0'] }), 422, 'DIVISION_BY_ZERO');
  });

  test('API: an unknown operation is 404 UNKNOWN_OPERATION', async ({ request }) => {
    await expectProblem(await post(request, 'modulo', { operands: ['1', '2'] }), 404, 'UNKNOWN_OPERATION');
  });

  test('API: GET on an operation is 405 METHOD_NOT_ALLOWED with an Allow header', async ({ request }) => {
    const response = await request.get('/api/v1/operations/add');
    await expectProblem(response, 405, 'METHOD_NOT_ALLOWED');
    expect(response.headers().allow).toContain('POST');
  });

  test('API: an unknown API route is a problem+json NOT_FOUND, never HTML', async ({ request }) => {
    const response = await request.get('/api/v1/does-not-exist');
    await expectProblem(response, 404, 'NOT_FOUND');
    expect(response.headers()['content-type']).not.toMatch(/html/);
  });
});
