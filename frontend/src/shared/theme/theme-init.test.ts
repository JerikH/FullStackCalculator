import { expect, it, vi } from 'vitest';
import { applyTheme, readTheme } from './theme';
import source from '../../../public/theme-init.js?raw';

// eslint-disable-next-line @typescript-eslint/no-implied-eval -- executes the real public/theme-init.js, a classic script served as a file
const run = new Function(source) as () => void;

it.each(['light', 'dark'])('applies the stored %s theme', (theme) => {
  window.localStorage.setItem('calculator.theme.v1', theme);
  run();
  expect(document.documentElement.getAttribute('data-theme')).toBe(theme);
});

it.each(['system', 'junk', 'LIGHT', '', null])('uses the system preference for stored %s', (theme) => {
  if (theme !== null) {
    window.localStorage.setItem('calculator.theme.v1', theme);
  }
  run();
  expect(document.documentElement.getAttribute('data-theme')).toBeNull();
});

it('uses the system preference when storage throws', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new DOMException('denied', 'SecurityError');
  });
  expect(run).not.toThrow();
  expect(document.documentElement.getAttribute('data-theme')).toBeNull();
});

it('reads exactly calculator.theme.v1 and ignores other keys', () => {
  window.localStorage.setItem('another.theme', 'dark');
  const getItem = vi.spyOn(Storage.prototype, 'getItem');
  run();
  expect(getItem).toHaveBeenCalledExactlyOnceWith('calculator.theme.v1');
  expect(document.documentElement.getAttribute('data-theme')).toBeNull();
});

it.each(['light', 'dark', 'system', 'junk', '', null, 'throw'])('bootstrap and React agree for stored %s', (stored) => {
  if (stored === 'throw') {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
  } else if (stored !== null) window.localStorage.setItem('calculator.theme.v1', stored);
  run();
  const initial = document.documentElement.getAttribute('data-theme');
  applyTheme(readTheme());
  expect(document.documentElement.getAttribute('data-theme')).toBe(initial);
});
