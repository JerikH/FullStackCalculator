import { render } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { axe as rawAxe } from 'vitest-axe';
import type { AxeCore } from 'vitest-axe';
import { assertRuleExecuted, axe } from './axe';

const RULE = 'label-content-name-mismatch';

function markup(allClear: string, power: string): React.JSX.Element {
  return createElement(
    'div',
    null,
    createElement('button', { type: 'button', 'aria-label': allClear }, 'AC'),
    createElement('button', { type: 'button', 'aria-label': power }, 'xʸ'),
  );
}

function resultWithError(withError: boolean): Pick<AxeCore.AxeResults, 'incomplete'> {
  const base = { description: '', help: '', helpUrl: '', tags: [], nodes: [] };
  return {
    incomplete: [
      { ...base, id: 'color-contrast' },
      { ...base, id: RULE, ...(withError ? { error: { message: 'no canvas', name: 'Error', stack: '' } } : {}) },
    ],
  };
}

describe('axe wrapper', () => {
  it('assertRuleExecuted throws when the rule came back incomplete with an error', () => {
    expect(() => {
      assertRuleExecuted(resultWithError(true));
    }).toThrow(/did not execute label-content-name-mismatch: no canvas/);
  });

  it('assertRuleExecuted passes when the rule has no error, or when only another rule has one', () => {
    expect(() => {
      assertRuleExecuted(resultWithError(false));
    }).not.toThrow();
    expect(() => {
      assertRuleExecuted({ incomplete: [] });
    }).not.toThrow();
    const base = { description: '', help: '', helpUrl: '', tags: [], nodes: [] };
    expect(() => {
      assertRuleExecuted({
        incomplete: [{ ...base, id: 'other-rule', error: { message: 'x', name: 'Error', stack: '' } }],
      });
    }).not.toThrow();
  });

  it('reports the visible label missing from the accessible name (the old keypad names)', async () => {
    const { container } = render(markup('all clear', 'power'));
    const results = await axe(container);
    const violations = results.violations.filter((violation) => violation.id === RULE);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.nodes).toHaveLength(2);
    expect(results.violations).toHaveLength(1);
  });

  it('passes when the accessible name starts with the visible label (the new keypad names)', async () => {
    const { container } = render(markup('AC, all clear', 'xʸ, power'));
    const results = await axe(container);
    expect(results.violations).toHaveLength(0);
    expect(results.incomplete.filter((result) => result.id === RULE && result.error !== undefined)).toHaveLength(0);
    expect(results).toHaveNoViolations();
  });

  it('puts the original getContext back after a run, and also when axe throws', async () => {
    const original = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'getContext');
    const { container } = render(markup('AC, all clear', 'xʸ, power'));
    await axe(container);
    expect(Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'getContext')).toEqual(original);
    await expect(axe('')).rejects.toThrow();
    expect(Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'getContext')).toEqual(original);
  });

  it('documents the trap: the raw vitest-axe call finds no violation because the rule never ran', async () => {
    const { container } = render(markup('all clear', 'power'));
    const results = await rawAxe(container);
    expect(results.violations.filter((violation) => violation.id === RULE)).toHaveLength(0);
    const incomplete = results.incomplete.find((result) => result.id === RULE);
    expect(incomplete).toBeDefined();
    expect(incomplete?.error).toBeDefined();
    expect(() => {
      assertRuleExecuted(results);
    }).toThrow(/did not execute/);
  });
});
