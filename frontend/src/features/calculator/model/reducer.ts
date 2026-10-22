import type { OperationName } from '@/shared/api/types';
import { appendDecimalPoint, appendDigit, backspace, toggleSign, toOperand } from './entry';
import { MESSAGES } from './messages';
import { isDecimal } from './operations';
import { HISTORY_LIMIT, MAX_HISTORY_ID_LENGTH } from './types';
import type { CalculatorAction, CalculatorState, Continuation, HistoryEntry } from './types';

const INVALID_RESULT_ERROR = Object.freeze({ message: MESSAGES.generic });

export function createInitialState(history: readonly HistoryEntry[] = []): CalculatorState {
  return Object.freeze({
    entry: '0',
    entryMode: 'typing',
    accumulator: null,
    pendingOperator: null,
    inexact: false,
    status: 'idle',
    error: null,
    request: null,
    history: Object.freeze(history.slice(0, HISTORY_LIMIT)),
    nextRequestId: 1,
  });
}
function reset(state: CalculatorState): CalculatorState {
  return { ...createInitialState(), history: state.history };
}
function issueRequest(
  state: CalculatorState,
  operation: OperationName,
  operands: readonly string[],
  continuation: Continuation,
): CalculatorState {
  return {
    ...state,
    status: 'busy',
    error: null,
    nextRequestId: state.nextRequestId + 1,
    request: Object.freeze({
      id: state.nextRequestId,
      operation,
      operands: Object.freeze([...operands]),
      continuation: Object.freeze(continuation),
    }),
  };
}
function transition(state: CalculatorState, action: CalculatorAction): CalculatorState {
  switch (action.type) {
    case 'digitPressed':
      return {
        ...state,
        entry: state.entryMode === 'typing' ? appendDigit(state.entry, action.digit) : action.digit,
        entryMode: 'typing',
        inexact: false,
      };
    case 'decimalPointPressed':
      return {
        ...state,
        entry: state.entryMode === 'typing' ? appendDecimalPoint(state.entry) : '0.',
        entryMode: 'typing',
        inexact: false,
      };
    case 'signToggled': {
      const entry = toggleSign(state.entry);
      return {
        ...state,
        entry,
        entryMode: entry !== state.entry && state.entryMode === 'operand' ? 'fresh' : state.entryMode,
      };
    }
    case 'backspacePressed':
      return state.entryMode === 'typing' ? { ...state, entry: backspace(state.entry) } : state;
    case 'entryCleared':
      return { ...state, entry: '0', entryMode: 'typing', inexact: false };
    case 'allCleared':
      return reset(state);
    case 'binaryOperatorPressed':
      if (state.pendingOperator !== null && state.accumulator !== null) {
        return state.entryMode === 'operand'
          ? { ...state, pendingOperator: action.operator }
          : issueRequest(state, state.pendingOperator, [state.accumulator, toOperand(state.entry)], {
              kind: 'chain',
              operator: action.operator,
            });
      }
      return {
        ...state,
        entry: toOperand(state.entry),
        accumulator: toOperand(state.entry),
        pendingOperator: action.operator,
        entryMode: 'operand',
      };
    case 'unaryOperatorPressed':
      return issueRequest(state, action.operator, [toOperand(state.entry)], { kind: 'replaceEntry' });
    case 'equalsPressed':
      return state.pendingOperator !== null && state.accumulator !== null
        ? issueRequest(state, state.pendingOperator, [state.accumulator, toOperand(state.entry)], { kind: 'complete' })
        : state;
    case 'historyRecalled':
      return { ...state, entry: action.value, entryMode: 'fresh', inexact: false };
    case 'historyCleared':
      return state.history.length === 0 ? state : { ...state, history: Object.freeze([]) };
    case 'calculationFailed':
      return {
        ...state,
        entry: '0',
        entryMode: 'fresh',
        accumulator: null,
        pendingOperator: null,
        inexact: false,
        status: 'error',
        error: action.error,
        request: null,
      };
    case 'calculationSucceeded': {
      const { request, result, historyId } = action;
      // A result that is not a contract Decimal never becomes the entry: it is reported as a failure.
      if (!isDecimal(result.result))
        return transition(state, { type: 'calculationFailed', request, error: INVALID_RESULT_ERROR });
      const history =
        historyId.length === 0 ||
        historyId.length > MAX_HISTORY_ID_LENGTH ||
        state.history.some((entry) => entry.id === historyId)
          ? state.history
          : Object.freeze(
              [
                Object.freeze({
                  id: historyId,
                  operation: request.operation,
                  operands: request.operands,
                  result: result.result,
                  inexact: result.inexact,
                }),
                ...state.history,
              ].slice(0, HISTORY_LIMIT),
            );
      const next: CalculatorState = {
        ...state,
        entry: result.result,
        entryMode: 'fresh',
        inexact: result.inexact,
        status: 'idle',
        error: null,
        request: null,
        history,
      };
      switch (request.continuation.kind) {
        case 'complete':
          return { ...next, accumulator: null, pendingOperator: null };
        case 'chain':
          return {
            ...next,
            accumulator: result.result,
            pendingOperator: request.continuation.operator,
            entryMode: 'operand',
          };
        case 'replaceEntry':
          return next;
      }
    }
  }
}
export function calculatorReducer(state: CalculatorState, action: CalculatorAction): CalculatorState {
  if (action.type === 'historyRecalled' && !isDecimal(action.value)) return state;
  const completion = action.type === 'calculationSucceeded' || action.type === 'calculationFailed';
  if (completion && action.request !== state.request) return state;
  if (state.status === 'busy' && action.type !== 'allCleared' && !completion) return state;
  let base = state;
  if (state.status === 'error') {
    switch (action.type) {
      case 'digitPressed':
      case 'decimalPointPressed':
      case 'historyRecalled':
        base = reset(state);
        break;
      case 'entryCleared':
      case 'allCleared':
        base = reset(state);
        break;
      case 'historyCleared':
        break;
      case 'signToggled':
      case 'backspacePressed':
      case 'binaryOperatorPressed':
      case 'unaryOperatorPressed':
      case 'equalsPressed':
      case 'calculationSucceeded':
      case 'calculationFailed':
        return state;
    }
  }
  const next = transition(base, action);
  return (Object.keys(state) as (keyof CalculatorState)[]).every((key) => Object.is(state[key], next[key]))
    ? state
    : Object.freeze(next);
}
