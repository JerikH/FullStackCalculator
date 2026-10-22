import type { Locator, Page } from '@playwright/test';
import { expect, nextCalculation, test } from './helpers/fixture.js';
import type { Calc } from './helpers/fixture.js';

const WIDTHS = [320, 393, 768, 1280] as const;
type Theme = 'light' | 'dark';
const THEMES: readonly Theme[] = ['light', 'dark'];

/** 34 significant digits: the longest entry the calculator accepts (RF-UI-03). */
const DIGITS_34 = '1234567890123456789012345678901234';
/** The same operand as the display and the history show it (RF-UI-06: grouped by thousands). */
const DIGITS_34_GROUPED = '1,234,567,890,123,456,789,012,345,678,901,234';
const REF_128 = 'r'.repeat(128);

async function setWidth(page: Page, width: number): Promise<void> {
  await page.setViewportSize({ width, height: 900 });
}

async function useTheme(page: Page, theme: Theme): Promise<void> {
  await page.addInitScript((stored) => {
    window.localStorage.setItem('calculator.theme.v1', stored);
  }, theme);
}

/** Types the characters through the physical keyboard (RF-UI-02). */
async function typeText(page: Page, text: string): Promise<void> {
  for (const character of text) await page.keyboard.press(character);
}

async function calculate(page: Page, calc: Calc, sequence: string): Promise<void> {
  const answered = nextCalculation(page);
  await calc.enter(sequence);
  await answered;
}

interface Measures {
  scrollWidth: number;
  clientWidth: number;
  /** Visible elements that stick out of the viewport horizontally. */
  outside: string[];
}

/** The page's own horizontal extent and any element that leaves the viewport. */
async function measurePage(page: Page): Promise<Measures> {
  return page.evaluate(() => {
    const root = document.documentElement;
    const outside: string[] = [];
    for (const element of Array.from(document.body.querySelectorAll('*'))) {
      const box = element.getBoundingClientRect();
      if (box.width <= 1 || box.height <= 1) continue; // visually-hidden helpers are 1px clips
      if (box.left < -0.5 || box.right > root.clientWidth + 0.5) {
        outside.push(`${element.tagName.toLowerCase()} "${element.textContent.slice(0, 20)}"`);
      }
    }
    return { scrollWidth: root.scrollWidth, clientWidth: root.clientWidth, outside };
  });
}

async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const measures = await measurePage(page);
  expect(measures.scrollWidth, 'document scrollWidth').toBeLessThanOrEqual(measures.clientWidth);
  expect(measures.outside, 'elements outside the viewport').toEqual([]);
}

/** A box whose content is wider than the box itself clips or scrolls inside it. */
async function expectNotClipped(locator: Locator, what: string): Promise<void> {
  const box = await locator.evaluate((element) => ({
    scroll: element.scrollWidth,
    client: element.clientWidth,
  }));
  expect(box.scroll, `${what}: content wider than its box`).toBeLessThanOrEqual(box.client);
}

test.describe('responsive layout: no horizontal scroll (RF-UI-12, RNF-A11Y-01)', () => {
  for (const width of WIDTHS) {
    test.describe(`${String(width)} px`, () => {
      test('initial state; the history panel is open from 768 px up and collapsed below', async ({ page, calc }) => {
        await setWidth(page, width);
        await calc.goto();
        await expectNoHorizontalScroll(page);
        const open = await page.locator('details').evaluate((element: HTMLDetailsElement) => element.open);
        expect(open).toBe(width >= 768);
        await calc.openHistory();
        await expectNoHorizontalScroll(page);
      });

      test('a 34-digit accumulator with its pending operator, then a second 34-digit entry', async ({ page, calc }) => {
        await setWidth(page, width);
        await calc.goto();
        await typeText(page, DIGITS_34);
        await expectNoHorizontalScroll(page);
        await expectNotClipped(calc.result(), 'result');
        await typeText(page, '+');
        await expect(calc.expression()).toContainText('+');
        await expectNoHorizontalScroll(page);
        await expectNotClipped(calc.expression(), 'expression');
        await typeText(page, DIGITS_34);
        await expectNoHorizontalScroll(page);
        await expectNotClipped(calc.result(), 'result');
      });

      test('a 34-digit result (1 ÷ 3) with the approximation marker is shown whole', async ({ page, calc }) => {
        await setWidth(page, width);
        await calc.goto();
        await calculate(page, calc, '1 ÷ 3 =');
        await expect(calc.result()).toContainText(`0.${'3'.repeat(34)}`);
        await expect(calc.result().getByText('≈')).toBeVisible();
        await expectNoHorizontalScroll(page);
        await expectNotClipped(calc.result(), 'result');
      });

      test('an error with a 128-character Ref wraps inside the display (fault injection)', async ({ page, calc }) => {
        await setWidth(page, width);
        await page.route('**/api/v1/operations/divide', async (route) => {
          await route.fulfill({
            status: 500,
            contentType: 'application/problem+json',
            headers: { 'x-request-id': REF_128 },
            body: JSON.stringify({
              type: 'about:blank',
              title: 'fault injection',
              status: 500,
              detail: 'fault injection',
              code: 'INTERNAL_ERROR',
              requestId: REF_128,
            }),
          });
        });
        await calc.goto();
        await calc.enter('1 ÷ 3 =');
        await expect(calc.alert()).toContainText('Something went wrong');
        await expect(calc.alert()).toContainText(`Ref: ${REF_128}`);
        await expectNoHorizontalScroll(page);
        await expectNotClipped(calc.alert(), 'alert');
      });

      test('a history row with two 34-digit operands wraps inside the panel', async ({ page, calc, requests }) => {
        await setWidth(page, width);
        await calc.goto();
        await calculate(page, calc, `${DIGITS_34} + ${DIGITS_34} =`);
        expect(requests[0]).toMatchObject({ operation: 'add', operands: [DIGITS_34, DIGITS_34], status: 200 });
        await calc.openHistory();
        await expect(calc.historyRows()).toHaveCount(1);
        await expect(calc.historyRows().first()).toContainText(`${DIGITS_34_GROUPED} + ${DIGITS_34_GROUPED} =`);
        await expectNoHorizontalScroll(page);
        await expectNotClipped(calc.historyRows().first(), 'history row');
        await expectNotClipped(calc.result(), 'result');
      });
    });
  }
});

test.describe('touch targets of at least 48 × 48 px (RF-UI-13, RNF-A11Y-01)', () => {
  for (const width of WIDTHS) {
    test(`${String(width)} px: the 23 keys, the theme choices, the History summary and the history controls`, async ({
      page,
      calc,
    }) => {
      await setWidth(page, width);
      await calc.goto();
      await calculate(page, calc, '12 × 3 =');
      await calc.openHistory();
      await expect(calc.historyRows()).toHaveCount(1);

      const keys = page.getByRole('group', { name: 'Keypad' }).getByRole('button');
      await expect(keys).toHaveCount(23);
      const targets: { name: string; locator: Locator }[] = [];
      for (const [index, key] of (await keys.all()).entries()) {
        targets.push({
          name: `key ${String(index + 1)} ${(await key.getAttribute('aria-label')) ?? ''}`,
          locator: key,
        });
      }
      for (const label of ['System', 'Light', 'Dark']) {
        targets.push({ name: `theme ${label}`, locator: page.locator('label').filter({ hasText: label }) });
      }
      targets.push({ name: 'History summary', locator: calc.historySummary() });
      targets.push({ name: 'history row', locator: calc.historyRows().first() });
      targets.push({ name: 'Clear history', locator: page.getByRole('button', { name: 'Clear history' }) });

      const tooSmall: string[] = [];
      for (const target of targets) {
        const box = await target.locator.boundingBox();
        if (box === null) {
          tooSmall.push(`${target.name}: not rendered`);
        } else if (box.width < 48 || box.height < 48) {
          tooSmall.push(`${target.name}: ${box.width.toFixed(1)} × ${box.height.toFixed(1)}`);
        }
      }
      expect(tooSmall, 'targets smaller than 48 × 48').toEqual([]);
    });
  }
});

// ---- visible focus -------------------------------------------------------------------------------------------------

interface Ring {
  outlineStyle: string;
  outlineWidth: number;
  outlineVisible: boolean;
  boxShadow: string;
}

/** Brings the element into focus by pressing Tab and returns its ring and the same element's unfocused look. */
async function ringOf(page: Page, target: Locator): Promise<{ focused: Ring; unfocused: Ring }> {
  let reached = false;
  for (let presses = 0; presses < 60 && !reached; presses += 1) {
    await page.keyboard.press('Tab');
    reached = await target.evaluate((element) => element === document.activeElement);
  }
  expect(reached, 'the element can be reached with the Tab key').toBe(true);
  const read = (): Promise<Ring> =>
    target.evaluate((element) => {
      // A radio input is visually hidden: its label text carries the ring.
      const ringed = element instanceof HTMLInputElement ? (element.nextElementSibling ?? element) : element;
      const style = getComputedStyle(ringed);
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      let alpha = 0;
      if (context !== null) {
        context.fillStyle = style.outlineColor;
        context.fillRect(0, 0, 1, 1);
        alpha = context.getImageData(0, 0, 1, 1).data[3] ?? 0;
      }
      return {
        outlineStyle: style.outlineStyle,
        outlineWidth: Number.parseFloat(style.outlineWidth),
        outlineVisible: alpha > 0,
        boxShadow: style.boxShadow,
      };
    });
  const focused = await read();
  await target.evaluate((element) => {
    if (element instanceof HTMLElement) element.blur();
  });
  const unfocused = await read();
  return { focused, unfocused };
}

function expectVisibleRing(ring: { focused: Ring; unfocused: Ring }, what: string): void {
  const outline = ring.focused.outlineStyle !== 'none' && ring.focused.outlineWidth > 0 && ring.focused.outlineVisible;
  const shadow = ring.focused.boxShadow !== 'none' && ring.focused.boxShadow !== ring.unfocused.boxShadow;
  expect(outline || shadow, `${what}: a visible indicator when focused by keyboard (${JSON.stringify(ring)})`).toBe(
    true,
  );
  // The indicator belongs to the focus: the unfocused element shows none of it.
  expect(
    ring.unfocused.outlineStyle === 'none' || ring.unfocused.outlineWidth === 0 || !ring.unfocused.outlineVisible,
  ).toBe(true);
}

test.describe('visible focus indicator (RF-UI-13, RNF-A11Y-01)', () => {
  for (const theme of THEMES) {
    test(`${theme}: theme radio, a key, the History summary and a history row show a ring when focused with Tab`, async ({
      page,
      calc,
    }) => {
      await useTheme(page, theme);
      await calc.goto();
      await calculate(page, calc, '12 × 3 =');
      await calc.openHistory();
      await expect(calc.historyRows()).toHaveCount(1);
      const targets: [string, Locator][] = [
        ['checked theme radio', page.getByRole('radio', { checked: true })],
        ['key 7', calc.key('7')],
        ['key equals', calc.key('=')],
        ['History summary', calc.historySummary()],
        ['history row', calc.historyRows().first()],
        ['Clear history', page.getByRole('button', { name: 'Clear history' })],
      ];
      for (const [name, locator] of targets) {
        // Start each search from the top of the document, so the order of the targets does not matter: a focused
        // element that is removed leaves the sequential focus starting point at the beginning of the body.
        await page.evaluate(() => {
          const start = document.createElement('span');
          start.tabIndex = -1;
          document.body.prepend(start);
          start.focus();
          start.remove();
        });
        expectVisibleRing(await ringOf(page, locator), name);
      }
    });
  }
});

// ---- contrast ------------------------------------------------------------------------------------------------------

interface PaintedText {
  foreground: string;
  /** Background layers from the element outwards, as serialised sRGB `rgba()` strings. */
  backgrounds: string[];
  opacity: number;
}

type Rgba = readonly [number, number, number, number];

/**
 * Reads the text colour, the background layers and the opacity of an element. The browser may serialise computed
 * colours as `oklab()` or `color()`; filling a canvas pixel makes it return plain sRGB bytes.
 */
async function paintOf(locator: Locator): Promise<PaintedText> {
  return locator.evaluate((element) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const toRgba = (css: string): string => {
      if (context === null) return css;
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = css;
      context.fillRect(0, 0, 1, 1);
      const [r = 0, g = 0, b = 0, a = 255] = context.getImageData(0, 0, 1, 1).data;
      return `rgba(${String(r)}, ${String(g)}, ${String(b)}, ${String(a / 255)})`;
    };
    let opacity = 1;
    const backgrounds: string[] = [];
    for (let node: Element | null = element; node !== null; node = node.parentElement) {
      const style = getComputedStyle(node);
      opacity *= Number(style.opacity);
      const layer = toRgba(style.backgroundColor);
      if (!layer.endsWith(', 0)')) backgrounds.push(layer);
    }
    return { foreground: toRgba(getComputedStyle(element).color), backgrounds, opacity };
  });
}

function parseRgba(css: string): Rgba {
  const match = /^rgba\((\d+), (\d+), (\d+), ([\d.e-]+)\)$/.exec(css);
  if (match === null) throw new Error(`not an sRGB colour: ${css}`);
  return [Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4])];
}

function over(top: Rgba, bottom: Rgba): Rgba {
  const alpha = top[3];
  return [
    top[0] * alpha + bottom[0] * (1 - alpha),
    top[1] * alpha + bottom[1] * (1 - alpha),
    top[2] * alpha + bottom[2] * (1 - alpha),
    1,
  ];
}

/** WCAG 2.x relative luminance. */
function luminance(colour: Rgba): number {
  const channel = (value: number): number => {
    const c = value / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(colour[0]) + 0.7152 * channel(colour[1]) + 0.0722 * channel(colour[2]);
}

function contrastRatio(a: Rgba, b: Rgba): number {
  const [light, dark] = luminance(a) >= luminance(b) ? [luminance(a), luminance(b)] : [luminance(b), luminance(a)];
  return (light + 0.05) / (dark + 0.05);
}

/** Contrast of the text of an element against the layers behind it, with element opacity folded in. */
async function contrastOf(locator: Locator): Promise<number> {
  const painted = await paintOf(locator);
  // Layers are listed from the element outwards: composite from the outermost opaque layer inwards.
  let background: Rgba = [255, 255, 255, 1];
  for (const layer of [...painted.backgrounds].reverse()) background = over(parseRgba(layer), background);
  const text = parseRgba(painted.foreground);
  const foreground = over([text[0], text[1], text[2], text[3] * painted.opacity], background);
  return contrastRatio(foreground, background);
}

test.describe('text contrast of at least 4.5:1 in both themes (RF-UI-13, RNF-A11Y-01)', () => {
  for (const theme of THEMES) {
    test(`${theme}: display, keys, theme choices, History and error copy`, async ({ page, calc }) => {
      await useTheme(page, theme);
      await calc.goto();
      const measured: Record<string, number> = {};
      const measure = async (name: string, locator: Locator): Promise<void> => {
        measured[name] = await contrastOf(locator);
      };

      await measure(
        'theme checked',
        page
          .locator('label')
          .filter({ has: page.getByRole('radio', { checked: true }) })
          .locator('span'),
      );
      await measure('theme unchecked', page.locator('label').filter({ hasText: 'Dark' }).locator('span'));
      for (const key of ['7', '+', 'AC', '=', '√', '±']) await measure(`key ${key}`, calc.key(key));
      await measure('History summary', calc.historySummary());

      await typeText(page, '12*');
      await measure('expression', calc.expression());
      await measure('result', calc.result());
      await calculate(page, calc, '3 =');
      await expect(calc.result()).toHaveText('36');
      await measure('result after a calculation', calc.result());
      await calc.openHistory();
      await measure('history row', calc.historyRows().first());
      await measure('Clear history', page.getByRole('button', { name: 'Clear history' }));

      await calc.press('AC');
      await calculate(page, calc, '1 ÷ 0 =');
      await expect(calc.alert()).toContainText('Ref: ');
      await measure('error copy', calc.alert().locator('p').first());
      await measure('Ref line', calc.alert().locator('p').nth(1));

      const failing = Object.entries(measured)
        .filter(([, ratio]) => ratio < 4.5)
        .map(([name, ratio]) => `${name}: ${ratio.toFixed(2)}:1`);
      expect(failing, `contrast below 4.5:1 (${JSON.stringify(measured)})`).toEqual([]);
      test.info().annotations.push({
        type: 'contrast',
        description: Object.entries(measured)
          .map(([name, ratio]) => `${name} ${ratio.toFixed(2)}`)
          .join('; '),
      });
    });
  }
});

// ---- reduced motion ------------------------------------------------------------------------------------------------

/** The longest duration in a computed `transition-duration` / `animation-duration` list, in seconds. */
function longestSeconds(computed: string): number {
  return Math.max(...computed.split(',').map((part) => Number.parseFloat(part.trim())));
}

test.describe('prefers-reduced-motion removes transitions and animation (RF-UI-13, RNF-A11Y-01)', () => {
  test('keys and the busy spinner stop moving under reduce and move otherwise', async ({ page, calc }) => {
    // The answer is held back so the spinner (shown after 150 ms) can be inspected.
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/api/v1/operations/add', async (route) => {
      await gate;
      await route.continue();
    });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await calc.goto();
    await calc.enter('1 + 1');
    const answered = nextCalculation(page);
    await calc.press('=');
    await expect(page.getByText('Calculating')).toBeAttached();
    const spinner = page.locator('[aria-busy="true"] span[aria-hidden="true"]').first();
    await expect(spinner).toBeVisible();

    const read = async (): Promise<{ transition: number; animation: number }> => ({
      transition: longestSeconds(
        await calc.key('7').evaluate((element) => getComputedStyle(element).transitionDuration),
      ),
      animation: longestSeconds(await spinner.evaluate((element) => getComputedStyle(element).animationDuration)),
    });

    const moving = await read();
    expect(moving.transition, 'keys transition without the reduce preference').toBeGreaterThan(0.01);
    expect(moving.animation, 'spinner animates without the reduce preference').toBeGreaterThan(0.01);

    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
    const still = await read();
    // The stylesheet shortens them to 0.01 ms (computed as 1e-05s), which no one can perceive.
    expect(still.transition, 'key transition under reduce').toBeLessThanOrEqual(0.001);
    expect(still.animation, 'spinner animation under reduce').toBeLessThanOrEqual(0.001);
    await expect(spinner).toHaveCSS('animation-name', 'none');

    release();
    await answered;
    await expect(calc.result()).toHaveText('2');
  });

  test('the History panel and the theme choices have no transition under reduce', async ({ page, calc }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await calc.goto();
    const durations = await page.evaluate(() => {
      const longest = (element: Element): number =>
        Math.max(
          ...getComputedStyle(element)
            .transitionDuration.split(',')
            .map((part) => Number.parseFloat(part)),
        );
      return Array.from(document.querySelectorAll('button, summary, label, span, output, details')).map(longest);
    });
    expect(Math.max(...durations)).toBeLessThanOrEqual(0.001);
  });
});
