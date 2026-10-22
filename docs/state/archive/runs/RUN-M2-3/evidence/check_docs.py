#!/usr/bin/env python3
"""Static checker for the project documentation (README, API notes, verification record, ADRs).

Usage:
    python3 -B -I docs/state/runs/RUN-M2-3/evidence/check_docs.py [--root DIR] [--no-git]

Standard library only. Prints one line per rule (`PASS|FAIL|PENDING Cn description`), indented
detail lines for FAIL and PENDING, and a final `RESULT: N passed, M failed, K pending` line.
Exit status 1 when any rule FAILs, 0 otherwise (2 on usage or environment errors).

The tracked-file set is `git ls-files --cached` plus `git ls-files --others --exclude-standard`
(uncommitted new files count as "will be tracked", ignored files do not); with --no-git it is
every file under the root (used by the mutation harness on scratch copies).

Reading choices where the rule text is ambiguous (the stricter reading was taken):
  * C1: a link to a directory fails (the target must be a tracked file); same-document `#fragment`
    links are checked against the document's own heading slugs; a fragment on a non-markdown
    target fails; fragments must equal the slug exactly (lowercase).
  * C1: markdown links with any URL scheme fail in README.md and docs/api/README.md, even to
    localhost; only autolinks `<http://localhost:PORT...>` / `<http://127.0.0.1:PORT...>` pass.
  * C3: every tracked docs/adr/NNNN-*.md (except 0000) must be in the table; each ADR's own title
    heading and status line must equal the table row.
  * C5: a code that appears both in problem.go and in the edge template must cite both `service`
    and `edge`; the code list is compared with the openapi ProblemCode enum (13 codes, 11 of them
    emitted by the service; the task statement "13 codes" counts the enum; the service can emit 11 of them).
  * C9: durations are also cross-checked against the `real` line of the raw RUN-M2-1 logs.
  * C15: path spans that name a directory pass when a tracked file lives below it.
"""

from __future__ import annotations

import argparse
import json
import os
import posixpath
import re
import struct
import subprocess
import sys
import traceback
import zlib
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path
from urllib.parse import unquote

# --------------------------------------------------------------------------------------------
# Constants
# --------------------------------------------------------------------------------------------

README = "README.md"
API_README = "docs/api/README.md"
VERIFICATION = "docs/verification.md"
ADR_DIR = "docs/adr"
ADR_INDEX = "docs/adr/README.md"
DOCS = [README, API_README, VERIFICATION]

REQUIRED_SECTIONS = [
    "Overview", "Features", "Quick start", "Architecture", "API usage", "Design decisions",
    "Testing & coverage", "Configuration", "Observability", "CI/CD", "Project layout",
    "Trade-offs & future work",
]

# C15: paths the README may name before the files that create them exist (reported PENDING).
PENDING_PATHS = [
    ".github/dependabot.yml",
    "scripts/ci/image-smoke.sh",
    "scripts/ci/edge-smoke.sh",
    "scripts/ci/edge-stub-smoke.sh",
    "scripts/ci/edge-mutations.sh",
    "scripts/ci/publish-tags.sh",
]

# C4: names that are read outside the primary sources but belong in the table.
ALSO_READ = {"CI_STAGE_TIMEOUT": "scripts/ci/lib.sh"}

EVIDENCE_LOGS = "docs/state/archive/runs/RUN-M2-1/evidence/logs"

HTTP_STATUS = {
    "BadRequest": 400, "NotFound": 404, "MethodNotAllowed": 405, "RequestEntityTooLarge": 413,
    "UnsupportedMediaType": 415, "UnprocessableEntity": 422, "InternalServerError": 500,
}

EDGE_ONLY_CODES = ["RATE_LIMITED", "SERVICE_UNAVAILABLE"]
OPERATIONS = ["add", "subtract", "multiply", "divide", "power", "sqrt", "percentage"]

DESCRIPTIONS = {
    "C1": "links resolve to tracked files, no forbidden or external targets",
    "C2": "README sections equal the required list, single title",
    "C3": "Design decisions table equals the ADR index",
    "C4": "Configuration table equals the variables the sources read",
    "C5": "Problem catalog equals the contract, service and edge",
    "C6": "ADR plain-text paths exist",
    "C7": "Make targets exist and the Make table equals the Makefile",
    "C8": "ports and private port block",
    "C9": "figures equal the raw evidence and appear in README and verification",
    "C10": "screenshots exist, are PNG, right size, embedded in Overview",
    "C11": "hard-rule wording",
    "C12": "CI/CD section content",
    "C13": "API notes page and ignored generated page",
    "C14": "trade-offs and note literals",
    "C15": "README structure and plain code-span paths",
    "C16": "API usage examples structure and coverage",
}

# C9 durations: token expected in README (Testing & coverage) and docs/verification.md, and the
# raw log whose `real` line must round to it (None: no raw log holds the figure).
DURATIONS = [
    ("7.2 s", "make-coverage-backend.txt"),
    ("53.2 s", "make-coverage-frontend.txt"),
    ("1 min 5 s", "make-fuzz.txt"),
    ("54.3 s", "make-bench.txt"),
    ("47.3 s", "make-lint.txt"),
    ("16.8 s", "make-up.txt"),
    ("4 min 8 s", "e2e-chromium.txt"),
    ("4 min 9 s", "e2e-mobile.txt"),
    ("1 min 2 s", "e2e-disruptive.txt"),
    ("6.3 s", "make-image-aio.txt"),
    ("9.5 s", "make-smoke-aio.txt"),
    ("1.1 s", "make-docs-api.txt"),
]
SIZE_TOKENS = ["16.5 MB", "5.3 MB", "21.8 MB", "18.0 MB", "5.6 MB", "23.7 MB", "66.1 MB",
               "25.9 MB", "92 MB"]
REVISION = "5a00a5d"

# C4 exclusions (each with its reason).
EXCLUDED_NAMES = {
    "NGINX_ENVSUBST_FILTER",  # fixed by the web image, not user configuration
    "HOME", "PATH", "PWD",  # generic shell environment
    "CI",  # set by CI runners and by the build stage, not a project setting
    "TARGETOS", "TARGETARCH", "BUILDPLATFORM", "TARGETPLATFORM",  # BuildKit platform ARGs
    "REDOCLY_TELEMETRY", "REDOCLY_SUPPRESS_UPDATE_NOTICE",  # set inside package.json scripts
    "SHELL", "SHELLFLAGS", "CURDIR", "DEFAULT_GOAL", "PHONY",  # GNU Make internals
    "GOTOOLCHAIN", "CGO_ENABLED", "GOOS", "GOARCH",  # Go build settings fixed in Dockerfiles
    "COREPACK_ENABLE_DOWNLOAD_PROMPT",  # build-stage corepack setting
    "IMAGE",  # not a variable of the project (generic word)
}
EXCLUDED_PREFIXES = ("WF_",)  # workflow-package variables, not project configuration
NAME_RE = re.compile(r"^[A-Z][A-Z0-9_]*$")

KNOWN_EXTS = (".go", ".ts", ".tsx", ".yaml", ".yml", ".sh", ".conf", ".template", ".css", ".js",
              ".json", ".md", ".mod", ".sum", ".env")
BARE_ROOT_FILES = {"Makefile", "Dockerfile", "compose.yaml"}
STDLIB_FIRST = {
    "net", "log", "crypto", "os", "path", "encoding", "math", "io", "context", "sync", "time",
    "errors", "fmt", "strings", "strconv", "sort", "slices", "maps", "bytes", "bufio", "embed",
    "runtime", "testing", "html", "text", "unicode", "hash", "mime", "regexp", "reflect",
    "syscall", "unsafe", "flag", "expvar", "plugin", "archive", "compress", "container",
    "database", "debug", "go", "image", "index", "internal",
}
LIB_PREFIXES = ("cockroachdb/", "pb33f/", "prometheus/")

BOX_CHARS = re.compile("[─-╿]")

# --------------------------------------------------------------------------------------------
# Context and markdown model
# --------------------------------------------------------------------------------------------


class Ctx:
    def __init__(self, root: Path, no_git: bool):
        self.root = root
        self.no_git = no_git
        self._cache: dict[str, str | None] = {}
        self._docs: dict[str, "Doc | None"] = {}
        self.tracked = self._tracked_files()
        self.tracked_dirs = {posixpath.dirname(p) for p in self.tracked}
        # every ancestor directory of a tracked file
        for d in list(self.tracked_dirs):
            while d:
                self.tracked_dirs.add(d)
                d = posixpath.dirname(d)

    def _tracked_files(self) -> set[str]:
        if self.no_git:
            out = set()
            for dirpath, _dirs, files in os.walk(self.root):
                for f in files:
                    out.add(Path(dirpath, f).relative_to(self.root).as_posix())
            return out
        files: set[str] = set()
        for args in (["ls-files", "--cached", "-z"],
                     ["ls-files", "--others", "--exclude-standard", "-z"]):
            proc = subprocess.run(["git", "-C", str(self.root), *args], capture_output=True)
            if proc.returncode != 0:
                raise SystemExit("git ls-files failed: " + proc.stderr.decode(errors="replace"))
            for name in proc.stdout.decode("utf-8", errors="replace").split("\0"):
                if name and (self.root / name).is_file():
                    files.add(name)
        return files

    def read(self, rel: str) -> str | None:
        if rel not in self._cache:
            p = self.root / rel
            try:
                self._cache[rel] = p.read_text(encoding="utf-8") if p.is_file() else None
            except (OSError, UnicodeDecodeError):
                self._cache[rel] = None
        return self._cache[rel]

    def doc(self, rel: str) -> "Doc | None":
        if rel not in self._docs:
            t = self.read(rel)
            self._docs[rel] = Doc(rel, t) if t is not None else None
        return self._docs[rel]

    def exists(self, rel: str) -> bool:
        return (self.root / rel).exists()


FENCE_OPEN = re.compile(r"^\s*(`{3,}|~{3,})\s*(.*)$")
FENCE_CLOSE = re.compile(r"^\s*(`{3,}|~{3,})\s*$")
CODE_SPAN = re.compile(r"(?<!`)(`+)(?!`)(.+?)(?<!`)\1(?!`)")
HEADING = re.compile(r"^ {0,3}(#{1,6})\s+(.*?)\s*$")


class Block:
    def __init__(self, start: int, end: int, info: str, body: list[str]):
        self.start, self.end, self.info, self.body = start, end, info, body


class Doc:
    """A markdown file: lines, fenced blocks, headings (all outside fences)."""

    def __init__(self, rel: str, text: str):
        self.rel = rel
        self.text = text
        self.lines = text.split("\n")
        n = len(self.lines)
        self.infence = [False] * n
        self.blocks: list[Block] = []
        opened = None
        for i, line in enumerate(self.lines):
            if opened is None:
                m = FENCE_OPEN.match(line)
                if m and not (m.group(1)[0] == "`" and "`" in m.group(2)):
                    info = m.group(2).strip().split()
                    opened = (m.group(1)[0], len(m.group(1)), info[0] if info else "", i)
                    self.infence[i] = True
            else:
                self.infence[i] = True
                m = FENCE_CLOSE.match(line)
                if m and m.group(1)[0] == opened[0] and len(m.group(1)) >= opened[1]:
                    self.blocks.append(Block(opened[3], i, opened[2], self.lines[opened[3] + 1:i]))
                    opened = None
        if opened is not None:
            self.blocks.append(Block(opened[3], n - 1, opened[2], self.lines[opened[3] + 1:]))
        self.headings: list[tuple[int, int, str]] = []  # (line index, level, text)
        for i, line in enumerate(self.lines):
            if self.infence[i]:
                continue
            m = HEADING.match(line)
            if m:
                self.headings.append((i, len(m.group(1)), re.sub(r"\s+#+$", "", m.group(2))))

    def prose(self):
        for i, line in enumerate(self.lines):
            if not self.infence[i]:
                yield i, line

    def section(self, title: str, level: int = 2, within: tuple[int, int] | None = None):
        """(start, end) line indexes of a heading's body (exclusive of the heading), or None."""
        for k, (i, lvl, text) in enumerate(self.headings):
            if lvl == level and text == title and (within is None or within[0] <= i < within[1]):
                end = len(self.lines)
                for j, l2, _t in self.headings[k + 1:]:
                    if l2 <= level:
                        end = j
                        break
                return (i + 1, end)
        return None

    def section_text(self, rng) -> str:
        return "\n".join(self.lines[rng[0]:rng[1]])

    def slugs(self) -> set[str]:
        seen: dict[str, int] = {}
        out = set()
        for _i, _lvl, text in self.headings:
            s = slugify(text)
            n = seen.get(s, 0)
            seen[s] = n + 1
            out.add(s if n == 0 else f"{s}-{n}")
        return out


def slugify(heading: str) -> str:
    """GitHub-style heading anchor: lowercase, punctuation removed, spaces to hyphens."""
    t = re.sub(r"!?\[([^\]]*)\]\([^)]*\)", r"\1", heading)
    t = t.replace("`", "").replace("*", "")
    t = t.lower()
    t = re.sub(r"[^\w\- ]", "", t)
    return t.replace(" ", "-")


def blank_code(line: str) -> str:
    return CODE_SPAN.sub(lambda m: "c" * len(m.group(0)), line)


def code_spans(doc: Doc):
    """Yield (line index, span text) for inline code spans outside fences."""
    for i, line in doc.prose():
        for m in CODE_SPAN.finditer(line):
            yield i, m.group(2).strip()


def split_row(line: str) -> list[str]:
    s = line.strip()
    if s.startswith("|"):
        s = s[1:]
    if s.endswith("|") and not s.endswith("\\|"):
        s = s[:-1]
    return [c.replace("\\|", "|").strip() for c in re.split(r"(?<!\\)\|", s)]


def find_table(doc: Doc, header: list[str], rng: tuple[int, int] | None = None):
    """Rows (line index, cells) of the pipe table whose header equals `header`, else None."""
    lo, hi = rng if rng else (0, len(doc.lines))
    for i in range(lo, hi - 1):
        if doc.infence[i] or not doc.lines[i].lstrip().startswith("|"):
            continue
        if split_row(doc.lines[i]) != header:
            continue
        if not re.match(r"^\s*\|?\s*:?-{3,}", doc.lines[i + 1]) and not re.match(
                r"^\s*\|?\s*:?-+:?\s*\|", doc.lines[i + 1]):
            continue
        rows = []
        j = i + 2
        while j < hi and doc.lines[j].lstrip().startswith("|") and not doc.infence[j]:
            rows.append((j, split_row(doc.lines[j])))
            j += 1
        return rows
    return None


class Result:
    def __init__(self):
        self.fails: list[str] = []
        self.pends: list[str] = []

    def fail(self, msg: str):
        self.fails.append(msg)

    def pend(self, msg: str):
        self.pends.append(msg)

    @property
    def status(self) -> str:
        return "FAIL" if self.fails else ("PENDING" if self.pends else "PASS")


def loc(doc_rel: str, idx: int) -> str:
    return f"{doc_rel}:{idx + 1}"


# --------------------------------------------------------------------------------------------
# C1 links
# --------------------------------------------------------------------------------------------

LINK_RE = re.compile(
    r"(!?)\[((?:[^\[\]]|\[[^\]]*\])*)\]\(\s*(<[^>]*>|[^)\s]*)(?:\s+(?:\"[^\"]*\"|'[^']*'))?\s*\)")
REF_DEF_RE = re.compile(r"^\s{0,3}\[[^\]]+\]:\s*(<[^>]*>|\S+)")
AUTOLINK_RE = re.compile(r"<([A-Za-z][A-Za-z0-9+.-]*:[^<>\s]*)>")
SCHEME_RE = re.compile(r"^(?:[A-Za-z][A-Za-z0-9+.-]*:|//)")
LOCAL_AUTOLINK = re.compile(r"^http://(?:localhost|127\.0\.0\.1):\d+(?:[/?#].*)?$")


def collect_links(doc: Doc):
    """(line index, kind, target) for links, images, reference definitions and autolinks."""
    out = []
    for i, line in doc.prose():
        b = blank_code(line)
        for m in LINK_RE.finditer(b):
            t = m.group(3)
            t = t[1:-1] if t.startswith("<") else t
            out.append((i, "image" if m.group(1) else "link", t))
        m = REF_DEF_RE.match(b)
        if m:
            t = m.group(1)
            out.append((i, "link", t[1:-1] if t.startswith("<") else t))
        for m in AUTOLINK_RE.finditer(b):
            out.append((i, "auto", m.group(1)))
    return out


def forbidden_target(path: str) -> str | None:
    p = path.replace("\\", "/")
    segs = [s for s in p.split("/") if s not in ("", ".")]
    if posixpath.normpath(p) == "docs/api/index.html":
        return "docs/api/index.html is generated and git-ignored"
    if segs and segs[-1] in ("CLAUDE.md", "AGENTS.md"):
        return segs[-1]
    if ".workflow" in segs:
        return ".workflow"
    if "node_modules" in segs:
        return "node_modules"
    if "coverage" in segs:
        return "coverage"
    return None


def check_c1(ctx: Ctx) -> Result:
    r = Result()
    for rel in DOCS:
        doc = ctx.doc(rel)
        if doc is None:
            r.fail(f"{rel} is missing")
            continue
        strict_scheme = rel in (README, API_README)
        for i, kind, target in collect_links(doc):
            where = loc(rel, i)
            if SCHEME_RE.match(target):
                if kind == "auto" and LOCAL_AUTOLINK.match(target):
                    continue
                if strict_scheme:
                    r.fail(f"{where}: external or scheme link `{target}` (only <http://localhost:PORT> "
                           f"autolinks are allowed)")
                continue
            if target.startswith("#"):
                frag = unquote(target[1:])
                if frag and frag not in doc.slugs():
                    r.fail(f"{where}: fragment `{target}` matches no heading of {rel}")
                continue
            path, _, frag = target.partition("#")
            path = path.split("?")[0]
            path = unquote(path)
            if not path:
                continue
            why = forbidden_target(path)
            resolved = posixpath.normpath(posixpath.join(posixpath.dirname(rel), path))
            if why is None:
                why = forbidden_target(resolved)
            if why:
                r.fail(f"{where}: link to forbidden target `{target}` ({why})")
                continue
            if resolved.startswith("../") or resolved == "..":
                r.fail(f"{where}: link `{target}` leaves the repository")
                continue
            if resolved not in ctx.tracked:
                r.fail(f"{where}: link `{target}` -> `{resolved}` is not a tracked file")
                continue
            if frag:
                frag = unquote(frag)
                if not resolved.endswith(".md"):
                    r.fail(f"{where}: fragment `#{frag}` on non-markdown target `{resolved}`")
                    continue
                tdoc = ctx.doc(resolved)
                if tdoc is None or frag not in tdoc.slugs():
                    r.fail(f"{where}: fragment `#{frag}` matches no heading of {resolved}")
    return r


# --------------------------------------------------------------------------------------------
# C2 README sections
# --------------------------------------------------------------------------------------------


def check_c2(ctx: Ctx) -> Result:
    r = Result()
    doc = ctx.doc(README)
    if doc is None:
        r.fail("README.md is missing")
        return r
    titles = [(i, t) for i, lvl, t in doc.headings if lvl == 1]
    if len(titles) != 1:
        r.fail(f"expected exactly one `# ` title, found {len(titles)}: {[t for _i, t in titles]}")
    got = [t for _i, lvl, t in doc.headings if lvl == 2]
    if got != REQUIRED_SECTIONS:
        miss = [s for s in REQUIRED_SECTIONS if s not in got]
        extra = [s for s in got if s not in REQUIRED_SECTIONS]
        dup = sorted({s for s in got if got.count(s) > 1})
        if miss:
            r.fail(f"missing sections: {miss}")
        if extra:
            r.fail(f"unexpected sections: {extra}")
        if dup:
            r.fail(f"duplicated sections: {dup}")
        if not (miss or extra or dup):
            r.fail(f"sections out of order: {got}")
    return r


# --------------------------------------------------------------------------------------------
# C3 Design decisions
# --------------------------------------------------------------------------------------------


def check_c3(ctx: Ctx) -> Result:
    r = Result()
    doc, idx = ctx.doc(README), ctx.doc(ADR_INDEX)
    if doc is None or idx is None:
        r.fail("README.md or docs/adr/README.md is missing")
        return r
    sec = doc.section("Design decisions")
    if sec is None:
        r.fail("README has no `## Design decisions` section")
        return r
    rows = find_table(doc, ["ADR", "Decision", "Status"], sec)
    irows = find_table(idx, ["ADR", "Title", "Status"])
    if rows is None:
        r.fail("README Design decisions table `| ADR | Decision | Status |` not found")
    if irows is None:
        r.fail("docs/adr/README.md table `| ADR | Title | Status |` not found")
    if rows is None or irows is None:
        return r
    link = re.compile(r"^\[(\d{4})\]\(([^)]+)\)$")

    def parse(rows_, rel, prefix):
        out = []
        for i, cells in rows_:
            if len(cells) != 3:
                r.fail(f"{loc(rel, i)}: row has {len(cells)} cells, expected 3")
                continue
            m = link.match(cells[0])
            if not m:
                r.fail(f"{loc(rel, i)}: first cell `{cells[0]}` is not `[NNNN](link)`")
                continue
            target = m.group(2)
            if not target.startswith(prefix):
                r.fail(f"{loc(rel, i)}: link target `{target}` must start with `{prefix}`")
                continue
            out.append((m.group(1), cells[1], cells[2], target[len(prefix):]))
        return out

    a = parse(rows, README, "docs/adr/")
    b = parse(irows, ADR_INDEX, "")
    if set(a) != set(b):
        for t in sorted(set(a) - set(b)):
            r.fail(f"in README table only: {t}")
        for t in sorted(set(b) - set(a)):
            r.fail(f"in docs/adr/README.md table only: {t}")
    elif a != b:
        r.fail(f"row order differs: README {[x[0] for x in a]} vs index {[x[0] for x in b]}")
    # Extra strictness: every ADR file is listed; the ADR's own heading and status agree.
    files = sorted(p for p in ctx.tracked
                   if re.match(r"^docs/adr/\d{4}-[^/]+\.md$", p) and not p.startswith("docs/adr/0000-"))
    listed = {x[3] for x in a}
    for p in files:
        if posixpath.basename(p) not in listed:
            r.fail(f"{p} is not in the Design decisions table")
    for number, title, status, fname in a:
        d = ctx.doc(f"{ADR_DIR}/{fname}")
        if d is None:
            r.fail(f"ADR file {ADR_DIR}/{fname} (table row {number}) does not exist")
            continue
        h1 = next((t for _i, lvl, t in d.headings if lvl == 1), "")
        if h1 != f"ADR-{number}: {title}":
            r.fail(f"{ADR_DIR}/{fname}: heading `{h1}` != `ADR-{number}: {title}`")
        m = re.search(r"^- \*\*Status:\*\*\s*(.+?)\s*$", d.text, re.M)
        if not m or m.group(1) != status:
            r.fail(f"{ADR_DIR}/{fname}: status `{m.group(1) if m else None}` != table `{status}`")
    return r


# --------------------------------------------------------------------------------------------
# C4 Configuration table
# --------------------------------------------------------------------------------------------


def strip_comment_lines(text: str, marker: str) -> list[str]:
    return [l for l in text.split("\n") if not l.lstrip().startswith(marker)]


def scan_variables(ctx: Ctx):
    """Return ({name: set(source files)}, config.go defaults {name: default})."""
    found: dict[str, set[str]] = {}
    defaults: dict[str, str] = {}

    def add(name: str, src: str):
        found.setdefault(name, set()).add(src)

    # backend/internal/config/config.go: get("NAME", "default") / lookup("NAME", "default"),
    # also the one-argument form lookup("NAME").
    p = "backend/internal/config/config.go"
    t = ctx.read(p)
    if t is not None:
        for m in re.finditer(r'\b(?:get|lookup)\(\s*"([A-Z][A-Z0-9_]*)"\s*,\s*"([^"]*)"\s*\)', t):
            add(m.group(1), p)
            defaults[m.group(1)] = m.group(2)
        for m in re.finditer(r'\blookup\(\s*"([A-Z][A-Z0-9_]*)"\s*\)', t):
            add(m.group(1), p)

    # scripts/ci/env.sh: words NAME= on lines starting with `export`.
    p = "scripts/ci/env.sh"
    t = ctx.read(p)
    if t is not None:
        for line in t.split("\n"):
            if re.match(r"^\s*export\s", line):
                for m in re.finditer(r"(?:^|\s)([A-Z][A-Z0-9_]*)=", line):
                    add(m.group(1), p)

    # compose.yaml: keys under `environment:` and ${NAME references (comment lines skipped).
    p = "compose.yaml"
    t = ctx.read(p)
    if t is not None:
        lines = t.split("\n")
        k = 0
        while k < len(lines):
            m = re.match(r"^(\s*)environment:\s*$", lines[k])
            if m:
                base = len(m.group(1))
                k += 1
                while k < len(lines):
                    ln = lines[k]
                    if ln.strip() and (len(ln) - len(ln.lstrip())) <= base:
                        break
                    km = re.match(r"^\s+([A-Z][A-Z0-9_]*):", ln) or re.match(
                        r"^\s+-\s*([A-Z][A-Z0-9_]*)=", ln)
                    if km and not ln.lstrip().startswith("#"):
                        add(km.group(1), p)
                    k += 1
                continue
            k += 1
        for line in strip_comment_lines(t, "#"):
            for m in re.finditer(r"\$\{([A-Z][A-Z0-9_]*)", line):
                add(m.group(1), p)

    # .env.example: live or commented assignments `# NAME=` at the start of a line.
    p = ".env.example"
    t = ctx.read(p)
    if t is not None:
        for line in t.split("\n"):
            m = re.match(r"^#?\s*([A-Z][A-Z0-9_]*)=", line)
            if m:
                add(m.group(1), p)

    # Makefile: `NAME ?=`, `NAME :=`, `NAME =` and `export` lists (top-level lines only).
    p = "Makefile"
    t = ctx.read(p)
    if t is not None:
        for line in t.split("\n"):
            if line.startswith("\t") or line.lstrip().startswith("#"):
                continue
            m = re.match(r"^(?:export\s+|override\s+)?([A-Z][A-Z0-9_]*)\s*(?:\?=|::=|:=|\+=|=)", line)
            if m:
                add(m.group(1), p)
            m = re.match(r"^export\s+(.*)$", line)
            if m:
                head = re.split(r"\?=|::=|:=|\+=|=", m.group(1))[0]
                for w in head.split():
                    if NAME_RE.match(w):
                        add(w, p)

    # Frontend sources: process.env.NAME, import.meta.env.NAME, `readonly NAME?:`.
    ts_files = ["frontend/vite.config.ts", "frontend/playwright.config.ts",
                "frontend/src/vite-env.d.ts", "frontend/src/main.tsx"]
    ts_files += sorted(f for f in ctx.tracked if f.startswith("frontend/e2e/") and f.endswith(".ts"))
    for p in ts_files:
        t = ctx.read(p)
        if t is None:
            continue
        for m in re.finditer(r"process\.env\.([A-Z][A-Z0-9_]*)", t):
            add(m.group(1), p)
        for m in re.finditer(r"process\.env\[\s*['\"]([A-Z][A-Z0-9_]*)['\"]\s*\]", t):
            add(m.group(1), p)
        for m in re.finditer(r"import\.meta\.env\.([A-Z][A-Z0-9_]*)", t):
            add(m.group(1), p)
        for m in re.finditer(r"readonly\s+([A-Z][A-Z0-9_]*)\??\s*:", t):
            add(m.group(1), p)

    # Dockerfiles: `ENV NAME=` (also `ENV NAME value`) and `ARG NAME`; continuations joined.
    for p in ("frontend/Dockerfile", "Dockerfile", "backend/Dockerfile"):
        t = ctx.read(p)
        if t is None:
            continue
        joined = re.sub(r"\\\n", " ", t)
        for line in joined.split("\n"):
            m = re.match(r"^\s*ENV\s+(.*)$", line)
            if m:
                body = m.group(1)
                toks = re.findall(r"(?:^|\s)([A-Za-z_][A-Za-z0-9_]*)=", body)
                if toks:
                    for n in toks:
                        add(n, p)
                else:
                    add(body.split()[0], p)
            m = re.match(r"^\s*ARG\s+([A-Za-z_][A-Za-z0-9_]*)", line)
            if m:
                add(m.group(1), p)

    # Names read outside the sources above (ALSO_READ): confirmed by `${NAME:-default}` in the file.
    also_defaults = {}
    for name, p in ALSO_READ.items():
        t = ctx.read(p)
        if t is not None:
            m = re.search(r"\$\{" + name + r":-([^}]*)\}", t)
            if m:
                add(name, p)
                also_defaults[name] = m.group(1)
    return found, defaults, also_defaults


def want_name(n: str) -> bool:
    return (bool(NAME_RE.match(n)) and len(n) >= 4 and n not in EXCLUDED_NAMES
            and not n.startswith(EXCLUDED_PREFIXES))


def check_c4(ctx: Ctx) -> Result:
    r = Result()
    doc = ctx.doc(README)
    if doc is None:
        r.fail("README.md is missing")
        return r
    sec = doc.section("Configuration")
    if sec is None:
        r.fail("README has no `## Configuration` section")
        return r
    rows = find_table(doc, ["Variable", "Read by", "Default", "Meaning"], sec)
    if rows is None:
        r.fail("table `| Variable | Read by | Default | Meaning |` not found in Configuration")
        return r
    found, cfg_defaults, also_defaults = scan_variables(ctx)
    scanned = {n for n in found if want_name(n)}
    table: dict[str, tuple[int, list[str]]] = {}
    for i, cells in rows:
        if len(cells) != 4:
            r.fail(f"{loc(README, i)}: row has {len(cells)} cells, expected 4")
            continue
        m = re.match(r"^`([A-Z][A-Z0-9_]*)`$", cells[0])
        if not m:
            r.fail(f"{loc(README, i)}: first cell `{cells[0]}` is not a backticked variable name")
            continue
        if m.group(1) in table:
            r.fail(f"{loc(README, i)}: `{m.group(1)}` is documented twice")
        table[m.group(1)] = (i, cells)
    for n in sorted(set(table) - scanned):
        r.fail(f"documented but not read by any source: {n}")
    for n in sorted(scanned - set(table)):
        r.fail(f"read by {sorted(found[n])} but undocumented: {n}")

    def default_cell(name):
        if name not in table:
            return None
        return table[name][1][2]

    def fmt_ok(name):
        d = default_cell(name)
        if d is None:
            return True
        if d == "—" or re.search(r"`[^`]+`", d):
            return True
        r.fail(f"{loc(README, table[name][0])}: default of {name} must be a backticked value or `—`, got `{d}`")
        return False

    # CALC_* defaults equal config.go.
    for name, want in sorted(cfg_defaults.items()):
        if not name.startswith("CALC_") or name not in table:
            continue
        if not fmt_ok(name):
            continue
        got = default_cell(name).replace("`", "")
        want_cell = want if want != "" else "—"
        if got != want_cell:
            r.fail(f"{loc(README, table[name][0])}: default of {name} is `{got}`, config.go says `{want_cell}`")

    # Literal expectations, confirmed in the sources.
    def confirm(name, value, rel, pattern):
        t = ctx.read(rel)
        if t is None or not re.search(pattern, t, re.M):
            r.fail(f"source check: {rel} does not confirm {name} = {value} (pattern {pattern!r})")
        if name not in table:
            return
        if not fmt_ok(name):
            return
        got = default_cell(name).replace("`", "")
        if got != value:
            r.fail(f"{loc(README, table[name][0])}: default of {name} is `{got}`, expected `{value}`")

    confirm("WEB_PORT", "8080", "Makefile", r"^WEB_PORT\s*\?=\s*8080\s*$")
    confirm("API_UPSTREAM", "api:8081", "frontend/Dockerfile", r"API_UPSTREAM=api:8081(?:\s|$)")
    confirm("VITE_PORT", "5173", "scripts/ci/env.sh", r"^\s*vite=5173\s*$")
    confirm("API_PROXY_TARGET", "http://localhost:8081", "frontend/vite.config.ts",
            r"process\.env\.API_PROXY_TARGET\s*\?\?\s*'http://localhost:8081'")
    confirm("FUZZTIME", "30s", "Makefile", r"^FUZZTIME\s*\?=\s*30s\s*$")
    confirm("COMPOSE_PROJECT_NAME", "fullstackcalculator", "Makefile",
            r"^COMPOSE_PROJECT_NAME\s*\?=\s*fullstackcalculator\s*$")
    for name, value in also_defaults.items():
        if name in table and fmt_ok(name):
            got = default_cell(name).replace("`", "")
            if got != value:
                r.fail(f"{loc(README, table[name][0])}: default of {name} is `{got}`, "
                       f"{ALSO_READ[name]} says `{value}`")

    # Meaning cells that must cite a value set elsewhere.
    compose = ctx.read("compose.yaml") or ""
    m = re.search(r"^\s*CALC_SHUTDOWN_DRAIN:\s*(\S+)\s*$", compose, re.M)
    if not m:
        r.fail("compose.yaml does not set CALC_SHUTDOWN_DRAIN")
    elif "CALC_SHUTDOWN_DRAIN" in table:
        meaning = table["CALC_SHUTDOWN_DRAIN"][1][3]
        if not re.search(r"(?<![\w.])" + re.escape(m.group(1)) + r"(?![\w])", meaning):
            r.fail(f"{loc(README, table['CALC_SHUTDOWN_DRAIN'][0])}: CALC_SHUTDOWN_DRAIN meaning does not "
                   f"state the Compose value `{m.group(1)}`")
    root_df = ctx.read("Dockerfile") or ""
    m = re.search(r"CALC_HTTP_ADDR=(\S+)", root_df)
    if m and "CALC_HTTP_ADDR" in table:
        meaning = table["CALC_HTTP_ADDR"][1][3]
        if m.group(1) not in meaning:
            r.fail(f"{loc(README, table['CALC_HTTP_ADDR'][0])}: CALC_HTTP_ADDR meaning does not state the "
                   f"all-in-one image value `{m.group(1)}`")
    return r


# --------------------------------------------------------------------------------------------
# C5 Problem catalog
# --------------------------------------------------------------------------------------------


def read_problem_enum(text: str) -> list[str]:
    lines = text.split("\n")
    out: list[str] = []
    i = 0
    while i < len(lines):
        if lines[i].strip() == "ProblemCode:":
            j = i + 1
            while j < len(lines) and lines[j].strip() != "enum:":
                j += 1
            j += 1
            while j < len(lines):
                m = re.match(r"^\s*-\s+([A-Z][A-Z0-9_]*)\s*$", lines[j])
                if not m:
                    break
                out.append(m.group(1))
                j += 1
            return out
        i += 1
    return out


def api_usage_range(doc: Doc):
    return doc.section("API usage")


def problem_catalog(ctx: Ctx, r: Result):
    doc = ctx.doc(README)
    if doc is None:
        r.fail("README.md is missing")
        return None
    api = api_usage_range(doc)
    if api is None:
        r.fail("README has no `## API usage` section")
        return None
    sub = doc.section("Problem catalog", 3, (api[0] - 1, api[1]))
    if sub is None:
        r.fail("no `### Problem catalog` heading inside API usage")
        return None
    rows = find_table(doc, ["Code", "Status", "Title", "Emitted by"], sub)
    if rows is None:
        r.fail("table `| Code | Status | Title | Emitted by |` not found in Problem catalog")
        return None
    return rows


def check_c5(ctx: Ctx) -> Result:
    r = Result()
    rows = problem_catalog(ctx, r)
    if rows is None:
        return r
    spec = ctx.read("backend/api/openapi.yaml")
    prob = ctx.read("backend/internal/platform/httpx/problem.go")
    edge = ctx.read("deploy/nginx/default.conf.template")
    if spec is None or prob is None or edge is None:
        r.fail("openapi.yaml, problem.go or default.conf.template is missing")
        return r
    enum = read_problem_enum(spec)
    if not enum:
        r.fail("could not read the ProblemCode enum of openapi.yaml")
        return r
    consts = {m.group(1): m.group(2) for m in re.finditer(
        r'\bCode(\w+)\s+Code\s*=\s*"([A-Z][A-Z0-9_]*)"', prob)}
    service: dict[str, tuple[int, str]] = {}
    for m in re.finditer(r'\bCode(\w+):\s*\{http\.Status(\w+),\s*"([^"]+)"\}', prob):
        if m.group(1) not in consts:
            r.fail(f"problem.go: constant Code{m.group(1)} has no string value")
            continue
        if m.group(2) not in HTTP_STATUS:
            r.fail(f"problem.go: http.Status{m.group(2)} is not in the checker's status table")
            continue
        service[consts[m.group(1)]] = (HTTP_STATUS[m.group(2)], m.group(3))
    edge_codes: dict[str, set[tuple[int, str]]] = {}
    for line in edge.split("\n"):
        mt, ms, mc = (re.search(r'"title":"([^"]*)"', line), re.search(r'"status":(\d+)', line),
                      re.search(r'"code":"([A-Z][A-Z0-9_]*)"', line))
        if mt and ms and mc:
            edge_codes.setdefault(mc.group(1), set()).add((int(ms.group(1)), mt.group(1)))
    for code, vals in edge_codes.items():
        if len(vals) > 1:
            r.fail(f"edge template gives {code} several status/title pairs: {sorted(vals)}")
    expected: dict[str, tuple[int, str]] = {}
    for code in enum:
        if code in service:
            expected[code] = service[code]
        elif code in edge_codes:
            expected[code] = sorted(edge_codes[code])[0]
        else:
            r.fail(f"{code} is in the ProblemCode enum but in neither problem.go nor the edge template")
    for code in service:
        if code not in enum:
            r.fail(f"problem.go emits {code}, which is not in the ProblemCode enum")
    for code in EDGE_ONLY_CODES:
        if code not in edge_codes:
            r.fail(f"edge template has no {code} problem")
        if code in service:
            r.fail(f"problem.go unexpectedly emits the edge-only code {code}")
    for code in service:
        if code in edge_codes and edge_codes[code] != {service[code]}:
            r.fail(f"{code}: edge {sorted(edge_codes[code])} differs from service {service[code]}")

    codes_doc = []
    for i, cells in rows:
        if len(cells) != 4:
            r.fail(f"{loc(README, i)}: row has {len(cells)} cells, expected 4")
            continue
        m = re.match(r"^`([A-Z][A-Z0-9_]*)`$", cells[0])
        if not m:
            r.fail(f"{loc(README, i)}: first cell `{cells[0]}` is not a backticked code")
            continue
        code = m.group(1)
        codes_doc.append(code)
        if code not in expected:
            continue
        st, title = expected[code]
        if cells[1] != str(st):
            r.fail(f"{loc(README, i)}: {code} status `{cells[1]}` != contract {st}")
        if cells[2] != title:
            r.fail(f"{loc(README, i)}: {code} title `{cells[2]}` != `{title}`")
        by = cells[3].strip().lower()
        has_service = re.search(r"\bservice\b", by) is not None
        has_edge = re.search(r"\bedge\b", by) is not None
        in_service, in_edge = code in service, code in edge_codes
        if not by:
            r.fail(f"{loc(README, i)}: {code} has an empty `Emitted by` cell")
        elif in_service and in_edge:
            if not (has_service and has_edge):
                r.fail(f"{loc(README, i)}: {code} is emitted by service and edge; cell is `{cells[3]}`")
        elif in_service:
            if not by.startswith("service"):
                r.fail(f"{loc(README, i)}: {code} `Emitted by` must start with `service`, got `{cells[3]}`")
        elif in_edge:
            if not by.startswith("edge") or has_service:
                r.fail(f"{loc(README, i)}: {code} `Emitted by` must start with `edge` and not cite "
                       f"`service`, got `{cells[3]}`")
    if codes_doc != enum:
        r.fail(f"catalog codes {codes_doc} != ProblemCode enum {enum}")
    return r


# --------------------------------------------------------------------------------------------
# C6 ADR plain-text paths
# --------------------------------------------------------------------------------------------

SPAN_SKIP_CHARS = set(" *{}<>$[(")


def normalise_path_span(span: str) -> str | None:
    """Return a repository path candidate from a code span, or None when it must be skipped."""
    s = span.strip()
    if not s or any(c in SPAN_SKIP_CHARS for c in s):  # spaces, globs, templates, calls
        return None
    if s.startswith(("/", "http", "-")):  # routes, URLs, flags
        return None
    prev = None
    while prev != s:
        prev = s
        s = re.sub(r":\d+(?:-\d+)?$", "", s)
        s = s.rstrip(",.;")
        if s.endswith("/") and len(s) > 1:
            s = s[:-1]
    return s or None


def is_path_like(s: str) -> bool:
    return "/" in s or s.endswith(KNOWN_EXTS) or s in BARE_ROOT_FILES


def is_foreign_path(s: str) -> bool:
    if s.startswith(("application/", "text/")):  # MIME types
        return True
    first = s.split("/")[0]
    if "/" in s:
        if "." in first and not first.startswith("."):  # github.com/..., go.yaml.in/...
            return True
        if s.startswith(LIB_PREFIXES):
            return True
    if first in STDLIB_FIRST:  # net/http, log/slog, crypto/rand...
        return True
    return False


def check_c6(ctx: Ctx) -> Result:
    r = Result()
    adrs = sorted(p for p in ctx.tracked if re.match(r"^docs/adr/0\d{3}-[^/]+\.md$", p))
    if not adrs:
        r.fail("no docs/adr/0*.md files found")
    for p in adrs:
        doc = ctx.doc(p)
        if doc is None:
            continue
        for i, span in code_spans(doc):
            s = normalise_path_span(span)
            if s is None or not is_path_like(s):
                continue
            if is_foreign_path(s):
                continue
            if "/" not in s:
                # bare file name: must exist at the repository root
                if not ctx.exists(s):
                    r.fail(f"{loc(p, i)}: `{span}` is a bare file name but {s} is not at the repository root")
                continue
            if not ctx.exists(s):
                r.fail(f"{loc(p, i)}: `{span}` does not exist as `{s}`")
    return r


# --------------------------------------------------------------------------------------------
# C7 Make targets
# --------------------------------------------------------------------------------------------


def makefile_targets(ctx: Ctx):
    t = ctx.read("Makefile")
    if t is None:
        return None, None
    helped = []
    for line in t.split("\n"):
        m = re.match(r"^([a-z][a-z0-9-]*):.*?##\s*(.*?)\s*$", line)
        if m:
            helped.append((m.group(1), m.group(2)))
    phony = set()
    for m in re.finditer(r"^\.PHONY:(.*(?:\\\n.*)*)$", t, re.M):
        phony.update(m.group(1).replace("\\\n", " ").split())
    return helped, phony


def make_tokens(doc: Doc):
    """(line index, target) for `make <target>` in fenced shell blocks and inline code spans only."""
    out = []
    pat = re.compile(r"(?<![\w-])make\s+([a-z][a-z0-9-]*)")
    for b in doc.blocks:
        if b.info not in ("", "bash", "sh", "shell", "console", "zsh"):
            continue
        for k, line in enumerate(b.body):
            code = re.sub(r"(^|\s)#.*$", "", line)
            for m in pat.finditer(code):
                out.append((b.start + 1 + k, m.group(1)))
    for i, span in code_spans(doc):
        for m in pat.finditer(span):
            out.append((i, m.group(1)))
    return out


def norm_desc(s: str) -> str:
    return re.sub(r"\s+", " ", s.strip().rstrip(".")).lower()


def check_c7(ctx: Ctx) -> Result:
    r = Result()
    helped, phony = makefile_targets(ctx)
    if helped is None:
        r.fail("Makefile is missing")
        return r
    names = [n for n, _d in helped]
    for n in names:
        if n not in phony:
            r.fail(f"Makefile target `{n}` has a `##` description but is not in .PHONY")
    for n in sorted(phony - set(names)):
        r.fail(f"Makefile .PHONY target `{n}` has no `##` description (missing from `make help`)")
    for rel in DOCS:
        doc = ctx.doc(rel)
        if doc is None:
            r.fail(f"{rel} is missing")
            continue
        for i, target in make_tokens(doc):
            if target not in phony or target not in names:
                r.fail(f"{loc(rel, i)}: `make {target}` is not a Makefile target")
    doc = ctx.doc(README)
    if doc is None:
        return r
    qs = doc.section("Quick start")
    sub = doc.section("Make targets", 3, (qs[0] - 1, qs[1])) if qs else None
    if sub is None:
        r.fail("no `### Make targets` heading inside Quick start")
        return r
    rows = find_table(doc, ["Target", "What it does"], sub)
    if rows is None:
        r.fail("table `| Target | What it does |` not found in Make targets")
        return r
    listed = []
    for i, cells in rows:
        if len(cells) != 2:
            r.fail(f"{loc(README, i)}: row has {len(cells)} cells, expected 2")
            continue
        m = re.match(r"^`([a-z][a-z0-9-]*)`$", cells[0])
        if not m:
            r.fail(f"{loc(README, i)}: first cell `{cells[0]}` is not a backticked target")
            continue
        listed.append((m.group(1), cells[1], i))
    got = [x[0] for x in listed]
    if len(set(got)) != len(got):
        r.fail(f"targets listed more than once: {sorted({g for g in got if got.count(g) > 1})}")
    if got != names:
        miss = [n for n in names if n not in got]
        extra = [g for g in got if g not in names]
        if miss:
            r.fail(f"Make table is missing targets: {miss}")
        if extra:
            r.fail(f"Make table lists unknown targets: {extra}")
        if not (miss or extra) and len(set(got)) == len(got):
            r.fail(f"Make table order differs from the Makefile: {got} vs {names}")
    desc = dict(helped)
    for n, d, i in listed:
        if n in desc and norm_desc(d) != norm_desc(desc[n]):
            r.fail(f"{loc(README, i)}: `{n}` description `{d}` != Makefile `{desc[n]}`")
    return r


# --------------------------------------------------------------------------------------------
# C8 Ports
# --------------------------------------------------------------------------------------------


def check_c8(ctx: Ctx) -> Result:
    r = Result()
    block = re.compile(r"(?<!\d)(41(?:1\d|2[0-3]))(?!\d)")
    for rel in (README, API_README):
        t = ctx.read(rel)
        if t is None:
            r.fail(f"{rel} is missing")
            continue
        for i, line in enumerate(t.split("\n")):
            for m in block.finditer(line):
                r.fail(f"{loc(rel, i)}: private worker port {m.group(1)} must not appear")

    def need(rel, pattern, what):
        t = ctx.read(rel)
        if t is None or not re.search(pattern, t, re.M):
            r.fail(f"{rel}: expected {what}")

    need("compose.yaml", r"\$\{WEB_PORT:-8080\}:8080", "`${WEB_PORT:-8080}:8080`")
    need("compose.yaml", r"^\s*CALC_HTTP_ADDR:\s*:8081\s*$", "`CALC_HTTP_ADDR: :8081`")
    need("compose.yaml", r"^\s*CALC_ADMIN_ADDR:\s*:9091\s*$", "`CALC_ADMIN_ADDR: :9091`")
    for pat, what in ((r"^\s*web=8080\s*$", "web=8080"), (r"^\s*http=:8081\s*$", "http=:8081"),
                      (r"^\s*admin=:9091\s*$", "admin=:9091"), (r"^\s*vite=5173\s*$", "vite=5173")):
        need("scripts/ci/env.sh", pat, f"main-branch value `{what}`")
    need("backend/internal/config/config.go", r'get\("CALC_HTTP_ADDR",\s*":8081"\)', "default :8081")
    need("backend/internal/config/config.go", r'get\("CALC_ADMIN_ADDR",\s*":9091"\)', "default :9091")
    t = ctx.read(README) or ""
    for needle in ("localhost:8080", "localhost:8081", "localhost:9091", "localhost:5173"):
        if needle not in t:
            r.fail(f"README.md does not mention {needle}")
    return r


# --------------------------------------------------------------------------------------------
# C9 Figures
# --------------------------------------------------------------------------------------------


def norm_numbers(text: str) -> str:
    text = re.sub(r"[   ]", "", text)  # thin / no-break thousands separators
    prev = None
    while prev != text:
        prev = text
        text = re.sub(r"(?<=\d),(?=\d{3}(?!\d))", "", text)
    return text


def has_num(text: str, token: str) -> bool:
    return re.search(r"(?<![\d.])" + re.escape(token) + r"(?![\d])", text) is not None


def has_pct(text: str, number: str) -> bool:
    return re.search(r"(?<![\d.])" + re.escape(number) + r"\s?%", text) is not None


def fmt_duration(seconds: Decimal) -> str:
    if seconds < 60:
        return f"{seconds.quantize(Decimal('0.1'), rounding=ROUND_HALF_UP)} s"
    total = int(seconds.quantize(Decimal(1), rounding=ROUND_HALF_UP))
    return f"{total // 60} min {total % 60} s"


def real_seconds(text: str) -> Decimal | None:
    ms = re.findall(r"^real\s+(\d+)m([\d.]+)s\s*$", text, re.M)
    if not ms:
        return None
    m, s = ms[-1]
    return Decimal(m) * 60 + Decimal(s)


def check_c9(ctx: Ctx) -> Result:
    r = Result()
    readme, ver = ctx.doc(README), ctx.doc(VERIFICATION)
    if readme is None or ver is None:
        r.fail("README.md or docs/verification.md is missing")
        return r
    sec = readme.section("Testing & coverage")
    if sec is None:
        r.fail("README has no `## Testing & coverage` section")
        return r
    rt = norm_numbers(readme.section_text(sec))
    rlines = [norm_numbers(l) for l in readme.lines[sec[0]:sec[1]]]
    vt = norm_numbers(ver.text)
    vlines = [norm_numbers(l) for l in ver.lines]

    logs = {}
    for name in ("make-coverage-backend.txt", "make-coverage-frontend.txt", "make-bench.txt",
                 *[d[1] for d in DURATIONS]):
        t = ctx.read(f"{EVIDENCE_LOGS}/{name}")
        if t is None:
            r.fail(f"evidence log {EVIDENCE_LOGS}/{name} is missing")
        logs[name] = t
    if any(v is None for v in logs.values()):
        return r

    def line_with(lines, *needles, pred=None):
        for l in lines:
            if all(n in l for n in needles) and (pred is None or pred(l)):
                return l
        return None

    # --- backend coverage
    m = re.search(r"covered (\d+) of (\d+) statements: percent ([\d.]+)", logs["make-coverage-backend.txt"])
    if not m:
        r.fail("make-coverage-backend.txt has no `covered N of M statements: percent P` line")
    else:
        cov, tot, pct = m.groups()
        for label, lines in (("README", rlines), ("verification.md", vlines)):
            l = line_with(lines, "Backend", pred=lambda x: has_pct(x, pct))
            if l is None:
                r.fail(f"{label}: no `Backend` row with {pct} %")
            elif f"{cov} of {tot}" not in l:
                r.fail(f"{label}: Backend row lacks `{cov} of {tot}`: {l.strip()}")
    # --- frontend coverage
    ft = logs["make-coverage-frontend.txt"]
    for label_ev, label_doc in (("Statements", "Frontend statements"), ("Branches", "Frontend branches"),
                                ("Functions", "Frontend functions"), ("Lines", "Frontend lines")):
        m = re.search(label_ev + r"\s*:\s*([\d.]+)%\s*\(\s*(\d+)/(\d+)\s*\)", ft)
        if not m:
            r.fail(f"make-coverage-frontend.txt has no `{label_ev}` summary line")
            continue
        pct, cov, tot = m.groups()
        for dl, lines in (("README", rlines), ("verification.md", vlines)):
            l = line_with([x for x in lines], pred=lambda x: label_doc.lower() in x.lower() and has_pct(x, pct))
            if l is None:
                r.fail(f"{dl}: no `{label_doc}` row with {pct} %")
        l = line_with(vlines, pred=lambda x: label_doc.lower() in x.lower() and has_pct(x, pct))
        if l is not None and f"{cov} of {tot}" not in l:
            r.fail(f"verification.md: `{label_doc}` row lacks `{cov} of {tot}`: {l.strip()}")
    mt = re.search(r"Tests\s+(\d+) passed", ft)
    mf = re.search(r"Test Files\s+(\d+) passed", ft)
    if not mt or not mf:
        r.fail("make-coverage-frontend.txt has no `Tests N passed` / `Test Files N passed` line")
    else:
        for dl, text in (("README", rt), ("verification.md", vt)):
            if not re.search(r"(?<![\d.])" + mt.group(1) + r" tests in " + mf.group(1) + r" files", text):
                r.fail(f"{dl}: expected `{mt.group(1)} tests in {mf.group(1)} files`")
    # --- benchmarks (matched by case name and median, never by row order)
    bt = logs["make-bench.txt"]
    gate = bt.split("\ncase", 1)
    cases = []
    if len(gate) == 2:
        for line in gate[1].split("\n")[1:]:
            m = re.match(r"^(Benchmark\S+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*$", line)
            if m:
                cases.append(m.groups())
    if len(cases) != 13:
        r.fail(f"make-bench.txt gate table has {len(cases)} cases, expected 13")
    for name, _samples, med, mx, budget in cases:
        for dl, lines in (("README", rlines), ("verification.md", vlines)):
            l = line_with(lines, f"`{name}`")
            if l is None:
                r.fail(f"{dl}: no row for benchmark `{name}`")
                continue
            need = [med, budget] + ([mx] if dl == "verification.md" else [])
            for n in need:
                if not has_num(l, n):
                    r.fail(f"{dl}: benchmark `{name}` row lacks {int(n):,} ({'median' if n == med else 'max' if n == mx else 'budget'}): {l.strip()}")
    # --- durations and image sizes
    for brief_token, log in DURATIONS:
        real = real_seconds(logs[log])
        if real is None:
            r.fail(f"{log}: no `real` line")
            continue
        token = fmt_duration(real)  # the raw log is the authority; DURATIONS holds the usual wording
        for dl, text in (("README (Testing & coverage)", rt), ("verification.md", vt)):
            if has_token(text, token):
                continue
            stale = f" (it states `{brief_token}`, which the evidence does not support)" \
                if brief_token != token and has_token(text, brief_token) else ""
            r.fail(f"{dl}: duration `{token}` not found; evidence {log} `real` = {real} s{stale}")
    for token in SIZE_TOKENS:
        for dl, text in (("README (Testing & coverage)", rt), ("verification.md", vt)):
            if not has_token(text, token):
                r.fail(f"{dl}: image size `{token}` not found")
    # --- revision
    for dl, text in (("README", readme.text), ("verification.md", ver.text)):
        if not re.search(r"\b" + REVISION + r"\b", text):
            r.fail(f"{dl}: revision `{REVISION}` not found")
    return r


def has_token(text: str, token: str) -> bool:
    return re.search(r"(?<![\d.,])" + re.escape(token) + r"(?!\w)", text) is not None


# --------------------------------------------------------------------------------------------
# C10 Screenshots
# --------------------------------------------------------------------------------------------

PNG_SIG = b"\x89PNG\r\n\x1a\n"
DESKTOP = "docs/assets/calculator-desktop.png"
MOBILE = "docs/assets/calculator-mobile.png"


def check_c10(ctx: Ctx) -> Result:
    r = Result()
    for rel, kind in ((DESKTOP, "desktop"), (MOBILE, "mobile")):
        p = ctx.root / rel
        if not p.is_file():
            r.fail(f"{rel} does not exist")
            continue
        if rel not in ctx.tracked:
            r.fail(f"{rel} is not in the tracked set (git-ignored?)")
        data = p.read_bytes()
        if len(data) > 600 * 1024:
            r.fail(f"{rel} is {len(data)} bytes, limit {600 * 1024}")
        if data[:8] != PNG_SIG:
            r.fail(f"{rel} does not start with the PNG signature")
            continue
        if len(data) < 33 or data[8:12] != b"\x00\x00\x00\x0d" or data[12:16] != b"IHDR":
            r.fail(f"{rel}: first chunk is not a 13-byte IHDR")
            continue
        w, h = struct.unpack(">II", data[16:24])
        if zlib.crc32(data[12:29]) & 0xFFFFFFFF != struct.unpack(">I", data[29:33])[0]:
            r.fail(f"{rel}: IHDR checksum is wrong (truncated or edited header)")
        if kind == "desktop" and (w, h) != (1280, 800):
            r.fail(f"{rel} is {w}x{h}, expected exactly 1280x800")
        if kind == "mobile":
            if w != 1082:
                r.fail(f"{rel} width is {w}, expected exactly 1082 (412 CSS px x 2.625)")
            if h <= 2202:
                r.fail(f"{rel} height is {h}, expected more than 2202")
    doc = ctx.doc(README)
    if doc is None:
        r.fail("README.md is missing")
        return r
    sec = doc.section("Overview")
    if sec is None:
        r.fail("README has no `## Overview` section")
        return r
    imgs = overview_images(doc, sec)
    for rel in (DESKTOP, MOBILE):
        hits = [(i, alt) for i, alt, t in imgs if t == rel]
        if not hits:
            r.fail(f"README Overview does not embed `![alt]({rel})`")
        elif any(not alt.strip("c ") for _i, alt in hits):
            r.fail(f"README Overview: image {rel} has empty alt text")
    return r


def overview_images(doc: Doc, sec):
    out = []
    for i in range(sec[0], sec[1]):
        if doc.infence[i]:
            continue
        for m in LINK_RE.finditer(blank_code(doc.lines[i])):
            if m.group(1):
                t = m.group(3)
                out.append((i, m.group(2), t[1:-1] if t.startswith("<") else t))
    return out


# --------------------------------------------------------------------------------------------
# C11 Wording
# --------------------------------------------------------------------------------------------

WORDING_CI = [
    r"\bTODO\b", r"\bFIXME\b", r"Co-Authored", "§", r"shields\.io",
    r"github\.io", r"\.workflow", r"wf env",
    r"deferred", r"postponed", r"descoped", r"scaled back", r"temporarily",
]
# Product and planning names that committed files must never mention are NOT listed here (a committed
# list of them would break the rule it enforces): pass them with --terms-file PATH or DOC_TERMS_FILE
# (one regular expression per line, `#` comments, matched case-insensitively).
EXTRA_TERMS: list[str] = []
WORDING_CS = [r"\bT(?:1[0-9]|20|[1-9])\b"]
SECRET_PATTERNS = [r"ghp_[A-Za-z0-9]{20,}", r"AKIA[0-9A-Z]{16}", r"-----BEGIN [A-Z ]*PRIVATE KEY"]


def wording_hits(rel: str, text: str, r: Result):
    for i, line in enumerate(text.split("\n")):
        for pat in WORDING_CI + EXTRA_TERMS:
            for m in re.finditer(pat, line, re.I):
                r.fail(f"{loc(rel, i)}: forbidden wording `{m.group(0)}`")
        for pat in WORDING_CS + SECRET_PATTERNS:
            for m in re.finditer(pat, line):
                r.fail(f"{loc(rel, i)}: forbidden pattern `{m.group(0)[:40]}`")
        for m in re.finditer(r"badge", line, re.I):
            if not line[:m.start()].lower().endswith("no status "):
                r.fail(f"{loc(rel, i)}: `badge` is only allowed inside `no status badge`")


def check_c11(ctx: Ctx) -> Result:
    r = Result()
    if not EXTRA_TERMS:
        r.pend("the project-specific term list was not supplied (--terms-file or DOC_TERMS_FILE): only the generic wording rules ran")
    for rel in DOCS:
        t = ctx.read(rel)
        if t is None:
            r.fail(f"{rel} is missing")
        else:
            wording_hits(rel, t, r)
    return r


# --------------------------------------------------------------------------------------------
# C12 CI/CD
# --------------------------------------------------------------------------------------------


def check_c12(ctx: Ctx) -> Result:
    r = Result()
    doc = ctx.doc(README)
    sec = doc.section("CI/CD") if doc else None
    if sec is None:
        r.fail("README has no `## CI/CD` section")
        return r
    t = doc.section_text(sec)
    for lit in (".github/workflows/ci.yml.disabled", "ci.yml", "`contract`", "`backend`", "`frontend`",
                "`e2e`", "`images`", "`publish`", "v*", "main", "`main`", "sha-<full 40-character SHA>", "X.Y.Z",
                "Dependabot", ".github/dependabot.yml"):
        if lit not in t:
            r.fail(f"CI/CD section lacks `{lit}`")
    for lit in ("pull request", "manual dispatch", "weekly", "renaming it to"):
        if lit not in t.lower():
            r.fail(f"CI/CD section lacks `{lit}`")
    for lit in ("shields.io", "github.io"):
        if lit in t.lower():
            r.fail(f"CI/CD section contains `{lit}`")
    for i, line in enumerate(doc.lines[sec[0]:sec[1]]):
        for m in re.finditer(r"badge", line, re.I):
            if not line[:m.start()].lower().endswith("no status "):
                r.fail(f"{loc(README, sec[0] + i)}: `badge` is only allowed inside `no status badge`")
    return r


# --------------------------------------------------------------------------------------------
# C13 API notes page
# --------------------------------------------------------------------------------------------


def check_c13(ctx: Ctx) -> Result:
    r = Result()
    doc = ctx.doc(API_README)
    if doc is None:
        r.fail(f"{API_README} is missing")
        return r
    if "make docs-api" not in doc.text:
        r.fail(f"{API_README} does not contain `make docs-api`")
    if not any("docs/api/index.html" in span for _i, span in code_spans(doc)):
        r.fail(f"{API_README} does not name `docs/api/index.html` in an inline code span")
    for i, kind, target in collect_links(doc):
        if "docs/api/index.html" in target:
            r.fail(f"{loc(API_README, i)}: `docs/api/index.html` must not be a link target")
    gi = ctx.read(".gitignore")
    if gi is None or "/docs/api/index.html" not in [l.strip() for l in gi.split("\n")]:
        r.fail(".gitignore does not contain the line `/docs/api/index.html`")
    if ctx.no_git:
        r.pend("git check-ignore skipped (--no-git)")
    else:
        proc = subprocess.run(["git", "-C", str(ctx.root), "check-ignore", "-q", "docs/api/index.html"],
                              capture_output=True)
        if proc.returncode != 0:
            r.fail("`git check-ignore -q docs/api/index.html` fails: the generated page is not ignored")
    return r


# --------------------------------------------------------------------------------------------
# C14 Trade-offs literals
# --------------------------------------------------------------------------------------------


def check_c14(ctx: Ctx) -> Result:
    r = Result()
    doc = ctx.doc(README)
    if doc is None:
        r.fail("README.md is missing")
        return r
    sec = doc.section("Trade-offs & future work")
    if sec is None:
        r.fail("README has no `## Trade-offs & future work` section")
        return r
    t = doc.section_text(sec).lower()
    if "one 20 requests-per-second budget" not in t and "share one" not in t:
        r.fail("Trade-offs: neither `one 20 requests-per-second budget` nor `share one` found")
    for lit in ("userland proxy", "uncompressed", "make up", "no `storage` listener", "last writer wins",
                "cors", "accounts", "expression parsing", "distributed rate limiting", "localisation"):
        if lit not in t:
            r.fail(f"Trade-offs section lacks `{lit}`")
    for lit in ("AC, all clear", "xʸ, power", "256 characters"):
        if lit not in doc.text:
            r.fail(f"README lacks `{lit}`")
    return r


# --------------------------------------------------------------------------------------------
# C15 Structure
# --------------------------------------------------------------------------------------------

PATH_PREFIXES = ("scripts/", ".github/", "tools/", "deploy/", "docs/", "backend/", "frontend/")


def check_c15(ctx: Ctx) -> Result:
    r = Result()
    doc = ctx.doc(README)
    if doc is None:
        r.fail("README.md is missing")
        return r
    ov = doc.section("Overview")
    if ov is None:
        r.fail("README has no `## Overview` section")
    else:
        n = len(overview_images(doc, ov))
        if n != 2:
            r.fail(f"Overview has {n} images, expected exactly 2")
    arch = doc.section("Architecture")
    if arch is None:
        r.fail("README has no `## Architecture` section")
    else:
        diagrams = [b for b in doc.blocks if arch[0] <= b.start < arch[1] and b.info == "text"
                    and any(BOX_CHARS.search(l) for l in b.body)]
        if len(diagrams) < 2:
            r.fail(f"Architecture has {len(diagrams)} `text` blocks with box-drawing characters, expected >= 2")
    if "ghcr.io" in doc.text:
        r.fail("README contains `ghcr.io`")
    for i, line in enumerate(doc.lines):
        if re.search(r"(?:\bsource|(?:^|\s)\.)\s+scripts/ci/env\.sh", line):
            r.fail(f"{loc(README, i)}: env.sh sourcing instructions do not belong in the README")
    pending = set(PENDING_PATHS)
    seen = set()
    for i, span in code_spans(doc):
        s = normalise_path_span(span)
        if s is None or not s.startswith(PATH_PREFIXES):
            continue
        if "/" not in s or is_foreign_path(s):
            continue
        if s in seen:
            continue
        seen.add(s)
        if s in ctx.tracked or s in ctx.tracked_dirs:
            continue
        if s in pending:
            r.pend(f"{loc(README, i)}: `{s}` is named but not created yet")
        else:
            r.fail(f"{loc(README, i)}: `{s}` is not in the tracked set")
    return r


# --------------------------------------------------------------------------------------------
# C16 API usage structure
# --------------------------------------------------------------------------------------------


def check_c16(ctx: Ctx) -> Result:
    r = Result()
    doc = ctx.doc(README)
    if doc is None:
        r.fail("README.md is missing")
        return r
    sec = doc.section("API usage")
    if sec is None:
        r.fail("README has no `## API usage` section")
        return r
    spec = ctx.read("backend/api/openapi.yaml") or ""
    enum = read_problem_enum(spec)
    # INTERNAL_ERROR (a panic or unexpected condition) cannot be produced by any request,
    # so it has no curl example; it stays in the problem catalog (C5) like the edge-only codes.
    service_codes = [c for c in enum if c not in EDGE_ONLY_CODES and c != "INTERNAL_ERROR"]
    blocks = [b for b in doc.blocks if sec[0] <= b.start < sec[1]]
    pairs = 0
    bodies_codes: set[str] = set()
    urls = ""
    for b in blocks:
        if b.info != "bash" or "curl" not in "\n".join(b.body):
            continue
        cmd = "\n".join(b.body)
        where = loc(README, b.start)
        j = b.end + 1
        while j < len(doc.lines) and not doc.lines[j].strip():
            j += 1
        m = re.match(r"^Response `(\d{3})`", doc.lines[j]) if j < len(doc.lines) else None
        if not m:
            r.fail(f"{where}: curl block is not followed by a `Response `NNN`` line")
            continue
        k = j + 1
        while k < len(doc.lines) and not doc.lines[k].strip():
            k += 1
        nxt = next((x for x in blocks if x.start == k), None)
        if nxt is None or nxt.info != "json":
            r.fail(f"{loc(README, j)}: the Response line is not followed by a json fence")
            continue
        try:
            body = json.loads("\n".join(nxt.body))
        except ValueError as e:
            r.fail(f"{loc(README, nxt.start)}: json fence does not parse: {e}")
            continue
        if isinstance(body, dict) and "code" in body and isinstance(body.get("status"), int):
            if body["status"] != int(m.group(1)):
                r.fail(f"{loc(README, j)}: Response {m.group(1)} but body status is {body['status']}")
            bodies_codes.add(str(body["code"]))
        if re.search(r"(?:^|\s)(?:-d|--data|--data-binary)\b", cmd) and "X-Request-ID: demo-1" not in cmd:
            r.fail(f"{where}: POST example lacks `X-Request-ID: demo-1`")
        urls += cmd + "\n"
        pairs += 1
    if pairs < 19:
        r.fail(f"only {pairs} curl/Response/json examples, expected at least 19")
    for c in service_codes:
        if c not in bodies_codes:
            r.fail(f"no example body shows the problem code {c}")
    if not service_codes:
        r.fail("could not read the ProblemCode enum to derive the service codes")
    for op in OPERATIONS:
        if not re.search(r"/api/v1/operations/" + op + r"(?![\w-])", urls):
            r.fail(f"no curl example calls /api/v1/operations/{op}")
    return r


# --------------------------------------------------------------------------------------------
# main
# --------------------------------------------------------------------------------------------

CHECKS = [check_c1, check_c2, check_c3, check_c4, check_c5, check_c6, check_c7, check_c8, check_c9,
          check_c10, check_c11, check_c12, check_c13, check_c14, check_c15, check_c16]


def default_root() -> Path:
    here = Path(__file__).resolve()
    for parent in here.parents:
        if parent.name == "docs":
            return parent.parent
    return here.parents[0]


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--root", default=None, help="repository root (default: derived from this script)")
    ap.add_argument("--no-git", action="store_true", help="treat every file under root as tracked")
    ap.add_argument("--terms-file", default=os.environ.get("DOC_TERMS_FILE"),
                    help="file with extra forbidden terms (one regex per line), kept outside the repository")
    args = ap.parse_args(argv)
    if args.terms_file:
        for raw in Path(args.terms_file).read_text(encoding="utf-8").splitlines():
            raw = raw.strip()
            if raw and not raw.startswith("#"):
                EXTRA_TERMS.append(raw)
    root = Path(args.root).resolve() if args.root else default_root()
    if not root.is_dir():
        print(f"root {root} is not a directory", file=sys.stderr)
        return 2
    ctx = Ctx(root, args.no_git)
    passed = failed = pending = 0
    for fn in CHECKS:
        cid = fn.__name__.replace("check_", "").upper()
        try:
            res = fn(ctx)
        except Exception:  # a checker bug must surface as a failure, not a crash
            res = Result()
            res.fail("checker error: " + traceback.format_exc(limit=3).strip().replace("\n", " | "))
        print(f"{res.status} {cid} {DESCRIPTIONS[cid]}")
        for line in res.fails:
            print(f"    - {line}")
        for line in res.pends:
            print(f"    ~ {line}")
        if res.status == "PASS":
            passed += 1
        elif res.status == "FAIL":
            failed += 1
        else:
            pending += 1
    print(f"RESULT: {passed} passed, {failed} failed, {pending} pending")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
