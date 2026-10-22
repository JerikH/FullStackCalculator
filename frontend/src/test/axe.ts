import { axe as vitestAxe } from 'vitest-axe';
import type { AxeCore } from 'vitest-axe';

const RULE = 'label-content-name-mismatch';

/**
 * Throws when axe reported the label-in-name rule as `incomplete` with an error. jsdom has no canvas, so
 * without the stub below axe skips the rule and `toHaveNoViolations` passes without checking anything.
 */
export function assertRuleExecuted(results: Pick<AxeCore.AxeResults, 'incomplete'>): void {
  const failed = results.incomplete.filter((result) => result.id === RULE && Boolean(result.error));
  if (failed.length > 0) {
    const messages = failed.map((result) => result.error?.message ?? 'unknown error').join('; ');
    throw new Error(`axe did not execute ${RULE}: ${messages}`);
  }
}

/**
 * A minimal 2D context for axe's icon-ligature check: every character is as wide as the next and the
 * "rendered" image is never blank, so no label is taken for an icon and the rule judges the text.
 */
function canvasContextStub(canvas: HTMLCanvasElement): unknown {
  return {
    canvas,
    font: '',
    textAlign: '',
    textBaseline: '',
    measureText: (text: string) => ({ width: 10 * text.length }),
    fillText: () => undefined,
    clearRect: () => undefined,
    getImageData: () => ({ data: new Uint8ClampedArray(4096).fill(255) }),
  };
}

/**
 * vitest-axe's `axe` with a canvas stub installed for the run, so `label-content-name-mismatch` really
 * executes in jsdom; fails if the rule still could not run.
 */
export async function axe(html: Element | string, options?: AxeCore.RunOptions): Promise<AxeCore.AxeResults> {
  const original = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'getContext');
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    writable: true,
    value: function getContext(this: HTMLCanvasElement) {
      return canvasContextStub(this);
    },
  });
  try {
    const results = await vitestAxe(html, options);
    assertRuleExecuted(results);
    return results;
  } finally {
    if (original) Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', original);
  }
}
