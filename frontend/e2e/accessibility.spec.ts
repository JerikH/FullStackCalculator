import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, nextCalculation, test } from './helpers/fixture.js';
import type { Calc } from './helpers/fixture.js';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

/** WCAG 2.5.3 (label in name). Part of the wcag21a set; the scan must visibly have run it. */
const LABEL_RULE = 'label-content-name-mismatch';

type Theme = 'light' | 'dark';
const THEMES: readonly Theme[] = ['light', 'dark'];

/** Starts the page with an explicit stored theme, whatever the operating system prefers. */
async function useTheme(page: Page, theme: Theme): Promise<void> {
  await page.addInitScript((stored) => {
    window.localStorage.setItem('calculator.theme.v1', stored);
  }, theme);
}

interface Scan {
  violations: string;
  labelRulePasses: number;
  labelRuleIncomplete: number;
}

/** Runs axe on the whole page and summarises it; the label-in-name rule has to appear in the results. */
async function scan(page: Page): Promise<Scan> {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const violations = JSON.stringify(
    results.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      targets: violation.nodes.map((node) => node.target),
    })),
  );
  const count = (rules: typeof results.passes): number =>
    rules.find((rule) => rule.id === LABEL_RULE)?.nodes.length ?? 0;
  return {
    violations,
    labelRulePasses: count(results.passes),
    labelRuleIncomplete: count(results.incomplete),
  };
}

/** Asserts zero violations and that the label rule was evaluated; records its numbers on the test. */
async function expectClean(page: Page, state: string): Promise<void> {
  const scanned = await scan(page);
  expect(scanned.violations, `axe violations in the ${state} state`).toBe('[]');
  expect(
    scanned.labelRulePasses + scanned.labelRuleIncomplete,
    `${LABEL_RULE} must appear in passes or incomplete (it ran)`,
  ).toBeGreaterThan(0);
  test.info().annotations.push({
    type: LABEL_RULE,
    description: `${state}: passes=${String(scanned.labelRulePasses)} incomplete=${String(scanned.labelRuleIncomplete)}`,
  });
}

async function calculate(page: Page, calc: Calc, sequence: string): Promise<void> {
  const answered = nextCalculation(page);
  await calc.enter(sequence);
  await answered;
}

test.describe('RNF-A11Y-01 axe: zero violations, initial/history/result/error states in both themes', () => {
  for (const theme of THEMES) {
    test(`${theme}: initial state`, async ({ page, calc }) => {
      await useTheme(page, theme);
      await calc.goto();
      expect(await page.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe(theme);
      await expectClean(page, 'initial');
    });

    test(`${theme}: result state (12 × 3 = 36 and 1 ÷ 3 with the approximation marker)`, async ({ page, calc }) => {
      await useTheme(page, theme);
      await calc.goto();
      await calculate(page, calc, '12 × 3 =');
      await expect(calc.result()).toHaveText('36');
      await expectClean(page, 'result');
      await calc.press('AC');
      await calculate(page, calc, '1 ÷ 3 =');
      await expect(calc.result().getByText('≈')).toBeVisible();
      await expectClean(page, 'inexact result');
    });

    test(`${theme}: history open with rows`, async ({ page, calc }) => {
      await useTheme(page, theme);
      await calc.goto();
      await calculate(page, calc, '12 × 3 =');
      await calc.press('AC');
      await calculate(page, calc, '16 √');
      await calc.openHistory();
      await expect(calc.historyRows()).toHaveCount(2);
      await expectClean(page, 'history open');
    });

    test(`${theme}: empty history open`, async ({ page, calc }) => {
      await useTheme(page, theme);
      await calc.goto();
      await calc.openHistory();
      await expect(page.getByText('No calculations yet')).toBeVisible();
      await expectClean(page, 'empty history');
    });

    test(`${theme}: error state (1 ÷ 0 =)`, async ({ page, calc }) => {
      await useTheme(page, theme);
      await calc.goto();
      await calculate(page, calc, '1 ÷ 0 =');
      await expect(calc.alert()).toContainText('Cannot divide by zero');
      await expect(calc.alert()).toContainText('Ref: ');
      await expectClean(page, 'error');
    });
  }
});

test.describe('RNF-A11Y-01 accessible names and structure (RF-UI-01, RF-UI-10, RF-UI-13)', () => {
  test('AC and xʸ keep their visible label at the start of their accessible name (WCAG 2.5.3)', async ({ calc }) => {
    await calc.goto();
    await expect(calc.page.getByRole('button', { name: 'AC, all clear', exact: true })).toBeVisible();
    await expect(calc.page.getByRole('button', { name: 'xʸ, power', exact: true })).toBeVisible();
    await expect(calc.page.getByRole('button', { name: 'AC, all clear', exact: true })).toHaveText('AC');
    await expect(calc.page.getByRole('button', { name: 'xʸ, power', exact: true })).toHaveText('xʸ');
  });

  test('a history row is named «<visible expression>, use result»', async ({ page, calc }) => {
    await calc.goto();
    await calculate(page, calc, '12 × 3 =');
    await calc.openHistory();
    const row = calc.historyRows().first();
    const visible = ((await row.textContent()) ?? '').replace(/\s+/g, ' ').trim();
    expect(visible).toBe('12 × 3 = 36');
    await expect(page.getByRole('button', { name: `${visible}, use result`, exact: true })).toHaveCount(1);
  });

  test('every key of the keypad has the name the keypad table defines', async ({ page, calc }) => {
    await calc.goto();
    const names = await page
      .getByRole('group', { name: 'Keypad' })
      .getByRole('button')
      .evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label')));
    expect(names).toEqual([
      'AC, all clear',
      'clear entry',
      'backspace',
      'divide',
      'square root',
      'xʸ, power',
      'percentage',
      'multiply',
      '7',
      '8',
      '9',
      'subtract',
      '4',
      '5',
      '6',
      'add',
      '1',
      '2',
      '3',
      'equals',
      'toggle sign',
      '0',
      'decimal point',
    ]);
  });

  test('landmarks: a single h1 Calculator, a header, a main, the Keypad group and the Theme radio group', async ({
    page,
    calc,
  }) => {
    await calc.goto();
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByRole('heading', { level: 1, name: 'Calculator' })).toBeVisible();
    await expect(page.getByRole('banner')).toHaveCount(1);
    await expect(page.getByRole('main')).toHaveCount(1);
    await expect(page.getByRole('group', { name: 'Keypad' })).toBeVisible();
    await expect(page.getByRole('radiogroup', { name: 'Theme' })).toBeVisible();
  });

  test('the result is a polite live region and an error is announced by an alert', async ({ page, calc }) => {
    await calc.goto();
    await expect(calc.result()).toHaveAttribute('aria-live', 'polite');
    await expect(calc.result()).toHaveAttribute('aria-atomic', 'true');
    await calculate(page, calc, '1 ÷ 0 =');
    await expect(calc.alert()).toContainText('Cannot divide by zero');
  });
});
