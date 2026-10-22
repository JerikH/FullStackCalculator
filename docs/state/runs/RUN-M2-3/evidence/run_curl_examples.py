#!/usr/bin/env python3
"""Run the curl examples of README.md `## API usage` and compare them with the documented responses.

Usage: python3 -B -I run_curl_examples.py --readme README.md --base http://127.0.0.1:4121 [--list]
"""
import argparse
import json
import os
import re
import subprocess
import sys
import tempfile

MIN_PAIRS = 19
DOC_BASE = "http://localhost:8080"
RESPONSE_RE = re.compile(r"^Response `(\d{3})`")


def section(text):
    lines = text.splitlines()
    out, inside = [], False
    for line in lines:
        if line.startswith("## "):
            if inside:
                break
            inside = line.strip() == "## API usage"
            continue
        if inside:
            out.append(line)
    return out


def parse_pairs(lines):
    """Return [(command, status, expected_json_text)] for bash blocks followed by a Response line and a json block."""
    pairs = []
    i, n = 0, len(lines)
    while i < n:
        if lines[i].strip() == "```bash":
            j = i + 1
            block = []
            while j < n and lines[j].strip() != "```":
                block.append(lines[j])
                j += 1
            k = j + 1
            while k < n and not lines[k].strip():
                k += 1
            m = RESPONSE_RE.match(lines[k]) if k < n else None
            if m:
                k += 1
                while k < n and not lines[k].strip():
                    k += 1
                if k < n and lines[k].strip() == "```json":
                    body = []
                    k += 1
                    while k < n and lines[k].strip() != "```":
                        body.append(lines[k])
                        k += 1
                    pairs.append(("\n".join(block), int(m.group(1)), "\n".join(body)))
                    j = k
            i = j + 1
        else:
            i += 1
    return pairs


def summary(cmd):
    flat = cmd.replace("\\\n", " ")
    method = "POST" if re.search(r"(^|\s)(-d|--data-binary)\s", flat) else "GET"
    m = re.search(r"-X\s+(\w+)", flat)
    if m:
        method = m.group(1)
    url = re.search(r"https?://\S+", flat)
    return "%s %s" % (method, url.group(0) if url else "?")


def url_path(cmd):
    m = re.search(r"https?://[^/\s]+(/[^\s'\"]*)", cmd)
    return m.group(1) if m else ""


def run(cmd, base):
    cmd = cmd.replace(DOC_BASE, base.rstrip("/"))
    with tempfile.NamedTemporaryFile(delete=False) as tf:
        body_file = tf.name
    try:
        script = "curl() { command curl -o \"$BODY_FILE\" -w '%{http_code}' --max-time 10 \"$@\"; }\n" + cmd + "\n"
        env = dict(os.environ, BODY_FILE=body_file)
        proc = subprocess.run(["bash", "-c", script], capture_output=True, text=True, env=env, timeout=30)
        status = proc.stdout.strip()
        with open(body_file, "rb") as fh:
            body = fh.read().decode("utf-8", "replace")
        return status, body, proc.stderr.strip()
    finally:
        os.unlink(body_file)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--readme", required=True)
    ap.add_argument("--base", required=True)
    ap.add_argument("--list", action="store_true", help="print the parsed pairs without running anything")
    args = ap.parse_args()

    with open(args.readme, encoding="utf-8") as fh:
        pairs = parse_pairs(section(fh.read()))
    print("pairs found: %d" % len(pairs))

    if args.list:
        for idx, (cmd, status, exp) in enumerate(pairs, 1):
            print("%2d  %-60s expect %d  json=%d bytes" % (idx, summary(cmd), status, len(exp)))
        return 0 if len(pairs) >= MIN_PAIRS else 1

    failures = 0
    for idx, (cmd, exp_status, exp_text) in enumerate(pairs, 1):
        problems = []
        try:
            status, body, err = run(cmd, args.base)
        except Exception as exc:  # noqa: BLE001 - report any runner failure as a FAIL
            status, body, err = "?", "", str(exc)
            problems.append("runner error: %s" % exc)
        if status != str(exp_status):
            problems.append("status %s != %s" % (status, exp_status))
        try:
            expected = json.loads(exp_text)
        except ValueError as exc:
            expected = None
            problems.append("README json invalid: %s" % exc)
        try:
            actual = json.loads(body)
        except ValueError:
            actual = None
            problems.append("body is not JSON: %r" % body[:120])
        if expected is not None and actual is not None:
            if url_path(cmd) == "/healthz":
                if not isinstance(actual, dict) or actual.get("status") != expected.get("status"):
                    problems.append("healthz status field %r != %r" % (actual.get("status") if isinstance(actual, dict) else actual, expected.get("status")))
            elif actual != expected:
                if isinstance(actual, dict) and isinstance(expected, dict):
                    diff = [k for k in sorted(set(actual) | set(expected)) if actual.get(k) != expected.get(k)]
                    problems.append("body differs in %s: actual=%s expected=%s" % (
                        diff, json.dumps({k: actual.get(k) for k in diff}, ensure_ascii=False),
                        json.dumps({k: expected.get(k) for k in diff}, ensure_ascii=False)))
                else:
                    problems.append("body differs")
        verdict = "OK" if not problems else "FAIL"
        print("%2d  %-60s expected %s actual %s  %s" % (idx, summary(cmd), exp_status, status, verdict))
        if problems:
            failures += 1
            for p in problems:
                print("      - " + p)
            if err:
                print("      stderr: " + err[:200])
    if len(pairs) < MIN_PAIRS:
        print("FAIL: fewer than %d pairs found (%d)" % (MIN_PAIRS, len(pairs)))
        return 1
    print("%d/%d OK" % (len(pairs) - failures, len(pairs)))
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
