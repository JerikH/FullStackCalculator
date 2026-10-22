import { actionForCommand, commandForKey } from './keypad';
import { calculatorReducer } from './reducer';
import type { CalculatorAction, CalculatorError, CalculatorState } from './types';

export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
export function run(state: CalculatorState, ...actions: CalculatorAction[]): CalculatorState {
  return actions.reduce(
    (current, action) => calculatorReducer(deepFreeze(current), deepFreeze(action)),
    deepFreeze(state),
  );
}
export function press(state: CalculatorState, keys: readonly string[]): CalculatorState {
  return keys.reduce((current, key) => {
    const command = commandForKey(key);
    if (command === undefined) throw new Error(`Unbound key: ${key}`);
    return run(current, actionForCommand(command));
  }, state);
}
let historyCounter = 0;
export function succeed(
  state: CalculatorState,
  result: string,
  options: { inexact?: boolean; historyId?: string } = {},
): CalculatorState {
  const request = state.request;
  if (request === null) throw new Error('No current request');
  historyCounter += 1;
  return run(state, {
    type: 'calculationSucceeded',
    request,
    result: {
      operation: request.operation,
      operands: [...request.operands],
      result,
      inexact: options.inexact ?? false,
    },
    historyId: options.historyId ?? `fixture-${historyCounter}`,
  });
}
export function fail(
  state: CalculatorState,
  error: CalculatorError = { message: 'Something went wrong' },
): CalculatorState {
  if (state.request === null) throw new Error('No current request');
  return run(state, { type: 'calculationFailed', request: state.request, error });
}
