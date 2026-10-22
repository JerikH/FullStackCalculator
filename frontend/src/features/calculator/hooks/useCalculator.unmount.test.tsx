import type * as ReactModule from 'react';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { apiWrapper, createFakeApi, networkError, success } from '@/test/calculatorFake';
import { commandForKey } from '../model/keypad';
import type { CalculatorAction, CalculatorState } from '../model/types';
import { useCalculator } from './useCalculator';

const { dispatches } = vi.hoisted(() => ({
  dispatches: [] as Mock<(action: CalculatorAction) => void>[],
}));
vi.mock('react', async (importOriginal) => {
  const real = await importOriginal<typeof ReactModule>();
  return {
    ...real,
    useReducer(
      reducer: (state: CalculatorState, action: CalculatorAction) => CalculatorState,
      initialArg: undefined,
      init: () => CalculatorState,
    ) {
      const [state, dispatch] = real.useReducer(reducer, initialArg, init);
      const observedDispatch = real.useMemo(() => {
        const wrapped = vi.fn((action: CalculatorAction) => {
          dispatch(action);
        });
        dispatches.push(wrapped);
        return wrapped;
      }, [dispatch]);
      return [state, observedDispatch];
    },
  };
});
beforeEach(() => {
  dispatches.length = 0;
});

it.each([success('add', ['2', '3'], '5'), networkError()])(
  'never dispatches a late completion after unmount %#',
  async (outcome) => {
    const api = createFakeApi({ ignoreAbort: true });
    const { result, unmount } = renderHook(useCalculator, { wrapper: apiWrapper(api, { strict: false }) });
    act(() => {
      for (const key of ['2', '+', '3', '=']) {
        const command = commandForKey(key);
        if (!command) throw new Error('Missing fixture binding');
        result.current.execute(command);
      }
    });
    expect(api.calls).toHaveLength(1);
    const call = api.calls[0];
    if (!call) throw new Error('Missing request');
    expect(call.signal?.aborted).toBe(false);
    expect(dispatches).toHaveLength(1);
    const dispatch = dispatches[0];
    if (!dispatch) throw new Error('Missing observed dispatch');
    expect(dispatch).toHaveBeenCalledTimes(4);
    unmount();
    expect(call.signal?.aborted).toBe(true);
    for (const observed of dispatches) observed.mockClear();
    await act(async () => {
      call.resolve(outcome);
      await Promise.resolve();
    });
    const actions = dispatches.flatMap((observed) => observed.mock.calls.map(([action]) => action));
    expect(
      actions.filter((action) => action.type === 'calculationSucceeded' || action.type === 'calculationFailed'),
    ).toEqual([]);
    expect(actions).toEqual([]);
  },
);
