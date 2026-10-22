import { describe, expect, it } from 'vitest';
import { MAX_HISTORY_RAW_LENGTH, decodeHistory, encodeHistory } from './history';
import { deepFreeze } from './testing';
import type { HistoryEntry } from './types';

function item(id: string, overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  return { id, operation: 'add', operands: ['2', '3'], result: '5', inexact: false, ...overrides };
}

/** An entry with arbitrary, possibly invalid, field values; only for exercising the filters. */
function broken(id: string, overrides: Record<string, unknown>): HistoryEntry {
  return { ...item(id), ...overrides };
}

function envelope(entries: unknown, version: unknown = 1): string {
  return JSON.stringify({ version, entries });
}

const EVERY_OPERATION: readonly HistoryEntry[] = [
  { id: 'op-add', operation: 'add', operands: ['0.1', '0.2'], result: '0.3', inexact: false },
  { id: 'op-sub', operation: 'subtract', operands: ['-5', '1e+21'], result: '-1e+21', inexact: true },
  { id: 'op-mul', operation: 'multiply', operands: ['12', '-3'], result: '-36', inexact: false },
  {
    id: 'op-div',
    operation: 'divide',
    operands: ['1', '3'],
    result: '0.3333333333333333333333333333333333',
    inexact: true,
  },
  { id: 'op-pow', operation: 'power', operands: ['2', '10'], result: '1024', inexact: false },
  { id: 'op-sqrt', operation: 'sqrt', operands: ['16'], result: '4', inexact: false },
  { id: 'op-pct', operation: 'percentage', operands: ['-2.5e-10'], result: '-2.5e-12', inexact: true },
];

describe('encodeHistory', () => {
  it('writes the exact envelope for one entry', () => {
    expect(encodeHistory([item('h-1')])).toBe(
      '{"version":1,"entries":[{"id":"h-1","operation":"add","operands":["2","3"],"result":"5","inexact":false}]}',
    );
  });

  it('writes an empty history as an empty list', () => {
    expect(encodeHistory([])).toBe('{"version":1,"entries":[]}');
  });

  it('is deterministic and rebuilds the five fields in a fixed order, dropping extras', () => {
    const messy = {
      extra: 'dropped',
      inexact: false,
      result: '5',
      operands: ['2', '3'],
      operation: 'add',
      id: 'h-1',
    };
    const expected = encodeHistory([item('h-1')]);
    expect(encodeHistory([messy as HistoryEntry])).toBe(expected);
    expect(encodeHistory([messy as HistoryEntry])).toBe(expected);
  });

  it('keeps only the first 20 entries', () => {
    const many = Array.from({ length: 25 }, (_, index) => item(`h-${String(index)}`));
    const decoded = decodeHistory(encodeHistory(many));
    expect(decoded.map((entry) => entry.id)).toEqual(many.slice(0, 20).map((entry) => entry.id));
  });

  it('drops the entries the decoder would reject and then caps at 20', () => {
    const entries = [
      broken('', {}),
      item('x'.repeat(129)),
      broken('bad-op', { operation: 'modulo' }),
      broken('bad-proto', { operation: '__proto__' }),
      broken('bad-arity-1', { operands: ['1'] }),
      broken('bad-arity-3', { operation: 'sqrt', operands: ['1', '2'] }),
      broken('bad-operand', { operands: ['1,000', '2'] }),
      broken('bad-result', { result: '1.' }),
      broken('bad-inexact', { inexact: 'false' }),
      broken('bad-operands-type', { operands: 'ab' }),
      ...Array.from({ length: 22 }, (_, index) => item(`ok-${String(index)}`)),
    ];
    const decoded = decodeHistory(encodeHistory(entries));
    expect(decoded.map((entry) => entry.id)).toEqual(Array.from({ length: 20 }, (_, index) => `ok-${String(index)}`));
  });

  it('drops a later entry that repeats an earlier ID and keeps the earlier one', () => {
    const entries = [item('same', { result: '5' }), item('other'), item('same', { result: '6' })];
    const decoded = decodeHistory(encodeHistory(entries));
    expect(decoded).toEqual([item('same', { result: '5' }), item('other')]);
  });

  it('never lets one bad entry empty the stored history', () => {
    const stored = encodeHistory([item('a'), broken('b', { result: 'NaN' }), item('c')]);
    expect(decodeHistory(stored).map((entry) => entry.id)).toEqual(['a', 'c']);
  });

  it('drops an entry with holes in its operands and keeps its neighbours', () => {
    const sparse: HistoryEntry = { ...item('sparse'), operands: new Array<string>(2) };
    const encoded = encodeHistory([item('a'), sparse, item('b')]);
    expect(decodeHistory(encoded).map((entry) => entry.id)).toEqual(['a', 'b']);
  });

  it('does not change a frozen input', () => {
    const entries = deepFreeze([item('a'), item('b')]);
    expect(() => encodeHistory(entries)).not.toThrow();
    expect(entries).toHaveLength(2);
  });
});

describe('decodeHistory round trip', () => {
  it('restores all seven operations with inexact, negative and scientific values', () => {
    expect(decodeHistory(encodeHistory(EVERY_OPERATION))).toEqual(EVERY_OPERATION);
  });

  it('restores the capped, filtered list that was encoded', () => {
    const many = Array.from({ length: 21 }, (_, index) => item(`h-${String(index)}`));
    expect(decodeHistory(encodeHistory(many))).toEqual(many.slice(0, 20));
  });

  it('accepts a syntactically valid but tiny exponent result', () => {
    const tiny = item('tiny', { result: '1e-9999' });
    expect(decodeHistory(encodeHistory([tiny]))).toEqual([tiny]);
  });

  it('accepts operands and results of exactly 128 characters', () => {
    const long = item('long', { operands: ['1'.repeat(128), '2'], result: '-' + '9'.repeat(127) });
    expect(decodeHistory(encodeHistory([long]))).toEqual([long]);
  });

  it('accepts an ID of exactly 128 characters and a single character', () => {
    const entries = [item('i'.repeat(128)), item('j')];
    expect(decodeHistory(encodeHistory(entries))).toEqual(entries);
  });
});

describe('decodeHistory output', () => {
  it('freezes the list, every entry and every operands array', () => {
    const decoded = decodeHistory(encodeHistory(EVERY_OPERATION));
    expect(Object.isFrozen(decoded)).toBe(true);
    for (const entry of decoded) {
      expect(Object.isFrozen(entry)).toBe(true);
      expect(Object.isFrozen(entry.operands)).toBe(true);
    }
  });

  it('freezes the empty list returned for rejected input too', () => {
    expect(Object.isFrozen(decodeHistory(null))).toBe(true);
    expect(Object.isFrozen(decodeHistory('{'))).toBe(true);
  });

  it('keeps exactly the five fields, ignoring unknown properties on entries and on the envelope', () => {
    const raw = JSON.stringify({
      version: 1,
      note: 'ignored',
      entries: [{ id: 'a', operation: 'add', operands: ['1', '2'], result: '3', inexact: false, extra: 1, other: [] }],
    });
    const decoded = decodeHistory(raw);
    expect(decoded).toHaveLength(1);
    expect(Object.keys(decoded[0] ?? {})).toEqual(['id', 'operation', 'operands', 'result', 'inexact']);
  });

  it('keeps the first 20 of a valid longer list, in order', () => {
    const many = Array.from({ length: 25 }, (_, index) => item(`h-${String(index)}`));
    const decoded = decodeHistory(envelope(many));
    expect(decoded).toHaveLength(20);
    expect(decoded.map((entry) => entry.id)).toEqual(many.slice(0, 20).map((entry) => entry.id));
  });

  it('keeps all of a list of exactly 20', () => {
    const twenty = Array.from({ length: 20 }, (_, index) => item(`h-${String(index)}`));
    expect(decodeHistory(envelope(twenty))).toHaveLength(20);
  });

  it('rejects the whole list for a malformed entry or a duplicate ID beyond the first 20', () => {
    const many = Array.from({ length: 22 }, (_, index) => item(`h-${String(index)}`));
    expect(decodeHistory(envelope([...many.slice(0, 21), broken('late', { result: 'x' })]))).toEqual([]);
    expect(decodeHistory(envelope([...many, item('h-3')]))).toEqual([]);
  });
});

describe('decodeHistory rejects the whole envelope', () => {
  it.each([
    ['null', null],
    ['an empty string', ''],
    ['whitespace only', '   '],
    ['an unterminated object', '{'],
    ['the JSON null', 'null'],
    ['a JSON number', '1'],
    ['a JSON string', '"x"'],
    ['an empty array', '[]'],
    ['an array of entries instead of an envelope', JSON.stringify([item('a')])],
    ['an empty object', '{}'],
    ['trailing garbage', envelope([]) + 'x'],
    ['a BOM-prefixed value', '﻿' + envelope([])],
  ])('for %s', (_label, raw) => {
    expect(decodeHistory(raw)).toEqual([]);
  });

  it.each([
    ['version 2', envelope([item('a')], 2)],
    ['version "1" as text', envelope([item('a')], '1')],
    ['version 1.5', envelope([item('a')], 1.5)],
    ['version null', envelope([item('a')], null)],
    ['version true', envelope([item('a')], true)],
    ['version [1]', envelope([item('a')], [1])],
    ['no version', JSON.stringify({ entries: [item('a')] })],
  ])('for %s', (_label, raw) => {
    expect(decodeHistory(raw)).toEqual([]);
  });

  it.each([
    ['no entries', JSON.stringify({ version: 1 })],
    ['entries null', envelope(null)],
    ['entries an object', envelope({ 0: item('a') })],
    ['entries a string', envelope('abc')],
    ['entries a number', envelope(3)],
  ])('for %s', (_label, raw) => {
    expect(decodeHistory(raw)).toEqual([]);
  });

  it.each([
    ['null', null],
    ['an array', []],
    ['an array holding a valid entry', [item('a')]],
    ['a number', 5],
    ['a string', 'a'],
    ['a boolean', true],
  ])('for an entry that is %s', (_label, value) => {
    expect(decodeHistory(envelope([item('ok'), value]))).toEqual([]);
  });

  it.each(['id', 'operation', 'operands', 'result', 'inexact'])('for an entry without %s', (field) => {
    const entry: Record<string, unknown> = { ...item('a') };
    Reflect.deleteProperty(entry, field);
    expect(decodeHistory(envelope([entry]))).toEqual([]);
  });

  it.each([
    ['id', 1],
    ['id', null],
    ['id', ['a']],
    ['operation', 5],
    ['operation', null],
    ['operands', 'ab'],
    ['operands', null],
    ['operands', { 0: '2', 1: '3', length: 2 }],
    ['result', 5],
    ['result', null],
    ['result', ['5']],
    ['inexact', 'false'],
    ['inexact', 0],
    ['inexact', null],
    ['inexact', 'true'],
  ])('for %s of the wrong type (%j)', (field, value) => {
    expect(decodeHistory(envelope([{ ...item('a'), [field]: value }]))).toEqual([]);
  });

  it('for an empty ID', () => {
    expect(decodeHistory(envelope([item('')]))).toEqual([]);
  });

  it('for an ID of 129 characters', () => {
    expect(decodeHistory(envelope([item('i'.repeat(129))]))).toEqual([]);
  });

  it.each(['modulo', 'ADD', '', ' add', '__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf'])(
    'for the operation %j',
    (operation) => {
      expect(decodeHistory(envelope([{ ...item('a'), operation }]))).toEqual([]);
    },
  );

  it.each([
    ['add with one operand', { operation: 'add', operands: ['1'] }],
    ['add with three operands', { operation: 'add', operands: ['1', '2', '3'] }],
    ['add with none', { operation: 'add', operands: [] }],
    ['sqrt with two operands', { operation: 'sqrt', operands: ['1', '2'] }],
    ['percentage with none', { operation: 'percentage', operands: [] }],
    ['power with one operand', { operation: 'power', operands: ['2'] }],
  ])('for the wrong arity: %s', (_label, fields) => {
    expect(decodeHistory(envelope([{ ...item('a'), ...fields }]))).toEqual([]);
  });

  describe.each([
    ['1,000'],
    [' 1'],
    ['1 '],
    ['1.'],
    ['.5'],
    ['01'],
    ['+1'],
    ['NaN'],
    ['Infinity'],
    ['−1'],
    ['<b>1</b>'],
    ['1'.repeat(129)],
    [''],
  ])('for the invalid decimal %j', (bad) => {
    it('as an operand', () => {
      expect(decodeHistory(envelope([{ ...item('a'), operands: [bad, '2'] }]))).toEqual([]);
      expect(decodeHistory(envelope([{ ...item('a'), operands: ['2', bad] }]))).toEqual([]);
    });

    it('as the result', () => {
      expect(decodeHistory(envelope([{ ...item('a'), result: bad }]))).toEqual([]);
    });
  });

  it('for a number where a decimal text is required', () => {
    expect(decodeHistory(envelope([{ ...item('a'), operands: [1, '2'] }]))).toEqual([]);
    expect(decodeHistory(envelope([{ ...item('a'), result: 1 }]))).toEqual([]);
  });

  it('for duplicate IDs', () => {
    expect(decodeHistory(envelope([item('a'), item('b'), item('a')]))).toEqual([]);
    expect(decodeHistory(envelope([item('a'), item('a')]))).toEqual([]);
  });

  it('for one bad entry among good ones', () => {
    expect(decodeHistory(envelope([item('a'), broken('b', { result: 'oops' }), item('c')]))).toEqual([]);
  });

  it('for an entry whose fields come only from a __proto__ key', () => {
    const raw =
      '{"version":1,"entries":[{"__proto__":{"id":"a","operation":"add","operands":["1","2"],"result":"3","inexact":false}}]}';
    expect(decodeHistory(raw)).toEqual([]);
  });

  it('for an envelope whose entries come only from a __proto__ key', () => {
    const raw =
      '{"version":1,"__proto__":{"entries":[{"id":"a","operation":"add","operands":["1","2"],"result":"3","inexact":false}]}}';
    expect(decodeHistory(raw)).toEqual([]);
  });

  it('for an entry that inherits a field it does not own', () => {
    const raw =
      '{"version":1,"entries":[{"id":"a","operation":"add","operands":["1","2"],"inexact":false,"__proto__":{"result":"3"}}]}';
    expect(decodeHistory(raw)).toEqual([]);
  });
});

describe('decodeHistory raw length limit', () => {
  const valid = envelope([item('a')]);

  it('accepts a value of exactly 65,536 code units', () => {
    const raw = valid + ' '.repeat(MAX_HISTORY_RAW_LENGTH - valid.length);
    expect(raw).toHaveLength(65536);
    expect(decodeHistory(raw)).toEqual([item('a')]);
  });

  it('rejects a valid value of 65,537 code units', () => {
    const raw = valid + ' '.repeat(MAX_HISTORY_RAW_LENGTH + 1 - valid.length);
    expect(raw).toHaveLength(65537);
    expect(decodeHistory(raw)).toEqual([]);
  });

  it('exposes the limit', () => {
    expect(MAX_HISTORY_RAW_LENGTH).toBe(65536);
  });
});

describe('decodeHistory never throws', () => {
  it('returns a list for deterministic garbage of every shape', () => {
    const alphabet = '{}[]":,0123456789abcdefnult-+.eE \\\n_1/*−';
    let seed = 12345;
    const next = (bound: number): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % bound;
    };
    for (let round = 0; round < 500; round += 1) {
      const length = next(80);
      let raw = '';
      for (let index = 0; index < length; index += 1) raw += alphabet.charAt(next(alphabet.length));
      expect(() => decodeHistory(raw)).not.toThrow();
      expect(Array.isArray(decodeHistory(raw))).toBe(true);
    }
  });

  it('returns a list for truncated valid values', () => {
    const valid = encodeHistory(EVERY_OPERATION);
    for (let cut = 0; cut < valid.length; cut += 7) {
      expect(() => decodeHistory(valid.slice(0, cut))).not.toThrow();
      expect(decodeHistory(valid.slice(0, cut))).toEqual([]);
    }
  });
});
