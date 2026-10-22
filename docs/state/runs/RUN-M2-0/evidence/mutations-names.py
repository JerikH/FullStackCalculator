#!/usr/bin/env python3
"""Mutation checks for the label-in-name change (UI-FIX-01, U28, U34): each reverts one name, then the component axe
tests ALONE (with the equality assertions filtered out by test name) must still fail, proving the rule really executes."""
import os, shutil, subprocess, sys
ROOT = subprocess.check_output(["git", "rev-parse", "--show-toplevel"], text=True).strip()
F = f"{ROOT}/frontend/src"
S = os.environ["WF_SCRATCH"] + "/mut"; os.makedirs(S, exist_ok=True)
CASES = [
    ("AC name reverted", "features/calculator/model/keypad.ts", "'AC, all clear'", "'all clear'",
     ["src/features/calculator/ui/Keypad.test.tsx", "src/app/App.test.tsx"], "axe"),
    ("xʸ name reverted", "features/calculator/model/keypad.ts", "'xʸ, power'", "'power'",
     ["src/features/calculator/ui/Keypad.test.tsx", "src/app/App.test.tsx"], "axe"),
    ("history row name reverted", "features/calculator/ui/HistoryPanel.tsx", "`${historyExpression(entry)}, use result`", "`Use result ${entry.result}`",
     ["src/features/calculator/ui/HistoryPanel.test.tsx", "src/app/App.test.tsx"], "axe"),
]
bad = 0
for name, rel, old, new, tests, pattern in CASES:
    path = f"{F}/{rel}"; orig = f"{S}/{os.path.basename(rel)}.orig"
    shutil.copyfile(path, orig)
    src = open(orig).read()
    assert src.count(old) == 1, (name, "pattern count", src.count(old))
    try:
        open(path, "w").write(src.replace(old, new))
        p = subprocess.run(["pnpm", "-C", f"{ROOT}/frontend", "exec", "vitest", "run", *tests, "-t", pattern],
                           capture_output=True, text=True, timeout=300)
        out = p.stdout + p.stderr
        fails = [l.strip() for l in out.splitlines() if l.strip().startswith("FAIL")]
        verdict = "KILLED by an axe test" if p.returncode != 0 and fails else "SURVIVED"
        if verdict == "SURVIVED": bad += 1
        print(name, "->", verdict, "|", "; ".join(f[:110] for f in fails[:3]), flush=True)
    finally:
        shutil.copyfile(orig, path)
        assert open(path, "rb").read() == open(orig, "rb").read()
print("restored; survivors:", bad)
sys.exit(1 if bad else 0)
