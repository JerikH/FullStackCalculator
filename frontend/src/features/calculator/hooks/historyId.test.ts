import { afterEach, expect, it, vi } from 'vitest';
import { newHistoryId } from './historyId';
afterEach(() => {
  vi.unstubAllGlobals();
});
it('uses randomUUID when available', () => {
  const randomUUID = vi.fn(() => 'uuid-fixture');
  vi.stubGlobal('crypto', { randomUUID });
  expect(newHistoryId()).toBe('uuid-fixture');
  expect(randomUUID).toHaveBeenCalledOnce();
});
it('uses 16 random bytes as lowercase hex without randomUUID', () => {
  const getRandomValues = vi.fn((bytes: Uint8Array) => {
    bytes.fill(171);
    return bytes;
  });
  vi.stubGlobal('crypto', { randomUUID: undefined, getRandomValues });
  expect(newHistoryId()).toBe('abababababababababababababababab');
  expect(getRandomValues).toHaveBeenCalledWith(expect.any(Uint8Array));
});
it('creates 1000 unique bounded nonempty fallback ids even at the same time', () => {
  vi.stubGlobal('crypto', undefined);
  vi.spyOn(Date, 'now').mockReturnValue(1234);
  const ids = Array.from({ length: 1000 }, () => newHistoryId());
  expect(new Set(ids).size).toBe(1000);
  for (const id of ids) {
    expect(id.length).toBeGreaterThanOrEqual(1);
    expect(id.length).toBeLessThanOrEqual(128);
  }
});
it('falls back to a counter id when crypto throws', () => {
  vi.stubGlobal('crypto', {
    randomUUID: () => {
      throw new Error('not a secure context');
    },
  });
  const first = newHistoryId();
  const second = newHistoryId();
  expect(first).not.toBe('');
  expect(second).not.toBe(first);
  expect(first.length).toBeLessThanOrEqual(128);
});
