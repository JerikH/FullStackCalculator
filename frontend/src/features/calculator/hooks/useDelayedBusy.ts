import { useEffect, useState } from 'react';
import type { CalculationRequest } from '../model/types';

export const BUSY_SPINNER_DELAY_MS = 150;
export function useDelayedBusy(busy: boolean, request: CalculationRequest | null): boolean {
  const [shownFor, setShownFor] = useState<CalculationRequest | null>(null);
  useEffect(() => {
    if (!busy || request === null) return;
    const timer = setTimeout(() => {
      setShownFor(request);
    }, BUSY_SPINNER_DELAY_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [busy, request]);
  return busy && request !== null && shownFor === request;
}
