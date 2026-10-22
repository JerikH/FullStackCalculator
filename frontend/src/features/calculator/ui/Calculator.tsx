import { useCalculator } from '../hooks/useCalculator';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { Display } from './Display';
import { HistoryPanel } from './HistoryPanel';
import { Keypad } from './Keypad';
import styles from './Calculator.module.css';

export function Calculator(): React.JSX.Element {
  const { display, history, execute, recall, clearHistory } = useCalculator();
  useKeyboardShortcuts(execute);
  return (
    <div className={styles.layout}>
      <div className={styles.card}>
        <Display model={display} />
        <Keypad execute={execute} />
      </div>
      <HistoryPanel entries={history} recall={recall} clearHistory={clearHistory} />
    </div>
  );
}
