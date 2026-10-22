import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { CalculatorApiProvider } from './CalculatorApiProvider';
import { useCalculatorApi } from './apiContext';
import type { CalculatorApi } from './types';

describe('CalculatorApiProvider', () => {
  it('provides the injected instance', () => {
    const api: CalculatorApi = { calculate: () => Promise.reject(new Error('unused')) };
    const wrapper = ({ children }: { children: ReactNode }) => (
      <CalculatorApiProvider api={api}>{children}</CalculatorApiProvider>
    );
    const { result } = renderHook(() => useCalculatorApi(), { wrapper });
    expect(result.current).toBe(api);
  });

  it('throws when used outside a provider', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => renderHook(() => useCalculatorApi())).toThrow(
      'useCalculatorApi must be used inside <CalculatorApiProvider>',
    );
    log.mockRestore();
  });
});
