/**
 * jsdom has no `CSS.escape`, which user-event calls to navigate a named radio group. Installs a minimal
 * implementation when it is missing and returns the function that removes it again.
 */
export function installCssEscape(): () => void {
  const existing: unknown = (window as { CSS?: { escape?: unknown } }).CSS?.escape;
  if (typeof existing === 'function') return () => undefined;
  const escape = (value: string): string =>
    value.replace(/[^\w-]/gu, (character) => `\\${character}`).replace(/^(\d)/u, '\\3$1 ');
  const target = (window as { CSS?: object }).CSS ?? {};
  Object.defineProperty(target, 'escape', { configurable: true, writable: true, value: escape });
  Object.defineProperty(window, 'CSS', { configurable: true, writable: true, value: target });
  return () => {
    Reflect.deleteProperty(target, 'escape');
  };
}
