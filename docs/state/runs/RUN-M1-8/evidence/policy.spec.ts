import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { collectCsp, resultText, shot, typeKeys, watchProblems, open } from './support';

// U24: the theme bootstrap and the screen under the REAL browser policy (RNF-SEC-03) on the web image built
// from this branch (nginx edge), API_UPSTREAM at this worktree's service. Chromium desktop.

const THEMES = [
  {
    name: 'system-light',
    stored: null,
    scheme: 'light' as const,
    bg: 'rgb(244, 245, 247)',
    attr: null,
  },
  {
    name: 'system-dark',
    stored: null,
    scheme: 'dark' as const,
    bg: 'rgb(13, 17, 23)',
    attr: null,
  },
  {
    name: 'light',
    stored: 'light',
    scheme: 'dark' as const,
    bg: 'rgb(244, 245, 247)',
    attr: 'light',
  },
  {
    name: 'dark',
    stored: 'dark',
    scheme: 'light' as const,
    bg: 'rgb(13, 17, 23)',
    attr: 'dark',
  },
];

for (const t of THEMES) {
  test(`real policy: ${t.name}`, async ({ browser }, info) => {
    const context = await browser.newContext({
      ...info.project.use,
      colorScheme: t.scheme,
    });
    const page = await context.newPage();
    const problems = await watchProblems(page);
    await page.addInitScript((stored) => {
      if (stored) window.localStorage.setItem('calculator.theme.v1', stored);
      const w = window as unknown as { __atBody: string | null };
      w.__atBody = 'unset';
      new MutationObserver((_records, observer) => {
        if (document.body) {
          w.__atBody = document.documentElement.getAttribute('data-theme');
          observer.disconnect();
        }
      }).observe(document, { childList: true, subtree: true });
    }, t.stored);
    const response = await open(page);
    const csp = response?.headers()['content-security-policy'] ?? '';
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("style-src 'self'");
    // the attribute is already there when <body> appears, i.e. set by the blocking /theme-init.js, not by React
    expect(await page.evaluate(() => (window as unknown as { __atBody: string | null }).__atBody)).toBe(t.attr);
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(t.bg);
    await expect(page.getByRole('heading', { level: 1, name: 'Calculator' })).toBeVisible();
    await shot(page, info, `policy-${t.name}-initial`);
    const axeInitial = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(axeInitial.violations).toEqual([]);
    await typeKeys(page, '0.1+0.2=');
    await expect(page.locator('output[aria-label="Result"]')).toContainText('0.3');
    await typeKeys(page, '1/0=');
    await expect(page.getByRole('alert')).toContainText('Cannot divide by zero');
    await expect(page.getByRole('alert')).toContainText('Ref: ');
    await shot(page, info, `policy-${t.name}-error`);
    const axeError = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(axeError.violations).toEqual([]);
    expect(await resultText(page)).toBe('');
    await collectCsp(page, problems);
    expect(problems, JSON.stringify(problems)).toEqual({
      console: [],
      pageErrors: [],
      csp: [],
    });
    await context.close();
  });
}
