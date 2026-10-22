import { useCallback, useEffect, useReducer, useRef } from 'react';
import { useCalculatorApi } from '@/shared/api/apiContext';
import { actionForCommand } from '../model/keypad';
import { toCalculatorError } from '../model/messages';
import { calculatorReducer, createInitialState } from '../model/reducer';
import { selectDisplay } from '../model/selectors';
import type { DisplayModel, HistoryEntry, KeyCommand } from '../model/types';
import { newHistoryId } from './historyId';
import { loadHistory, saveHistory } from './historyStorage';
import { useDelayedBusy } from './useDelayedBusy';

export interface CalculatorDisplay extends DisplayModel {
  readonly showSpinner: boolean;
}
export interface CalculatorController {
  readonly display: CalculatorDisplay;
  readonly history: readonly HistoryEntry[];
  readonly busy: boolean;
  readonly execute: (command: KeyCommand) => void;
  readonly recall: (value: string) => void;
  readonly clearHistory: () => void;
}
export function useCalculator(): CalculatorController {
  const [state, dispatch] = useReducer(calculatorReducer, undefined, () => createInitialState(loadHistory()));
  const api = useCalculatorApi();
  const initialHistory = useRef(state.history);
  useEffect(() => {
    const request = state.request;
    if (!request) return;
    const controller = new AbortController();
    let active = true;
    void api.calculate(request.operation, request.operands, { signal: controller.signal }).then((outcome) => {
      if (!active || controller.signal.aborted) return;
      if (outcome.ok)
        dispatch({ type: 'calculationSucceeded', request, result: outcome.data, historyId: newHistoryId() });
      else if (outcome.error.kind !== 'aborted')
        dispatch({ type: 'calculationFailed', request, error: toCalculatorError(outcome.error) });
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [api, state.request]);
  useEffect(() => {
    if (state.history !== initialHistory.current) saveHistory(state.history);
  }, [state.history]);
  const showSpinner = useDelayedBusy(state.status === 'busy', state.request);
  const execute = useCallback((command: KeyCommand) => {
    dispatch(actionForCommand(command));
  }, []);
  const recall = useCallback((value: string) => {
    dispatch({ type: 'historyRecalled', value });
  }, []);
  const clearHistory = useCallback(() => {
    dispatch({ type: 'historyCleared' });
  }, []);
  return {
    display: { ...selectDisplay(state), showSpinner },
    history: state.history,
    busy: state.status === 'busy',
    execute,
    recall,
    clearHistory,
  };
}
