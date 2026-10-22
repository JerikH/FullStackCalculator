import type { MouseEvent } from 'react';
import type { KeyCommand, KeyDefinition } from '@/features/calculator/model/types';
import { cx } from '@/shared/ui/cx';
import styles from './KeyButton.module.css';

const VARIANT_CLASS: Readonly<Record<KeyDefinition['variant'], string | undefined>> = {
  digit: styles.digit,
  function: styles.function,
  operator: styles.operator,
  equals: styles.equals,
};

const ROW_CLASS: Readonly<Record<number, string | undefined>> = {
  1: styles.row1,
  2: styles.row2,
  3: styles.row3,
  4: styles.row4,
  5: styles.row5,
  6: styles.row6,
};

const COLUMN_CLASS: Readonly<Record<number, string | undefined>> = {
  1: styles.col1,
  2: styles.col2,
  3: styles.col3,
  4: styles.col4,
};

const ROW_SPAN_CLASS: Readonly<Record<KeyDefinition['rowSpan'], string | undefined>> = {
  1: undefined,
  2: styles.span2,
};

interface KeyButtonProps {
  readonly definition: KeyDefinition;
  readonly execute: (command: KeyCommand) => void;
}

/** A mouse press must not move focus onto the key, so a later Enter still evaluates. */
function keepFocus(event: MouseEvent): void {
  event.preventDefault();
}

export function KeyButton({ definition, execute }: KeyButtonProps): React.JSX.Element {
  return (
    <button
      type="button"
      aria-label={definition.ariaLabel}
      className={cx(
        styles.key,
        VARIANT_CLASS[definition.variant],
        ROW_CLASS[definition.row],
        COLUMN_CLASS[definition.column],
        ROW_SPAN_CLASS[definition.rowSpan],
      )}
      onMouseDown={keepFocus}
      onClick={() => {
        execute(definition.command);
      }}
    >
      {definition.label}
    </button>
  );
}
