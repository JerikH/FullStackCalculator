#!/usr/bin/env python3
"""Structural checker for the GitHub Actions definition and the Dependabot file.

It enforces CI security and consistency rules that actionlint does not cover. It runs in
the `workflows` stage of the contract job (so on every pull request) and locally.
Python 3 standard library plus PyYAML only; no network; it never runs third-party code
(the only subprocess is `t3.sh --list`, the repository's own script).

Usage:
  check-workflow.py [--root DIR] [--workflow PATH] [--dependabot PATH] [--t3 PATH]

Defaults: root is the repository root (the parent of the `scripts` directory holding
this file), workflow `<root>/.github/workflows/ci.yml.disabled`, dependabot
`<root>/.github/dependabot.yml`, t3 `<root>/scripts/ci/t3.sh`.

Output: one line `FAIL <rule-id>: <detail>` per violation; at the end `ok: <N> rules`
and exit 0, or exit 1 when any rule failed. Exit 2 for usage, I/O or YAML parse errors.

Rule ids (workflow):
  jobs-exact                    exactly the jobs contract, backend, frontend, e2e, images, publish
  publish-needs                 publish.needs equals the other five jobs
  permissions-default           top-level permissions are exactly {contents: read}
  packages-write-only-publish   `packages: write` only in publish, whose permissions are
                                exactly {contents: read, packages: write}
  no-pull-request-target        no pull_request_target trigger
  triggers                      exactly pull_request, push (branches [main], tags ['v*']),
                                workflow_dispatch
  concurrency                   top-level concurrency with group and cancel-in-progress
  timeouts                      every job has an integer timeout-minutes
  uses-pinned                   every `uses:` is owner/name@<40 hex> with a trailing
                                `# vN[.N[.N]]` comment on the same line
  checkout-no-credentials       every actions/checkout has with.persist-credentials: false
  no-secrets-outside-publish    `secrets.` appears only as secrets.GITHUB_TOKEN inside publish
  no-expression-in-run          no `${{` inside a `run:` body. This also keeps event-derived
                                values (github.ref, github.ref_name, github.head_ref,
                                github.event.pull_request.title, github.event.pull_request.head,
                                github.sha) out of shell text: they may appear only under
                                `env:`, `if:`, `concurrency` or `with:`, never in `run:`.
  upload-retention              every actions/upload-artifact has integer retention-days 1..30
  upload-names-unique           upload-artifact names are unique across the file
  publish-if                    publish.if names push, refs/heads/main and
                                startsWith(github.ref, 'refs/tags/v'), and neither
                                pull_request nor workflow_dispatch
  node-no-literal               no `node-version:` key; setup-node uses
                                node-version-file: frontend/.node-version
  node-pin                      frontend/.node-version equals the Node tag of both Dockerfiles
  t3-calls                      every `t3.sh --job J [--stage S]` names a job and stage that
                                `t3.sh --list` declares, and every default stage is called
  paths-exist                   every scripts/... path in a `run:` body exists
  make-targets-exist            every `make <target>` in a `run:` body is a Makefile target
  artifact-paths                every upload-artifact path occurs in the Makefile, scripts or
                                the Playwright config (or is in the documented allow-list)
Rule ids (Dependabot):
  dependabot-version            `version: 2`
  dependabot-set                the exact (ecosystem, directory) pairs
  dependabot-weekly             every schedule.interval is weekly
  dependabot-groups             every entry groups exactly minor and patch; majors stay ungrouped
  dependabot-no-automerge       no auto-merge key anywhere
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path

try:
    import yaml
except ImportError:  # pragma: no cover - environment dependent
    print("check-workflow.py: install python3-yaml", file=sys.stderr)
    sys.exit(2)

WORKFLOW_RULES = [
    "jobs-exact", "publish-needs", "permissions-default", "packages-write-only-publish",
    "no-pull-request-target", "triggers", "concurrency", "timeouts", "uses-pinned",
    "checkout-no-credentials", "no-secrets-outside-publish", "no-expression-in-run",
    "upload-retention", "upload-names-unique", "publish-if", "node-no-literal", "node-pin",
    "t3-calls", "paths-exist", "make-targets-exist", "artifact-paths",
]
DEPENDABOT_RULES = [
    "dependabot-version", "dependabot-set", "dependabot-weekly", "dependabot-groups",
    "dependabot-no-automerge",
]

EXPECTED_JOBS = {"contract", "backend", "frontend", "e2e", "images", "publish"}
EXPECTED_DEPENDABOT = {
    ("gomod", "/backend"), ("npm", "/frontend"), ("docker", "/"), ("docker", "/backend"),
    ("docker", "/frontend"), ("github-actions", "/"),
}
USES_RE = re.compile(r"^[\w.-]+/[\w./-]+@[0-9a-f]{40}$")
USES_COMMENT_RE = re.compile(r"^\s+#\s*v\d+(?:\.\d+){0,2}\s*$")
# Written by `go test -fuzz` itself when it finds a crasher; no script names this path.
ARTIFACT_ALLOW = {"backend/internal/calc/testdata/fuzz"}

failures: list[tuple[str, str]] = []


def fail(rule: str, detail: str) -> None:
    failures.append((rule, detail))


def die(message: str) -> None:
    print(f"check-workflow.py: {message}", file=sys.stderr)
    sys.exit(2)


def load_yaml(path: Path):
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as exc:
        die(f"cannot read {path}: {exc.strerror or exc}")
    try:
        return text, yaml.safe_load(text)
    except yaml.YAMLError as exc:
        die(f"cannot parse {path}: {str(exc).splitlines()[0] if str(exc) else 'invalid YAML'}")


def read_text(path: Path) -> str | None:
    try:
        return path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return None


# ---------------------------------------------------------------- workflow helpers

def as_dict(value) -> dict:
    return value if isinstance(value, dict) else {}


def jobs_of(doc: dict) -> dict:
    return {str(k): as_dict(v) for k, v in as_dict(doc.get("jobs")).items()}


def steps_of(job: dict) -> list[dict]:
    steps = job.get("steps")
    return [s for s in steps if isinstance(s, dict)] if isinstance(steps, list) else []


def triggers_of(doc: dict) -> dict:
    # PyYAML (YAML 1.1) parses the key `on` as boolean True.
    on = doc.get("on", doc.get(True))
    if isinstance(on, dict):
        return {str(k): v for k, v in on.items()}
    if isinstance(on, str):
        return {on: None}
    if isinstance(on, list):
        return {str(k): None for k in on}
    return {}


def is_int(value) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def job_line_ranges(lines: list[str]) -> dict[str, tuple[int, int]]:
    """Map job id -> (first, last) 1-based line numbers, from the raw text."""
    ranges: dict[str, tuple[int, int]] = {}
    in_jobs = False
    current = None
    start = 0
    for number, line in enumerate(lines, 1):
        if re.match(r"^jobs:\s*(#.*)?$", line):
            in_jobs = True
            continue
        if not in_jobs:
            continue
        if line.strip() and not line.startswith((" ", "#")):
            if current:
                ranges[current] = (start, number - 1)
            current = None
            in_jobs = False
            continue
        match = re.match(r"^  ([\w-]+):\s*(#.*)?$", line)
        if match:
            if current:
                ranges[current] = (start, number - 1)
            current, start = match.group(1), number
    if current:
        ranges[current] = (start, len(lines))
    return ranges


def line_job(number: int, ranges: dict[str, tuple[int, int]]) -> str | None:
    for name, (first, last) in ranges.items():
        if first <= number <= last:
            return name
    return None


def run_bodies(jobs: dict) -> list[tuple[str, str]]:
    out = []
    for jid, job in jobs.items():
        for step in steps_of(job):
            if isinstance(step.get("run"), str):
                out.append((jid, step["run"]))
    return out


def steps_using(jobs: dict, prefix: str) -> list[tuple[str, dict]]:
    out = []
    for jid, job in jobs.items():
        for step in steps_of(job):
            uses = step.get("uses")
            if isinstance(uses, str) and uses.split("@", 1)[0] == prefix:
                out.append((jid, step))
    return out


# ---------------------------------------------------------------- workflow rules

def rule_jobs_exact(jobs: dict) -> None:
    names = set(jobs)
    if names != EXPECTED_JOBS:
        fail("jobs-exact", f"jobs are {sorted(names)}; expected {sorted(EXPECTED_JOBS)}")


def rule_publish_needs(jobs: dict) -> None:
    needs = as_dict(jobs.get("publish")).get("needs")
    if isinstance(needs, str):
        needs = [needs]
    if not isinstance(needs, list):
        fail("publish-needs", "publish has no needs list")
        return
    expected = EXPECTED_JOBS - {"publish"}
    if set(needs) != expected:
        fail("publish-needs", f"publish.needs is {sorted(map(str, needs))}; expected {sorted(expected)}")


def rule_permissions_default(doc: dict) -> None:
    if doc.get("permissions") != {"contents": "read"}:
        fail("permissions-default", f"top-level permissions are {doc.get('permissions')!r}; expected {{contents: read}}")


def rule_packages_write(doc: dict, jobs: dict, lines: list[str], ranges) -> None:
    def writes(perms) -> bool:
        if perms == "write-all":
            return True
        return isinstance(perms, dict) and perms.get("packages") == "write"

    if writes(doc.get("permissions")):
        fail("packages-write-only-publish", "top-level permissions grant packages: write")
    for jid, job in jobs.items():
        if jid != "publish" and writes(job.get("permissions")):
            fail("packages-write-only-publish", f"job {jid} grants packages: write")
    for number, line in enumerate(lines, 1):
        if re.search(r"packages\s*:\s*write", line) and not line.lstrip().startswith("#"):
            owner = line_job(number, ranges)
            if owner != "publish":
                fail("packages-write-only-publish", f"line {number}: `packages: write` outside publish")
    if "publish" in jobs and jobs["publish"].get("permissions") != {"contents": "read", "packages": "write"}:
        fail("packages-write-only-publish",
             f"publish permissions are {jobs['publish'].get('permissions')!r}; expected contents: read, packages: write")


def rule_no_pull_request_target(doc: dict) -> None:
    if "pull_request_target" in triggers_of(doc):
        fail("no-pull-request-target", "pull_request_target is a trigger")


def rule_triggers(doc: dict) -> None:
    triggers = triggers_of(doc)
    expected = {"pull_request", "push", "workflow_dispatch"}
    if set(triggers) != expected:
        fail("triggers", f"triggers are {sorted(triggers)}; expected {sorted(expected)}")
    push = triggers.get("push")
    if not isinstance(push, dict) or push.get("branches") != ["main"] or push.get("tags") != ["v*"] or set(push) != {"branches", "tags"}:
        fail("triggers", f"push must be exactly branches [main] and tags ['v*']; found {push!r}")


def rule_concurrency(doc: dict) -> None:
    conc = doc.get("concurrency")
    if not isinstance(conc, dict) or "group" not in conc or "cancel-in-progress" not in conc:
        fail("concurrency", "top-level concurrency needs group and cancel-in-progress")


def rule_timeouts(jobs: dict) -> None:
    for jid, job in jobs.items():
        if not is_int(job.get("timeout-minutes")):
            fail("timeouts", f"job {jid} has no integer timeout-minutes")


def rule_uses_pinned(jobs: dict, lines: list[str]) -> None:
    parsed = 0
    for jid, job in jobs.items():
        refs = [(s.get("uses"), s) for s in steps_of(job) if "uses" in s]
        if "uses" in job:
            refs.append((job["uses"], job))
        for uses, _ in refs:
            parsed += 1
            if not isinstance(uses, str) or not USES_RE.match(uses):
                fail("uses-pinned", f"job {jid}: `{uses}` is not owner/name@<40 hex>")
    raw = 0
    for number, line in enumerate(lines, 1):
        match = re.match(r"^\s*(?:-\s+)?uses:\s*(\S+)(.*)$", line)
        if not match:
            continue
        raw += 1
        action = match.group(1).strip("'\"").split("@", 1)[0]
        if not USES_COMMENT_RE.match(match.group(2)):
            fail("uses-pinned", f"line {number}: {action} lacks a trailing `# vN[.N[.N]]` comment")
    if raw != parsed:
        fail("uses-pinned", f"{parsed} uses entries parsed but {raw} `uses:` lines found; use plain block style")


def rule_checkout(jobs: dict) -> None:
    for jid, step in steps_using(jobs, "actions/checkout"):
        if as_dict(step.get("with")).get("persist-credentials") is not False:
            fail("checkout-no-credentials", f"job {jid}: actions/checkout without persist-credentials: false")


def rule_secrets(lines: list[str], ranges) -> None:
    for number, line in enumerate(lines, 1):
        for match in re.finditer(r"\bsecrets\s*(?:\.\s*(\w*)|\[|:\s*inherit\b)", line):
            name = match.group(1)
            if name != "GITHUB_TOKEN":
                fail("no-secrets-outside-publish", f"line {number}: `{match.group(0)}` is not secrets.GITHUB_TOKEN")
            elif line_job(number, ranges) != "publish":
                fail("no-secrets-outside-publish", f"line {number}: secrets.GITHUB_TOKEN outside publish")


def rule_no_expression_in_run(jobs: dict) -> None:
    for jid, body in run_bodies(jobs):
        if "${{" in body:
            fail("no-expression-in-run", f"job {jid}: a run body contains `${{{{`; pass it through env:")


def rule_upload(jobs: dict) -> None:
    names: dict[str, str] = {}
    for jid, step in steps_using(jobs, "actions/upload-artifact"):
        with_ = as_dict(step.get("with"))
        name = with_.get("name")
        retention = with_.get("retention-days")
        if not is_int(retention) or not 1 <= retention <= 30:
            fail("upload-retention", f"job {jid}: upload {name!r} has retention-days {retention!r}; need an integer 1..30")
        if not isinstance(name, str) or not name:
            fail("upload-names-unique", f"job {jid}: an upload has no name")
        elif name in names:
            fail("upload-names-unique", f"artifact name {name!r} used in {names[name]} and {jid}")
        else:
            names[name] = jid


def rule_publish_if(jobs: dict) -> None:
    cond = as_dict(jobs.get("publish")).get("if")
    if not isinstance(cond, str):
        fail("publish-if", "publish has no if condition")
        return
    cond = " ".join(cond.split())
    for needle in ("github.event_name == 'push'", "refs/heads/main", "startsWith(github.ref, 'refs/tags/v')"):
        if needle not in cond:
            fail("publish-if", f"publish.if lacks `{needle}`")
    for banned in ("pull_request", "workflow_dispatch"):
        if banned in cond:
            fail("publish-if", f"publish.if mentions `{banned}`")


def rule_node_literal(jobs: dict, lines: list[str]) -> None:
    for number, line in enumerate(lines, 1):
        if re.match(r"^\s*(?:-\s+)?node-version\s*:", line):
            fail("node-no-literal", f"line {number}: `node-version:` literal; use node-version-file")
    for jid, step in steps_using(jobs, "actions/setup-node"):
        if as_dict(step.get("with")).get("node-version-file") != "frontend/.node-version":
            fail("node-no-literal", f"job {jid}: setup-node must use node-version-file: frontend/.node-version")


def docker_node_tag(path: Path) -> str | None:
    text = read_text(path)
    if text is None:
        fail("node-pin", f"cannot read {path}")
        return None
    tags = []
    for line in text.splitlines():
        if re.match(r"^\s*FROM\b", line, re.I):
            match = re.search(r"\bnode:(.+?)(?:-alpine|@|\s|$)", line)
            if match:
                tags.append(match.group(1))
    if not tags:
        fail("node-pin", f"{path.name}: no `FROM ... node:<tag>-alpine` line")
        return None
    if len(set(tags)) > 1:
        fail("node-pin", f"{path}: several Node tags {sorted(set(tags))}")
    return tags[0]


def rule_node_pin(root: Path) -> None:
    pin = read_text(root / "frontend" / ".node-version")
    if pin is None:
        fail("node-pin", "cannot read frontend/.node-version")
        return
    pin = pin.strip()
    for rel in ("frontend/Dockerfile", "Dockerfile"):
        tag = docker_node_tag(root / rel)
        if tag is not None and tag != pin:
            fail("node-pin", f"frontend/.node-version is {pin!r} but {rel} uses node:{tag}")


def load_t3_list(t3: Path, root: Path) -> dict[str, tuple[list[str], list[str]]] | None:
    try:
        proc = subprocess.run(["bash", str(t3), "--list"], capture_output=True, text=True,
                              timeout=60, cwd=root, check=False)
    except (OSError, subprocess.SubprocessError) as exc:
        fail("t3-calls", f"cannot run {t3} --list: {exc}")
        return None
    if proc.returncode != 0:
        fail("t3-calls", f"`t3.sh --list` exited {proc.returncode}")
        return None
    table: dict[str, tuple[list[str], list[str]]] = {}
    for line in proc.stdout.splitlines():
        if not line.strip():
            continue
        name, sep, rest = line.partition(":")
        if not sep:
            fail("t3-calls", f"unparsable `t3.sh --list` line: {line!r}")
            return None
        words = rest.split()
        table[name.strip()] = ([w for w in words if not w.startswith("+")],
                               [w[1:] for w in words if w.startswith("+")])
    return table


def t3_calls(body: str) -> list[tuple[str | None, list[str]]]:
    flat = body.replace("\\\n", " ")
    calls = []
    for match in re.finditer(r"scripts/ci/t3\.sh([^\n;&|]*)", flat):
        words = match.group(1).split()
        job = None
        stages: list[str] = []
        for i, word in enumerate(words):
            if word == "--job" and i + 1 < len(words):
                job = words[i + 1]
            elif word == "--stage" and i + 1 < len(words):
                stages.append(words[i + 1])
        calls.append((job, stages))
    return calls


def rule_t3_calls(jobs: dict, t3: Path, root: Path) -> None:
    table = load_t3_list(t3, root)
    if table is None:
        return
    called: dict[str, set[str]] = {}
    job_called: set[str] = set()
    for wf_job, body in run_bodies(jobs):
        for job, stages in t3_calls(body):
            if job is None:
                fail("t3-calls", f"job {wf_job}: a t3.sh call without --job")
                continue
            if job not in table:
                fail("t3-calls", f"job {wf_job}: t3.sh names unknown job {job!r}")
                continue
            valid = set(table[job][0]) | set(table[job][1])
            for stage in stages:
                if stage not in valid:
                    fail("t3-calls", f"job {wf_job}: t3.sh --job {job} names unknown stage {stage!r}")
            if wf_job == job:
                job_called.add(job)
                called.setdefault(job, set()).update(stages)
    for job in sorted(EXPECTED_JOBS):
        if job not in table:
            fail("t3-calls", f"`t3.sh --list` does not declare job {job}")
            continue
        defaults = table[job][0]
        if not defaults:
            if job not in job_called:
                fail("t3-calls", f"workflow job {job} never calls t3.sh --job {job}")
            continue
        for stage in defaults:
            if stage not in called.get(job, set()):
                fail("t3-calls", f"workflow job {job} never calls --stage {stage}")


def rule_paths_exist(jobs: dict, root: Path) -> None:
    seen = set()
    for jid, body in run_bodies(jobs):
        for match in re.finditer(r"(?<![\w./-])(scripts/[\w./-]+)", body):
            token = match.group(1).rstrip(".")
            if token in seen:
                continue
            seen.add(token)
            if not (root / token).is_file():
                fail("paths-exist", f"job {jid}: {token} does not exist")


def makefile_targets(makefile: str) -> set[str]:
    return set(re.findall(r"^([a-z][a-z0-9-]*):", makefile, re.M))


def rule_make_targets(jobs: dict, root: Path) -> None:
    text = read_text(root / "Makefile")
    if text is None:
        fail("make-targets-exist", "cannot read Makefile")
        return
    targets = makefile_targets(text)
    for jid, body in run_bodies(jobs):
        for match in re.finditer(r"(?<![\w./-])make\s+(?:-\S+\s+)*([A-Za-z][\w-]*)", body):
            if match.group(1) not in targets:
                fail("make-targets-exist", f"job {jid}: make target {match.group(1)!r} is not in the Makefile")


def rule_artifact_paths(jobs: dict, root: Path) -> None:
    corpus = []
    files = [root / "Makefile", root / "frontend" / "playwright.config.ts"]
    files += sorted((root / "scripts" / "ci").glob("*.sh")) + sorted((root / "scripts").glob("*.sh"))
    for file in files:
        text = read_text(file)
        if text is not None:
            corpus.append(text)
    haystack = "\n".join(corpus)
    for jid, step in steps_using(jobs, "actions/upload-artifact"):
        path = as_dict(step.get("with")).get("path")
        if not isinstance(path, str) or not path.strip():
            fail("artifact-paths", f"job {jid}: an upload has no path")
            continue
        for entry in path.splitlines():
            entry = entry.strip()
            if not entry:
                continue
            cut = entry.split("*", 1)[0].rstrip("/")
            if cut in ARTIFACT_ALLOW:
                continue
            if not cut or cut not in haystack:
                fail("artifact-paths", f"job {jid}: upload path {entry!r} occurs in no Makefile, script or Playwright config")


# ---------------------------------------------------------------- dependabot rules

def walk_keys(node):
    if isinstance(node, dict):
        for key, value in node.items():
            yield str(key)
            yield from walk_keys(value)
    elif isinstance(node, list):
        for item in node:
            yield from walk_keys(item)


def check_dependabot(doc) -> None:
    doc = as_dict(doc)
    if doc.get("version") != 2:
        fail("dependabot-version", f"version is {doc.get('version')!r}; expected 2")
    updates = doc.get("updates")
    entries = [as_dict(u) for u in updates] if isinstance(updates, list) else []
    pairs = {(e.get("package-ecosystem"), e.get("directory")) for e in entries}
    if pairs != EXPECTED_DEPENDABOT or len(entries) != len(EXPECTED_DEPENDABOT):
        fail("dependabot-set", f"found {sorted(map(str, pairs))} ({len(entries)} entries); "
                               f"expected {sorted(map(str, EXPECTED_DEPENDABOT))}")
    for e in entries:
        label = f"{e.get('package-ecosystem')} {e.get('directory')}"
        if as_dict(e.get("schedule")).get("interval") != "weekly":
            fail("dependabot-weekly", f"{label}: schedule.interval is {as_dict(e.get('schedule')).get('interval')!r}")
        groups = as_dict(e.get("groups"))
        good = False
        for name, group in groups.items():
            types = as_dict(group).get("update-types")
            if isinstance(types, list) and "major" in types:
                fail("dependabot-groups", f"{label}: group {name} includes major")
            if isinstance(types, list) and sorted(map(str, types)) == ["minor", "patch"] and len(types) == 2:
                good = True
        if not good:
            fail("dependabot-groups", f"{label}: no group with update-types exactly [minor, patch]")
    for key in walk_keys(doc):
        if re.search(r"auto[-_]?merge", key, re.I):
            fail("dependabot-no-automerge", f"key {key!r} mentions auto-merge")


# ---------------------------------------------------------------- main

def main() -> int:
    default_root = Path(__file__).resolve().parents[2]
    parser = argparse.ArgumentParser(description="Structural check of the CI workflow and Dependabot file.")
    parser.add_argument("--root", type=Path, default=default_root)
    parser.add_argument("--workflow", type=Path)
    parser.add_argument("--dependabot", type=Path)
    parser.add_argument("--t3", type=Path)
    args = parser.parse_args()
    root = args.root.resolve()
    workflow = args.workflow or root / ".github" / "workflows" / "ci.yml.disabled"
    dependabot = args.dependabot or root / ".github" / "dependabot.yml"
    t3 = args.t3 or root / "scripts" / "ci" / "t3.sh"

    text, doc = load_yaml(workflow)
    if not isinstance(doc, dict):
        die(f"{workflow} is not a YAML mapping")
    _, dep = load_yaml(dependabot)

    lines = text.splitlines()
    ranges = job_line_ranges(lines)
    jobs = jobs_of(doc)

    rule_jobs_exact(jobs)
    rule_publish_needs(jobs)
    rule_permissions_default(doc)
    rule_packages_write(doc, jobs, lines, ranges)
    rule_no_pull_request_target(doc)
    rule_triggers(doc)
    rule_concurrency(doc)
    rule_timeouts(jobs)
    rule_uses_pinned(jobs, lines)
    rule_checkout(jobs)
    rule_secrets(lines, ranges)
    rule_no_expression_in_run(jobs)
    rule_upload(jobs)
    rule_publish_if(jobs)
    rule_node_literal(jobs, lines)
    rule_node_pin(root)
    rule_t3_calls(jobs, t3, root)
    rule_paths_exist(jobs, root)
    rule_make_targets(jobs, root)
    rule_artifact_paths(jobs, root)
    check_dependabot(dep)

    for rule, detail in failures:
        print(f"FAIL {rule}: {detail}")
    if failures:
        return 1
    print(f"ok: {len(WORKFLOW_RULES) + len(DEPENDABOT_RULES)} rules")
    return 0


if __name__ == "__main__":
    sys.exit(main())
