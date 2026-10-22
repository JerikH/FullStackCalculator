import { expect, it, vi } from 'vitest';
import { applyTheme, readTheme, THEME_STORAGE_KEY, writeTheme } from './theme';
it.each(['system', 'light', 'dark', 'junk', '', 'LIGHT', null])('reads stored %s', (stored) => {
  if (stored !== null) window.localStorage.setItem(THEME_STORAGE_KEY, stored);
  expect(readTheme()).toBe(stored === 'light' || stored === 'dark' ? stored : 'system');
});
it('defaults to system when storage throws', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('denied');
  });
  expect(readTheme()).toBe('system');
});
it.each(['light', 'dark'] as const)('applies %s', (theme) => {
  applyTheme(theme);
  expect(document.documentElement.getAttribute('data-theme')).toBe(theme);
});
it('removes the attribute for system', () => {
  applyTheme('dark');
  applyTheme('system');
  expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
});
it('stores the theme', () => {
  writeTheme('dark');
  expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
});
