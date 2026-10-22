// Browser check of the app served by the edge (OPS-EDGE-01, plan R14).
// Run with any Playwright install: PLAYWRIGHT_FROM names a directory whose
// node_modules holds `playwright` or `@playwright/test` (default: the current one), e.g.
//   PLAYWRIGHT_FROM="$(npm root -g)" node browser-check.mjs http://127.0.0.1:4130
// For desktop Chromium and a Pixel 7 profile, and for the stored theme unset
// (system), light and dark while the OS prefers dark: the page renders, the
// external theme bootstrap applies the stored theme before the app under the
// real policy header, a source map and the API are reachable same-origin, and
// there is no CSP violation, console error or page error.
import { createRequire } from 'node:module';

const load = createRequire(`${process.env.PLAYWRIGHT_FROM ?? process.cwd()}/resolve-from.js`);
const { chromium, devices } = (() => {
  try {
    return load('@playwright/test');
  } catch {
    return load('playwright');
  }
})();

const base = process.argv[2] ?? 'http://127.0.0.1:4130';
const profiles = [
  ['desktop-chromium', { viewport: { width: 1280, height: 800 } }],
  ['mobile-chromium', devices['Pixel 7']],
];
const themes = [
  ['system (OS dark)', null, null],
  ['light while OS dark', 'light', 'light'],
  ['dark', 'dark', 'dark'],
];

let failures = 0;
const report = (ok, name, detail = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch();
for (const [profile, options] of profiles) {
  for (const [label, stored, expected] of themes) {
    const name = `${profile} / ${label}`;
    const context = await browser.newContext({ ...options, colorScheme: 'dark' });
    await context.addInitScript((value) => {
      window.__violations = [];
      document.addEventListener('securitypolicyviolation', (e) => {
        window.__violations.push(`${e.violatedDirective} ${e.blockedURI}`);
      });
      if (value !== null) window.localStorage.setItem('calculator.theme.v1', value);
      // The theme in force when the app first renders into #root.
      window.__themeAtFirstRender = 'not rendered';
      new MutationObserver((records, observer) => {
        const root = document.getElementById('root');
        if (root !== null && root.childElementCount > 0) {
          window.__themeAtFirstRender = document.documentElement.getAttribute('data-theme');
          observer.disconnect();
        }
      }).observe(document, { childList: true, subtree: true });
    }, stored);
    const page = await context.newPage();
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(e.message));
    const response = await page.goto(`${base}/`, { waitUntil: 'networkidle' });
    const headers = response?.headers() ?? {};
    report(response?.status() === 200, `${name}: document 200`);
    report((headers['content-security-policy'] ?? '').startsWith("default-src 'self'; script-src 'self'"), `${name}: policy header present`);
    report(await page.locator('h1').innerText() === 'Calculator', `${name}: app rendered`);
    const theme = await page.evaluate(() => window.__themeAtFirstRender);
    report(theme === expected, `${name}: data-theme already set when the app first renders`, `got ${theme}, want ${expected}`);
    const scheme = await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme);
    report(scheme !== '', `${name}: styles applied`, `color-scheme ${scheme}`);
    const fetched = await page.evaluate(async () => {
      const script = document.querySelector('script[type="module"]')?.getAttribute('src') ?? '';
      const map = await fetch(`${script}.map`);
      const api = await fetch('/api/v1/operations');
      return { map: map.status, mapType: map.headers.get('content-type'), api: api.status };
    });
    report(fetched.map === 200 && fetched.mapType === 'application/json', `${name}: source map same-origin`, JSON.stringify(fetched));
    report(fetched.api === 200, `${name}: API same-origin through the edge`, JSON.stringify(fetched));
    const violations = await page.evaluate(() => window.__violations);
    report(violations.length === 0, `${name}: zero CSP violations`, violations.join('; '));
    report(errors.length === 0, `${name}: zero console and page errors`, errors.join('; '));
    await context.close();
  }
}
await browser.close();
console.log(`\n${failures === 0 ? 'all checks passed' : `${failures} failed`}`);
process.exit(failures === 0 ? 0 : 1);
