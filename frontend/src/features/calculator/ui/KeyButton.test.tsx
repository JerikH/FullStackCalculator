import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { KEYPAD } from '@/features/calculator/model/keypad';
import type { KeyDefinition } from '@/features/calculator/model/types';
import { KeyButton } from './KeyButton';
import styles from './KeyButton.module.css';

function definition(id: string): KeyDefinition {
  const found = KEYPAD.find((key) => key.id === id);
  if (found === undefined) throw new Error(`No key ${id}`);
  return found;
}

describe('KeyButton', () => {
  it('is a native button named by the table, showing the label', () => {
    render(<KeyButton definition={definition('divide')} execute={vi.fn()} />);
    const button = screen.getByRole('button', { name: 'divide' });
    expect(button).toHaveAttribute('type', 'button');
    expect(button).toHaveTextContent('÷');
    expect(button).toBeEnabled();
  });

  it('executes its own command object on click, once', async () => {
    const execute = vi.fn();
    render(<KeyButton definition={definition('digit-7')} execute={execute} />);
    await userEvent.setup().click(screen.getByRole('button', { name: '7' }));
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute.mock.calls[0]?.[0]).toBe(definition('digit-7').command);
  });

  it.each([
    ['digit-7', styles.digit],
    ['all-clear', styles.function],
    ['add', styles.operator],
    ['equals', styles.equals],
  ])('takes the variant class of %s', (id, variantClass) => {
    render(<KeyButton definition={definition(id)} execute={vi.fn()} />);
    expect(screen.getByRole('button')).toHaveClass(styles.key ?? '', variantClass ?? '');
  });

  it('places keys with one row class and one column class; only equals spans two rows', () => {
    const { rerender } = render(<KeyButton definition={definition('sqrt')} execute={vi.fn()} />);
    expect(screen.getByRole('button')).toHaveClass(styles.row2 ?? '', styles.col1 ?? '');
    expect(screen.getByRole('button')).not.toHaveClass(styles.span2 ?? '');
    rerender(<KeyButton definition={definition('equals')} execute={vi.fn()} />);
    expect(screen.getByRole('button')).toHaveClass(styles.row5 ?? '', styles.col4 ?? '', styles.span2 ?? '');
  });

  it('prevents the default of mousedown so a click never moves focus', async () => {
    render(<KeyButton definition={definition('digit-7')} execute={vi.fn()} />);
    const button = screen.getByRole('button', { name: '7' });
    expect(fireEvent.mouseDown(button)).toBe(false);
    await userEvent.setup().click(button);
    expect(button).not.toHaveFocus();
  });

  it('sets no inline style', () => {
    const { container } = render(<KeyButton definition={definition('digit-7')} execute={vi.fn()} />);
    expect(container.querySelector('[style]')).toBeNull();
  });

  it('has no axe violations', async () => {
    const { container } = render(<KeyButton definition={definition('digit-7')} execute={vi.fn()} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
