#!/usr/bin/env python3
"""Mutation checks for check_adrs.py (RF-DOC-02).

Copies docs/adr/ to a temporary directory, applies one mutation at a time, runs
check_adrs.py --adr-dir <copy> and expects exit 1 with a failure of the named rule.
A clean baseline run on the unmodified copy must exit 0 first. Exit 0 when every
mutation is caught, 1 otherwise.
"""

import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
CHECK = HERE / "check_adrs.py"
ROOT = Path(subprocess.run(["git", "-C", str(HERE), "rev-parse", "--show-toplevel"],
                           check=True, capture_output=True, text=True).stdout.strip())
ADR = ROOT / "docs/adr"

F = {
    1: "0001-monorepo-and-independent-services.md",
    2: "0002-decimal-arithmetic-and-string-numbers.md",
    3: "0003-provider-owned-openapi-contract.md",
    4: "0004-problem-details-and-status-semantics.md",
    5: "0005-stdlib-http-and-consumer-interfaces.md",
    6: "0006-server-arithmetic-and-pure-reducer.md",
    7: "0007-split-and-embedded-delivery.md",
    8: "0008-observability-and-drain-aware-readiness.md",
}


def edit(d, n, fn):
    p = d / (F[n] if isinstance(n, int) else n)
    p.write_text(fn(p.read_text(encoding="utf-8")), encoding="utf-8")


def section_swap(t, a, b):
    parts = re.split(r"(?m)^(?=## )", t)
    ia = next(i for i, x in enumerate(parts) if x.startswith(f"## {a}\n"))
    ib = next(i for i, x in enumerate(parts) if x.startswith(f"## {b}\n"))
    parts[ia], parts[ib] = parts[ib], parts[ia]
    return "".join(parts)


def drop_section(t, name):
    return re.sub(rf"(?ms)^## {re.escape(name)}\n.*?(?=^## )", "", t)


def empty_section(t, name):
    return re.sub(rf"(?ms)^(## {re.escape(name)}\n).*?(?=^## )", r"\1\n", t)


def keep_one_positive(t):
    head, rest = t.split("### Positive\n", 1)
    pos, tail = rest.split("### Negative\n", 1)
    bullets = [l for l in pos.splitlines() if l.startswith("- ")]
    return head + "### Positive\n" + bullets[0] + "\n\n### Negative\n" + tail


def short_reasons(t):
    return re.sub(r"(?m)^(- \*\*.+?\*\* — ).+$", r"\1too short.", t)


def readme_rows(fn):
    def apply(t):
        lines = t.splitlines()
        i = lines.index("|---|---|---|") + 1
        rows = lines[i:i + 8]
        lines[i:i + 8] = fn(rows)
        return "\n".join(lines) + "\n"
    return apply


def swap_rows(rows):
    rows[0], rows[1] = rows[1], rows[0]
    return rows


MUTATIONS = [
    ("delete 0008", "C1", lambda d: (d / F[8]).unlink()),
    ("change 0002 title", "C2", lambda d: edit(d, 2, lambda t: t.replace("# ADR-0002: Decimal", "# ADR-0002: Binary", 1))),
    ("add an author line to 0003", "C3", lambda d: edit(d, 3, lambda t: t.replace("- **Date:** 2026-10-22", "- **Date:** 2026-10-22\n- **Author:** x", 1))),
    ("status Proposed in 0001", "C3", lambda d: edit(d, 1, lambda t: t.replace("- **Status:** Accepted", "- **Status:** Proposed", 1))),
    ("change 0004 date", "C3", lambda d: edit(d, 4, lambda t: t.replace("2026-10-22", "2026-10-21", 1))),
    ("delete Decision from 0003", "C4", lambda d: edit(d, 3, lambda t: drop_section(t, "Decision"))),
    ("swap Context and Decision in 0005", "C4", lambda d: edit(d, 5, lambda t: section_swap(t, "Context", "Decision"))),
    ("empty Context of 0006", "C4", lambda d: edit(d, 6, lambda t: empty_section(t, "Context"))),
    ("delete Negative from 0006", "C5", lambda d: edit(d, 6, lambda t: t.replace("### Negative\n", "", 1))),
    ("one Positive bullet in 0007", "C5", lambda d: edit(d, 7, keep_one_positive)),
    ("short reasons in 0002", "C6", lambda d: edit(d, 2, short_reasons)),
    ("external link in 0001", "C7", lambda d: edit(d, 1, lambda t: t + "\nSee [x](https://example.com).\n")),
    ("untracked target in 0001", "C7", lambda d: edit(d, 1, lambda t: t + "\nSee [x](../../backend/internal/missing.go).\n")),
    ("anchor link in 0002", "C7", lambda d: edit(d, 2, lambda t: t + "\nSee [x](../spec/srs.md#scope).\n")),
    ("directory link in 0003", "C7", lambda d: edit(d, 3, lambda t: t + "\nSee [x](../../scripts/ci/).\n")),
    ("deferred in 0007", "C8", lambda d: edit(d, 7, lambda t: t + "\nThis part is deferred.\n")),
    ("section sign, T5, task ID, tier in 0008", "C8", lambda d: edit(d, 8, lambda t: t + "\nSee § 4, T5, OPS-CI-02 and tier 1.\n")),
    ("unknown requirement ID in 0002", "C10", lambda d: edit(d, 2, lambda t: t + "\nAs RF-CALC-99 says.\n")),
    ("invented path in 0005", "C11", lambda d: edit(d, 5, lambda t: t + "\nSee `backend/internal/bogus/x.go`.\n")),
    ("swap two index rows", "C9", lambda d: edit(d, "README.md", readme_rows(swap_rows))),
    ("change an index title", "C9", lambda d: edit(d, "README.md", lambda t: t.replace("| Split and embedded delivery |", "| Split delivery |", 1))),
    ("index status Proposed", "C9", lambda d: edit(d, "README.md", lambda t: t.replace("| Accepted |", "| Proposed |", 1))),
    ("duplicate the 0003 index row", "C9", lambda d: edit(d, "README.md", readme_rows(lambda r: r[:3] + [r[2]] + r[3:7]))),
    ("index link to a missing file", "C9", lambda d: edit(d, "README.md", lambda t: t.replace("(0004-problem", "(0004-missing-problem", 1))),
    ("cut 0004 to 30 lines", "C12", lambda d: edit(d, 4, lambda t: "\n".join(t.splitlines()[:30]) + "\n")),
]


def run(adr_dir):
    p = subprocess.run([sys.executable, str(CHECK), "--adr-dir", str(adr_dir)], capture_output=True, text=True)
    return p.returncode, [l for l in p.stdout.splitlines() if l.startswith("✘")]


def main():
    caught = 0
    with tempfile.TemporaryDirectory() as tmp:
        base = Path(tmp) / "base"
        shutil.copytree(ADR, base)
        code, fails = run(base)
        print(f"baseline: exit {code}, {len(fails)} failure(s) {'(ok)' if code == 0 else '(BASELINE MUST PASS)'}")
        if code != 0:
            for l in fails:
                print("   ", l)
            return 1
        for i, (desc, rule, mutate) in enumerate(MUTATIONS, 1):
            d = Path(tmp) / f"m{i}"
            shutil.copytree(ADR, d)
            mutate(d)
            code, fails = run(d)
            hit = [l for l in fails if l.startswith(f"✘ {rule} ")]
            good = code == 1 and bool(hit)
            caught += good
            print(f"{'caught' if good else 'MISSED'} [{rule}] {desc}: exit {code}; {hit[0] if hit else (fails[0] if fails else 'no failure')}")
    print(f"\n{caught}/{len(MUTATIONS)} mutations caught")
    return 0 if caught == len(MUTATIONS) else 1


if __name__ == "__main__":
    sys.exit(main())
