import { describe, expect, it } from 'vitest';

// The screen layer shows server answers and edits strings; it never computes, parses numbers, touches
// storage directly or talks to the network. The production sources it scans are the hooks, the
// components, the theme module, the app shell and the entry point (never *.test.* files).
const sources = import.meta.glob<string>(
  [
    '../features/calculator/hooks/*.{ts,tsx}',
    '../features/calculator/ui/*.{ts,tsx}',
    '../shared/theme/*.{ts,tsx}',
    './*.{ts,tsx}',
    '../main.tsx',
    '!**/*.test.{ts,tsx}',
  ],
  { query: '?raw', import: 'default', eager: true },
);

/** Lower bound of the files the scan must find; a broken glob would otherwise pass vacuously. */
const MINIMUM_FILES = 16;
const MUST_INCLUDE = [
  '../features/calculator/hooks/useCalculator.ts',
  '../features/calculator/hooks/useKeyboardShortcuts.ts',
  '../features/calculator/ui/Calculator.tsx',
  '../features/calculator/ui/Display.tsx',
  '../shared/theme/ThemeToggle.tsx',
  '../shared/theme/useTheme.ts',
  './App.tsx',
  '../main.tsx',
];

/** Banned primitives, each as a pattern over comment-free source. */
const BANNED: readonly { readonly name: string; readonly pattern: RegExp }[] = [
  { name: 'Number(', pattern: /\bNumber\s*\(/ },
  { name: 'parseFloat', pattern: /\bparseFloat\b/ },
  { name: 'parseInt', pattern: /\bparseInt\b/ },
  { name: 'BigInt', pattern: /\bBigInt\b/ },
  { name: 'Intl.NumberFormat', pattern: /\bIntl\s*\.\s*NumberFormat\b/ },
  { name: 'Math.', pattern: /\bMath\s*\./ },
  { name: 'eval(', pattern: /\beval\s*\(/ },
  { name: 'new Function', pattern: /\bnew\s+Function\b/ },
  { name: 'style attribute', pattern: /\bstyle\s*=/ },
  { name: 'dangerouslySetInnerHTML', pattern: /\bdangerouslySetInnerHTML\b/ },
  { name: 'localStorage', pattern: /\blocalStorage\b/ },
  { name: 'sessionStorage', pattern: /\bsessionStorage\b/ },
  { name: 'fetch(', pattern: /\bfetch\s*\(/ },
];

/** Replaces comments with whitespace and leaves string and template literals as they are. */
function stripComments(source: string): string {
  let out = '';
  let index = 0;
  while (index < source.length) {
    const char = source.charAt(index);
    const next = source.charAt(index + 1);
    if (char === '/' && next === '/') {
      while (index < source.length && source.charAt(index) !== '\n') index += 1;
    } else if (char === '/' && next === '*') {
      const end = source.indexOf('*/', index + 2);
      const stop = end === -1 ? source.length : end + 2;
      out += source.slice(index, stop).replace(/[^\n]/g, ' ');
      index = stop;
    } else if (char === "'" || char === '"' || char === '`') {
      let end = index + 1;
      while (end < source.length && source.charAt(end) !== char) end += source.charAt(end) === '\\' ? 2 : 1;
      out += source.slice(index, end + 1);
      index = end + 1;
    } else {
      out += char;
      index += 1;
    }
  }
  return out;
}

/** The names of every banned primitive the source uses; empty when it is clean. */
function findViolations(source: string): string[] {
  const code = stripComments(source);
  return BANNED.filter(({ pattern }) => pattern.test(code)).map(({ name }) => name);
}

describe('the screen layer sources', () => {
  const files = Object.keys(sources);

  it('are found: the scan cannot pass vacuously', () => {
    expect(files.length).toBeGreaterThanOrEqual(MINIMUM_FILES);
    for (const expected of MUST_INCLUDE) expect(files).toContain(expected);
  });

  it('contain no test files', () => {
    expect(files.filter((file) => /\.test\.[tj]sx?$/.test(file))).toEqual([]);
  });

  it.each(Object.entries(sources))('%s is not empty', (_file, source) => {
    expect(source.trim().length).toBeGreaterThan(0);
  });

  it.each(Object.entries(sources))('%s uses no banned primitive', (_file, source) => {
    expect(findViolations(source)).toEqual([]);
  });
});

describe('findViolations', () => {
  it.each([
    ['const y = Number(x);', 'Number('],
    ['const y = Number (x);', 'Number('],
    ['const y = parseFloat(x);', 'parseFloat'],
    ['const y = Number.parseFloat(x);', 'parseFloat'],
    ['const y = parseInt(x, 10);', 'parseInt'],
    ['const y = BigInt(x);', 'BigInt'],
    ['const y = new Intl.NumberFormat();', 'Intl.NumberFormat'],
    ['const y = Math.max(a, b);', 'Math.'],
    ['const y = eval(x);', 'eval('],
    ['const f = new Function(body);', 'new Function'],
    ['<div style={{ width: 1 }} />', 'style attribute'],
    ['<div style="width: 1px" />', 'style attribute'],
    ['<div dangerouslySetInnerHTML={{ __html: x }} />', 'dangerouslySetInnerHTML'],
    ['const s = window.localStorage.getItem(k);', 'localStorage'],
    ['const s = sessionStorage.getItem(k);', 'sessionStorage'],
    ['const r = await fetch(url);', 'fetch('],
  ])('flags %s (%s)', (source, name) => {
    expect(findViolations(source)).toContain(name);
  });

  it.each([
    ['className={styles.value}', 'styles is not style='],
    ['const numbers = [1, 2];', 'numbers is not Number('],
    ['const evaluate = () => 1;', 'evaluate is not eval('],
    ['const prefetch = 1;', 'prefetch is not fetch('],
    ['// Number(x) parseInt Math.max style={}\nconst a = 1;', 'banned words in a line comment'],
    ['/* BigInt fetch( localStorage */ const a = 1;', 'banned words in a block comment'],
    ['const label = `Rounded to 34 significant digits`;', 'ordinary copy'],
  ])('accepts %s (%s)', (source) => {
    expect(findViolations(source)).toEqual([]);
  });

  it('keeps comment markers inside string literals so a banned call after them is still seen', () => {
    expect(findViolations("const a = '//'; const b = Number(x);")).toEqual(['Number(']);
  });

  it('reports every banned primitive a source uses', () => {
    expect(findViolations('const a = parseInt(x) + Math.abs(y);')).toEqual(['parseInt', 'Math.']);
  });
});
