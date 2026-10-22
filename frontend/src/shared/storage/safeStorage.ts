/**
 * localStorage that never throws. Storage can be unavailable (private mode,
 * blocked site data, quota) and persistence is always a convenience here, never
 * a requirement.
 */
export const safeStorage = {
  get(key: string): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Best effort only.
    }
  },
  remove(key: string): void {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Best effort only.
    }
  },
};
