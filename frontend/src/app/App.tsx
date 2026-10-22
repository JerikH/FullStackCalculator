import { Calculator } from '@/features/calculator';
import { ThemeToggle } from '@/shared/theme/ThemeToggle';
import styles from './App.module.css';

export function App(): React.JSX.Element {
  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <h1 className={styles.title}>Calculator</h1>
        <ThemeToggle />
      </header>
      <main className={styles.main}>
        <Calculator />
      </main>
    </div>
  );
}
