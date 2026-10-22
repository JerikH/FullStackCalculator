#!/usr/bin/env bash
# Mutation checks of scripts/ci/check-workflow.py: each mutation breaks one rule in a COPY of the
# workflow, the Dependabot file or the minimal tree, and the named rule id must be printed.
# Usage: checker-mutations.sh     (WF_SCRATCH or a temporary directory holds the copies)
set -uo pipefail
root=$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
export PYTHONDONTWRITEBYTECODE=1
checker=$root/scripts/ci/check-workflow.py
wf=$root/.github/workflows/ci.yml.disabled
db=$root/.github/dependabot.yml
fail=0
# mutate <id> <expected rule> <target: wf|db|node|lib> <python expression on text s>
mutate() {
  local id=$1 rule=$2 target=$3 expr=$4 out
  rm -rf "$work/tree"; mkdir -p "$work/tree/.github/workflows" "$work/tree/frontend" "$work/tree/scripts"
  cp "$wf" "$work/tree/.github/workflows/ci.yml.disabled"; cp "$db" "$work/tree/.github/dependabot.yml"
  cp "$root/Makefile" "$root/Dockerfile" "$work/tree/"; cp "$root/frontend/Dockerfile" "$root/frontend/.node-version" "$root/frontend/playwright.config.ts" "$work/tree/frontend/"
  cp -r "$root/scripts/." "$work/tree/scripts/"
  case $target in wf) file=$work/tree/.github/workflows/ci.yml.disabled ;; db) file=$work/tree/.github/dependabot.yml ;; node) file=$work/tree/frontend/.node-version ;; lib) file=$work/tree/scripts/ci/lib.sh ;; esac
  if ! python3 -I - "$file" "$expr" <<'PY'
import re, sys
path, expr = sys.argv[1], sys.argv[2]
s = open(path).read()
t = eval(expr)
if t == s:
    sys.exit("mutation changed nothing")
open(path, "w").write(t)
PY
  then printf 'FAIL %s: mutation changed nothing\n' "$id"; fail=1; return; fi
  out=$(python3 -I "$checker" --root "$work/tree" --workflow "$work/tree/.github/workflows/ci.yml.disabled" --dependabot "$work/tree/.github/dependabot.yml" 2>&1)
  if grep -q "^FAIL $rule:" <<<"$out"; then printf 'CAUGHT %-28s -> %s\n' "$id" "$rule"; else printf 'MISSED %-28s expected %s, got: %s\n' "$id" "$rule" "$(head -3 <<<"$out" | tr '\n' '|')"; fail=1; fi
}
base=$(python3 -I "$checker" --root "$root" 2>&1)
if [[ $base == "ok: "* ]]; then echo "BASE   $base"; else echo "BASE FAILS: $base"; fail=1; fi
mutate unpinned-action uses-pinned wf "re.sub(r'(actions/checkout@)[0-9a-f]{40}', r'\1abc123', s, count=1)"
mutate version-comment-removed uses-pinned wf "s.replace(' # v7.0.1','',1)"
mutate persist-credentials checkout-no-credentials wf "s.replace('          persist-credentials: false\n','',1)"
mutate top-level-packages-write permissions-default wf "s.replace('permissions:\n  contents: read\n\n# Pull','permissions:\n  contents: read\n  packages: write\n\n# Pull',1)"
mutate packages-write-in-backend packages-write-only-publish wf "s.replace('    timeout-minutes: 25\n','    timeout-minutes: 25\n    permissions:\n      contents: read\n      packages: write\n',1)"
mutate pull-request-target no-pull-request-target wf "s.replace('on:\n  pull_request:\n','on:\n  pull_request:\n  pull_request_target:\n',1)"
mutate expression-in-run no-expression-in-run wf "s.replace('run: scripts/ci/setup-pnpm.sh','run: echo \${{ github.ref }}',1)"
mutate publish-needs-e2e publish-needs wf "s.replace('needs: [contract, backend, frontend, e2e, images]','needs: [contract, backend, frontend, images]',1)"
mutate retention-removed upload-retention wf "s.replace('          retention-days: 14\n','',1)"
mutate duplicate-artifact-name upload-names-unique wf "s.replace('name: benchmark','name: coverage-backend',1)"
mutate unknown-stage t3-calls wf "s.replace('--job contract --stage docs-api','--job contract --stage nonexistent',1)"
mutate missing-script paths-exist wf "s.replace('scripts/ci/setup-pnpm.sh','scripts/ci/missing-script.sh',1)"
mutate unknown-make-target make-targets-exist wf "s.replace('run: scripts/ci/setup-pnpm.sh','run: make nothing',1)"
mutate artifact-path-unknown artifact-paths wf "s.replace('path: coverage/bench','path: coverage/zzz',1)"
mutate timeout-removed timeouts wf "s.replace('    timeout-minutes: 10\n','',1)"
mutate secret-outside-publish no-secrets-outside-publish wf "s.replace('run: scripts/ci/setup-pnpm.sh','env:\n          X: \${{ secrets.OTHER }}\n        run: scripts/ci/setup-pnpm.sh',1)"
mutate node-literal node-no-literal wf "s.replace('node-version-file: frontend/.node-version','node-version: 24',1)"
mutate node-pin-mismatch node-pin node "'24.0.0\n'"
mutate publish-if-removed publish-if wf "re.sub(r'    if: >-\n(      .*\n)+', '', s, count=1)"
mutate dependabot-ecosystem dependabot-set db "s.replace('package-ecosystem: npm','package-ecosystem: pip',1)"
mutate dependabot-daily dependabot-weekly db "s.replace('interval: weekly','interval: daily',1)"
mutate dependabot-major-grouped dependabot-groups db "s.replace('update-types: [minor, patch]','update-types: [major, minor, patch]',1)"
mutate job-permissions-write job-permissions wf "s.replace('    timeout-minutes: 20\n','    timeout-minutes: 20\n    permissions:\n      contents: write\n',1)"
mutate token-in-other-step token-only-in-push-step wf "s.replace('        run: scripts/ci/t3.sh --job publish --stage tags','        env:\n          GITHUB_TOKEN: x\n        run: scripts/ci/t3.sh --job publish --stage tags',1)"
mutate continue-on-error no-continue-on-error wf "s.replace('      - name: Typecheck\n','      - name: Typecheck\n        continue-on-error: true\n',1)"
mutate always-outside-upload no-continue-on-error wf "s.replace('      - name: Typecheck\n','      - name: Typecheck\n        if: always()\n',1)"
mutate publish-if-or publish-if wf "s.replace(\"github.event_name == 'push' &&\\n      !github.event.repository.fork\", \"github.event_name == 'push' ||\\n      !github.event.repository.fork\",1)"
mutate lib-missing-script lib-calls-exist lib "s.replace('scripts/ci/edge-smoke.sh','scripts/ci/gone-smoke.sh',1)"
mutate lib-missing-make-target lib-calls-exist lib "s.replace('ci_stage_make images:smoke-aio smoke-aio','ci_stage_make images:smoke-aio smoke-nothing',1)"
exit "$fail"
