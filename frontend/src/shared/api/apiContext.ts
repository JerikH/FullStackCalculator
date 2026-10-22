import { createContext, use } from 'react';
import type { CalculatorApi } from './types';

export const CalculatorApiContext = createContext<CalculatorApi | null>(null);

/** The injected API. Tests provide a fake; main.tsx provides the real client. */
export function useCalculatorApi(): CalculatorApi {
  const api = use(CalculatorApiContext);
  if (!api) throw new Error('useCalculatorApi must be used inside <CalculatorApiProvider>');
  return api;
}
