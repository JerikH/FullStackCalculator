import { useId } from 'react';
import { cx } from '@/shared/ui/cx';
import { useTheme } from './useTheme';
import type { Theme } from './theme';
import styles from './ThemeToggle.module.css';

const OPTIONS: readonly { readonly value: Theme; readonly label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export function ThemeToggle(): React.JSX.Element {
  const { theme, setTheme } = useTheme();
  const name = useId();
  return (
    <fieldset role="radiogroup" className={styles.group}>
      <legend className="visually-hidden">Theme</legend>
      {OPTIONS.map((option) => (
        <label key={option.value} className={styles.segment}>
          <input
            type="radio"
            name={name}
            value={option.value}
            className={cx('visually-hidden', styles.input)}
            checked={theme === option.value}
            onChange={() => {
              setTheme(option.value);
            }}
          />
          <span className={styles.text}>{option.label}</span>
        </label>
      ))}
    </fieldset>
  );
}
