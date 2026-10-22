import type { HistoryEntry } from './types';
import { HISTORY_LIMIT, MAX_HISTORY_ID_LENGTH } from './types';
import { OPERATIONS, isDecimal, isOperationName } from './operations';

/** Raw values longer than this (UTF-16 code units) are not parsed. */
export const MAX_HISTORY_RAW_LENGTH = 65536;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Reads an own property only, so inherited names and `__proto__` never satisfy a field. */
function own(record: UnknownRecord, key: string): unknown {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

/** A valid entry rebuilt with exactly the five fields, or null when anything is off. */
function toEntry(value: unknown): HistoryEntry | null {
  if (!isRecord(value)) return null;
  const id = own(value, 'id');
  const operation = own(value, 'operation');
  const operands = own(value, 'operands');
  const result = own(value, 'result');
  const inexact = own(value, 'inexact');
  if (typeof id !== 'string' || id.length < 1 || id.length > MAX_HISTORY_ID_LENGTH) return null;
  if (!isOperationName(operation)) return null;
  if (!Array.isArray(operands) || operands.length !== OPERATIONS[operation].arity) return null;
  // Array.from turns holes into undefined, which every() would otherwise skip.
  const list: unknown[] = Array.from(operands);
  if (!list.every(isDecimal)) return null;
  if (!isDecimal(result) || typeof inexact !== 'boolean') return null;
  return Object.freeze({
    id,
    operation,
    operands: Object.freeze(list.filter(isDecimal)),
    result,
    inexact,
  });
}

/**
 * Defensive read of the stored history. Any problem, from a missing value to a single malformed
 * entry or a repeated ID, yields an empty history; it never throws.
 */
export function decodeHistory(raw: string | null): readonly HistoryEntry[] {
  try {
    if (raw === null || raw === '' || raw.length > MAX_HISTORY_RAW_LENGTH) return Object.freeze([]);
    const envelope: unknown = JSON.parse(raw);
    if (!isRecord(envelope) || own(envelope, 'version') !== 1) return Object.freeze([]);
    const entries = own(envelope, 'entries');
    if (!Array.isArray(entries)) return Object.freeze([]);
    const decoded: HistoryEntry[] = [];
    const seen = new Set<string>();
    for (const item of entries) {
      const entry = toEntry(item);
      if (entry === null || seen.has(entry.id)) return Object.freeze([]);
      seen.add(entry.id);
      decoded.push(entry);
    }
    return Object.freeze(decoded.slice(0, HISTORY_LIMIT));
  } catch {
    return Object.freeze([]);
  }
}

/**
 * Serialises the history for storage. Entries `decodeHistory` would reject (including a later
 * repeat of an ID) are dropped first, then the newest 20 are kept, so one bad in-memory entry can
 * never empty the stored history on the next load.
 */
export function encodeHistory(entries: readonly HistoryEntry[]): string {
  const kept: HistoryEntry[] = [];
  const seen = new Set<string>();
  for (const item of entries) {
    const entry = toEntry(item);
    if (entry === null || seen.has(entry.id)) continue;
    seen.add(entry.id);
    kept.push(entry);
  }
  return JSON.stringify({
    version: 1,
    entries: kept.slice(0, HISTORY_LIMIT).map(({ id, operation, operands, result, inexact }) => ({
      id,
      operation,
      operands,
      result,
      inexact,
    })),
  });
}
