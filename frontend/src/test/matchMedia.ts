export interface MatchMediaController {
  /** Changes the answer of every query and fires the `change` listeners (wrap the call in `act`). */
  set(matches: boolean): void;
  listenerCount(): number;
  restore(): void;
}

/** Replaces `window.matchMedia` with a stub whose answer the test controls. */
export function installMatchMedia(initial: boolean): MatchMediaController {
  const original = Object.getOwnPropertyDescriptor(window, 'matchMedia');
  let matches = initial;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();

  const matchMedia = (query: string): MediaQueryList =>
    ({
      get matches() {
        return matches;
      },
      media: query,
      onchange: null,
      addEventListener: (type: string, listener: (event: MediaQueryListEvent) => void) => {
        if (type === 'change') listeners.add(listener);
      },
      removeEventListener: (type: string, listener: (event: MediaQueryListEvent) => void) => {
        if (type === 'change') listeners.delete(listener);
      },
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
  Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: matchMedia });

  return {
    set(next) {
      matches = next;
      for (const listener of [...listeners]) listener({ matches: next } as MediaQueryListEvent);
    },
    listenerCount: () => listeners.size,
    restore() {
      listeners.clear();
      if (original) Object.defineProperty(window, 'matchMedia', original);
    },
  };
}
