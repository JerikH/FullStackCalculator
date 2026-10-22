import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import { THEME_STORAGE_KEY } from '@/shared/theme/theme';
import { apiWrapper, createFakeApi, problem, success } from '@/test/calculatorFake';
import type { FakeApi } from '@/test/calculatorFake';
import { installCssEscape } from '@/test/cssEscape';
import { App } from './App';

const HISTORY_KEY = 'calculator.history.v1';

let restoreCssEscape: () => void = () => undefined;
beforeEach(() => {
  restoreCssEscape = installCssEscape();
});
afterEach(() => {
  restoreCssEscape();
});

function renderApp(api: FakeApi = createFakeApi()) {
  const user = userEvent.setup();
  const view = render(<App />, { wrapper: apiWrapper(api) });
  return { api, user, ...view };
}

async function press(user: ReturnType<typeof userEvent.setup>, ...names: string[]): Promise<void> {
  for (const name of names) await user.click(screen.getByRole('button', { name }));
}

async function reachError(user: ReturnType<typeof userEvent.setup>, api: FakeApi): Promise<void> {
  await press(user, '1', 'divide', '0', 'equals');
  const call = api.calls[0];
  if (call === undefined) throw new Error('No API call');
  await act(async () => {
    call.resolve(problem('DIVISION_BY_ZERO', 'req-42'));
    await Promise.resolve();
  });
}

const POPULATED = JSON.stringify({
  version: 1,
  entries: [
    {
      id: 'h3',
      operation: 'divide',
      operands: ['1', '3'],
      result: '0.3333333333333333333333333333333333',
      inexact: true,
    },
    { id: 'h2', operation: 'sqrt', operands: ['16'], result: '4', inexact: false },
    { id: 'h1', operation: 'multiply', operands: ['12', '3'], result: '36', inexact: false },
  ],
});

describe('App structure', () => {
  it('has one h1 named Calculator, a banner and a main landmark', () => {
    renderApp();
    const headings = screen.getAllByRole('heading');
    expect(headings).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'Calculator' })).toBe(headings[0]);
    const banner = screen.getByRole('banner');
    const main = screen.getByRole('main');
    expect(within(banner).getByRole('heading', { name: 'Calculator' })).toBeInTheDocument();
    expect(within(banner).getByRole('radiogroup', { name: 'Theme' })).toBeInTheDocument();
    expect(within(main).getByRole('group', { name: 'Keypad' })).toBeInTheDocument();
    expect(screen.queryAllByRole('navigation')).toHaveLength(0);
    expect(screen.queryAllByRole('contentinfo')).toHaveLength(0);
  });

  it('has one Theme radio group and one Keypad group', () => {
    renderApp();
    expect(screen.getAllByRole('radiogroup')).toHaveLength(1);
    expect(screen.getAllByRole('group', { name: 'Keypad' })).toHaveLength(1);
    expect(screen.getAllByRole('radio')).toHaveLength(3);
  });

  it('mounts exactly one alert container, empty when idle, and fills it on a failure', async () => {
    const { api, user } = renderApp();
    const alerts = screen.getAllByRole('alert');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toBeEmptyDOMElement();

    await reachError(user, api);
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByRole('alert')).toHaveTextContent('Cannot divide by zero');
    expect(screen.getByRole('alert')).toHaveTextContent('Ref: req-42');
  });

  it('has no inline style attribute anywhere', () => {
    const { container } = renderApp();
    expect(container.querySelector('[style]')).toBeNull();
  });

  it('runs a calculation end to end through the real hooks', async () => {
    const { api, user } = renderApp();
    await press(user, '2', 'add', '3', 'equals');
    expect(api.calls).toHaveLength(1);
    expect(api.calls[0]?.operation).toBe('add');
    expect(api.calls[0]?.operands).toEqual(['2', '3']);
    await act(async () => {
      api.calls[0]?.resolve(success('add', ['2', '3'], '5'));
      await Promise.resolve();
    });
    expect(screen.getByRole('status', { name: 'Result' })).toHaveTextContent('5');
    expect(screen.getByRole('button', { name: 'Use result 5' })).toHaveTextContent('2 + 3 = 5');
  });
});

describe('App theme interaction', () => {
  it('applies the chosen theme to the document and stores it', async () => {
    const { user } = renderApp();
    await user.click(screen.getByRole('radio', { name: 'Dark' }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    await user.click(screen.getByRole('radio', { name: 'System' }));
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('arrow keys move the theme selection and are not taken by the calculator', async () => {
    const { api, user } = renderApp();
    await user.tab();
    expect(screen.getByRole('radio', { name: 'System' })).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Light' })).toBeChecked();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    await user.keyboard('{ArrowRight}{ArrowLeft}{ArrowLeft}');
    expect(screen.getByRole('radio', { name: 'System' })).toBeChecked();
    expect(api.calls).toHaveLength(0);
    expect(screen.getByRole('status', { name: 'Result' })).toHaveTextContent('0');
  });

  it('keeps digit shortcuts working after a theme was picked', async () => {
    const { user } = renderApp();
    await user.click(screen.getByRole('radio', { name: 'Light' }));
    await user.keyboard('5');
    expect(screen.getByRole('status', { name: 'Result' })).toHaveTextContent('5');
  });
});

describe('App accessibility (axe)', () => {
  it('has zero violations initially', async () => {
    const { container } = renderApp();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has zero violations with a populated history', async () => {
    window.localStorage.setItem(HISTORY_KEY, POPULATED);
    const { container } = renderApp();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has zero violations in an error state', async () => {
    const { api, user, container } = renderApp();
    await reachError(user, api);
    expect(screen.getByRole('alert')).toHaveTextContent('Cannot divide by zero');
    expect(await axe(container)).toHaveNoViolations();
  });

  it.each(['light', 'dark'])('has zero violations with the %s theme set', async (theme) => {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    window.localStorage.setItem(HISTORY_KEY, POPULATED);
    const { container } = renderApp();
    expect(document.documentElement.getAttribute('data-theme')).toBe(theme);
    expect(await axe(container)).toHaveNoViolations();
  });
});
