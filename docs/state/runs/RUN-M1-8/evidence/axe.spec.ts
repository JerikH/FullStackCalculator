import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { setStoredTheme, typeKeys, open } from './support';

// RNF-A11Y-01: axe on the initial and error states in both themes (once per project), plus the computed
// contrast of the states DESIGN.md measured (busy digits, key hover/active, checked theme segment, Ref line).

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

// `label-content-name-mismatch` (WCAG 2.5.3, an axe *experimental* rule that runs only when a wcag21a tag is
// requested) cannot pass for AC → «all clear» and xʸ → «power»: RF-UI-01 fixes those accessible names. It is scanned
// separately below, pinned to exactly those two keys, and recorded as a finding for the owner.
async function scan(page: Page) {
  return new AxeBuilder({ page }).withTags(TAGS).disableRules(['label-content-name-mismatch']).analyze();
}

test('WCAG 2.5.3 label-in-name: only the two keys whose names RF-UI-01 fixes', async ({ page }) => {
  await open(page);
  const results = await new AxeBuilder({ page }).withRules(['label-content-name-mismatch']).analyze();
  const targets = results.violations.flatMap((v) => v.nodes.map((n) => n.target.join(' '))).sort();
  expect(targets).toEqual(['button[aria-label="all clear"]', 'button[aria-label="power"]']);
});

for (const theme of ['light', 'dark'] as const) {
  test(`axe ${theme}: initial and error states, populated history`, async ({ browser }, info) => {
    const context = await browser.newContext({
      ...info.project.use,
      colorScheme: theme,
    });
    const page = await context.newPage();
    await setStoredTheme(page, theme);
    await open(page);
    const initial = await scan(page);
    expect(initial.violations, JSON.stringify(initial.violations.map((v) => [v.id, v.nodes.length]))).toEqual([]);
    await typeKeys(page, '12*3=');
    await expect(page.locator('output[aria-label="Result"]')).toContainText('36');
    if (!(await page.locator('details').evaluate((el: HTMLDetailsElement) => el.open)))
      await page.getByText('History', { exact: true }).click();
    const populated = await scan(page);
    expect(populated.violations, JSON.stringify(populated.violations.map((v) => [v.id, v.nodes.length]))).toEqual([]);
    await typeKeys(page, '1/0=');
    await expect(page.getByRole('alert')).toContainText('Cannot divide by zero');
    const error = await scan(page);
    expect(error.violations, JSON.stringify(error.violations.map((v) => [v.id, v.nodes.length]))).toEqual([]);
    await context.close();
  });
}

// ---- computed contrast of dynamic states --------------------------------------------------------------------

type Rgb = [number, number, number, number];

function parse(color: string): Rgb {
  const rgb = /^rgba?\(([^)]+)\)$/.exec(color);
  if (rgb?.[1]) {
    const p = rgb[1]
      .split(/[ ,/]+/)
      .filter(Boolean)
      .map(Number);
    return [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0, p[3] ?? 1];
  }
  const srgb = /^color\(srgb ([^)]+)\)$/.exec(color);
  if (srgb?.[1]) {
    const p = srgb[1].split(/[ /]+/).filter(Boolean).map(Number);
    return [(p[0] ?? 0) * 255, (p[1] ?? 0) * 255, (p[2] ?? 0) * 255, p[3] ?? 1];
  }
  throw new Error(`unparsed colour ${color}`);
}

function over(fg: Rgb, bg: Rgb): Rgb {
  const a = fg[3];
  return [fg[0] * a + bg[0] * (1 - a), fg[1] * a + bg[1] * (1 - a), fg[2] * a + bg[2] * (1 - a), 1];
}

function lum([r, g, b]: Rgb): number {
  const f = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function ratio(a: Rgb, b: Rgb): number {
  const [hi, lo] = lum(a) > lum(b) ? [lum(a), lum(b)] : [lum(b), lum(a)];
  return (hi + 0.05) / (lo + 0.05);
}

/** Effective foreground over the nearest opaque background, with element opacity folded in. */
async function colours(page: Page, selector: string) {
  return page
    .locator(selector)
    .first()
    .evaluate((el) => {
      let opacity = 1;
      for (let n: Element | null = el; n; n = n.parentElement) opacity *= Number(getComputedStyle(n).opacity);
      let bg = 'rgba(0, 0, 0, 0)';
      for (let n: Element | null = el; n; n = n.parentElement) {
        const c = getComputedStyle(n).backgroundColor;
        if (c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') {
          bg = c;
          break;
        }
      }
      // computed colours may serialise as oklab()/color(): let the browser rasterise them to sRGB
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const toRgba = (css: string): string => {
      if (!ctx) return css;
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = css;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
      return `rgba(${String(r)}, ${String(g)}, ${String(b)}, ${String((a ?? 255) / 255)})`;
    };
    return { fg: toRgba(getComputedStyle(el).color), bg: toRgba(bg), opacity };
    });
}

for (const theme of ['light', 'dark'] as const) {
  test(`dynamic-state contrast ${theme}`, async ({ browser }, info) => {
    const context = await browser.newContext({
      ...info.project.use,
      colorScheme: theme,
    });
    const page = await context.newPage();
    await setStoredTheme(page, theme);
    const rows: [string, number, number][] = [];
    const check = async (label: string, selector: string, min: number) => {
      const c = await colours(page, selector);
      const bg = parse(c.bg);
      const fg = over([...parse(c.fg).slice(0, 3), parse(c.fg)[3] * c.opacity] as Rgb, bg);
      const r = ratio(fg, bg);
      rows.push([label, Number(r.toFixed(2)), min]);
      expect(r, `${label} ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(min);
    };
    await page.route('**/api/v1/operations/add', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 900));
      await route.continue().catch(() => undefined);
    });
    await open(page);
    await check('theme checked segment label', 'fieldset input:checked + span', 4.5);
    await check('theme unchecked label', 'fieldset label:nth-of-type(2) span', 4.5);
    for (const name of ['7', 'add', 'all clear', 'equals']) {
      const button = page.getByRole('button', { name, exact: true });
      await check(`key ${name} rest`, `button[aria-label="${name}"]`, 4.5);
      await button.hover();
      await page.waitForTimeout(220); // the 120 ms background transition has finished
      await check(`key ${name} hover`, `button[aria-label="${name}"]`, 4.5);
      await page.mouse.down();
      await page.waitForTimeout(220);
      await check(`key ${name} active`, `button[aria-label="${name}"]`, 4.5);
      await page.mouse.up();
    }
    await typeKeys(page, '1+1=');
    await expect(page.getByText('Calculating')).toBeVisible();
    await check('busy digits (opacity 0.6)', 'output[aria-label="Result"] > span:last-child', 4.5);
    await expect(page.locator('output[aria-label="Result"]')).toContainText('2');
    await typeKeys(page, '1/0=');
    await expect(page.getByRole('alert')).toContainText('Cannot divide by zero');
    await check('error copy', '[role="alert"] p:first-child', 4.5);
    await check('Ref line', '[role="alert"] p:nth-child(2)', 4.5);
    console.log(JSON.stringify({ theme, project: info.project.name, rows }));
    await context.close();
  });
}
