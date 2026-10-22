import type { DisplayModel } from '@/features/calculator/model/types';
import { cx } from '@/shared/ui/cx';
import styles from './Display.module.css';

const ROUNDED = 'Rounded to 34 significant digits';

const SIZE_CLASS: Readonly<Record<DisplayModel['size'], string | undefined>> = {
  xl: styles.xl,
  lg: styles.lg,
  md: styles.md,
};

interface DisplayProps {
  readonly model: DisplayModel & { readonly showSpinner: boolean };
}

export function Display({ model }: DisplayProps): React.JSX.Element {
  const { error } = model;
  const requestId = error?.requestId;
  return (
    <div className={styles.display} aria-busy={model.busy}>
      <div className={styles.top}>
        {model.showSpinner && (
          <>
            <span className={styles.spinner} aria-hidden="true" />
            <span className="visually-hidden">Calculating</span>
          </>
        )}
        <p className={styles.expression}>{model.expression}</p>
      </div>
      <div role="alert" className={styles.alert}>
        {error !== null && (
          <>
            <p className={styles.error}>{error.message}</p>
            {requestId !== undefined && requestId !== '' && <p className={styles.reference}>{`Ref: ${requestId}`}</p>}
          </>
        )}
      </div>
      <output
        aria-live="polite"
        aria-atomic="true"
        aria-label="Result"
        className={cx(styles.value, SIZE_CLASS[model.size])}
      >
        {error === null && (
          <>
            {model.inexact && (
              <span className={styles.approx} title={ROUNDED}>
                <span aria-hidden="true">≈</span>
                <span className="visually-hidden">{`${ROUNDED}. `}</span>
              </span>
            )}
            <span className={cx(model.busy && styles.dimmed)}>{model.value}</span>
          </>
        )}
      </output>
    </div>
  );
}
