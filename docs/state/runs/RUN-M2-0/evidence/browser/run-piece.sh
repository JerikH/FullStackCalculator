#!/usr/bin/env bash
# Runs one ad hoc Playwright piece (U22: one spec, one project, `timeout 600`).
# Usage: run-piece.sh <spec-name-without-.spec.ts> <project> [extra playwright args...]
# Environment: E2E_URL (the Vite dev server of the agent's port block), after `eval "$(.workflow/bin/wf env --export)"`.
set -euo pipefail
spec="${1:?spec}" project="${2:?project}"; shift 2
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(git -C "$here" rev-parse --show-toplevel)"
work="${WF_SCRATCH:?}/e2e"
rm -rf "$work"; mkdir -p "$work"
cp "$here"/*.ts "$work/"
ln -sfn "$root/frontend/node_modules" "$work/node_modules"
export E2E_PIECE="$spec-$project" E2E_OUT="$here/results" E2E_SHOTS="$here/shots"
mkdir -p "$E2E_OUT" "$E2E_SHOTS"
cd "$work"
start=$(date +%s)
set +e
timeout 600 "$root/frontend/node_modules/.bin/playwright" test -c "$work/playwright.config.ts" "$spec" --project="$project" --workers=2 "$@"
code=$?
set -e
echo "piece $spec/$project exit=$code seconds=$(( $(date +%s) - start ))"
exit $code
