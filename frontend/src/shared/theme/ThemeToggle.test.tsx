import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useKeyboardShortcuts } from '@/features/calculator/hooks/useKeyboardShortcuts';
import { axe } from '@/test/axe';
import { installCssEscape } from '@/test/cssEscape';
import { THEME_STORAGE_KEY } from './theme';
import { ThemeToggle } from './ThemeToggle';

let restoreCssEscape: () => void = () => undefined;
beforeEach(() => {
  restoreCssEscape = installCssEscape();
});
afterEach(() => {
  restoreCssEscape();
});

function radios(): HTMLInputElement[] {
  return screen.getAllByRole<HTMLInputElement>('radio');
}

function Harness({ onCommand }: { onCommand: (kind: string) => void }) {
  useKeyboardShortcuts((command) => {
    onCommand(command.kind);
  });
  return <ThemeToggle />;
}

describe('ThemeToggle', () => {
  it('is a radio group named Theme with System, Light and Dark radios sharing one name', () => {
    render(<ThemeToggle />);
    const group = screen.getByRole('radiogroup', { name: 'Theme' });
    expect(group.tagName).toBe('FIELDSET');
    const all = radios();
    expect(all.map((radio) => radio.value)).toEqual(['system', 'light', 'dark']);
    expect(screen.getByRole('radio', { name: 'System' })).toBe(all[0]);
    expect(screen.getByRole('radio', { name: 'Light' })).toBe(all[1]);
    expect(screen.getByRole('radio', { name: 'Dark' })).toBe(all[2]);
    const names = new Set(all.map((radio) => radio.name));
    expect(names.size).toBe(1);
    expect([...names][0]).not.toBe('');
    for (const radio of all) expect(radio.closest('label')).not.toBeNull();
  });

  it('checks System when nothing is stored', () => {
    render(<ThemeToggle />);
    expect(screen.getByRole('radio', { name: 'System' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Light' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'Dark' })).not.toBeChecked();
  });

  it.each([
    ['light', 'Light'],
    ['dark', 'Dark'],
    ['system', 'System'],
  ])('checks the stored theme %s', (stored, label) => {
    window.localStorage.setItem(THEME_STORAGE_KEY, stored);
    render(<ThemeToggle />);
    expect(screen.getByRole('radio', { name: label })).toBeChecked();
    expect(radios().filter((radio) => radio.checked)).toHaveLength(1);
  });

  it('falls back to System for an unknown stored value', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'solarized');
    render(<ThemeToggle />);
    expect(screen.getByRole('radio', { name: 'System' })).toBeChecked();
  });

  it('applies and stores the chosen theme, and System removes the attribute', async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);
    const root = document.documentElement;
    expect(root.hasAttribute('data-theme')).toBe(false);

    await user.click(screen.getByRole('radio', { name: 'Dark' }));
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked();
    expect(root.getAttribute('data-theme')).toBe('dark');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');

    await user.click(screen.getByRole('radio', { name: 'Light' }));
    expect(screen.getByRole('radio', { name: 'Light' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Dark' })).not.toBeChecked();
    expect(root.getAttribute('data-theme')).toBe('light');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');

    await user.click(screen.getByRole('radio', { name: 'System' }));
    expect(screen.getByRole('radio', { name: 'System' })).toBeChecked();
    expect(root.hasAttribute('data-theme')).toBe(false);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('system');
  });

  it('chooses a theme by clicking its label text', async () => {
    render(<ThemeToggle />);
    await userEvent.setup().click(screen.getByText('Dark'));
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('moves the selection natively with ArrowRight and ArrowLeft', async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);
    await user.tab();
    expect(screen.getByRole('radio', { name: 'System' })).toHaveFocus();

    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Light' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Light' })).toHaveFocus();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');

    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('radio', { name: 'Light' })).toBeChecked();
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
  });

  it('is not intercepted by the calculator shortcuts: arrows are left alone', async () => {
    const onCommand = vi.fn();
    const user = userEvent.setup();
    render(<Harness onCommand={onCommand} />);
    await user.tab();
    await user.keyboard('{ArrowRight}{ArrowRight}{ArrowLeft}{ArrowDown}{ArrowUp}');
    expect(onCommand).not.toHaveBeenCalled();
    const notPrevented = fireEvent.keyDown(screen.getByRole('radio', { name: 'Light' }), { key: 'ArrowRight' });
    expect(notPrevented).toBe(true);
  });

  it('keeps digit shortcuts working after a theme is picked, but leaves Enter to the radio', async () => {
    const onCommand = vi.fn();
    const user = userEvent.setup();
    render(<Harness onCommand={onCommand} />);
    await user.click(screen.getByRole('radio', { name: 'Dark' }));
    await user.keyboard('5');
    expect(onCommand).toHaveBeenCalledTimes(1);
    expect(onCommand).toHaveBeenCalledWith('digit');
    onCommand.mockClear();
    await user.keyboard('{Enter}');
    expect(onCommand).not.toHaveBeenCalled();
  });

  it('has no axe violations in any state', async () => {
    const { container } = render(<ThemeToggle />);
    expect(await axe(container)).toHaveNoViolations();
    await act(async () => {
      await userEvent.setup().click(screen.getByRole('radio', { name: 'Dark' }));
    });
    expect(await axe(container)).toHaveNoViolations();
  });

  it('sets no inline style', () => {
    const { container } = render(<ThemeToggle />);
    expect(container.querySelector('[style]')).toBeNull();
  });
});
