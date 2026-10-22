import '@testing-library/jest-dom/vitest';
import 'vitest-axe/extend-expect';
import * as axeMatchers from 'vitest-axe/matchers';
import { afterEach, expect } from 'vitest';

expect.extend(axeMatchers);

// The API client tests run in the node environment, where there is no DOM.
if (typeof window !== 'undefined') {
  const { cleanup } = await import('@testing-library/react');

  // jsdom does not implement matchMedia (the property exists but is not a function); components read it
  // for the history panel and theme. Tests that need a match replace it with their own stub.
  const matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList; // a stub without the deprecated addListener/removeListener
  Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: matchMedia });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });
}
