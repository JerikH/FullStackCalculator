import { useEffect, useRef, useState } from 'react';
import type { MouseEvent, SyntheticEvent } from 'react';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { historyExpression } from '@/features/calculator/model/selectors';
import type { HistoryEntry } from '@/features/calculator/model/types';
import styles from './HistoryPanel.module.css';

/** Open by default from this width up; the same breakpoint as the page's two-column layout. */
const WIDE_QUERY = '(min-width: 768px)';

interface HistoryPanelProps {
  readonly entries: readonly HistoryEntry[];
  readonly recall: (value: string) => void;
  readonly clearHistory: () => void;
}

/** A mouse press must not leave focus on the button, or the next Enter would press it again. */
function keepFocus(event: MouseEvent): void {
  event.preventDefault();
}

export function HistoryPanel({ entries, recall, clearHistory }: HistoryPanelProps): React.JSX.Element {
  const wide = useMediaQuery(WIDE_QUERY);
  // The visitor's choice only holds for the breakpoint it was made at: any crossing returns to the default.
  const [override, setOverride] = useState<boolean | null>(null);
  const [seenWide, setSeenWide] = useState(wide);
  if (seenWide !== wide) {
    setSeenWide(wide);
    setOverride(null);
  }
  const open = override ?? wide;

  const summary = useRef<HTMLElement>(null);
  const focusSummaryWhenEmpty = useRef(false);
  const count = entries.length;
  useEffect(() => {
    if (focusSummaryWhenEmpty.current && count === 0) {
      summary.current?.focus();
      focusSummaryWhenEmpty.current = false;
    }
  }, [count]);

  return (
    <details
      className={styles.panel}
      open={open}
      onToggle={(event: SyntheticEvent<HTMLDetailsElement>) => {
        setOverride(event.currentTarget.open);
      }}
    >
      <summary ref={summary} className={styles.summary}>
        History
      </summary>
      <div className={styles.body}>
        {count === 0 ? (
          <p className={styles.empty}>No calculations yet</p>
        ) : (
          <>
            <ol className={styles.list}>
              {entries.map((entry) => (
                <li key={entry.id} className={styles.item}>
                  <button
                    type="button"
                    className={styles.row}
                    aria-label={`${historyExpression(entry)}, use result`}
                    onMouseDown={keepFocus}
                    onClick={() => {
                      recall(entry.result);
                    }}
                  >
                    {historyExpression(entry)}
                  </button>
                </li>
              ))}
            </ol>
            <button
              type="button"
              className={styles.clear}
              onMouseDown={keepFocus}
              onClick={(event) => {
                // A mouse or touch click leaves focus alone (the next Enter must evaluate); only a keyboard
                // activation (detail 0) needs a stable place for focus once the button is gone.
                focusSummaryWhenEmpty.current = event.detail === 0;
                clearHistory();
              }}
            >
              Clear history
            </button>
          </>
        )}
      </div>
    </details>
  );
}
