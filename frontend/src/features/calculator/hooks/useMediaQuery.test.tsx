import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { installMatchMedia } from '@/test/matchMedia';
import type { MatchMediaController } from '@/test/matchMedia';
import { useMediaQuery } from './useMediaQuery';

describe('useMediaQuery', () => {
  let media: MatchMediaController | undefined;
  afterEach(() => {
    media?.restore();
    media = undefined;
  });

  it.each([true, false])('starts with the current answer (%s)', (matches) => {
    media = installMatchMedia(matches);
    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'));
    expect(result.current).toBe(matches);
  });

  it('follows change events', () => {
    media = installMatchMedia(false);
    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'));
    act(() => {
      media?.set(true);
    });
    expect(result.current).toBe(true);
    act(() => {
      media?.set(false);
    });
    expect(result.current).toBe(false);
  });

  it('removes its listener on unmount', () => {
    media = installMatchMedia(false);
    const { unmount } = renderHook(() => useMediaQuery('(min-width: 768px)'));
    expect(media.listenerCount()).toBe(1);
    unmount();
    expect(media.listenerCount()).toBe(0);
  });

  it('is false, without throwing, where matchMedia is not a function', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'matchMedia');
    Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: undefined });
    try {
      const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'));
      expect(result.current).toBe(false);
    } finally {
      if (original) Object.defineProperty(window, 'matchMedia', original);
    }
  });
});
