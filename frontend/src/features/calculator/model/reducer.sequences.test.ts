import { expect, it } from 'vitest';
import { toOperand } from './entry';
import { isDecimal, OPERATIONS } from './operations';
import { calculatorReducer, createInitialState } from './reducer';
import { deepFreeze } from './testing';
import type { CalculationRequest, CalculatorAction, CalculatorState } from './types';

const seen = new Set<CalculatorAction['type']>();
it.each(Array.from({ length: 300 }, (_, index) => index + 1))(
  'preserves invariants for seed %i over 60 actions',
  (seed) => {
    let random = seed;
    const next = (limit: number) => {
      random = (random * 1664525 + 1013904223) >>> 0;
      return random % limit;
    };
    let state = deepFreeze(createInitialState());
    let stale: CalculationRequest = deepFreeze({
      id: 1,
      operation: 'sqrt',
      operands: ['16'],
      continuation: { kind: 'replaceEntry' },
    });
    for (let step = 0; step < 60; step++) {
      const captured = state.request;
      const descriptors = [captured ?? stale, stale, { ...stale, id: 999 }] as const;
      const request = descriptors[next(descriptors.length)] ?? stale;
      const choices: CalculatorAction[] = [
        { type: 'digitPressed', digit: next(2) === 0 ? '0' : '7' },
        { type: 'decimalPointPressed' },
        { type: 'signToggled' },
        { type: 'backspacePressed' },
        { type: 'entryCleared' },
        { type: 'allCleared' },
        { type: 'binaryOperatorPressed', operator: next(2) === 0 ? 'add' : 'multiply' },
        { type: 'unaryOperatorPressed', operator: next(2) === 0 ? 'sqrt' : 'percentage' },
        { type: 'equalsPressed' },
        { type: 'historyRecalled', value: ['16', '1e+21', '-0', '1,000', '1.', '1'.repeat(129)][next(6)] ?? '16' },
        { type: 'historyCleared' },
        {
          type: 'calculationSucceeded',
          request,
          result: {
            operation: request.operation,
            operands: [...request.operands],
            result: next(2) === 0 ? '4' : '1e-9999',
            inexact: next(2) === 0,
          },
          historyId: `sequence-${seed}-${step}`,
        },
        { type: 'calculationFailed', request, error: { message: 'Something went wrong' } },
      ];
      const action = deepFreeze<CalculatorAction>(choices[next(choices.length)] ?? { type: 'allCleared' });
      seen.add(action.type);
      const previous = deepFreeze(state);
      state = calculatorReducer(previous, action);
      expect(Object.isFrozen(state)).toBe(true);
      expect(Object.isFrozen(state.history)).toBe(true);
      expect(state.request !== null).toBe(state.status === 'busy');
      expect(state.error !== null).toBe(state.status === 'error');
      if (state.entryMode === 'operand') {
        expect(state.pendingOperator).not.toBeNull();
        expect(state.entry).toBe(state.accumulator);
      }
      expect(new Set(state.history.map((entry) => entry.id)).size).toBe(state.history.length);
      expect(state.history.length).toBeLessThanOrEqual(20);
      expect(isDecimal(toOperand(state.entry))).toBe(true);
      if (state.request !== null) {
        expect(state.request.operands).toHaveLength(OPERATIONS[state.request.operation].arity);
        expect(state.request.operands.every(isDecimal)).toBe(true);
        expect(Object.isFrozen(state.request)).toBe(true);
        expect(Object.isFrozen(state.request.operands)).toBe(true);
      }
      if ((Object.keys(previous) as (keyof CalculatorState)[]).every((key) => Object.is(previous[key], state[key])))
        expect(state).toBe(previous);
      if (captured !== null && captured !== state.request) stale = captured;
    }
  },
);
it('generates every action kind', () => {
  expect(seen.size).toBe(13);
});
