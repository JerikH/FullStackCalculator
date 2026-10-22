import { expect, it, vi } from 'vitest';
import { HISTORY_STORAGE_KEY } from '../model/types';
import type { HistoryEntry } from '../model/types';
import { loadHistory, saveHistory } from './historyStorage';
const entries: readonly HistoryEntry[] = [
  { id: 'saved', operation: 'add', operands: ['0.1', '0.2'], result: '0.3', inexact: false },
];
it('loads a valid preload', () => {
  window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify({ version: 1, entries }));
  expect(loadHistory()).toEqual(entries);
});
it.each([null, '{', '{"version":2,"entries":[]}'])('loads empty for absent or invalid preload %s', (raw) => {
  if (raw !== null) window.localStorage.setItem(HISTORY_STORAGE_KEY, raw);
  expect(loadHistory()).toEqual([]);
});
it('round trips saved history', () => {
  saveHistory(entries);
  expect(loadHistory()).toEqual(entries);
});
it('writes the empty version-1 envelope on clear', () => {
  saveHistory(entries);
  saveHistory([]);
  expect(window.localStorage.getItem(HISTORY_STORAGE_KEY)).toBe('{"version":1,"entries":[]}');
});
it('tolerates denied getItem', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('denied');
  });
  expect(loadHistory()).toEqual([]);
});
it('tolerates quota errors', () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('quota', 'QuotaExceededError');
  });
  expect(() => {
    saveHistory(entries);
  }).not.toThrow();
});
it('tolerates the storage getter throwing', () => {
  const getter = vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
    throw new Error('denied');
  });
  expect(loadHistory()).toEqual([]);
  expect(() => {
    saveHistory(entries);
  }).not.toThrow();
  getter.mockRestore();
});
