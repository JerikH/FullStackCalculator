#!/usr/bin/env python3
"""Mutation checks (RUN-M1-8): apply one production mutation at a time, run the covering test file(s) under
`timeout 120`, require a failure, restore the file from a scratch copy (the files are untracked at this point)."""
import os, shutil, subprocess, sys, time

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../../..'))
FE = os.path.join(ROOT, 'frontend')
SCRATCH = os.environ['WF_SCRATCH']
H = 'src/features/calculator/hooks'
UI = 'src/features/calculator/ui'
TH = 'src/shared/theme'

MUTATIONS = [
  ('stale-guard-deleted', f'{H}/useCalculator.ts', "      if (!active || controller.signal.aborted) return;\n", "", [f'{H}/useCalculator.test.tsx', f'{H}/useCalculator.unmount.test.tsx', f'{H}/useCalculator.strict.test.tsx']),
  ('completion-with-rebuilt-request', f'{H}/useCalculator.ts', "dispatch({ type: 'calculationSucceeded', request, result", "dispatch({ type: 'calculationSucceeded', request: { ...request }, result", [f'{H}/useCalculator.test.tsx']),
  ('cleanup-abort-removed', f'{H}/useCalculator.ts', "      controller.abort();\n", "", [f'{H}/useCalculator.test.tsx', f'{H}/useCalculator.unmount.test.tsx', f'{H}/useCalculator.strict.test.tsx']),
  ('persist-on-mount', f'{H}/useCalculator.ts', "if (state.history !== initialHistory.current) saveHistory(state.history);", "saveHistory(state.history);", [f'{H}/useCalculator.test.tsx']),
  ('spinner-wiring-cut', f'{H}/useCalculator.ts', "useDelayedBusy(state.status === 'busy', state.request)", "useDelayedBusy(false, null)", [f'{H}/useCalculator.test.tsx']),
  ('spinner-delay-151', f'{H}/useDelayedBusy.ts', "BUSY_SPINNER_DELAY_MS = 150", "BUSY_SPINNER_DELAY_MS = 151", [f'{H}/useDelayedBusy.test.tsx', f'{H}/useCalculator.test.tsx']),
  ('spinner-id-instead-of-identity', f'{H}/useDelayedBusy.ts', "shownFor === request", "shownFor !== null && shownFor.id === request.id", [f'{H}/useDelayedBusy.test.tsx']),
  ('enter-on-button-guard-removed', f'{H}/useKeyboardShortcuts.ts', "      if ((event.key === 'Enter' || event.key === ' ') && target?.closest(ACTIVATABLE)) return;\n", "", [f'{H}/useKeyboardShortcuts.test.tsx']),
  ('composition-guard-removed', f'{H}/useKeyboardShortcuts.ts', "        event.isComposing ||\n", "", [f'{H}/useKeyboardShortcuts.test.tsx']),
  ('keycode-229-guard-removed', f'{H}/useKeyboardShortcuts.ts', "event.keyCode === 229 // eslint-disable-line", "false // eslint-disable-line", [f'{H}/useKeyboardShortcuts.test.tsx']),
  ('editable-guard-removed', f'{H}/useKeyboardShortcuts.ts', "      if (target?.closest(EDITABLE)) return;\n", "", [f'{H}/useKeyboardShortcuts.test.tsx']),
  ('modifier-guard-removed', f'{H}/useKeyboardShortcuts.ts', "        event.ctrlKey ||\n", "", [f'{H}/useKeyboardShortcuts.test.tsx']),
  ('shortcut-listener-not-removed', f'{H}/useKeyboardShortcuts.ts', "      window.removeEventListener('keydown', onKeyDown);\n", "", [f'{H}/useKeyboardShortcuts.test.tsx']),
  ('theme-written-on-mount', f'{TH}/useTheme.ts', "    applyTheme(theme);\n", "    applyTheme(theme);\n    writeTheme(theme);\n", [f'{TH}/useTheme.test.tsx']),
  ('theme-system-sets-attribute', f'{TH}/theme.ts', "if (theme === 'system') document.documentElement.removeAttribute('data-theme');", "if (theme === 'system') document.documentElement.setAttribute('data-theme', 'system');", [f'{TH}/theme.test.ts', f'{TH}/useTheme.test.tsx']),
  ('repeat-guard-removed', f'{H}/useKeyboardShortcuts.ts', "      if (event.repeat && !REPEATABLE.has(command.kind)) return;\n", "", [f'{H}/useKeyboardShortcuts.test.tsx']),
  ('clear-refocus-on-mouse', f'{UI}/HistoryPanel.tsx', "event.detail === 0", "true", [f'{UI}/HistoryPanel.test.tsx']),
  ('history-override-not-reset', f'{UI}/HistoryPanel.tsx', "    setOverride(null);\n", "", [f'{UI}/HistoryPanel.test.tsx']),
  ('key-mousedown-not-prevented', f'{UI}/KeyButton.tsx', "  event.preventDefault();\n", "  void event;\n", [f'{UI}/KeyButton.test.tsx', f'{UI}/Keypad.test.tsx', f'{UI}/Calculator.test.tsx']),
  ('history-recall-formatted-not-raw', f'{UI}/HistoryPanel.tsx', "recall(entry.result);", "recall(formatEntry(entry.result));", [f'{UI}/HistoryPanel.test.tsx', f'{UI}/Calculator.test.tsx']),
  ('display-error-shown-in-output', f'{UI}/Display.tsx', "{error === null && (", "{(", [f'{UI}/Display.test.tsx']),
  ('display-ref-without-id-check', f'{UI}/Display.tsx', "{requestId !== undefined && requestId !== '' && <p", "{<p", [f'{UI}/Display.test.tsx']),
]

def run(tests):
    cmd = ['timeout', '120', 'pnpm', 'exec', 'vitest', 'run', *tests]
    p = subprocess.run(cmd, cwd=FE, capture_output=True, text=True)
    return p.returncode, (p.stdout + p.stderr)

def main():
    only = sys.argv[1:]
    out = []
    for name, path, old, new, tests in MUTATIONS:
        if only and name not in only:
            continue
        full = os.path.join(FE, path)
        backup = os.path.join(SCRATCH, 'mut-backup.tmp')
        shutil.copy2(full, backup)
        src = open(full).read()
        if old not in src:
            out.append(f'{name}: PATTERN NOT FOUND in {path}')
            print(out[-1]); continue
        open(full, 'w').write(src.replace(old, new, 1))
        t = time.time()
        try:
            code, text = run(tests)
        finally:
            shutil.copy2(backup, full)
        failed = [l.strip() for l in text.splitlines() if l.strip().startswith(('FAIL', '×', '✗')) or ' FAIL ' in l][:3]
        verdict = 'KILLED' if code != 0 else 'SURVIVED'
        out.append(f'{name}: {verdict} ({time.time()-t:.0f}s, exit {code}) {path} :: {failed[0] if failed else ""}')
        print(out[-1], flush=True)
    open(os.path.join(os.path.dirname(__file__), 'mutations.txt'), 'w').write('\n'.join(out) + '\n')

main()
