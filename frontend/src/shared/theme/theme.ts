import { safeStorage } from '@/shared/storage/safeStorage';

export type Theme = 'system' | 'light' | 'dark';
export const THEME_STORAGE_KEY = 'calculator.theme.v1';
export function readTheme(): Theme {
  const stored = safeStorage.get(THEME_STORAGE_KEY);
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
}
export function applyTheme(theme: Theme): void {
  if (theme === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', theme);
}
export function writeTheme(theme: Theme): void {
  safeStorage.set(THEME_STORAGE_KEY, theme);
}
