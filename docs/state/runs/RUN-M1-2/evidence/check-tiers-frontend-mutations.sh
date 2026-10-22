#!/usr/bin/env bash
# Mutation checks for check-tiers-frontend.sh: each mutation of scripts/ci/lib.sh (applied to a copy,
# never to the repository) must make the harness fail.
# Usage (repository root): bash docs/state/runs/RUN-M1-2/evidence/check-tiers-frontend-mutations.sh
# Mutation anchors are literal source text: single quotes on purpose.
# shellcheck disable=SC2016
set -uo pipefail
repo=$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)
harness=$repo/docs/state/runs/RUN-M1-2/evidence/check-tiers-frontend.sh
work=$(mktemp -d "${WF_SCRATCH:-${TMPDIR:-/tmp}}/tier-mutations.XXXXXX")
trap 'rm -rf "$work"' EXIT
uncaught=0
mutate() {
  local name=$1 from=$2 to=$3 dir=$work/$1 output
  mkdir -p "$dir" && cp "$repo"/scripts/ci/{lib.sh,t0.sh,t1.sh,t2.sh,t3.sh,env.sh} "$dir/"
  FROM=$from TO=$to python3 - "$dir/lib.sh" <<'PY'
import os, sys
path = sys.argv[1]; text = open(path).read(); old = os.environ['FROM']
assert text.count(old) == 1, f'mutation anchor not unique: {old!r}'
open(path, 'w').write(text.replace(old, os.environ['TO']))
PY
  if output=$(SCRIPTS_SRC=$dir bash "$harness" 2>&1); then
    printf 'NOT CAUGHT %s\n' "$name"; uncaught=$((uncaught + 1))
  else
    printf 'caught     %s — %s\n' "$name" "$(grep '^FAIL' <<<"$output" | head -2 | tr '\n' ' ')"
  fi
}
mutate contract-input-predicate 'if ci_is_contract_any "$path"; then CI_CONTRACT+=' 'if ci_is_contract "$path"; then CI_CONTRACT+='
mutate no-pipefail "bash -c 'set -o pipefail" "bash -c 'set +o pipefail"
mutate any-exit-1-is-no-tests "(( status == 1 )) && [[ \$output == *'No affected test files found, exiting with code 1'* && \$output != *FAIL* ]]" '(( status == 1 ))'
mutate no-package-wide-run 'if ci_is_frontend_global "$path"; then global=1; fi' ':'
mutate no-install-check "if [[ ! -d frontend/node_modules ]]; then ci_problem contract" "if false; then ci_problem contract"
printf '\n%d uncaught mutation(s)\n' "$uncaught"
(( uncaught == 0 ))
