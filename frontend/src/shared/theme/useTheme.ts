import { useCallback, useEffect, useState } from 'react';
import { applyTheme, readTheme, writeTheme } from './theme';
import type { Theme } from './theme';

export function useTheme(): { readonly theme: Theme; readonly setTheme: (theme: Theme) => void } {
  const [theme, setThemeState] = useState<Theme>(readTheme);
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);
  const setTheme = useCallback((next: Theme) => {
    writeTheme(next);
    setThemeState(next);
  }, []);
  return { theme, setTheme };
}
