import { describe, expect, it } from 'vitest';

// The model is pure: it may import only contract types and its own files, and it never touches
// the DOM, timers, randomness, I/O or any numeric conversion of operands and results.
const sources = import.meta.glob<string>(['./*.ts', '!./*.test.ts', '!./testing.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

const EXPECTED_FILES = [
  './entry.ts',
  './history.ts',
  './keypad.ts',
  './messages.ts',
  './operations.ts',
  './reducer.ts',
  './selectors.ts',
  './types.ts',
];

const MODEL_MODULES = new Set(EXPECTED_FILES.map((file) => file.replace(/\.ts$/, '')));

/**
 * Replaces `//` and block comments with whitespace (newlines kept) and leaves string and template
 * literals untouched, so `'//'` and URLs inside strings survive. A regular expression literal
 * holding a quote character is not understood; the model has none.
 */
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

const FORBIDDEN_WORDS = [
  'window',
  'document',
  'localStorage',
  'sessionStorage',
  'fetch',
  'setTimeout',
  'setInterval',
  'Date',
  'crypto',
  'globalThis',
  'Number',
  'parseFloat',
  'parseInt',
  'BigInt',
  'Intl',
  'eval',
  'Math',
];

/** Every way the checked source breaks the model's boundaries; empty when it keeps them. */
function findViolations(source: string): string[] {
  const code = stripComments(source);
  const violations: string[] = [];

  const withFrom = /\b(import|export)\s+(type\s+)?[\w\s{},*$]*?\bfrom\s*(['"])([^'"]+)\3/g;
  for (const match of code.matchAll(withFrom)) {
    const kind = match[1] ?? '';
    const typeOnly = match[2] !== undefined;
    const target = match[4] ?? '';
    violations.push(...checkTarget(kind, typeOnly, target));
  }
  // Any module specifier after `from`, whatever the clause looks like (quoted names included).
  const anyFrom = /\bfrom\s*(['"])([^'"]+)\1/g;
  for (const match of code.matchAll(anyFrom)) {
    const target = match[2] ?? '';
    if (target !== '@/shared/api/types') violations.push(...checkTarget('from', false, target));
  }
  const sideEffect = /\bimport\s*(['"])([^'"]+)\1/g;
  for (const match of code.matchAll(sideEffect)) {
    violations.push(...checkTarget('import', false, match[2] ?? ''));
  }
  if (/\bimport\s*\(/.test(code)) violations.push('dynamic import');
  if (/\brequire\s*\(/.test(code)) violations.push('require call');

  if (/\breact\b/i.test(code)) violations.push('forbidden word react');
  for (const word of FORBIDDEN_WORDS) {
    if (new RegExp(`\\b${word}\\b`).test(code)) violations.push(`forbidden word ${word}`);
  }
  return violations;
}

function checkTarget(kind: string, typeOnly: boolean, target: string): string[] {
  if (target === '@/shared/api/types') {
    return typeOnly ? [] : [`${kind} of ${target} must be a type-only import`];
  }
  const relative = /^(\.\/[A-Za-z0-9_-]+)$/.exec(target);
  if (relative !== null && MODEL_MODULES.has(relative[1] ?? '')) return [];
  return [`${kind} from ${target} is outside the model`];
}

describe('the model sources found', () => {
  it('are exactly the production files, so the checks cannot pass vacuously', () => {
    expect(Object.keys(sources).sort()).toEqual(EXPECTED_FILES);
  });

  it.each(Object.entries(sources))('%s is not empty', (_file, source) => {
    expect(source.trim().length).toBeGreaterThan(0);
  });
});

describe('the model stays pure', () => {
  it.each(Object.entries(sources))(
    '%s imports only contract types and model files and avoids the forbidden words',
    (_file, source) => {
      expect(findViolations(source)).toEqual([]);
    },
  );
});

describe('stripComments', () => {
  it('removes line and block comments but keeps line breaks', () => {
    const stripped = stripComments('a // gone\nb /* gone\nalso */ c');
    expect(stripped).not.toContain('gone');
    expect(stripped.split('\n')).toHaveLength(3);
    expect(stripped.replace(/\s+/g, ' ').trim()).toBe('a b c');
  });

  it('keeps comment markers inside string and template literals', () => {
    const source = "const a = '//'; const b = \"/* x */\"; const c = `http://y`; const d = 'it\\'s // fine';";
    expect(stripComments(source)).toBe(source);
  });

  it('resumes stripping after a string that holds a marker', () => {
    expect(stripComments("const a = '//'; // note")).toBe("const a = '//'; ");
  });

  it('copes with an unterminated block comment', () => {
    expect(stripComments('a /* never closed').trim()).toBe('a');
  });
});

describe('findViolations', () => {
  it.each([
    ["import { Kind } from '@/shared/api/types';", 'value import of the contract types'],
    ["import x from 'react';", 'react'],
    ["import { 'convert' as convert } from 'decimal.js';", 'a quoted import name'],
    ["export { default as 'decimal' } from 'decimal.js';", 'a quoted export name'],
    ["export { x } from 'lodash';", 're-export from a package'],
    ["export * from '../hooks';", 're-export from outside the model'],
    ["const m = import('./reducer');", 'dynamic import'],
    ["import { deepFreeze } from './testing';", 'the test helper'],
    ["import { x } from './missing';", 'a relative file that is not a model file'],
    ["import { x } from '@/shared/api';", 'the API barrel'],
    ["import '@/shared/api/types';", 'a bare import of the contract types'],
    ["const x = require('./entry');", 'require'],
    ['const y = Number(x);', 'Number('],
    ['const y = Number.parseInt(x);', 'Number.'],
    ['const y = parseFloat(x);', 'parseFloat'],
    ['const y = parseInt(x, 10);', 'parseInt'],
    ['const y = BigInt(x);', 'BigInt'],
    ['const y = new Intl.NumberFormat();', 'Intl'],
    ['const y = eval(x);', 'eval'],
    ['const y = Math.max(a, b);', 'Math.max'],
    ['const y = Math.random();', 'Math.random'],
    ['const w = window.x;', 'window'],
    ['const d = document.body;', 'document'],
    ['const s = localStorage.getItem(k);', 'localStorage'],
    ['const s = sessionStorage.getItem(k);', 'sessionStorage'],
    ['const r = fetch(url);', 'fetch'],
    ['setTimeout(f, 1);', 'setTimeout'],
    ['setInterval(f, 1);', 'setInterval'],
    ['const d = new Date();', 'Date'],
    ['const c = crypto.randomUUID();', 'crypto'],
    ["const f = globalThis['fetch'];", 'globalThis'],
  ])('flags %s (%s)', (source) => {
    expect(findViolations(source)).not.toEqual([]);
  });

  it.each([
    ["import type { A } from '@/shared/api/types';", 'a type import of the contract types'],
    ["import type { A, B } from './types';", 'a type import of a model file'],
    ["import { HISTORY_LIMIT } from './types';", 'a value import of a model file'],
    ['import type {\n  A,\n  B,\n} from "./types";', 'a multi-line type import'],
    ["export type { A } from './types';", 'a type re-export'],
    ["import { OPERATIONS, isDecimal } from './operations';", 'two values from a model file'],
    ['const evaluate = 1;', 'evaluate is not eval'],
    ['const documented = 2;', 'documented is not document'],
    ['const dated = 3, Dated = 4, Datelike = 5;', 'words that merely contain Date'],
    ['const numbers = [1];', 'numbers is not Number'],
    ['// uses window, Number(x), Math.max and fetch\nconst a = 1;', 'a forbidden word in a line comment'],
    ['/* parseInt BigInt Intl.NumberFormat\n eval */ const a = 1;', 'a forbidden word in a block comment'],
    ["// import x from 'react';\nconst a = 1;", 'an import in a comment'],
    ['const a = Array.from(b);', 'Array.from is not an import'],
  ])('accepts %s (%s)', (source) => {
    expect(findViolations(source)).toEqual([]);
  });

  it('reports each broken rule once per occurrence kind', () => {
    const violations = findViolations("import x from 'react';\nconst y = Number(x) + Math.max(1, 2);");
    expect(violations).toEqual(
      expect.arrayContaining([
        'import from react is outside the model',
        'forbidden word react',
        'forbidden word Number',
        'forbidden word Math',
      ]),
    );
  });
});
