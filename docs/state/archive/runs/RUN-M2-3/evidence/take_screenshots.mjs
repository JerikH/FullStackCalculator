// Takes the two README screenshots from the running embedded app.
// Usage: node take_screenshots.mjs --base http://127.0.0.1:4120 --out <dir>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
// The repository root is the nearest ancestor with frontend/package.json (the script also runs from the archive).
let repo = here;
while (!fs.existsSync(path.join(repo, 'frontend', 'package.json'))) {
  const up = path.dirname(repo);
  if (up === repo) throw new Error('repository root not found');
  repo = up;
}
const { chromium, devices } = await import(
  pathToFileURL(path.join(repo, 'frontend', 'node_modules', '@playwright', 'test', 'index.mjs')).href
);

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}
const base = arg('base');
const out = arg('out');
if (!base || !out) {
  console.error('usage: node take_screenshots.mjs --base <url> --out <dir>');
  process.exit(1);
}
fs.mkdirSync(out, { recursive: true });

const VALUE = '0.3333333333333333333333333333333333';
const HISTORY = `1 ÷ 3 ≈ ${VALUE}`;

function pngSize(file) {
  const b = fs.readFileSync(file);
  return { bytes: b.length, width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

const problems = [];
const browser = await chromium.launch({ headless: true });

async function flow(name, contextOptions, file, mobile) {
  const passed = [];
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  const issues = [];
  page.on('console', (m) => {
    if (m.type() === 'error') issues.push(`console error: ${m.text()}`);
  });
  page.on('pageerror', (e) => issues.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => issues.push(`requestfailed: ${r.url()} ${r.failure()?.errorText ?? ''}`));
  const fail = (msg) => {
    throw new Error(`[${name}] ${msg}`);
  };
  try {
    await page.goto(base, { waitUntil: 'load' });
    for (const label of ['1', 'divide', '3', 'equals']) {
      await page.getByRole('button', { name: label, exact: true }).click();
    }
    const output = page.locator('output');
    await output.first().waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForFunction(
      (v) => document.querySelector('output')?.textContent?.includes(v),
      VALUE,
      { timeout: 10000 },
    ).catch(() => fail(`<output> never showed ${VALUE}`));
    const text = (await output.first().textContent()) ?? '';
    if (!text.includes('≈')) fail(`<output> text lacks "≈": ${JSON.stringify(text)}`);
    passed.push('output contains ≈');
    if (!/0\.3333333333333333333333333333333333/.test(text)) fail(`<output> text lacks the value: ${JSON.stringify(text)}`);
    passed.push(`output matches ${VALUE}`);
    if ((await page.locator('output [title="Rounded to 34 significant digits"]').count()) < 1) {
      fail('no element `output [title="Rounded to 34 significant digits"]`');
    }
    passed.push('rounded-to-34-digits marker present');

    const details = page.locator('details').filter({ has: page.locator('summary') }).first();
    if (mobile) {
      const isOpen = await details.evaluate((d) => d.open);
      if (!isOpen) await details.locator('summary').first().click();
      await page.evaluate(() => document.activeElement && document.activeElement.blur());
    }
    await page.waitForFunction(() => document.querySelector('details')?.open === true, null, { timeout: 5000 })
      .catch(() => fail('history <details> is not open'));
    passed.push('history <details> open');
    const row = details.locator('li').filter({ hasText: HISTORY });
    const rows = await row.allTextContents();
    if (!rows.some((t) => t.trim() === HISTORY)) {
      fail(`no history list item with text ${JSON.stringify(HISTORY)}; got ${JSON.stringify(rows)}`);
    }
    await row.first().waitFor({ state: 'visible', timeout: 5000 });
    passed.push(`history item "${HISTORY}" visible`);

    await page.evaluate(() => document.fonts.ready);
    const target = path.join(out, file);
    await page.screenshot({ path: target, fullPage: mobile, animations: 'disabled' });
    if (issues.length) fail(`browser issues:\n  ${issues.join('\n  ')}`);
    passed.push('no console errors, page errors or failed requests');
    const s = pngSize(target);
    console.log(`${target}\n  ${s.bytes} bytes, ${s.width}x${s.height} px`);
    for (const p of passed) console.log(`  ok: ${p}`);
  } catch (e) {
    problems.push(e.message + (issues.length && !e.message.includes('browser issues') ? `\n  also: ${issues.join('; ')}` : ''));
  } finally {
    await context.close();
  }
}

await flow(
  'desktop',
  { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, colorScheme: 'light' },
  'calculator-desktop.png',
  false,
);
await flow('mobile', { ...devices['Pixel 7'], colorScheme: 'light' }, 'calculator-mobile.png', true);
await browser.close();

if (problems.length) {
  for (const p of problems) console.error(`FAIL ${p}`);
  process.exit(1);
}
console.log('all assertions passed');
