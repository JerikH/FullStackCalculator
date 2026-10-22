import { StrictMode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { installMatchMedia } from '@/test/matchMedia';
import { THEME_STORAGE_KEY } from './theme';
import { useTheme } from './useTheme';
it('initializes from storage under StrictMode without writing', () => {
  window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
  const setItem = vi.spyOn(Storage.prototype, 'setItem');
  const { result } = renderHook(useTheme, { wrapper: StrictMode });
  expect(result.current.theme).toBe('dark');
  expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  expect(setItem).not.toHaveBeenCalled();
});
it('persists and applies every transition, returning to attribute-free system', () => {
  const { result } = renderHook(useTheme, { wrapper: StrictMode });
  const setter = Object.entries(result.current).find(([key]) => key === 'setTheme');
  for (const theme of ['light', 'dark', 'system'] as const) {
    act(() => {
      result.current.setTheme(theme);
    });
    expect(result.current.theme).toBe(theme);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe(theme);
    expect(document.documentElement.getAttribute('data-theme')).toBe(theme === 'system' ? null : theme);
    expect(Object.entries(result.current).find(([key]) => key === 'setTheme')).toEqual(setter);
  }
  expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
});
it('keeps explicit light with a dark system preference and installs no listener', () => {
  const media = installMatchMedia(false);
  try {
    const { result } = renderHook(useTheme, { wrapper: StrictMode });
    act(() => {
      result.current.setTheme('light');
      media.set(true);
    });
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(media.listenerCount()).toBe(0);
  } finally {
    media.restore();
  }
});
it('applies session changes even when writes throw', () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('quota');
  });
  const { result } = renderHook(useTheme, { wrapper: StrictMode });
  act(() => {
    result.current.setTheme('light');
  });
  expect(result.current.theme).toBe('light');
  expect(document.documentElement.getAttribute('data-theme')).toBe('light');
});
