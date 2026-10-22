import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  abortedError,
  apiWrapper,
  createFakeApi,
  networkError,
  problem,
  success,
  timeoutError,
  unexpectedError,
} from '@/test/calculatorFake';
import type { FakeApi } from '@/test/calculatorFake';
import type { ApiResult, CalculationResult } from '@/shared/api/types';
import { commandForKey } from '../model/keypad';
import { calculatorReducer } from '../model/reducer';
import type * as ReducerModule from '../model/reducer';
import { HISTORY_STORAGE_KEY } from '../model/types';
import type { HistoryEntry } from '../model/types';
import { useCalculator } from './useCalculator';
vi.mock('../model/reducer', async (importOriginal) => {
  const real = await importOriginal<typeof ReducerModule>();
  return { ...real, calculatorReducer: vi.fn(real.calculatorReducer) };
});
beforeEach(() => {
  vi.mocked(calculatorReducer).mockClear();
});
afterEach(() => {
  vi.useRealTimers();
});
const saved: HistoryEntry = { id: 'saved', operation: 'add', operands: ['0.1', '0.2'], result: '0.3', inexact: false };
function preload() {
  window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify({ version: 1, entries: [saved] }));
}
function mount(api = createFakeApi(), strict = true) {
  const hook = renderHook(useCalculator, { wrapper: apiWrapper(api, { strict }) });
  function press(...keys: string[]) {
    act(() => {
      for (const key of keys) {
        const command = commandForKey(key);
        if (!command) throw new Error(`Unbound key ${key}`);
        hook.result.current.execute(command);
      }
    });
  }
  return { ...hook, api, press };
}
async function settle(api: FakeApi, index: number, outcome: ApiResult<CalculationResult>) {
  const call = api.calls[index];
  if (!call) throw new Error('Missing call');
  await act(async () => {
    call.resolve(outcome);
    await Promise.resolve();
  });
}
function completions() {
  return vi
    .mocked(calculatorReducer)
    .mock.calls.map(([, action]) => action)
    .filter((action) => action.type === 'calculationSucceeded' || action.type === 'calculationFailed');
}
it('loads valid history with initial zero and no API call or mount write', () => {
  preload();
  const write = vi.spyOn(Storage.prototype, 'setItem');
  const { result, api } = mount();
  expect(result.current.history).toEqual([saved]);
  expect(result.current.display.value).toBe('0');
  expect(api.calls).toHaveLength(0);
  expect(write).not.toHaveBeenCalled();
});
it('sends exact decimal strings, remains busy and persists exactly one successful row', async () => {
  const { press, api, result } = mount();
  press('0', '.', '1', '+', '0', '.', '2', '=');
  expect(api.calls).toHaveLength(1);
  expect(api.calls[0]).toMatchObject({ operation: 'add', operands: ['0.1', '0.2'] });
  expect(result.current.busy).toBe(true);
  await settle(api, 0, success('add', ['0.1', '0.2'], '0.3'));
  expect(result.current.busy).toBe(false);
  expect(result.current.display.value).toBe('0.3');
  expect(result.current.history).toHaveLength(1);
  const entry = result.current.history[0];
  expect(entry).toMatchObject({ operation: 'add', operands: ['0.1', '0.2'], result: '0.3' });
  expect(entry?.id.length).toBeGreaterThan(0);
  expect(entry?.id.length).toBeLessThanOrEqual(128);
  expect(JSON.parse(window.localStorage.getItem(HISTORY_STORAGE_KEY) ?? 'null')).toEqual({
    version: 1,
    entries: result.current.history,
  });
});
it('performs unary and chain continuations and records every success', async () => {
  const { press, api, result } = mount();
  press('9', '+', '1', '6', 'r');
  expect(api.calls[0]).toMatchObject({ operation: 'sqrt', operands: ['16'] });
  await settle(api, 0, success('sqrt', ['16'], '4'));
  expect(result.current.history).toHaveLength(1);
  press('*');
  expect(api.calls[1]).toMatchObject({ operation: 'add', operands: ['9', '4'] });
  await settle(api, 1, success('add', ['9', '4'], '13'));
  expect(result.current.history).toHaveLength(2);
  press('2', '=');
  expect(api.calls[2]).toMatchObject({ operation: 'multiply', operands: ['13', '2'] });
  await settle(api, 2, success('multiply', ['13', '2'], '26'));
  expect(result.current.display.value).toBe('26');
  expect(result.current.history.map((entry) => entry.result)).toEqual(['26', '13', '4']);
  expect(api.calls).toHaveLength(3);
});
it('keeps the full literal inexact result', async () => {
  const { press, api, result } = mount();
  press('1', '/', '3', '=');
  await settle(api, 0, success('divide', ['1', '3'], '0.3333333333333333333333333333333333', true));
  expect(result.current.display.value).toBe('0.3333333333333333333333333333333333');
  expect(result.current.display.inexact).toBe(true);
});
it.each([
  [problem('DIVISION_BY_ZERO', 'req-1'), { message: 'Cannot divide by zero', requestId: 'req-1' }],
  [problem('DIVISION_BY_ZERO'), { message: 'Cannot divide by zero' }],
  [problem('DIVISION_BY_ZERO', ''), { message: 'Cannot divide by zero' }],
  [networkError(), { message: 'Calculator service is unreachable' }],
  [timeoutError(), { message: 'Calculator service timed out' }],
  [unexpectedError(), { message: 'Something went wrong' }],
])('maps API failure %# without adding history', async (outcome, expected) => {
  const { press, api, result } = mount();
  press('1', '/', '0', '=');
  await settle(api, 0, outcome);
  expect(result.current.display.error).toEqual(expected);
  expect(result.current.history).toEqual([]);
  expect(result.current.busy).toBe(false);
});
it('dispatches nothing for an explicit aborted outcome', async () => {
  const { press, api, result } = mount();
  press('2', '+', '3', '=');
  const before = result.current;
  await settle(api, 0, abortedError());
  expect(result.current.display).toEqual(before.display);
  expect(result.current.history).toBe(before.history);
  expect(result.current.busy).toBe(before.busy);
  expect(result.current.busy).toBe(true);
  expect(result.current.display.error).toBeNull();
  expect(completions()).toEqual([]);
});
it('AC aborts, resets and keeps history despite a late resolution', async () => {
  preload();
  const { press, api, result } = mount(createFakeApi({ ignoreAbort: true }));
  press('2', '+', '3', '=');
  press('Escape');
  expect(api.calls[0]?.signal?.aborted).toBe(true);
  expect(result.current.display.value).toBe('0');
  expect(result.current.history).toEqual([saved]);
  await settle(api, 0, success('add', ['2', '3'], '5'));
  expect(result.current.display.value).toBe('0');
  expect(result.current.history).toEqual([saved]);
  expect(completions()).toEqual([]);
});
it.each([success('add', ['2', '3'], '5'), networkError()])(
  'never dispatches a stale completion after AC and reused request id %#',
  async (oldOutcome) => {
    const { press, api, result } = mount(createFakeApi({ ignoreAbort: true }), false);
    press('2', '+', '3', '=');
    press('Escape');
    press('7', '+', '1', '=');
    await settle(api, 1, success('add', ['7', '1'], '8'));
    expect(completions()).toHaveLength(1);
    await settle(api, 0, oldOutcome);
    expect(completions()).toHaveLength(1);
    expect(completions()[0]).toMatchObject({ request: { id: 1 } });
    expect(result.current.display.value).toBe('8');
    expect(result.current.history.map((entry) => entry.result)).toEqual(['8']);
  },
);
it.each([success('add', ['2', '3'], '5'), networkError()])(
  'unmount aborts and late outcome never reaches the reducer %#',
  async (outcome) => {
    const { press, api, unmount } = mount(createFakeApi({ ignoreAbort: true }), false);
    press('2', '+', '3', '=');
    unmount();
    expect(api.calls[0]?.signal?.aborted).toBe(true);
    await settle(api, 0, outcome);
    expect(completions()).toEqual([]);
  },
);
it('rerenders and ignored busy actions do not start IO; AC is accepted', () => {
  preload();
  const { press, api, result, rerender } = mount();
  press('2', '+', '3', '=');
  const previous = result.current;
  rerender();
  press('Delete', '7', '+', 'r', '=');
  act(() => {
    result.current.recall('16');
    result.current.clearHistory();
  });
  expect(result.current.display).toEqual(previous.display);
  expect(result.current.history).toBe(previous.history);
  expect(api.calls).toHaveLength(1);
  press('Escape');
  expect(result.current.busy).toBe(false);
  expect(api.calls[0]?.signal?.aborted).toBe(true);
});
it('does not write a corrupt preload on mount; writes on first success and clear', async () => {
  window.localStorage.setItem(HISTORY_STORAGE_KEY, '{');
  const write = vi.spyOn(Storage.prototype, 'setItem');
  const { press, api, result } = mount();
  expect(result.current.history).toEqual([]);
  expect(write).not.toHaveBeenCalled();
  press('2', '+', '3', '=');
  await settle(api, 0, success('add', ['2', '3'], '5'));
  expect(write).toHaveBeenCalledWith(
    HISTORY_STORAGE_KEY,
    JSON.stringify({ version: 1, entries: result.current.history }),
  );
  act(() => {
    result.current.clearHistory();
  });
  expect(window.localStorage.getItem(HISTORY_STORAGE_KEY)).toBe('{"version":1,"entries":[]}');
});
it('calculates and retains history in memory when reads and writes throw', async () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('denied');
  });
  const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('quota');
  });
  const { press, api, result } = mount();
  expect(write).not.toHaveBeenCalled();
  press('2', '+', '3', '=');
  await settle(api, 0, success('add', ['2', '3'], '5'));
  expect(result.current.display.value).toBe('5');
  expect(result.current.history).toHaveLength(1);
  expect(write).toHaveBeenCalledOnce();
});
it('recalls after error as a fresh entry without IO until a new operation', async () => {
  const { press, api, result } = mount();
  press('1', '/', '0', '=');
  await settle(api, 0, problem('DIVISION_BY_ZERO'));
  act(() => {
    result.current.recall('16');
  });
  expect(result.current.display.error).toBeNull();
  expect(result.current.display.value).toBe('16');
  expect(api.calls).toHaveLength(1);
  press('7');
  expect(result.current.display.value).toBe('7');
  press('r');
  expect(api.calls).toHaveLength(2);
  expect(api.calls[1]).toMatchObject({ operation: 'sqrt', operands: ['7'] });
});
it('keeps all callbacks stable across edits, requests and completion', async () => {
  const { result, press, api, rerender } = mount();
  const initial = result.current;
  rerender();
  press('2', '+', '3', '=');
  await settle(api, 0, success('add', ['2', '3'], '5'));
  const callbacks = (controller: typeof initial) =>
    Object.entries(controller).filter(([key]) => ['execute', 'recall', 'clearHistory'].includes(key));
  expect(callbacks(result.current)).toEqual(callbacks(initial));
});

it('wires spinner timing to busy state and each request identity through completion and AC', async () => {
  vi.useFakeTimers();
  const { press, api, result } = mount();
  const advance = (ms: number) => {
    act(() => {
      vi.advanceTimersByTime(ms);
    });
  };
  press('2', '+', '3', '=');
  expect(result.current.display.showSpinner).toBe(false);
  advance(149);
  expect(result.current.display.showSpinner).toBe(false);
  advance(1);
  expect(result.current.display.showSpinner).toBe(true);
  await settle(api, 0, success('add', ['2', '3'], '5'));
  expect(result.current.display.showSpinner).toBe(false);
  press('Escape');
  press('7', '+', '1', '=');
  advance(150);
  expect(result.current.display.showSpinner).toBe(true);
  press('Escape');
  expect(result.current.display.showSpinner).toBe(false);
  press('4', '+', '2', '=');
  expect(result.current.display.showSpinner).toBe(false);
  advance(149);
  expect(result.current.display.showSpinner).toBe(false);
  advance(1);
  expect(result.current.display.showSpinner).toBe(true);
  const issuedIds = vi
    .mocked(calculatorReducer)
    .mock.calls.map(([state]) => state.request?.id)
    .filter((id) => id !== undefined);
  expect(issuedIds.length).toBeGreaterThan(0);
  expect(new Set(issuedIds)).toEqual(new Set([1]));
  await settle(api, 2, success('add', ['4', '2'], '6'));
  expect(result.current.display.showSpinner).toBe(false);
});
