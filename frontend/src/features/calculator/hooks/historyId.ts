let counter = 0;

/**
 * A history entry id: only ever a React key and a storage field, 1 to 128 characters. It never throws: a throw
 * inside the request callback would leave the screen busy until the visitor presses AC. `randomUUID` exists only
 * in secure contexts and the app can be served over plain HTTP, so the fallbacks matter.
 */
export function newHistoryId(): string {
  try {
    const crypto = globalThis.crypto as Crypto | undefined;
    if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID();
    if (typeof crypto?.getRandomValues === 'function') {
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    }
  } catch {
    // Fall through to the counter id.
  }
  counter += 1;
  return `${Date.now().toString(36)}-${counter.toString(36)}`;
}
