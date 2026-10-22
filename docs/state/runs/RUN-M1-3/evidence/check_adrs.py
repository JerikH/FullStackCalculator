#!/usr/bin/env python3
"""Structural and traceability checks for the architecture decision records (RF-DOC-02).

Usage: check_adrs.py [--adr-dir DIR] [--repo-root DIR]

--adr-dir   directory holding the ADR texts and README.md (default: <repo-root>/docs/adr)
--repo-root repository whose tracked files and records links and paths resolve against
            (default: the repository that holds this script)

Run after the ADRs are staged: `git ls-files` lists staged paths. Exit 0 when every
check passes, 1 otherwise; every failure is printed as a ✘ line.
"""

import argparse
import re
import subprocess
import sys
from pathlib import Path

EXPECTED = [
    ("0001-monorepo-and-independent-services.md", "Monorepo with independently deployable services"),
    ("0002-decimal-arithmetic-and-string-numbers.md", "Decimal arithmetic and decimal strings on the wire"),
    ("0003-provider-owned-openapi-contract.md", "Provider-owned OpenAPI contract"),
    ("0004-problem-details-and-status-semantics.md", "Problem details and status semantics"),
    ("0005-stdlib-http-and-consumer-interfaces.md", "Standard-library HTTP and consumer-defined interfaces"),
    ("0006-server-arithmetic-and-pure-reducer.md", "Server-authoritative arithmetic and a pure reducer"),
    ("0007-split-and-embedded-delivery.md", "Split and embedded delivery"),
    ("0008-observability-and-drain-aware-readiness.md", "Observability and drain-aware readiness"),
]
SECTIONS = ["Context", "Decision", "Consequences", "Alternatives considered"]
STATUS_LINE = "- **Status:** Accepted"
DATE_LINE = "- **Date:** 2026-10-22"
MIN_REASON = 40

# (pattern, case-insensitive)
WORDING = [
    (r"deferred", True), (r"skipped", True), (r"postponed", True), (r"descoped", True),
    (r"not yet", True), (r"for now", True), (r"later version", True), (r"not implemented", True),
    (r"\bTODO\b", True), (r"\bTBD\b", True), (r"roadmap", True), (r"milestone", True),
    (r"\bwave\b", True), (r"\btier\s*\d", True), (r"\bsrs\s*\d", True),
    (r"§", False), (r"\bT\d{1,2}\b", False), (r"\b(OPS|API|CALC|OBS|UI|DOC)-[A-Z]+-\d\d\b", False),
    (r"\bU\d+\b", False), (r"\bRUN-M", False), (r"\bM[0-9]\b", False),
]
ALLOWED_LINKS = {"backend/api/openapi.yaml", "backend/api/spec.go", "redocly.yaml", "docs/spec/srs.md"}
MIN_LINES, MAX_LINES = 50, 150
PATH_SUFFIXES = (
    ".go", ".ts", ".tsx", ".yaml", ".yml", ".md", ".sh", ".js", ".json", ".conf",
    ".template", ".env", ".example", "Dockerfile", "Makefile",
)
LINK_RE = re.compile(r"(?<!!)\[([^\]]*)\]\(([^)\s]+)\)")
SPAN_RE = re.compile(r"`([^`\n]+)`")
ID_RE = re.compile(r"\b(?:RF|RNF|UC)-[A-Z0-9]+-\d\d\b")
BRACE_RE = re.compile(r"([^\s`{}]*)\{([^{}\s`]+)\}([^\s`]*)")

failures = []


def ok(msg):
    print(f"✔ {msg}")


def fail(msg):
    failures.append(msg)
    print(f"✘ {msg}")


def tracked_files(root):
    out = subprocess.run(["git", "-C", str(root), "ls-files"], check=True, capture_output=True, text=True).stdout
    return set(out.splitlines())


def expand_braces(text):
    """Expand one level of brace groups repeatedly: a/{b,c}/d -> a/b/d a/c/d."""
    results = [text]
    changed = True
    while changed:
        changed = False
        nxt = []
        for t in results:
            m = BRACE_RE.search(t)
            if m and "," in m.group(2):
                for alt in m.group(2).split(","):
                    nxt.append(t[: m.start()] + m.group(1) + alt + m.group(3) + t[m.end():])
                changed = True
            else:
                nxt.append(t)
        results = nxt
    return results


def load_corpus(root, tracked):
    parts = []
    for pattern in ("docs/spec/*.md", "docs/state/tasks/*.md", "docs/state/context/*.md", "docs/state/waves/W1.md"):
        for p in sorted(root.glob(pattern)):
            parts.append(p.read_text(encoding="utf-8"))
    for f in ("backend/api/openapi.yaml",):
        parts.append((root / f).read_text(encoding="utf-8"))
    text = "\n".join(parts)
    tokens = set()
    # every token is kept as written and also added with its comma brace groups expanded
    for span in SPAN_RE.findall(text):
        tokens.add(span)
        tokens.update(expand_braces(span))
    for word in re.findall(r"[^\s`'\"()|;]+", text):
        for t in [word, *expand_braces(word)]:
            tokens.add(t.rstrip(".:,"))
    return text, tokens | tracked


def path_like(span):
    if span.startswith(("http://", "https://")):
        return False
    if " " in span.strip():
        return False
    return "/" in span or span.endswith(PATH_SUFFIXES)


def span_traced(span, corpus_text, corpus_tokens, tracked):
    s = span.strip().strip("\"'")
    candidates = [s, s.rstrip("/")]
    for c in candidates:
        if c in tracked or c in corpus_tokens or f"`{c}`" in corpus_text:
            return True
    if s.endswith("/"):
        if any(t.startswith(s) for t in corpus_tokens):
            return True
    # a span quoted verbatim anywhere in the records also counts
    return s in corpus_text


def split_sections(lines):
    """Return list of (heading, body_lines) for level-2 sections, and the preamble lines."""
    preamble, sections, current = [], [], None
    for line in lines:
        if line.startswith("## "):
            current = (line[3:].strip(), [])
            sections.append(current)
        elif current is None:
            preamble.append(line)
        else:
            current[1].append(line)
    return preamble, sections


def check_adr(path, number, title, repo_root, tracked, corpus_text, corpus_tokens, known_ids):
    name = path.name
    text = path.read_text(encoding="utf-8")
    lines = text.splitlines()

    # C2 heading
    want = f"# ADR-{number}: {title}"
    if lines and lines[0] == want:
        ok(f"C2 {name}: heading")
    else:
        fail(f"C2 {name}: first line must be {want!r}, got {lines[0] if lines else ''!r}")

    preamble, sections = split_sections(lines)

    # C3 status/date and nothing else
    pre_items = [l for l in preamble[1:] if l.strip()]
    if pre_items == [STATUS_LINE, DATE_LINE]:
        ok(f"C3 {name}: status Accepted, date 2026-10-22, no other front matter")
    else:
        fail(f"C3 {name}: front matter must be exactly status and date lines, got {pre_items!r}")

    # C4 sections
    heads = [h for h, _ in sections]
    if heads == SECTIONS:
        empty = [h for h, body in sections if not "".join(body).strip()]
        if empty:
            fail(f"C4 {name}: empty section(s) {empty}")
        else:
            ok(f"C4 {name}: four sections in template order, none empty")
    else:
        fail(f"C4 {name}: sections must be {SECTIONS}, got {heads}")

    body = dict(sections)

    # C5 consequences
    cons = body.get("Consequences", [])
    subs, cur = [], None
    for l in cons:
        if l.startswith("### "):
            cur = (l[4:].strip(), [])
            subs.append(cur)
        elif cur is not None:
            cur[1].append(l)
    if [h for h, _ in subs] == ["Positive", "Negative"]:
        thin = [h for h, b in subs if sum(1 for x in b if x.startswith("- ")) < 2]
        if thin:
            fail(f"C5 {name}: fewer than two bullets under {thin}")
        else:
            ok(f"C5 {name}: Positive and Negative consequences, two or more bullets each")
    else:
        fail(f"C5 {name}: Consequences must hold '### Positive' then '### Negative', got {[h for h, _ in subs]}")

    # C6 alternatives
    alts = [l for l in body.get("Alternatives considered", []) if l.startswith("- ")]
    bad, good = [], 0
    for a in alts:
        m = re.match(r"- \*\*(.+?)\*\* — (.+)$", a)
        if not m or len(m.group(2).strip()) < MIN_REASON:
            bad.append(a[:60])
        else:
            good += 1
    if good >= 2 and not bad:
        ok(f"C6 {name}: {good} alternatives, each with a reason")
    else:
        fail(f"C6 {name}: need two or more '- **name** — reason' bullets with reasons of {MIN_REASON}+ chars; bad {bad}, good {good}")

    # C7 links
    link_errors = []
    links = LINK_RE.findall(text)
    if re.search(r"<https?://", text):
        link_errors.append("autolink")
    if re.search(r"^\s*\[[^\]]+\]:\s", text, re.MULTILINE) or re.search(r"\]\[[^\]]*\]", text):
        link_errors.append("reference-style link")
    siblings = {f"docs/adr/{f}" for f, _ in EXPECTED}
    for _, target in links:
        if target.startswith(("http://", "https://", "mailto:")):
            link_errors.append(f"external link {target}")
            continue
        if "#" in target:
            link_errors.append(f"anchor link {target}")
            continue
        resolved = (repo_root / "docs/adr" / target).resolve()
        try:
            rel = resolved.relative_to(repo_root.resolve()).as_posix()
        except ValueError:
            link_errors.append(f"outside repository {target}")
            continue
        if rel not in tracked:
            link_errors.append(f"not a tracked file {target}")
        elif rel not in ALLOWED_LINKS | siblings:
            link_errors.append(f"target not in the allowed set {target}")
    if link_errors:
        for e in link_errors:
            fail(f"C7 {name}: {e}")
    else:
        ok(f"C7 {name}: {len(links)} links, all to tracked files")

    # C8 wording
    hits = []
    for pat, nocase in WORDING:
        for i, l in enumerate(lines, 1):
            if re.search(pat, l, re.IGNORECASE if nocase else 0):
                hits.append(f"line {i} /{pat}/")
    if hits:
        for h in hits:
            fail(f"C8 {name}: forbidden wording at {h}")
    else:
        ok(f"C8 {name}: no scope-reduction or planning wording")

    # C10 IDs
    ids = sorted(set(ID_RE.findall(text)))
    unknown = [i for i in ids if i not in known_ids]
    if unknown:
        fail(f"C10 {name}: unknown requirement IDs {unknown}")
    else:
        ok(f"C10 {name}: {len(ids)} requirement IDs, all defined")

    # C12 length and srs link
    n = len(lines)
    srs_links = [t for _, t in links if t == "../spec/srs.md"]
    if MIN_LINES <= n <= MAX_LINES and srs_links:
        ok(f"C12 {name}: {n} lines, links srs.md")
    else:
        fail(f"C12 {name}: {n} lines (want {MIN_LINES}-{MAX_LINES}), srs.md links {len(srs_links)}")

    # C11 path-like spans
    untraced = []
    spans = [s for s in SPAN_RE.findall(text) if path_like(s)]
    for s in spans:
        if not span_traced(s, corpus_text, corpus_tokens, tracked):
            untraced.append(s)
    if untraced:
        for s in untraced:
            fail(f"C11 {name}: path-like span not found in tracked files or records: {s!r}")
    else:
        ok(f"C11 {name}: {len(spans)} path-like spans, all traced")


def check_index(adr_dir, repo_root, tracked):
    text = (adr_dir / "README.md").read_text(encoding="utf-8")
    lines = text.splitlines()
    try:
        start = lines.index("| ADR | Title | Status |")
    except ValueError:
        fail("C9 README.md: index table header missing")
        return
    rows = []
    for l in lines[start + 2:]:
        if not l.startswith("|"):
            break
        rows.append(l)
    want = [
        f"| [{f[:4]}]({f}) | {t} | Accepted |" for f, t in EXPECTED
    ]
    if rows == want:
        ok("C9 README.md: eight rows in order, titles and status match")
    else:
        fail(f"C9 README.md: index rows differ from the expected eight ({len(rows)} rows found)")
        for r in rows:
            if r not in want:
                fail(f"C9 README.md: unexpected row {r}")
        if len(set(rows)) != len(rows):
            fail("C9 README.md: duplicate rows")
    for _, target in LINK_RE.findall(text):
        rel = (Path("docs/adr") / target).as_posix()
        if rel not in tracked:
            fail(f"C9 README.md: link target not tracked {target}")


def main():
    ap = argparse.ArgumentParser()
    default_root = Path(subprocess.run(
        ["git", "-C", str(Path(__file__).resolve().parent), "rev-parse", "--show-toplevel"],
        check=True, capture_output=True, text=True).stdout.strip())
    ap.add_argument("--repo-root", type=Path, default=default_root)
    ap.add_argument("--adr-dir", type=Path)
    args = ap.parse_args()
    repo_root = args.repo_root.resolve()
    adr_dir = (args.adr_dir or repo_root / "docs/adr").resolve()
    tracked = tracked_files(repo_root)
    corpus_text, corpus_tokens = load_corpus(repo_root, tracked)
    known_ids = set(ID_RE.findall(
        (repo_root / "docs/spec/srs.md").read_text(encoding="utf-8")
        + (repo_root / "docs/spec/use-cases.md").read_text(encoding="utf-8")
    ))

    for f, _ in EXPECTED:
        if (adr_dir / f).is_file() and f"docs/adr/{f}" in tracked:
            ok(f"C1 {f}: exists and is tracked")
        else:
            fail(f"C1 {f}: missing or not tracked")
    for f, t in EXPECTED:
        p = adr_dir / f
        if p.is_file():
            check_adr(p, f[:4], t, repo_root, tracked, corpus_text, corpus_tokens, known_ids)
    check_index(adr_dir, repo_root, tracked)

    print(f"\n{'FAIL' if failures else 'PASS'}: {len(failures)} failure(s)")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
