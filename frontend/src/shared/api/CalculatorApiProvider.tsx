import type { ReactNode } from 'react';
import { CalculatorApiContext } from './apiContext';
import type { CalculatorApi } from './types';

export function CalculatorApiProvider({ api, children }: { api: CalculatorApi; children: ReactNode }) {
  return <CalculatorApiContext value={api}>{children}</CalculatorApiContext>;
}
