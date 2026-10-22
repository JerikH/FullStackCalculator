import { afterEach, describe, expect, it, vi } from 'vitest';
import { safeStorage } from './safeStorage';

describe('safeStorage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('round-trips values through localStorage', () => {
    safeStorage.set('k', 'v');
    expect(safeStorage.get('k')).toBe('v');
    safeStorage.remove('k');
    expect(safeStorage.get('k')).toBeNull();
  });

  it('swallows storage failures', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    expect(safeStorage.get('k')).toBeNull();
    expect(() => {
      safeStorage.set('k', 'v');
    }).not.toThrow();
    expect(() => {
      safeStorage.remove('k');
    }).not.toThrow();
  });

  it('swallows failures when localStorage itself is unavailable', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    try {
      expect(safeStorage.get('k')).toBeNull();
      expect(() => {
        safeStorage.set('k', 'v');
      }).not.toThrow();
      expect(() => {
        safeStorage.remove('k');
      }).not.toThrow();
    } finally {
      vi.restoreAllMocks();
    }
  });
});
