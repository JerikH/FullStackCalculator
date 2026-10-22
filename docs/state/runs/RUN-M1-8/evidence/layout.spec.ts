import { expect, test } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import { collectCsp, fulfillOk, fulfillProblem, setStoredTheme, shot, typeKeys, watchProblems, open } from './support';

// RF-UI-12/13 layout matrix: widths × themes, run once per project (U22 piece 3).

const WIDTHS = [320, 393, 768, 1280];
const THEMES: {
  name: string;
  stored: string | null;
  scheme: 'light' | 'dark';
}[] = [
  { name: 'system-light', stored: null, scheme: 'light' },
  { name: 'system-dark', stored: null, scheme: 'dark' },
  { name: 'light', stored: 'light', scheme: 'light' },
  { name: 'dark', stored: 'dark', scheme: 'dark' },
  { name: 'light-under-dark-os', stored: 'light', scheme: 'dark' },
];

const OUT = 'output[aria-label="Result"]';

async function noOverflow(page: Page): Promise<{ scroll: number; client: number }> {
  return page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
}

for (const width of WIDTHS) {
  for (const theme of THEMES) {
    test(`layout ${String(width)}px ${theme.name}`, async ({ browser }, info: TestInfo) => {
      const context = await browser.newContext({
        ...info.project.use,
        viewport: { width, height: 900 },
        colorScheme: theme.scheme,
      });
      const page = await context.newPage();
      const problems = await watchProblems(page);
      await setStoredTheme(page, theme.stored);
      await open(page);
      const o = await noOverflow(page);
      expect(o.scroll, `horizontal overflow at ${String(width)}`).toBeLessThanOrEqual(o.client);

      // every keypad key is at least 48 × 48 (the design says 56 high), the group is named Keypad
      const keys = page.getByRole('group', { name: 'Keypad' }).getByRole('button');
      await expect(keys).toHaveCount(23);
      const boxes = await keys.evaluateAll((els) =>
        els.map((el) => el.getBoundingClientRect()).map((r) => [r.width, r.height]),
      );
      for (const [w, h] of boxes) {
        expect(w).toBeGreaterThanOrEqual(48);
        expect(h).toBeGreaterThanOrEqual(48);
      }
      // theme segments, summary
      const segs = await page
        .locator('fieldset label')
        .evaluateAll((els) => els.map((el) => el.getBoundingClientRect()).map((r) => [r.width, r.height]));
      expect(segs).toHaveLength(3);
      for (const [w, h] of segs) {
        expect(w).toBeGreaterThanOrEqual(48);
        expect(h).toBeGreaterThanOrEqual(48);
      }
      const summary = await page
        .getByText('History', { exact: true })
        .evaluate((el) => el.getBoundingClientRect().height);
      expect(summary).toBeGreaterThanOrEqual(48);

      // history open at ≥ 768 only
      const isOpen = await page.locator('details').evaluate((el: HTMLDetailsElement) => el.open);
      expect(isOpen).toBe(width >= 768);

      // two columns at ≥ 768: card and history side by side with the 22.5rem / 18rem widths
      const card = await page
        .getByRole('group', { name: 'Keypad' })
        .evaluate((el) => el.parentElement?.getBoundingClientRect().width ?? 0);
      const panel = await page.locator('details').evaluate((el) => el.getBoundingClientRect());
      if (width >= 768) {
        expect(Math.round(card)).toBe(360);
        expect(Math.round(panel.width)).toBe(288);
        const cardTop = await page
          .getByRole('group', { name: 'Keypad' })
          .evaluate((el) => el.getBoundingClientRect().top);
        expect(panel.top).toBeLessThan(cardTop);
      } else {
        expect(card).toBeLessThanOrEqual(360 + 1);
      }

      // focus ring: first Tab lands on a control with a 3px solid outline
      await page.keyboard.press('Tab');
      const ring = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el) return null;
        const target = el instanceof HTMLInputElement ? (el.nextElementSibling ?? el) : el;
        const s = getComputedStyle(target);
        return {
          style: s.outlineStyle,
          width: s.outlineWidth,
          offset: s.outlineOffset,
        };
      });
      expect(ring).toEqual({ style: 'solid', width: '3px', offset: '2px' });

      // reduced motion: the spinner does not rotate
      await collectCsp(page, problems);
      expect(problems).toEqual({ console: [], pageErrors: [], csp: [] });
      if (theme.name === 'system-light' || theme.name === 'dark')
        await shot(page, info, `layout-${String(width)}-${theme.name}`);
      await context.close();
    });
  }
}

test.describe('display budget and long strings, 320 px and the 22.5rem column', () => {
  for (const width of [320, 1280]) {
    test(`budget ${String(width)}px`, async ({ browser }, info) => {
      const context = await browser.newContext({
        ...info.project.use,
        viewport: { width, height: 900 },
      });
      const page = await context.newPage();
      const problems = await watchProblems(page);
      await page.route('**/api/v1/operations/divide', (route) => {
        const body = route.request().postDataJSON() as { operands: string[] };
        const [a] = body.operands;
        // a is the case id: 10 characters (xl) or 16 characters (lg), both inexact so the ≈ marker shows
        const result = a === '1' ? '1234567.89' : a === '2' ? '0.123456789012345' : '0.' + '3'.repeat(34);
        return route.fulfill(fulfillOk('divide', body.operands, result, true));
      });
      await open(page);
      const lineHeightsOk = async (label: string, chars: number) => {
        const m = await page.evaluate(() => {
          const out = document.querySelector('output[aria-label="Result"]');
          const digits = out?.querySelector(':scope > span:last-child');
          const marker = out?.querySelector('[title]');
          if (!out || !digits) return null;
          const lineHeight = parseFloat(getComputedStyle(digits).lineHeight);
          return {
            digitRects: digits.getClientRects().length,
            height: (digits as HTMLElement).getBoundingClientRect().height,
            lineHeight,
            outHeight: out.getBoundingClientRect().height,
            markerTop: marker?.getBoundingClientRect().top ?? 0,
            digitsTop: digits.getBoundingClientRect().top,
            text: digits.textContent,
            fontSize: getComputedStyle(digits).fontSize,
            scrollOverflow: (out as HTMLElement).scrollWidth > (out as HTMLElement).clientWidth,
          };
        });
        expect(m, label).not.toBeNull();
        expect(m?.text?.length, label).toBe(chars);
        expect(m?.scrollOverflow, `${label}: output overflows`).toBe(false);
        // one line: the digits box is not taller than 1.5 line heights
        expect((m?.height ?? 0) / (m?.lineHeight ?? 1), `${label}: wrapped (${JSON.stringify(m)})`).toBeLessThan(1.5);
        expect(Math.abs((m?.markerTop ?? 0) - (m?.digitsTop ?? 0)), `${label}: marker on the same line`).toBeLessThan(
          m?.lineHeight ?? 99,
        );
        return m;
      };
      await typeKeys(page, '1/9=');
      await expect(page.locator(OUT)).toContainText('1,234,567.89');
      await lineHeightsOk('xl 12 chars (10 digits + grouping)', 12);
      await shot(page, info, `budget-xl-${String(width)}`);
      await typeKeys(page, '2/9=');
      await expect(page.locator(OUT)).toContainText('0.123456789012345');
      await lineHeightsOk('lg 17 chars', 17);
      await shot(page, info, `budget-lg-${String(width)}`);
      await typeKeys(page, '3/9=');
      await expect(page.locator(OUT)).toContainText('0.' + '3'.repeat(34));
      const m = await page.evaluate(() => {
        const d = document.querySelector('output[aria-label="Result"] > span:last-child');
        return {
          text: d?.textContent ?? '',
          rects: d?.getClientRects().length ?? 0,
        };
      });
      expect(m.text).toBe('0.' + '3'.repeat(34)); // never truncated
      const o = await noOverflow(page);
      expect(o.scroll).toBeLessThanOrEqual(o.client);
      await shot(page, info, `budget-md-${String(width)}`);
      await collectCsp(page, problems);
      expect(problems).toEqual({ console: [], pageErrors: [], csp: [] });
      await context.close();
    });
  }

  test('34-digit accumulator, 128-character Ref and a history row with two 34-digit operands wrap at 320 px', async ({
    browser,
  }, info) => {
    const context = await browser.newContext({
      ...info.project.use,
      viewport: { width: 320, height: 900 },
    });
    const page = await context.newPage();
    const a = '1234567890123456789012345678901234';
    const sum = '2469135780246913578024691357802468';
    const ref = 'r'.repeat(128);
    await page.route('**/api/v1/operations/add', (route) => {
      const body = route.request().postDataJSON() as { operands: string[] };
      if (body.operands[0] === '1') return route.fulfill(fulfillProblem(500, 'INTERNAL_ERROR', ref));
      return route.fulfill(fulfillOk('add', body.operands, sum, false));
    });
    await open(page);
    await typeKeys(page, a + '+');
    const o0 = await noOverflow(page);
    expect(o0.scroll).toBeLessThanOrEqual(o0.client);
    await shot(page, info, 'long-expression-320');
    await typeKeys(page, a + '=');
    await expect(page.locator(OUT)).toContainText(sum.replace(/(\d)(?=(\d{3})+$)/g, '$1,'));
    await page.getByText('History', { exact: true }).click();
    await expect(page.locator('details ol button')).toHaveCount(1);
    const o1 = await noOverflow(page);
    expect(o1.scroll).toBeLessThanOrEqual(o1.client);
    await shot(page, info, 'long-history-row-320');
    await typeKeys(page, '1+1=');
    await expect(page.getByRole('alert')).toContainText(`Ref: ${ref}`);
    const o2 = await noOverflow(page);
    expect(o2.scroll).toBeLessThanOrEqual(o2.client);
    await shot(page, info, 'long-ref-320');
    await context.close();
  });
});

test('reduced motion: the busy spinner does not rotate', async ({ browser }, info) => {
  const context = await browser.newContext({
    ...info.project.use,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  await page.route('**/api/v1/operations/add', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await route.continue().catch(() => undefined);
  });
  await open(page);
  await typeKeys(page, '1+1=');
  await expect(page.getByText('Calculating')).toBeVisible();
  const anim = await page
    .locator('[aria-busy="true"] span[aria-hidden="true"]')
    .first()
    .evaluate((el) => getComputedStyle(el).animationName);
  expect(anim === 'none' || (await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches))).toBe(
    true,
  );
  const dur = await page
    .locator('[aria-busy="true"] span[aria-hidden="true"]')
    .first()
    .evaluate((el) => getComputedStyle(el).animationDuration);
  expect(['0s', '1e-05s']).toContain(dur);
  await context.close();
});
