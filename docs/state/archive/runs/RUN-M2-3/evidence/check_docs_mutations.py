#!/usr/bin/env python3
"""Mutation harness for check_docs.py (standard library only).

Usage:
    python3 -B -I docs/state/runs/RUN-M2-3/evidence/check_docs_mutations.py [--src DIR]
        [--baseline-sub REL OLD NEW]...

It builds a scratch baseline (tempfile.mkdtemp, removed at the end) from the documents under test and
the files the checker reads, runs `check_docs.py --root <scratch> --no-git` on the untouched copy
(which must not FAIL; PENDING is allowed; otherwise it prints the output and exits 2: the documents
are fixed, never the checker), then applies each mutation to a fresh hard-linked copy of the baseline
and requires the rule it targets to FAIL.

Baseline construction:
  * real copies: README.md, docs/** (except the generated, git-ignored docs/api/index.html),
    backend/api/openapi.yaml, backend/internal/config/config.go, backend/internal/platform/httpx/problem.go,
    deploy/nginx/default.conf.template, scripts/ci/env.sh, scripts/ci/lib.sh, compose.yaml, .env.example,
    Makefile, .gitignore, frontend/Dockerfile, Dockerfile, backend/Dockerfile, frontend/vite.config.ts,
    frontend/playwright.config.ts, frontend/src/vite-env.d.ts, frontend/src/main.tsx, frontend/e2e/**.
  * empty placeholder files for every other tracked or untracked-but-not-ignored file of the source
    tree, so that existence checks (ADR paths, README paths, links) see the same file layout as the
    real repository. Pending-listed files that do not exist in the source stay absent.
  * PNG fixtures: when docs/assets/calculator-desktop.png or calculator-mobile.png do not exist in the
    source, the harness synthesizes minimal valid PNGs (1-bit grayscale, all zero) of 1280x800 and
    1082x2300 so that the other mutations stay meaningful.
  * --baseline-sub REL OLD NEW (repeatable) patches the baseline text before the run; it exists only
    to test the harness against documents with a known defect, never for the real run.
"""

from __future__ import annotations

import argparse
import os
import re
import shutil
import struct
import subprocess
import sys
import tempfile
import time
import zlib
from pathlib import Path

HERE = Path(__file__).resolve().parent
CHECKER = HERE / "check_docs.py"

COPY_FILES = [
    "README.md", "backend/api/openapi.yaml", "backend/internal/config/config.go",
    "backend/internal/platform/httpx/problem.go", "deploy/nginx/default.conf.template",
    "scripts/ci/env.sh", "scripts/ci/lib.sh", "compose.yaml", ".env.example", "Makefile", ".gitignore",
    "frontend/Dockerfile", "Dockerfile", "backend/Dockerfile", "frontend/vite.config.ts",
    "frontend/playwright.config.ts", "frontend/src/vite-env.d.ts", "frontend/src/main.tsx",
]
COPY_TREES = ["docs", "frontend/e2e"]
SKIP_FILES = {"docs/api/index.html"}
PLACEHOLDER_SKIP_PREFIXES = (".workflow/", "node_modules/", "bin/", "coverage/", ".git/")
PLACEHOLDER_SKIP_NAMES = {"CLAUDE.md", "AGENTS.md", ".wf-agent"}


class Abort(Exception):
    pass


def png_bytes(w: int, h: int) -> bytes:
    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", w, h, 1, 0, 0, 0, 0)
    raw = b"\x00" * (h * (1 + (w + 7) // 8))
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(raw, 9))
            + chunk(b"IEND", b""))


def list_source_files(src: Path) -> set[str]:
    out: set[str] = set()
    if (src / ".git").exists():
        for args in (["ls-files", "--cached", "-z"], ["ls-files", "--others", "--exclude-standard", "-z"]):
            p = subprocess.run(["git", "-C", str(src), *args], capture_output=True)
            if p.returncode == 0:
                out.update(n for n in p.stdout.decode("utf-8", "replace").split("\0") if n)
    else:
        for dp, _d, files in os.walk(src):
            for f in files:
                out.add(Path(dp, f).relative_to(src).as_posix())
    return {f for f in out if (src / f).is_file()}


def build_baseline(src: Path, base: Path) -> None:
    def copy(rel: str):
        s, d = src / rel, base / rel
        if s.is_file():
            d.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(s, d)

    for rel in COPY_FILES:
        copy(rel)
    for tree in COPY_TREES:
        for dp, _d, files in os.walk(src / tree):
            for f in files:
                rel = Path(dp, f).relative_to(src).as_posix()
                if rel not in SKIP_FILES:
                    copy(rel)
    for rel in sorted(list_source_files(src)):
        if rel.startswith(PLACEHOLDER_SKIP_PREFIXES) or Path(rel).name in PLACEHOLDER_SKIP_NAMES:
            continue
        if rel in SKIP_FILES or (base / rel).exists():
            continue
        (base / rel).parent.mkdir(parents=True, exist_ok=True)
        (base / rel).write_bytes(b"")
    for rel, (w, h) in (("docs/assets/calculator-desktop.png", (1280, 800)),
                        ("docs/assets/calculator-mobile.png", (1082, 2300))):
        if not (src / rel).is_file():
            (base / rel).parent.mkdir(parents=True, exist_ok=True)
            (base / rel).write_bytes(png_bytes(w, h))


def run_checker(root: Path) -> tuple[int, str, dict[str, str]]:
    # The checker's project-specific term list lives outside the repository; the harness proves the
    # mechanism with a synthetic term written next to the scratch copy.
    terms = root.parent / (root.name + ".terms")
    terms.write_text("# synthetic\nSYNTHETIC_FORBIDDEN_TERM\n", encoding="utf-8")
    p = subprocess.run([sys.executable, "-B", "-I", str(CHECKER), "--root", str(root), "--no-git",
                        "--terms-file", str(terms)], capture_output=True, text=True)
    status = {}
    for line in p.stdout.split("\n"):
        m = re.match(r"^(PASS|FAIL|PENDING) (C\d+) ", line)
        if m:
            status[m.group(2)] = m.group(1)
    return p.returncode, p.stdout + p.stderr, status


# ------------------------------------------------------------------ mutation helpers


def write(path: Path, text: str) -> None:
    if path.exists() or path.is_symlink():
        path.unlink()  # break the hard link to the baseline before writing
    path.write_text(text, encoding="utf-8")


def rep(rel: str, old: str, new: str, count: int = 1):
    def fn(work: Path):
        p = work / rel
        text = p.read_text(encoding="utf-8")
        if old not in text:
            raise Abort(f"{rel}: text to replace not found: {old!r}")
        write(p, text.replace(old, new) if count < 0 else text.replace(old, new, count))
    return fn


def sub(rel: str, pattern: str, repl: str, flags: int = re.M):
    def fn(work: Path):
        p = work / rel
        text = p.read_text(encoding="utf-8")
        new, n = re.subn(pattern, repl, text, count=1, flags=flags)
        if n != 1 or new == text:
            raise Abort(f"{rel}: pattern did not match or changed nothing: {pattern!r}")
        write(p, new)
    return fn


def in_readme_section(title: str, old: str, new: str, count: int = -1):
    def fn(work: Path):
        p = work / "README.md"
        text = p.read_text(encoding="utf-8")
        m = re.search(r"^## " + re.escape(title) + r"\n.*?(?=^## |\Z)", text, re.M | re.S)
        if not m:
            raise Abort(f"README section {title!r} not found")
        chunk = m.group(0)
        if old not in chunk:
            raise Abort(f"README section {title!r}: text not found: {old!r}")
        write(p, text[:m.start()] + (chunk.replace(old, new) if count < 0 else chunk.replace(old, new, count))
              + text[m.end():])
    return fn


def swap_sections(a: str, b: str):
    def fn(work: Path):
        p = work / "README.md"
        text = p.read_text(encoding="utf-8")
        parts = re.split(r"(?m)^(?=## )", text)
        names = [re.match(r"## (.*)", s).group(1).strip() if s.startswith("## ") else None for s in parts]
        if a not in names or b not in names:
            raise Abort(f"sections {a!r}/{b!r} not found")
        i, j = names.index(a), names.index(b)
        parts[i], parts[j] = parts[j], parts[i]
        write(p, "".join(parts))
    return fn


def swap_lines(rel: str, start_a: str, start_b: str):
    def fn(work: Path):
        p = work / rel
        lines = p.read_text(encoding="utf-8").split("\n")
        ia = next((k for k, l in enumerate(lines) if l.startswith(start_a)), None)
        ib = next((k for k, l in enumerate(lines) if l.startswith(start_b)), None)
        if ia is None or ib is None:
            raise Abort(f"{rel}: lines starting {start_a!r}/{start_b!r} not found")
        lines[ia], lines[ib] = lines[ib], lines[ia]
        write(p, "\n".join(lines))
    return fn


def in_adr(needle: str, old: str, new: str):
    def fn(work: Path):
        for p in sorted((work / "docs/adr").glob("0*.md")):
            text = p.read_text(encoding="utf-8")
            if needle in text:
                if old not in text:
                    raise Abort(f"{p.name}: {old!r} not found")
                write(p, text.replace(old, new, 1))
                return
        raise Abort(f"no ADR contains {needle!r}")
    return fn


def png_width(rel: str, width: int):
    def fn(work: Path):
        p = work / rel
        data = bytearray(p.read_bytes())
        before = bytes(data)
        data[16:20] = struct.pack(">I", width)
        if bytes(data) == before:
            raise Abort("png width already equals the mutation value")
        p.unlink()
        p.write_bytes(bytes(data))
    return fn


def drop_nth_response_line(n: int):
    def fn(work: Path):
        p = work / "README.md"
        text = p.read_text(encoding="utf-8")
        ms = list(re.finditer(r"^Response `\d{3}`.*\n", text, re.M))
        if len(ms) <= n:
            raise Abort("fewer Response lines than expected")
        m = ms[n]
        write(p, text[:m.start()] + text[m.end():])
    return fn


LICENSE_LINE = "Licensed under the MIT license (`LICENSE`)."
API = "docs/api/README.md"
VER = "docs/verification.md"


def add_to_license(extra: str):
    return rep("README.md", LICENSE_LINE, LICENSE_LINE + extra)


MUTATIONS = [
    ("c1-broken-link", "C1", rep("README.md", "(docs/adr/0001-monorepo-and-independent-services.md)",
                                 "(docs/adr/0001-nosuch.md)")),
    ("c1-link-index-html", "C1", sub("README.md", r"\[docs/adr/README\.md\]\(docs/adr/README\.md\)",
                                     "[page](docs/api/index.html)")),
    ("c1-https-link", "C1", add_to_license(" See [site](https://example.com).")),
    ("c1-bad-fragment", "C1", rep(API, "README.md#api-usage", "README.md#no-such-heading")),
    ("c2-swap-sections", "C2", swap_sections("Observability", "CI/CD")),
    ("c2-rename-section", "C2", rep("README.md", "## Observability\n", "## Monitoring\n")),
    ("c2-add-section", "C2", rep("README.md", "## Project layout\n", "## Extra\n\nText.\n\n## Project layout\n")),
    ("c3-adr-title", "C3", rep("README.md", "| Provider-owned OpenAPI contract | Accepted |",
                               "| Provider owned OpenAPI contract | Accepted |")),
    ("c3-drop-row", "C3", sub("README.md", r"^\| \[0008\].*\n", "")),
    ("c3-adr-status", "C3", rep("README.md", "| Observability and drain-aware readiness | Accepted |",
                                "| Observability and drain-aware readiness | Proposed |")),
    ("c4-delete-row", "C4", sub("README.md", r"^\| `FUZZTIME` .*\n", "")),
    ("c4-fake-variable", "C4", sub("README.md", r"^(\| `FUZZTIME` .*\n)",
                                   r"\1| `FAKE_VARIABLE` | Make | `1` | Invented |\n")),
    ("c4-calc-default", "C4", sub("README.md", r"(\| `CALC_LOG_LEVEL` \| service \| )`info`", r"\1`debug`")),
    ("c4-web-port-default", "C4", sub("README.md", r"(\| `WEB_PORT` \|[^|]*\| )`8080`", r"\1`9090`")),
    ("c4-drain-compose-value", "C4", sub("README.md", r"\s*\(Compose sets `2s`\)", "")),
    ("c5-status", "C5", sub("README.md", r"(\| `NOT_FOUND` \| )404", r"\g<1>400")),
    ("c5-title", "C5", rep("README.md", "| Too many requests |", "| Too Many Requests |")),
    ("c5-reorder", "C5", swap_lines("README.md", "| `NOT_FOUND` |", "| `UNKNOWN_OPERATION` |")),
    ("c5-rate-limited-service", "C5", sub("README.md", r"(\| `RATE_LIMITED` \|.*\| )edge( \|)", r"\1service\2")),
    ("c6-bare-go-sum", "C6", in_adr("`backend/go.sum`", "`backend/go.sum`", "`go.sum`")),
    ("c6-missing-path", "C6", in_adr("`backend/internal/calc`", "`backend/internal/calc`",
                                     "`backend/internal/nosuch`")),
    ("c7-unknown-target", "C7", rep("README.md", "`make bootstrap`", "`make nosuch`")),
    ("c7-drop-table-row", "C7", sub("README.md", r"^\| `fuzz` \|.*\n", "")),
    ("c7-description", "C7", rep("README.md", "Record benchmarks and enforce their budgets",
                                 "Record benchmarks and enforce budgets")),
    ("c8-private-port", "C8", add_to_license(" Port 4121.")),
    ("c9-coverage-digit", "C9", rep("README.md", "98.11 %", "98.12 %")),
    ("c9-benchmark-median", "C9", sub(VER, r"(\| `BenchmarkCalculate/power_fractional` \| )290,082", r"\g<1>290,083")),
    ("c9-revision", "C9", rep("README.md", "5a00a5d", "0000000", count=-1)),
    ("c10-png-width", "C10", png_width("docs/assets/calculator-desktop.png", 1279)),
    ("c11-extra-term", "C11", add_to_license(" See SYNTHETIC_FORBIDDEN_TERM.")),
    ("c11-task-id", "C11", add_to_license(" Task T7.")),
    ("c11-deferred", "C11", add_to_license(" This is deferred.")),
    ("c12-ci-yml-disabled", "C12", in_readme_section("CI/CD", "ci.yml.disabled", "pipeline.disabled")),
    ("c12-publish-word", "C12", in_readme_section("CI/CD", "`publish`", "`release`")),
    ("c12-badge", "C12", in_readme_section("CI/CD", "no status badge", "a status badge", 1)),
    ("c13-make-docs-api", "C13", rep(API, "make docs-api", "make docs", count=-1)),
    ("c14-userland-proxy", "C14", rep("README.md", "userland proxy", "user-land proxy")),
    ("c15-ghcr", "C15", add_to_license(" Images on ghcr.io.")),
    ("c15-plain-path", "C15", add_to_license(" See `scripts/ci/nope.sh`.")),
    ("c16-response-line", "C16", drop_nth_response_line(1)),
]


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default=None, help="repository to take the documents from (default: this one)")
    ap.add_argument("--baseline-sub", nargs=3, action="append", default=[], metavar=("REL", "OLD", "NEW"))
    args = ap.parse_args(argv)
    src = Path(args.src).resolve() if args.src else next(
        p.parent for p in HERE.parents if p.name == "docs")
    started = time.time()
    scratch = Path(tempfile.mkdtemp(prefix="check_docs_mut_"))
    try:
        base = scratch / "base"
        build_baseline(src, base)
        for rel, old, new in args.baseline_sub:
            p = base / rel
            text = p.read_text(encoding="utf-8")
            if old not in text:
                print(f"baseline-sub: {old!r} not found in {rel}")
                return 3
            write(p, text.replace(old, new))
        code, out, status = run_checker(base)
        if "FAIL" in status.values():
            print("The unmutated baseline FAILS: fix the documents, not the checker.")
            print(out)
            return 2
        print(f"baseline: no FAIL ({sum(v == 'PASS' for v in status.values())} pass, "
              f"{sum(v == 'PENDING' for v in status.values())} pending)")
        caught = 0
        for k, (name, rule, fn) in enumerate(MUTATIONS):
            work = scratch / f"w{k}"
            shutil.copytree(base, work, copy_function=os.link)
            try:
                fn(work)
            except Abort as e:
                print(f"mutation {name}: ABORT {e}")
                return 3
            _code, out, status = run_checker(work)
            failed = sorted(r for r, s in status.items() if s == "FAIL")
            if status.get(rule) == "FAIL":
                caught += 1
                print(f"mutation {name}: caught by {rule}" + (f" (also {', '.join(r for r in failed if r != rule)})"
                                                               if len(failed) > 1 else ""))
            else:
                print(f"mutation {name}: NOT CAUGHT (expected {rule}; failing rules: {failed or 'none'})")
            shutil.rmtree(work)
        print(f"{caught}/{len(MUTATIONS)} mutations caught in {time.time() - started:.1f} s")
        return 0 if caught == len(MUTATIONS) else 1
    finally:
        shutil.rmtree(scratch, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
