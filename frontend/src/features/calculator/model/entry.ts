import { MAX_DECIMAL_LENGTH } from './operations';
import { MAX_ENTRY_DIGITS } from './types';
import type { Digit } from './types';

export function countDigits(entry: string): number {
  return entry.replace(/[^0-9]/g, '').length;
}
export function appendDigit(entry: string, digit: Digit): string {
  if (/[eE]/.test(entry)) return entry;
  if (entry === '0') return digit;
  if (entry === '-0') return '-' + digit;
  return countDigits(entry) >= MAX_ENTRY_DIGITS ? entry : entry + digit;
}
export function appendDecimalPoint(entry: string): string {
  return /[.eE]/.test(entry) ? entry : entry + '.';
}
export function toggleSign(entry: string): string {
  if (entry === '0') return entry;
  if (entry.startsWith('-')) return entry.slice(1);
  return entry.length >= MAX_DECIMAL_LENGTH ? entry : '-' + entry;
}
export function backspace(entry: string): string {
  const shortened = entry.slice(0, -1);
  return shortened === '' || shortened === '-' || shortened === '-0' ? '0' : shortened;
}
export function toOperand(entry: string): string {
  return entry.endsWith('.') ? entry.slice(0, -1) : entry;
}
