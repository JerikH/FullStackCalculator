import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { apiWrapper, createFakeApi, success } from '@/test/calculatorFake';
import { calculatorReducer } from '../model/reducer';
import type * as ReducerModule from '../model/reducer';
import { useCalculator } from './useCalculator';
vi.mock('../model/reducer', async (importOriginal) => {
  const real = await importOriginal<typeof ReducerModule>();
  // Avoid importing testing.ts back through this mocked module.
  const { actionForCommand, commandForKey } = await import('../model/keypad');
  return {
    ...real,
    calculatorReducer: vi.fn(real.calculatorReducer),
    createInitialState: () =>
      ['2', '+', '3', '='].reduce((state, key) => {
        const command = commandForKey(key);
        if (!command) throw new Error('Missing fixture binding');
        return real.calculatorReducer(state, actionForCommand(command));
      }, real.createInitialState()),
  };
});
it('replays in-flight effects under StrictMode and accepts only the active completion', async () => {
  const api = createFakeApi({ ignoreAbort: true });
  const { result } = renderHook(useCalculator, { wrapper: apiWrapper(api), reactStrictMode: true });
  expect(api.calls).toHaveLength(2);
  expect(api.calls[0]?.signal?.aborted).toBe(true);
  expect(api.calls[1]?.signal?.aborted).toBe(false);
  const first = api.calls[0];
  const second = api.calls[1];
  if (!first || !second) throw new Error('Missing replay calls');
  await act(async () => {
    first.resolve(success('add', ['2', '3'], '99'));
    second.resolve(success('add', ['2', '3'], '5'));
    await Promise.resolve();
  });
  expect(result.current.display.value).toBe('5');
  expect(result.current.history).toHaveLength(1);
  expect(result.current.history[0]?.result).toBe('5');
  // React replays each reducer invocation; one dispatched completion is observed twice.
  const completions = vi
    .mocked(calculatorReducer)
    .mock.calls.map(([, action]) => action)
    .filter((action) => action.type === 'calculationSucceeded' || action.type === 'calculationFailed');
  expect(completions).toHaveLength(2);
  expect(new Set(completions).size).toBe(1);
});
