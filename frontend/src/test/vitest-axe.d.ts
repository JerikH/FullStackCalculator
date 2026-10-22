// vitest-axe declares its matchers on the global `Vi` namespace, which Vitest 5 no longer reads.
// The type parameters repeat Vitest's own declaration so the interfaces merge.
import type { AxeMatchers } from 'vitest-axe';

declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unused-vars -- declaration merging: the interface only gains the axe matchers.
  interface Assertion<R extends void | Promise<void> = void, T = unknown> extends AxeMatchers {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- declaration merging: the interface only gains the axe matchers.
  interface AsymmetricMatchersContaining extends AxeMatchers {}
}
