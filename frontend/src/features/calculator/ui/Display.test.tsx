import { render, screen, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it } from 'vitest';
import { axe } from '@/test/axe';
import { Display } from './Display';
import styles from './Display.module.css';

type Model = ComponentProps<typeof Display>['model'];

const ROUNDED = 'Rounded to 34 significant digits';
// 34 significant digits as the service returns them (36 characters), and exactly 34 characters.
const THIRTY_FOUR = '0.3333333333333333333333333333333333';
const THIRTY_FOUR_CHARACTERS = '0.33333333333333333333333333333333';

function model(overrides: Partial<Model> = {}): Model {
  return {
    value: '0',
    expression: '',
    size: 'xl',
    inexact: false,
    busy: false,
    error: null,
    showSpinner: false,
    ...overrides,
  };
}

function result(): HTMLElement {
  return screen.getByRole('status', { name: 'Result' });
}

describe('Display', () => {
  it('shows 0 in the polite atomic Result output when idle', () => {
    render(<Display model={model()} />);
    const output = result();
    expect(output.tagName).toBe('OUTPUT');
    expect(output).toHaveAttribute('aria-live', 'polite');
    expect(output).toHaveAttribute('aria-atomic', 'true');
    expect(output).toHaveTextContent('0');
  });

  it('shows the pending expression as text', () => {
    render(<Display model={model({ value: '3', expression: '12 ×' })} />);
    expect(screen.getByText('12 ×')).toBeInTheDocument();
    expect(result()).toHaveTextContent('3');
  });

  it('carries aria-busy on its root only while busy', () => {
    const { container, rerender } = render(<Display model={model()} />);
    expect(container.firstElementChild).toHaveAttribute('aria-busy', 'false');
    rerender(<Display model={model({ busy: true })} />);
    expect(container.firstElementChild).toHaveAttribute('aria-busy', 'true');
  });

  it('dims only the digits while busy, never the approximation marker or the expression', () => {
    const { container, rerender } = render(
      <Display model={model({ value: '0.3', expression: '1 ÷', inexact: true, busy: true })} />,
    );
    expect(screen.getByText('0.3')).toHaveClass(styles.dimmed ?? '');
    expect(screen.getByText('≈')).not.toHaveClass(styles.dimmed ?? '');
    expect(screen.getByText('1 ÷')).not.toHaveClass(styles.dimmed ?? '');
    expect(container.querySelectorAll(`.${styles.dimmed ?? ''}`)).toHaveLength(1);
    rerender(<Display model={model({ value: '0.3', expression: '1 ÷', inexact: true })} />);
    expect(screen.getByText('0.3')).not.toHaveClass(styles.dimmed ?? '');
  });

  it('shows the spinner and Calculating only with showSpinner, and hides the ring from assistive technology', () => {
    const { container, rerender } = render(<Display model={model({ busy: true })} />);
    expect(screen.queryByText('Calculating')).toBeNull();
    expect(container.querySelector('[aria-hidden="true"]')).toBeNull();
    rerender(<Display model={model({ busy: true, showSpinner: true })} />);
    expect(screen.getByText('Calculating')).toHaveClass('visually-hidden');
    const ring = container.querySelector('[aria-hidden="true"]');
    expect(ring).toHaveClass(styles.spinner ?? '');
    expect(ring).toBeEmptyDOMElement();
  });

  it('marks an inexact value with a visible approximation, a title and the spoken explanation', () => {
    render(<Display model={model({ value: THIRTY_FOUR, inexact: true })} />);
    const output = result();
    const approximation = screen.getByText('≈');
    expect(approximation).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByTitle(ROUNDED)).toContainElement(approximation);
    expect(within(output).getByText(`${ROUNDED}.`)).toHaveClass('visually-hidden');
    expect(output).toContainElement(approximation);
    expect(output.textContent).toBe(`≈${ROUNDED}. ${THIRTY_FOUR}`);
  });

  it('shows no approximation for an exact value', () => {
    render(<Display model={model({ value: '0.3' })} />);
    expect(screen.queryByText('≈')).toBeNull();
    expect(screen.queryByTitle(ROUNDED)).toBeNull();
    expect(result().textContent).toBe('0.3');
  });

  it.each([THIRTY_FOUR_CHARACTERS, THIRTY_FOUR])('renders the long value %s in full', (value) => {
    render(<Display model={model({ value, size: 'md' })} />);
    expect(result().textContent).toBe(value);
  });

  it('uses a 34-character literal', () => {
    expect(THIRTY_FOUR_CHARACTERS).toHaveLength(34);
  });

  it.each([
    ['xl', styles.xl],
    ['lg', styles.lg],
    ['md', styles.md],
  ] as const)('applies the %s size class', (size, expected) => {
    render(<Display model={model({ size })} />);
    expect(result()).toHaveClass(expected ?? '');
    for (const other of [styles.xl, styles.lg, styles.md]) {
      if (other !== expected) expect(result()).not.toHaveClass(other ?? '');
    }
  });

  it('keeps one persistent empty alert while there is no error', () => {
    render(<Display model={model()} />);
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByRole('alert')).toBeEmptyDOMElement();
  });

  it('announces an error once: the alert holds the message and the output is empty', () => {
    render(<Display model={model({ value: '5', error: { message: 'Cannot divide by zero' } })} />);
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByRole('alert')).toHaveTextContent('Cannot divide by zero');
    expect(result().textContent).toBe('');
    expect(screen.queryByText(/^Ref:/)).toBeNull();
  });

  it('shows the request reference only when one is present', () => {
    const { rerender } = render(
      <Display model={model({ error: { message: 'Something went wrong', requestId: 'abc' } })} />,
    );
    expect(within(screen.getByRole('alert')).getByText('Ref: abc')).toBeInTheDocument();
    rerender(<Display model={model({ error: { message: 'Something went wrong', requestId: '' } })} />);
    expect(screen.queryByText(/^Ref:/)).toBeNull();
    rerender(<Display model={model()} />);
    expect(screen.queryByText(/^Ref:/)).toBeNull();
    expect(screen.getByRole('alert')).toBeEmptyDOMElement();
  });

  it('renders a hostile request reference as text and creates no element from it', () => {
    const hostile = '<img src=x onerror=alert(1)>';
    const { container } = render(
      <Display model={model({ error: { message: 'Something went wrong', requestId: hostile } })} />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(`Ref: ${hostile}`);
    expect(container.querySelector('img')).toBeNull();
  });

  it('clears the error and shows the value again once the error is gone', () => {
    const { rerender } = render(<Display model={model({ error: { message: 'Result is undefined' } })} />);
    rerender(<Display model={model({ value: '7' })} />);
    expect(result()).toHaveTextContent('7');
    expect(screen.getByRole('alert')).toBeEmptyDOMElement();
  });

  it('sets no inline style', () => {
    const { container } = render(<Display model={model({ showSpinner: true })} />);
    expect(container.querySelector('[style]')).toBeNull();
  });

  it.each([
    ['initial', model()],
    ['expression and busy', model({ value: '3', expression: '12 ×', busy: true, showSpinner: true })],
    ['inexact', model({ value: THIRTY_FOUR, size: 'md', inexact: true })],
    ['error with reference', model({ error: { message: 'Cannot divide by zero', requestId: 'req-1' } })],
  ])('has no axe violations (%s)', async (_name, value) => {
    const { container } = render(<Display model={value} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
