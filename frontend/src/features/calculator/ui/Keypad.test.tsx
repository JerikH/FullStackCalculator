import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { KEYPAD } from '@/features/calculator/model/keypad';
import { axe } from '@/test/axe';
import { Keypad } from './Keypad';
import keyStyles from './KeyButton.module.css';

const ROW_CLASSES = [1, 2, 3, 4, 5, 6].map((row) => keyStyles[`row${row}`] ?? '');
const COLUMN_CLASSES = [1, 2, 3, 4].map((column) => keyStyles[`col${column}`] ?? '');

function countClasses(element: HTMLElement, names: readonly string[]): number {
  return names.filter((name) => element.classList.contains(name)).length;
}

describe('Keypad', () => {
  it('is a group named Keypad with the 23 keys in table order', () => {
    render(<Keypad execute={vi.fn()} />);
    const group = screen.getByRole('group', { name: 'Keypad' });
    const buttons = within(group).getAllByRole('button');
    expect(buttons).toHaveLength(23);
    expect(KEYPAD).toHaveLength(23);
    KEYPAD.forEach((definition, index) => {
      expect(buttons[index]).toBe(within(group).getByRole('button', { name: definition.ariaLabel }));
      expect(buttons[index]).toHaveAttribute('type', 'button');
      expect(buttons[index]).toHaveTextContent(definition.label);
      expect(buttons[index]).toBeEnabled();
    });
  });

  it('executes the table command of the clicked key, exactly once', async () => {
    const execute = vi.fn();
    render(<Keypad execute={execute} />);
    const user = userEvent.setup();
    for (const definition of KEYPAD) {
      execute.mockClear();
      await user.click(screen.getByRole('button', { name: definition.ariaLabel }));
      expect(execute).toHaveBeenCalledTimes(1);
      expect(execute.mock.calls[0]?.[0]).toBe(definition.command);
    }
  });

  it('places every key from its row and column; equals sits at row 5, column 4 and spans two rows', () => {
    render(<Keypad execute={vi.fn()} />);
    for (const definition of KEYPAD) {
      const button = screen.getByRole('button', { name: definition.ariaLabel });
      expect(countClasses(button, ROW_CLASSES)).toBe(1);
      expect(countClasses(button, COLUMN_CLASSES)).toBe(1);
      expect(button).toHaveClass(ROW_CLASSES[definition.row - 1] ?? '', COLUMN_CLASSES[definition.column - 1] ?? '');
      if (definition.rowSpan === 2) expect(button).toHaveClass(keyStyles.span2 ?? '');
      else expect(button).not.toHaveClass(keyStyles.span2 ?? '');
    }
    const equals = screen.getByRole('button', { name: 'equals' });
    expect(equals).toHaveClass(keyStyles.row5 ?? '', keyStyles.col4 ?? '', keyStyles.span2 ?? '');
  });

  it('sets no inline style anywhere', () => {
    const { container } = render(<Keypad execute={vi.fn()} />);
    expect(container.querySelector('[style]')).toBeNull();
  });

  it('prevents the default of mousedown on every key and never moves focus on a click', async () => {
    render(<Keypad execute={vi.fn()} />);
    for (const definition of KEYPAD) {
      expect(fireEvent.mouseDown(screen.getByRole('button', { name: definition.ariaLabel }))).toBe(false);
    }
    await userEvent.setup().click(screen.getByRole('button', { name: '7' }));
    expect(document.body).toHaveFocus();
  });

  it('activates a focused key once with Enter and once with Space', async () => {
    const execute = vi.fn();
    render(<Keypad execute={execute} />);
    const user = userEvent.setup();
    for (let press = 0; press < 9; press += 1) await user.tab();
    expect(screen.getByRole('button', { name: '7' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(execute).toHaveBeenCalledTimes(1);
    await user.keyboard(' ');
    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute.mock.calls[1]?.[0]).toEqual({ kind: 'digit', digit: '7' });
  });

  it('starts every accessible name with the visible label where axe applies label-in-name', () => {
    // axe skips a label that is a single non-digit character or only symbols and punctuation.
    const applicable = KEYPAD.filter(
      (definition) => /[\p{L}\p{N}]/u.test(definition.label) && !/^\P{N}$/u.test(definition.label),
    );
    expect(applicable.map((definition) => definition.label)).toEqual(['AC', 'xʸ', ...'789456123'.split(''), '0']);
    render(<Keypad execute={vi.fn()} />);
    for (const definition of applicable) {
      const button = screen.getByRole('button', { name: definition.ariaLabel });
      expect(definition.ariaLabel.toLowerCase().startsWith(definition.label.toLowerCase())).toBe(true);
      expect(button).toHaveAccessibleName(definition.ariaLabel);
    }
  });

  it('has no axe violations', async () => {
    const { container } = render(<Keypad execute={vi.fn()} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
