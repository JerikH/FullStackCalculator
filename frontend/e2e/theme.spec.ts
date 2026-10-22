import type { Page } from '@playwright/test';
import { expect, test } from './helpers/fixture.js';

const STORAGE_KEY = 'calculator.theme.v1';

type Scheme = 'light' | 'dark';

/** The `data-theme` attribute of `<html>`: `light` or `dark`, absent (null) for System. */
async function themeAttribute(page: Page): Promise<string | null> {
  return page.evaluate(() => document.documentElement.getAttribute('data-theme'));
}

async function storedTheme(page: Page): Promise<string | null> {
  return page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY);
}

/** The page background, which is what the theme tokens change. */
async function background(page: Page): Promise<string> {
  return page.evaluate(() => getComputedStyle(document.body).backgroundColor);
}

/** Clicks the visible label of a theme radio (the inputs themselves are visually hidden). */
async function chooseTheme(page: Page, label: 'System' | 'Light' | 'Dark'): Promise<void> {
  await page.getByText(label, { exact: true }).click();
  await expect(page.getByRole('radio', { name: label })).toBeChecked();
}

async function reload(page: Page): Promise<void> {
  await page.reload();
  await page.getByRole('group', { name: 'Keypad' }).waitFor();
}

/** The two backgrounds the System choice shows, one per OS colour scheme, read from the page itself. */
async function systemBackgrounds(page: Page): Promise<Record<Scheme, string>> {
  await page.emulateMedia({ colorScheme: 'light' });
  const light = await background(page);
  await page.emulateMedia({ colorScheme: 'dark' });
  const dark = await background(page);
  expect(light, 'the two schemes must look different').not.toBe(dark);
  return { light, dark };
}

/** Writes the stored choice before any page script runs, unless the page has already stored one. */
async function preloadTheme(page: Page, value: string): Promise<void> {
  await page.addInitScript(
    ({ key, stored }) => {
      if (window.localStorage.getItem(key) === null) window.localStorage.setItem(key, stored);
    },
    { key: STORAGE_KEY, stored: value },
  );
}

test.describe('UC-UI-04 theme: System, Light and Dark (RF-UI-11)', () => {
  test('the radio group offers System, Light and Dark and starts on System with no attribute', async ({
    page,
    calc,
  }) => {
    await calc.goto();
    await expect(page.getByRole('radiogroup', { name: 'Theme' })).toBeVisible();
    await expect(page.getByRole('radio')).toHaveCount(3);
    await expect(page.getByRole('radio', { name: 'System' })).toBeChecked();
    expect(await themeAttribute(page)).toBeNull();
  });

  test('Dark and Light set the attribute and are stored; System removes the attribute and stores system', async ({
    page,
    calc,
  }) => {
    await calc.goto();
    await chooseTheme(page, 'Dark');
    expect(await themeAttribute(page)).toBe('dark');
    expect(await storedTheme(page)).toBe('dark');
    await chooseTheme(page, 'Light');
    expect(await themeAttribute(page)).toBe('light');
    expect(await storedTheme(page)).toBe('light');
    await chooseTheme(page, 'System');
    expect(await themeAttribute(page)).toBeNull();
    expect(await storedTheme(page)).toBe('system');
  });

  for (const choice of ['Light', 'Dark'] as const) {
    test(`${choice} persists across a reload and the radio shows it`, async ({ page, calc }) => {
      await calc.goto();
      await chooseTheme(page, choice);
      await reload(page);
      expect(await themeAttribute(page)).toBe(choice.toLowerCase());
      await expect(page.getByRole('radio', { name: choice })).toBeChecked();
      expect(await storedTheme(page)).toBe(choice.toLowerCase());
    });
  }

  test('System persists across a reload as no attribute', async ({ page, calc }) => {
    await calc.goto();
    await chooseTheme(page, 'Dark');
    await chooseTheme(page, 'System');
    await reload(page);
    expect(await themeAttribute(page)).toBeNull();
    await expect(page.getByRole('radio', { name: 'System' })).toBeChecked();
  });

  test('the arrow keys move the selection between the radios and change the theme', async ({ page, calc }) => {
    await calc.goto();
    await chooseTheme(page, 'Dark');
    await page.getByRole('radio', { name: 'Dark' }).focus();
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByRole('radio', { name: 'Light' })).toBeChecked();
    expect(await themeAttribute(page)).toBe('light');
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByRole('radio', { name: 'System' })).toBeChecked();
    expect(await themeAttribute(page)).toBeNull();
  });

  test('System follows the operating system scheme as it changes', async ({ page, calc }) => {
    await calc.goto();
    const backgrounds = await systemBackgrounds(page);
    expect(await themeAttribute(page)).toBeNull();
    await page.emulateMedia({ colorScheme: 'light' });
    await expect.poll(() => background(page)).toBe(backgrounds.light);
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect.poll(() => background(page)).toBe(backgrounds.dark);
  });

  test('Light chosen explicitly stays light while the operating system prefers dark, also after a reload', async ({
    page,
    calc,
  }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await calc.goto();
    const backgrounds = await systemBackgrounds(page);
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect.poll(() => background(page)).toBe(backgrounds.dark);
    await chooseTheme(page, 'Light');
    await expect.poll(() => background(page)).toBe(backgrounds.light);
    await reload(page);
    expect(await themeAttribute(page)).toBe('light');
    expect(await background(page)).toBe(backgrounds.light);
  });

  test('Dark chosen explicitly stays dark while the operating system prefers light', async ({ page, calc }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await calc.goto();
    const backgrounds = await systemBackgrounds(page);
    await page.emulateMedia({ colorScheme: 'light' });
    await chooseTheme(page, 'Dark');
    await expect.poll(() => background(page)).toBe(backgrounds.dark);
    await reload(page);
    expect(await background(page)).toBe(backgrounds.dark);
  });

  test('switching back to System follows the operating system again', async ({ page, calc }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await calc.goto();
    const backgrounds = await systemBackgrounds(page);
    await page.emulateMedia({ colorScheme: 'dark' });
    await chooseTheme(page, 'Light');
    await expect.poll(() => background(page)).toBe(backgrounds.light);
    await chooseTheme(page, 'System');
    await expect.poll(() => background(page)).toBe(backgrounds.dark);
    await page.emulateMedia({ colorScheme: 'light' });
    await expect.poll(() => background(page)).toBe(backgrounds.light);
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect.poll(() => background(page)).toBe(backgrounds.dark);
  });

  test('an unknown stored value falls back to System', async ({ page, calc }) => {
    await preloadTheme(page, 'purple');
    await calc.goto();
    expect(await themeAttribute(page)).toBeNull();
    await expect(page.getByRole('radio', { name: 'System' })).toBeChecked();
  });

  test('the theme choice does not disturb calculator keys typed afterwards', async ({ page, calc }) => {
    await calc.goto();
    await chooseTheme(page, 'Dark');
    await page.getByRole('radio', { name: 'Dark' }).focus();
    await page.keyboard.press('5');
    await expect(calc.result()).toHaveText('5');
  });
});

test.describe('UC-UI-04 theme bootstrap before the app renders (RF-UI-11, RNF-SEC-03)', () => {
  for (const [stored, expected] of [
    ['dark', 'dark'],
    ['light', 'light'],
    ['system', null],
    ['purple', null],
  ] as const) {
    test.describe(`stored ${stored}`, () => {
      // The aborted entry script is logged by the browser as a failed load; nothing else is allowed.
      test.use({ allowConsole: [/ERR_FAILED/] });

      test(`theme-init.js alone applies the attribute (${String(expected)}) while the application script is blocked`, async ({
        page,
      }) => {
        await preloadTheme(page, stored);
        const blocked: string[] = [];
        await page.route('**/assets/*.js', async (route) => {
          blocked.push(new URL(route.request().url()).pathname);
          await route.abort();
        });
        await page.emulateMedia({ colorScheme: 'dark' });
        await page.goto('/', { waitUntil: 'load' });
        expect(blocked.length, 'the application entry script was requested and blocked').toBeGreaterThan(0);
        // The application never rendered: the root is empty and there is no keypad.
        await expect(page.locator('#root')).toBeEmpty();
        await expect(page.getByRole('group', { name: 'Keypad' })).toHaveCount(0);
        expect(await themeAttribute(page)).toBe(expected);

        // Lifting the block lets the application start and agree with the bootstrap.
        await page.unroute('**/assets/*.js');
        await page.reload();
        await page.getByRole('group', { name: 'Keypad' }).waitFor();
        expect(await themeAttribute(page)).toBe(expected);
        const radio = stored === 'dark' ? 'Dark' : stored === 'light' ? 'Light' : 'System';
        await expect(page.getByRole('radio', { name: radio })).toBeChecked();
      });
    });
  }

  for (const stored of ['dark', 'light'] as const) {
    test(`no flash: the attribute is ${stored} when the app first renders and never takes another value`, async ({
      page,
    }) => {
      await preloadTheme(page, stored);
      await page.addInitScript(() => {
        const watched = window as unknown as { __themeAtFirstRender?: string | null; __themeValues: (string | null)[] };
        watched.__themeValues = [];
        const read = (): string | null => document.documentElement.getAttribute('data-theme');
        new MutationObserver((records) => {
          for (const record of records) {
            if (record.type === 'attributes') watched.__themeValues.push(read());
            else if (watched.__themeAtFirstRender === undefined) {
              const root = document.getElementById('root');
              if (root !== null && root.childElementCount > 0) watched.__themeAtFirstRender = read();
            }
          }
        }).observe(document, { attributes: true, attributeFilter: ['data-theme'], childList: true, subtree: true });
      });
      await page.emulateMedia({ colorScheme: stored === 'dark' ? 'light' : 'dark' });
      await page.goto('/');
      await page.getByRole('group', { name: 'Keypad' }).waitFor();
      const seen = await page.evaluate(() => {
        const watched = window as unknown as { __themeAtFirstRender?: string | null; __themeValues: (string | null)[] };
        return { first: watched.__themeAtFirstRender, values: watched.__themeValues };
      });
      expect(seen.first, 'attribute when the first element entered #root').toBe(stored);
      expect(
        seen.values.filter((value) => value !== stored),
        'values the attribute took after the bootstrap',
      ).toEqual([]);
      expect(await themeAttribute(page)).toBe(stored);
    });
  }

  test('the stored choice is applied at domcontentloaded', async ({ page }) => {
    await preloadTheme(page, 'dark');
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    expect(await themeAttribute(page)).toBe('dark');
  });

  test('the document has no inline script, inline style or style attribute, and loads only same-origin scripts', async ({
    page,
    calc,
  }) => {
    await preloadTheme(page, 'dark');
    await calc.goto();
    await calc.enter('1 ÷ 3 =');
    await expect(calc.result()).toContainText('0.3333');
    await chooseTheme(page, 'Light');
    const inventory = await page.evaluate(() => ({
      inlineScripts: document.querySelectorAll('script:not([src])').length,
      styleElements: document.querySelectorAll('style').length,
      styleAttributes: document.querySelectorAll('[style]').length,
      eventHandlerAttributes: Array.from(document.querySelectorAll('*')).filter((element) =>
        element.getAttributeNames().some((name) => name.startsWith('on')),
      ).length,
      foreignScripts: Array.from(document.querySelectorAll('script[src]'))
        .map((script) => (script as HTMLScriptElement).src)
        .filter((source) => new URL(source).origin !== window.location.origin),
    }));
    expect(inventory).toEqual({
      inlineScripts: 0,
      styleElements: 0,
      styleAttributes: 0,
      eventHandlerAttributes: 0,
      foreignScripts: [],
    });
  });

  test('the document is served under a Content-Security-Policy that allows no inline code', async ({ page }) => {
    const response = await page.goto('/');
    const policy = response?.headers()['content-security-policy'] ?? '';
    expect(policy).toContain("script-src 'self'");
    expect(policy).toContain("style-src 'self'");
    expect(policy).not.toContain('unsafe-inline');
    expect(policy).not.toContain('unsafe-eval');
    await page.getByRole('group', { name: 'Keypad' }).waitFor();
  });
});
