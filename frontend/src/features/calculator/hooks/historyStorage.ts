import { decodeHistory, encodeHistory } from '../model/history';
import { HISTORY_STORAGE_KEY } from '../model/types';
import type { HistoryEntry } from '../model/types';
import { safeStorage } from '@/shared/storage/safeStorage';

export function loadHistory(): readonly HistoryEntry[] {
  return decodeHistory(safeStorage.get(HISTORY_STORAGE_KEY));
}
export function saveHistory(entries: readonly HistoryEntry[]): void {
  safeStorage.set(HISTORY_STORAGE_KEY, encodeHistory(entries));
}
