import { describe, expect, it } from 'vitest';
import { appendDecimalPoint, appendDigit, backspace, countDigits, toggleSign, toOperand } from './entry';
import { isDecimal } from './operations';
import type { Digit } from './types';

describe('entry editing', () => {
  it.each<[string, Digit, string]>([
    ['0', '7', '7'],
    ['0', '0', '0'],
    ['-0', '7', '-7'],
    ['12', '3', '123'],
    ['0.', '5', '0.5'],
    ['-12.0', '0', '-12.00'],
    ['1'.repeat(34), '2', '1'.repeat(34)],
    ['0.' + '1'.repeat(33), '2', '0.' + '1'.repeat(33)],
    ['-' + '1'.repeat(32) + '.1', '2', '-' + '1'.repeat(32) + '.12'],
    ['1e+21', '2', '1e+21'],
    ['1E-2', '3', '1E-2'],
  ])('appendDigit(%s, %s)', (entry, digit, expected) => {
    expect(appendDigit(entry, digit)).toBe(expected);
  });
  it.each([
    ['0', '0.'],
    ['-12', '-12.'],
    ['1.2', '1.2'],
    ['1.', '1.'],
    ['1e+21', '1e+21'],
    ['1E2', '1E2'],
  ])('appendDecimalPoint(%s)', (entry, expected) => {
    expect(appendDecimalPoint(entry)).toBe(expected);
  });
  it.each([
    ['0', '0'],
    ['12', '-12'],
    ['-12', '12'],
    ['0.', '-0.'],
    ['-0', '0'],
    ['1e+21', '-1e+21'],
    ['-2.5e-10', '2.5e-10'],
    ['1'.repeat(128), '1'.repeat(128)],
    ['-' + '1'.repeat(127), '1'.repeat(127)],
  ])('toggleSign(%s)', (entry, expected) => {
    expect(toggleSign(entry)).toBe(expected);
  });
  it.each([
    ['12.3', '12.'],
    ['12.', '12'],
    ['5', '0'],
    ['-5', '0'],
    ['-0.1', '-0.'],
    ['-0.', '0'],
    ['0', '0'],
  ])('backspace(%s)', (entry, expected) => {
    expect(backspace(entry)).toBe(expected);
  });
  it.each([
    ['12.', '12'],
    ['-0.', '-0'],
    ['1e+21', '1e+21'],
    ['1.2300', '1.2300'],
    ['0', '0'],
  ])('toOperand(%s)', (entry, expected) => {
    expect(toOperand(entry)).toBe(expected);
  });
  it('counts digit characters', () => {
    expect(countDigits('-0.00120')).toBe(6);
    expect(countDigits('-.')).toBe(0);
  });
  it('keeps generated typing entries valid operands', () => {
    let entries = ['0'];
    for (let depth = 0; depth < 5; depth++) {
      entries = entries.flatMap((entry) => [
        appendDigit(entry, '0'),
        appendDigit(entry, '7'),
        appendDecimalPoint(entry),
        toggleSign(entry),
        backspace(entry),
      ]);
      for (const entry of entries) expect(isDecimal(toOperand(entry))).toBe(true);
    }
  });
});
