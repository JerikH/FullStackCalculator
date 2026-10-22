// Opens the generated docs/api/index.html in Chromium and checks that the reference rendered.
// Usage (from frontend/): node ../docs/state/runs/RUN-M2-3/evidence/check_api_page.mjs ../docs/api/index.html
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
const { chromium } = await import(
  pathToFileURL(path.join(repo, 'frontend', 'node_modules', '@playwright', 'test', 'index.mjs')).href
);
const file = path.resolve(process.argv[2] ?? path.join(repo, 'docs', 'api', 'index.html'));
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(pathToFileURL(file).href, { waitUntil: 'load' });
await page.waitForSelector('h1', { timeout: 10000 });
await page.waitForTimeout(1500); // Redocly fills the page after load
const title = await page.title();
const text = await page.locator('body').innerText();
// Redocly renders the info block and the tag menu first; operations unfold lazily.
const need = ['Calculator API (1.0.0)', 'Numbers are strings', 'Servers', 'operations', 'system'];
const missing = need.filter((t) => !text.includes(t));
console.log(`title: ${title}; body text length: ${text.length}; page errors: ${errors.length}`);
console.log(missing.length ? `MISSING: ${missing.join(', ')}` : 'all expected strings present');
await browser.close();
process.exit(missing.length || errors.length ? 1 : 0);
