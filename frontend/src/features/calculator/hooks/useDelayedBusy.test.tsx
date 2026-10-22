import { StrictMode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { CalculationRequest } from '../model/types';
import { useDelayedBusy } from './useDelayedBusy';
const request: CalculationRequest = {
  id: 1,
  operation: 'add',
  operands: ['2', '3'],
  continuation: { kind: 'complete' },
};
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});
function mount() {
  return renderHook<boolean, { busy: boolean; request: CalculationRequest | null }>(
    (props: { busy: boolean; request: CalculationRequest | null }) => useDelayedBusy(props.busy, props.request),
    { initialProps: { busy: true, request }, wrapper: StrictMode },
  );
}
function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}
it('is hidden at 149ms and visible at 150ms', () => {
  const { result } = mount();
  advance(149);
  expect(result.current).toBe(false);
  advance(1);
  expect(result.current).toBe(true);
});
it('clears its timer when completion arrives at 100ms', () => {
  const { result, rerender } = mount();
  advance(100);
  rerender({ busy: false, request: null });
  expect(vi.getTimerCount()).toBe(0);
  advance(100);
  expect(result.current).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
});
it('hides immediately on AC', () => {
  const { result, rerender } = mount();
  advance(150);
  rerender({ busy: false, request: null });
  expect(result.current).toBe(false);
});
it('does not inherit a spinner on the first render of a replacement with the same id', () => {
  const seen: boolean[] = [];
  const { result, rerender } = renderHook(
    ({ token }) => {
      const shown = useDelayedBusy(true, token);
      seen.push(shown);
      return shown;
    },
    { initialProps: { token: request }, wrapper: StrictMode },
  );
  advance(150);
  expect(result.current).toBe(true);
  seen.length = 0;
  rerender({ token: { ...request } });
  expect(seen.every((shown) => !shown)).toBe(true);
  advance(149);
  expect(result.current).toBe(false);
  advance(1);
  expect(result.current).toBe(true);
});
it('clears pending timers on unmount', () => {
  const { unmount } = mount();
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});
it('never starts a timer without a request', () => {
  const { result } = renderHook(() => useDelayedBusy(true, null), { wrapper: StrictMode });
  expect(result.current).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
});
