import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import type { HistoryEntry } from '@/features/calculator/model/types';
import { installMatchMedia } from '@/test/matchMedia';
import type { MatchMediaController } from '@/test/matchMedia';
import { HistoryPanel } from './HistoryPanel';

const ENTRIES: readonly HistoryEntry[] = [
  { id: 'secret-id-3', operation: 'divide', operands: ['1', '3'], result: '0.3333', inexact: true },
  { id: 'secret-id-2', operation: 'sqrt', operands: ['16'], result: '4', inexact: false },
  { id: 'secret-id-1', operation: 'multiply', operands: ['12', '3'], result: '36', inexact: false },
];

function details(container: HTMLElement): HTMLDetailsElement {
  const element = container.querySelector('details');
  if (element === null) throw new Error('No details element');
  return element;
}

/** jsdom fires the details `toggle` event on a later task; let it run and React re-render. */
async function flushToggle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

describe('HistoryPanel', () => {
  let media: MatchMediaController | undefined;
  afterEach(() => {
    media?.restore();
    media = undefined;
  });

  it('is a details element with a History summary', () => {
    const { container } = render(<HistoryPanel entries={[]} recall={vi.fn()} clearHistory={vi.fn()} />);
    expect(details(container)).toBeInTheDocument();
    expect(screen.getByText('History').tagName).toBe('SUMMARY');
  });

  it('shows the empty state and no Clear history button without entries', () => {
    render(<HistoryPanel entries={[]} recall={vi.fn()} clearHistory={vi.fn()} />);
    expect(screen.getByText('No calculations yet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear history' })).toBeNull();
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('lists the entries in the given order as expressions, named by their formatted result', () => {
    render(<HistoryPanel entries={ENTRIES} recall={vi.fn()} clearHistory={vi.fn()} />);
    const list = screen.getByRole('list');
    const items = within(list).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual(['1 ÷ 3 ≈ 0.3333', '√16 = 4', '12 × 3 = 36']);
    const rows = within(list).getAllByRole('button');
    expect(rows.map((row) => row.getAttribute('aria-label'))).toEqual([
      'Use result 0.3333',
      'Use result 4',
      'Use result 36',
    ]);
    expect(screen.getByRole('button', { name: 'Use result 36' })).toBe(rows[2]);
    for (const row of rows) expect(row).toHaveAttribute('type', 'button');
  });

  it('formats the accessible name with grouping and the minus sign, and recalls the raw result', async () => {
    const recall = vi.fn();
    const entries: readonly HistoryEntry[] = [
      { id: 'a', operation: 'multiply', operands: ['-1234', '1'], result: '-1234.5', inexact: false },
    ];
    render(<HistoryPanel entries={entries} recall={recall} clearHistory={vi.fn()} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Use result −1,234.5' }));
    expect(recall).toHaveBeenCalledTimes(1);
    expect(recall).toHaveBeenCalledWith('-1234.5');
  });

  it('shows Clear history only with entries and calls clearHistory once per click', async () => {
    const clearHistory = vi.fn();
    render(<HistoryPanel entries={ENTRIES} recall={vi.fn()} clearHistory={clearHistory} />);
    expect(screen.queryByText('No calculations yet')).toBeNull();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Clear history' }));
    expect(clearHistory).toHaveBeenCalledTimes(1);
  });

  it('prevents the default of mousedown on rows and on Clear history so a click leaves focus alone', async () => {
    render(<HistoryPanel entries={ENTRIES} recall={vi.fn()} clearHistory={vi.fn()} />);
    const user = userEvent.setup();
    for (const name of ['Use result 36', 'Use result 4', 'Clear history']) {
      const button = screen.getByRole('button', { name });
      expect(fireEvent.mouseDown(button)).toBe(false);
      await user.click(button);
      expect(button).not.toHaveFocus();
    }
  });

  function ClearHarness() {
    const [entries, setEntries] = useState(ENTRIES);
    return (
      <HistoryPanel
        entries={entries}
        recall={vi.fn()}
        clearHistory={() => {
          setEntries([]);
        }}
      />
    );
  }

  it('moves focus to the summary once a keyboard-activated clear empties the list', async () => {
    render(<ClearHarness />);
    const user = userEvent.setup();
    screen.getByRole('button', { name: 'Clear history' }).focus();
    await user.keyboard('{Enter}');
    expect(screen.getByText('No calculations yet')).toBeInTheDocument();
    expect(screen.getByText('History')).toHaveFocus();
  });

  it('leaves focus alone after a mouse click, so the next Enter is not swallowed by the summary', async () => {
    render(<ClearHarness />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Clear history' }));
    expect(screen.getByText('No calculations yet')).toBeInTheDocument();
    expect(screen.getByText('History')).not.toHaveFocus();
  });

  it('does not move focus when the clear changed nothing', async () => {
    const { rerender } = render(<HistoryPanel entries={ENTRIES} recall={vi.fn()} clearHistory={vi.fn()} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Clear history' }));
    expect(screen.getByText('History')).not.toHaveFocus();
    rerender(<HistoryPanel entries={ENTRIES.slice(0, 2)} recall={vi.fn()} clearHistory={vi.fn()} />);
    expect(screen.getByText('History')).not.toHaveFocus();
  });

  it('is open by default where the wide query matches', () => {
    media = installMatchMedia(true);
    const { container } = render(<HistoryPanel entries={ENTRIES} recall={vi.fn()} clearHistory={vi.fn()} />);
    expect(details(container).open).toBe(true);
  });

  it('is closed by default where the wide query does not match', () => {
    media = installMatchMedia(false);
    const { container } = render(<HistoryPanel entries={ENTRIES} recall={vi.fn()} clearHistory={vi.fn()} />);
    expect(details(container).open).toBe(false);
  });

  it('asks for the 768px breakpoint in pixels', () => {
    const query = vi.fn((q: string) => ({
      matches: false,
      media: q,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    const original = Object.getOwnPropertyDescriptor(window, 'matchMedia');
    Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: query });
    try {
      render(<HistoryPanel entries={[]} recall={vi.fn()} clearHistory={vi.fn()} />);
      expect(query).toHaveBeenCalledWith('(min-width: 768px)');
    } finally {
      if (original) Object.defineProperty(window, 'matchMedia', original);
    }
  });

  it('keeps the visitor choice across re-renders and unrelated prop changes', async () => {
    media = installMatchMedia(false);
    const user = userEvent.setup();
    const { container, rerender } = render(<HistoryPanel entries={ENTRIES} recall={vi.fn()} clearHistory={vi.fn()} />);
    await user.click(screen.getByText('History'));
    await flushToggle();
    expect(details(container).open).toBe(true);
    rerender(<HistoryPanel entries={ENTRIES.slice(1)} recall={vi.fn()} clearHistory={vi.fn()} />);
    await flushToggle();
    expect(details(container).open).toBe(true);
    await user.click(screen.getByText('History'));
    await flushToggle();
    expect(details(container).open).toBe(false);
    rerender(<HistoryPanel entries={ENTRIES} recall={vi.fn()} clearHistory={vi.fn()} />);
    await flushToggle();
    expect(details(container).open).toBe(false);
  });

  it('keeps a wide-screen close across re-renders', async () => {
    media = installMatchMedia(true);
    const user = userEvent.setup();
    const { container, rerender } = render(<HistoryPanel entries={ENTRIES} recall={vi.fn()} clearHistory={vi.fn()} />);
    await user.click(screen.getByText('History'));
    await waitFor(() => {
      expect(details(container).open).toBe(false);
    });
    await flushToggle();
    rerender(<HistoryPanel entries={[]} recall={vi.fn()} clearHistory={vi.fn()} />);
    await flushToggle();
    expect(details(container).open).toBe(false);
  });

  it('re-applies the default when the breakpoint changes', async () => {
    media = installMatchMedia(true);
    const user = userEvent.setup();
    const { container } = render(<HistoryPanel entries={ENTRIES} recall={vi.fn()} clearHistory={vi.fn()} />);
    expect(details(container).open).toBe(true);
    act(() => {
      media?.set(false);
    });
    await flushToggle();
    expect(details(container).open).toBe(false);
    await user.click(screen.getByText('History'));
    await flushToggle();
    expect(details(container).open).toBe(true);
    act(() => {
      media?.set(true);
    });
    await flushToggle();
    expect(details(container).open).toBe(true);
    await user.click(screen.getByText('History'));
    await flushToggle();
    expect(details(container).open).toBe(false);
    act(() => {
      media?.set(false);
    });
    await flushToggle();
    expect(details(container).open).toBe(false);
  });

  it('narrow → opened → wide → narrow returns to the collapsed default', async () => {
    media = installMatchMedia(false);
    const user = userEvent.setup();
    const { container } = render(<HistoryPanel entries={ENTRIES} recall={vi.fn()} clearHistory={vi.fn()} />);
    await user.click(screen.getByText('History'));
    await flushToggle();
    expect(details(container).open).toBe(true);
    act(() => {
      media?.set(true);
    });
    await flushToggle();
    expect(details(container).open).toBe(true);
    act(() => {
      media?.set(false);
    });
    await flushToggle();
    expect(details(container).open).toBe(false);
  });

  it('wide → closed → narrow → wide returns to the open default', async () => {
    media = installMatchMedia(true);
    const user = userEvent.setup();
    const { container } = render(<HistoryPanel entries={ENTRIES} recall={vi.fn()} clearHistory={vi.fn()} />);
    await user.click(screen.getByText('History'));
    await waitFor(() => {
      expect(details(container).open).toBe(false);
    });
    await flushToggle();
    act(() => {
      media?.set(false);
    });
    await flushToggle();
    expect(details(container).open).toBe(false);
    act(() => {
      media?.set(true);
    });
    await flushToggle();
    expect(details(container).open).toBe(true);
  });

  it('adds no key handling of its own to the summary, so the native Enter and Space toggle is untouched', async () => {
    media = installMatchMedia(false);
    const user = userEvent.setup();
    render(<HistoryPanel entries={ENTRIES} recall={vi.fn()} clearHistory={vi.fn()} />);
    await user.tab();
    const summary = screen.getByText('History');
    expect(summary).toHaveFocus();
    // jsdom and user-event do not synthesise the browser's keyboard activation of <summary>; the point
    // here is that nothing in the panel prevents the default that does the toggling in a browser.
    expect(fireEvent.keyDown(summary, { key: 'Enter' })).toBe(true);
    expect(fireEvent.keyDown(summary, { key: ' ' })).toBe(true);
    expect(fireEvent.keyUp(summary, { key: ' ' })).toBe(true);
  });

  it('never renders the entry ids', () => {
    const { container } = render(<HistoryPanel entries={ENTRIES} recall={vi.fn()} clearHistory={vi.fn()} />);
    expect(container.innerHTML).not.toContain('secret-id');
  });

  it('sets no inline style', () => {
    const { container } = render(<HistoryPanel entries={ENTRIES} recall={vi.fn()} clearHistory={vi.fn()} />);
    expect(container.querySelector('[style]')).toBeNull();
  });

  it.each([
    ['empty', [] as readonly HistoryEntry[]],
    ['populated', ENTRIES],
  ])('has no axe violations (%s)', async (_name, entries) => {
    media = installMatchMedia(true);
    const { container } = render(<HistoryPanel entries={entries} recall={vi.fn()} clearHistory={vi.fn()} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
