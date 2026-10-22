import { KEYPAD } from '@/features/calculator/model/keypad';
import type { KeyCommand } from '@/features/calculator/model/types';
import { KeyButton } from './KeyButton';
import styles from './Keypad.module.css';

interface KeypadProps {
  readonly execute: (command: KeyCommand) => void;
}

export function Keypad({ execute }: KeypadProps): React.JSX.Element {
  return (
    <div role="group" aria-label="Keypad" className={styles.keypad}>
      {KEYPAD.map((definition) => (
        <KeyButton key={definition.id} definition={definition} execute={execute} />
      ))}
    </div>
  );
}
