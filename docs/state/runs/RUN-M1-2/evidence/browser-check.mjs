// Evidence for UI-SCAF-01 (RF-UI-11, RF-UI-14, RNF-SEC-03): serves the built frontend/dist with the
// browser policy of RNF-SEC-03 and checks the placeholder page in Chromium (desktop widths and Pixel 7):
// theme bootstrap before first paint for every stored value and OS preference, blocked storage, token
// background per theme, favicon, no horizontal scroll, no console errors, no CSP violations.
// Usage (repository root, after `pnpm -C frontend build`): node docs/state/runs/RUN-M1-2/evidence/browser-check.mjs [port] [screenshot dir]
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { extname, join, resolve } from 'node:path';

const root = resolve(new URL('../../../../../', import.meta.url).pathname);
const require = createRequire(join(root, 'frontend/package.json'));
const { chromium, devices } = require('@playwright/test');
const dist = join(root, 'frontend/dist');
const port = Number(process.argv[2] ?? 4120);
const shots = process.argv[3];

const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; " +
  "font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'none'";
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.map': 'application/json' };
const requests = [];
const server = createServer((req, res) => {
  const path = new URL(req.url, 'http://x').pathname;
  requests.push(path);
  let file = join(dist, path === '/' ? 'index.html' : path);
  if (!file.startsWith(dist) || !existsSync(file) || statSync(file).isDirectory()) {
    res.writeHead(404).end();
    return;
  }
  const headers = { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' };
  if (extname(file) === '.html') Object.assign(headers, { 'Content-Security-Policy': CSP, 'Referrer-Policy': 'no-referrer' });
  res.writeHead(200, headers);
  createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(port, '127.0.0.1', r));
const base = `http://127.0.0.1:${port}/`;

let failures = 0;
const check = (name, cond, detail = '') => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failures += 1;
};

// Runs before every page script: records when data-theme is first set, CSP violations, and optionally blocks storage.
const probe = (blockStorage) => {
  window.__probe = { violations: [], themeSetWithBody: null };
  document.addEventListener('securitypolicyviolation', (e) => window.__probe.violations.push(e.violatedDirective));
  if (blockStorage) {
    Storage.prototype.getItem = () => {
      throw new DOMException('denied', 'SecurityError');
    };
  }
  // Init scripts run before <html> exists: observe the document for the attribute appearing.
  new MutationObserver(() => {
    if (window.__probe.themeSetWithBody === null && document.documentElement?.hasAttribute('data-theme')) {
      window.__probe.themeSetWithBody = document.body !== null;
    }
  }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-theme'] });
};

const browser = await chromium.launch();
const cases = [
  { stored: null, os: 'light', attr: null, bg: 'rgb(244, 245, 247)' },
  { stored: null, os: 'dark', attr: null, bg: 'rgb(13, 17, 23)' },
  { stored: 'system', os: 'dark', attr: null, bg: 'rgb(13, 17, 23)' },
  { stored: 'light', os: 'dark', attr: 'light', bg: 'rgb(244, 245, 247)' },
  { stored: 'dark', os: 'light', attr: 'dark', bg: 'rgb(13, 17, 23)' },
  { stored: 'junk', os: 'light', attr: null, bg: 'rgb(244, 245, 247)' },
  { stored: 'dark', os: 'dark', attr: null, bg: 'rgb(13, 17, 23)', blocked: true },
];
const projects = [
  ...[320, 393, 768, 1280].map((width) => ({ name: `chromium-${width}`, options: { viewport: { width, height: 800 } } })),
  { name: 'mobile-chromium (Pixel 7)', options: { ...devices['Pixel 7'] } },
];

for (const project of projects) {
  for (const c of cases) {
    const label = `${project.name} stored=${c.stored ?? '∅'}${c.blocked ? ' (storage blocked)' : ''} os=${c.os}`;
    const context = await browser.newContext({ ...project.options, colorScheme: c.os });
    await context.addInitScript(probe, Boolean(c.blocked));
    const page = await context.newPage();
    const errors = [];
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    page.on('pageerror', (e) => errors.push(String(e)));
    // Seed storage on the origin first, then load the page fresh so theme-init.js reads it.
    await page.goto(`${base}favicon.svg`);
    await page.evaluate((v) => {
      localStorage.clear();
      if (v !== null) localStorage.setItem('calculator.theme.v1', v);
    }, c.stored);
    const response = await page.goto(base);
    await page.getByRole('heading', { name: 'Calculator' }).waitFor();
    const state = await page.evaluate(() => ({
      attr: document.documentElement.getAttribute('data-theme'),
      bg: getComputedStyle(document.body).backgroundColor,
      scroll: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      probe: window.__probe,
      favicon: document.querySelector('link[rel=icon]')?.getAttribute('href'),
    }));
    check(`${label}: CSP header present`, (response?.headers()['content-security-policy'] ?? '') === CSP);
    check(`${label}: data-theme`, state.attr === c.attr, `got ${state.attr}`);
    check(`${label}: background token`, state.bg === c.bg, `got ${state.bg}`);
    if (c.attr !== null) check(`${label}: theme set before <body> exists`, state.probe.themeSetWithBody === false);
    check(`${label}: no horizontal scroll`, state.scroll);
    check(`${label}: no CSP violations`, state.probe.violations.length === 0, state.probe.violations.join(', '));
    check(`${label}: no console errors`, errors.length === 0, errors.join(' | '));
    if (shots && c.blocked !== true && (c.stored === null || c.stored === 'dark') && /320|1280|Pixel/.test(project.name)) {
      const file = `${shots}/placeholder-${project.name.replace(/[^a-z0-9-]+/gi, '_')}-${c.stored ?? 'system'}-${c.os}.png`;
      await page.screenshot({ path: file });
    }
    await context.close();
  }
}
await browser.close();
server.close();
check('favicon requested and served', requests.includes('/favicon.svg'));
check('theme-init.js requested', requests.includes('/theme-init.js'));
console.log(`\n${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
