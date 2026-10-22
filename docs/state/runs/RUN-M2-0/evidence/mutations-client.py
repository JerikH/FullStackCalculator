#!/usr/bin/env python3
"""Mutation checks for frontend/src/shared/api/calculatorApi.ts (UI-FIX-01, U29).

Each mutation edits the file in place (the pattern must be found exactly once), runs the api tests, expects a
failure, then restores the file from a copy kept in $WF_SCRATCH and compares it byte for byte.
Run with: python3 -B mutations-client.py   (after `eval "$(.workflow/bin/wf env --export)"` and nvm use 24.22.1)
"""
import os, shutil, subprocess, sys, time

ROOT = subprocess.check_output(["git", "rev-parse", "--show-toplevel"], text=True).strip()
FILE = f"{ROOT}/frontend/src/shared/api/calculatorApi.ts"
BACKUP = f"{os.environ['WF_SCRATCH']}/mut/calculatorApi.ts.orig"
os.makedirs(os.path.dirname(BACKUP), exist_ok=True)
shutil.copyfile(FILE, BACKUP)

MUTATIONS = [
    ("fallback removed (always native)",
     "if (typeof AbortSignal.timeout === 'function' && (!caller || typeof AbortSignal.any === 'function')) {",
     "if (true) {"),
    ("release emptied: timer not cleared",
     "      clearTimeout(timer);\n", ""),
    ("release emptied: listener not removed",
     "      caller?.removeEventListener('abort', onAbort);\n", ""),
    ("combineSignals moved outside the try",
     "      let status: number | undefined;\n      try {\n        combined = combineSignals(options.signal, timeoutMs);\n",
     "      let status: number | undefined;\n      combined = combineSignals(options.signal, timeoutMs);\n      try {\n"),
    ("fallback expired() inverted", "expired: () => timedOut,", "expired: () => !timedOut,"),
    ("native expired() inverted", "expired: () => signal.reason === timeout.reason,", "expired: () => signal.reason !== timeout.reason,"),
    ("timer guard removed",
     "if (!controller.signal.aborted) {\n        timedOut = true;", "{\n        timedOut = true;"),
    ("pre-aborted caller still starts a timer",
     "if (caller?.aborted) {\n    controller.abort(caller.reason);\n  } else {", "if (false) {\n  } else {"),
    ("finally release removed", "      } finally {\n        combined?.release();\n      }", "      }"),
]

env = dict(os.environ)
results = []
try:
    for name, old, new in MUTATIONS:
        src = open(BACKUP).read()
        if src.count(old) != 1:
            print(f"PATTERN NOT FOUND exactly once: {name}", file=sys.stderr)
            results.append((name, "pattern-missing", 0)); continue
        open(FILE, "w").write(src.replace(old, new))
        t = time.time()
        p = subprocess.run(["pnpm", "-C", f"{ROOT}/frontend", "exec", "vitest", "run", "src/shared/api"],
                           capture_output=True, text=True, timeout=300, env=env)
        out = p.stdout + p.stderr
        failed = [l.strip() for l in out.splitlines() if l.strip().startswith("FAIL")][:3]
        results.append((name, "KILLED" if p.returncode != 0 else "SURVIVED", round(time.time() - t, 1), failed))
        print(results[-1], flush=True)
finally:
    shutil.copyfile(BACKUP, FILE)
    assert open(FILE, "rb").read() == open(BACKUP, "rb").read(), "restore failed"
    print("restored, identical to the pre-mutation copy")
survivors = [r for r in results if r[1] != "KILLED"]
print("SURVIVORS:", survivors if survivors else "none")
sys.exit(1 if survivors else 0)
