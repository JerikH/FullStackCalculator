import { useEffect } from 'react';
import { commandForKey } from '../model/keypad';
import type { KeyCommand } from '../model/types';

const EDITABLE =
  'textarea, select, [contenteditable]:not([contenteditable="false" i]), [role="textbox"], [role="searchbox"], [role="combobox"], input:not([type="button" i], [type="checkbox" i], [type="radio" i], [type="range" i], [type="color" i], [type="file" i], [type="image" i], [type="reset" i], [type="submit" i])';
const ACTIVATABLE =
  'button, summary, a[href], input, select, [role="button"], [role="radio"], [role="checkbox"], [role="switch"], [role="menuitem"], [role="tab"], [role="link"]';
const REPEATABLE: ReadonlySet<KeyCommand['kind']> = new Set(['digit', 'decimal', 'backspace', 'clearEntry']);
export function useKeyboardShortcuts(execute: (command: KeyCommand) => void): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.isComposing ||
        event.keyCode === 229 // eslint-disable-line @typescript-eslint/no-deprecated -- Safari confirms IME input with keyCode 229.
      )
        return;
      const node = event.target as Node | null;
      const target = node?.nodeType === 1 ? (node as Element) : node?.nodeType === 3 ? node.parentElement : null;
      if (target?.closest(EDITABLE)) return;
      if ((event.key === 'Enter' || event.key === ' ') && target?.closest(ACTIVATABLE)) return;
      const command = commandForKey(event.key);
      if (command === undefined) return;
      event.preventDefault();
      // Holding an operator, equals, sign or AC would queue a request after every answer; editing keys repeat.
      if (event.repeat && !REPEATABLE.has(command.kind)) return;
      execute(command);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [execute]);
}
