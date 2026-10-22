import { StrictMode } from 'react';
import { renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { KEYPAD } from '../model/keypad';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';
function send(key: string, target: EventTarget = window, options: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options });
  target.dispatchEvent(event);
  return event;
}
function mount() {
  const execute = vi.fn();
  renderHook(
    () => {
      useKeyboardShortcuts(execute);
    },
    { wrapper: StrictMode },
  );
  return execute;
}
for (const definition of KEYPAD) {
  it.each(definition.bindings)(`handles ${definition.id} binding %s`, (key) => {
    const execute = mount();
    expect(send(key).defaultPrevented).toBe(true);
    expect(execute).toHaveBeenCalledExactlyOnceWith(definition.command);
  });
}
it.each([' ', 'R', 'N', 'Tab', 'ArrowLeft', 'Process'])('preserves unknown key %s', (key) => {
  const execute = mount();
  expect(send(key).defaultPrevented).toBe(false);
  expect(execute).not.toHaveBeenCalled();
});
it.each([{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { isComposing: true }, { keyCode: 229 }])(
  'ignores modifier or composition %j',
  (options) => {
    const execute = mount();
    expect(send('Enter', window, options).defaultPrevented).toBe(false);
    expect(execute).not.toHaveBeenCalled();
  },
);
it.each([
  ['+', { kind: 'binary', operation: 'add' }],
  ['*', { kind: 'binary', operation: 'multiply' }],
  ['%', { kind: 'unary', operation: 'percentage' }],
  ['^', { kind: 'binary', operation: 'power' }],
] as const)('allows Shift with %s', (key, command) => {
  const execute = mount();
  expect(send(key, window, { shiftKey: true }).defaultPrevented).toBe(true);
  expect(execute).toHaveBeenCalledExactlyOnceWith(command);
});
it('ignores already prevented events', () => {
  const execute = mount();
  const event = new KeyboardEvent('keydown', { key: '5', cancelable: true });
  event.preventDefault();
  window.dispatchEvent(event);
  expect(execute).not.toHaveBeenCalled();
});
it.each([
  '<input>',
  '<input type="TEXT">',
  '<textarea></textarea>',
  '<select></select>',
  '<div contenteditable></div>',
  '<div role="textbox"></div>',
  '<div role="searchbox"></div>',
  '<div role="combobox"></div>',
  '<div contenteditable="true"><span></span></div>',
])('ignores editable target %s', (markup) => {
  const execute = mount();
  const host = document.createElement('div');
  host.innerHTML = markup;
  document.body.append(host);
  const target = host.querySelector('span') ?? host.firstElementChild;
  if (!target) throw new Error('Missing fixture');
  expect(send('5', target).defaultPrevented).toBe(false);
  expect(execute).not.toHaveBeenCalled();
  host.remove();
});
it.each(['radio', 'checkbox'])('allows digits but preserves Enter on %s inputs', (type) => {
  const execute = mount();
  const input = document.createElement('input');
  input.type = type;
  document.body.append(input);
  expect(send('5', input).defaultPrevented).toBe(true);
  expect(send('Enter', input).defaultPrevented).toBe(false);
  expect(execute).toHaveBeenCalledExactlyOnceWith({ kind: 'digit', digit: '5' });
  input.remove();
});
it('preserves button activation but handles equals and digits', () => {
  const execute = mount();
  const button = document.createElement('button');
  const span = document.createElement('span');
  button.append(span);
  document.body.append(button);
  expect(send('Enter', button).defaultPrevented).toBe(false);
  expect(send(' ', button).defaultPrevented).toBe(false);
  expect(send('Enter', span).defaultPrevented).toBe(false);
  expect(send('=', button).defaultPrevented).toBe(true);
  expect(send('7', button).defaultPrevented).toBe(true);
  expect(execute).toHaveBeenCalledTimes(2);
  button.remove();
});
it('preserves summary activation', () => {
  const execute = mount();
  const details = document.createElement('details');
  const summary = document.createElement('summary');
  details.append(summary);
  document.body.append(details);
  expect(send('Enter', summary).defaultPrevented).toBe(false);
  expect(send(' ', summary).defaultPrevented).toBe(false);
  expect(execute).not.toHaveBeenCalled();
  details.remove();
});
it('handles body, window, document and text node targets', () => {
  const execute = mount();
  const text = document.createTextNode('text');
  document.body.append(text);
  for (const target of [document.body, window, document, text]) expect(send('5', target).defaultPrevented).toBe(true);
  expect(execute).toHaveBeenCalledTimes(4);
  text.remove();
});
it('handles noneditable content and guards text inside editable content', () => {
  const execute = mount();
  const div = document.createElement('div');
  div.setAttribute('contenteditable', 'false');
  const text = document.createTextNode('text');
  div.append(text);
  document.body.append(div);
  expect(send('5', text).defaultPrevented).toBe(true);
  div.setAttribute('contenteditable', 'true');
  expect(send('5', text).defaultPrevented).toBe(false);
  expect(execute).toHaveBeenCalledOnce();
  div.remove();
});
it.each(['5', '.', ',', 'Backspace', 'Delete'])('executes repeated keydown events of the editing key %s', (key) => {
  const execute = mount();
  send(key, window, { repeat: true });
  send(key, window, { repeat: true });
  expect(execute).toHaveBeenCalledTimes(2);
});
it.each(['+', '-', '*', '/', '^', 'r', '%', 'n', 'Enter', '=', 'Escape'])(
  'ignores, but still prevents, a repeated keydown of %s (a held key must not queue requests)',
  (key) => {
    const execute = mount();
    const event = send(key, window, { repeat: true });
    expect(execute).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
    send(key, window);
    expect(execute).toHaveBeenCalledOnce();
  },
);
it('replaces callbacks with balanced listeners and removes on unmount', () => {
  const add = vi.spyOn(window, 'addEventListener');
  const remove = vi.spyOn(window, 'removeEventListener');
  const first = vi.fn();
  const second = vi.fn();
  const { rerender, unmount } = renderHook(
    ({ execute }) => {
      useKeyboardShortcuts(execute);
    },
    { initialProps: { execute: first }, wrapper: StrictMode },
  );
  rerender({ execute: second });
  send('5');
  expect(first).not.toHaveBeenCalled();
  expect(second).toHaveBeenCalledOnce();
  unmount();
  send('5');
  expect(second).toHaveBeenCalledOnce();
  const added = add.mock.calls.filter(([type]) => type === 'keydown');
  const removed = remove.mock.calls.filter(([type]) => type === 'keydown');
  expect(added).toHaveLength(3);
  expect(removed).toHaveLength(added.length);
  for (const [index, call] of added.entries()) expect(removed[index]?.[1]).toBe(call[1]);
});

it.each(['input', 'button', 'editable-text'] as const)('guards adopted foreign-realm %s targets', (kind) => {
  const execute = mount();
  const iframe = document.createElement('iframe');
  document.body.appendChild(iframe);
  const foreignDocument = iframe.contentDocument;
  if (!foreignDocument) throw new Error('Missing iframe document');
  const element = foreignDocument.createElement(kind === 'editable-text' ? 'div' : kind);
  let target: Node = element;
  if (kind === 'input') element.setAttribute('type', 'text');
  if (kind === 'editable-text') {
    element.setAttribute('contenteditable', 'true');
    target = foreignDocument.createTextNode('editable text');
    element.appendChild(target);
  }
  document.body.appendChild(document.adoptNode(element));
  try {
    expect(element instanceof Element).toBe(false);
    if (kind === 'button') {
      expect(send('Enter', target).defaultPrevented).toBe(false);
      expect(execute).not.toHaveBeenCalled();
      expect(send('=', target).defaultPrevented).toBe(true);
      expect(execute).toHaveBeenCalledExactlyOnceWith({ kind: 'equals' });
    } else {
      expect(send('5', target).defaultPrevented).toBe(false);
      expect(execute).not.toHaveBeenCalled();
    }
  } finally {
    element.remove();
    iframe.remove();
  }
});
