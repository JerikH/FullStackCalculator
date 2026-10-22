#!/usr/bin/env bash
# Check affected stages in full, then integration; or run exactly the named stages (--stage).
set -euo pipefail
if (( BASH_VERSINFO[0] < 5 )); then printf 'Bash 5 or newer is required\n' >&2; exit 2; fi
# shellcheck source=scripts/ci/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
valid_stages=(lint test coverage-backend coverage-frontend fuzz bench image-api image-web image-aio up e2e e2e-disruptive down smoke-aio docs-api)
usage() {
  printf 'usage: t2.sh [--base <ref>] [--stage <name>]… [--keep-stack] [--keep-going] [-h]\n'
  printf 'stages: %s\n' "${valid_stages[*]}"
  cat <<'TEXT'
Without --stage: the affected stages in full, then a check that every Make target exists.
TEXT
  printf 'Note: the default T2 never starts the composed stack: up, e2e, e2e-disruptive, down and smoke-aio run only when named.\n'
  cat <<'TEXT'
--stage <name> (repeatable, in the order given) runs ONLY the named stages: no affected-stage checks
and no Makefile check. Each stage is one `make <name>` under `timeout` (CI_STAGE_TIMEOUT seconds,
default 600); image-api and image-web are `docker compose build api|web` with the variables the
Makefile exports. e2e takes E2E_ARGS from the environment (without it both Playwright projects run);
e2e-disruptive runs only the stack-disruptive file with E2E_STACK=1.
When up is named and down is not, down runs at the end (also after a failed stage) unless
--keep-stack is given; it runs only if up was attempted. A failed stage ends the run unless
--keep-going is given.
TEXT
}
base=main
stages=()
keep_stack=0
while (( $# )); do
  case $1 in
    --base) if (( $# < 2 )); then usage >&2; exit 2; fi; base=$2; shift 2 ;;
    --stage) if (( $# < 2 )); then usage >&2; exit 2; fi; stages+=("$2"); shift 2 ;;
    --keep-stack) keep_stack=1; shift ;;
    --keep-going) CI_KEEP_GOING=1; shift ;;
    -h) usage; exit 0 ;;
    *) usage >&2; exit 2 ;;
  esac
done
for stage in "${stages[@]}"; do
  case " ${valid_stages[*]} " in
    *" $stage "*) ;;
    *) printf 'unknown stage %s; valid: %s\n' "$stage" "${valid_stages[*]}" >&2; exit 2 ;;
  esac
done
ci_agent_env

# t2_stage <name>: runs one named stage; returns non-zero when it failed.
t2_stage() {
  case $1 in
    image-api|image-web)
      ci_compose_env
      ci_run "stage:$1" -- timeout "${CI_STAGE_TIMEOUT:-600}" docker compose build "${1#image-}" ;;
    e2e-disruptive)
      ci_run stage:e2e-disruptive -- env E2E_STACK=1 timeout "${CI_STAGE_TIMEOUT:-600}" \
        make e2e 'E2E_ARGS=--project=chromium e2e/stack-disruptive.spec.ts' ;;
    *) ci_stage_make "stage:$1" "$1" ;;
  esac
}

if (( ${#stages[@]} )); then
  up_attempted=0; down_ran=0
  # The stages run in keep-going mode so that a failure returns here and the cleanup below runs
  # before the summary; without the user's --keep-going the first failure still ends the run.
  stop_on_failure=$(( ! CI_KEEP_GOING ))
  CI_KEEP_GOING=1
  for stage in "${stages[@]}"; do
    if [[ $stage == up ]]; then up_attempted=1; fi
    if [[ $stage == down ]]; then down_ran=1; fi
    if ! t2_stage "$stage" && (( stop_on_failure )); then break; fi
  done
  # down runs after a stage list that attempted up, also when a named down was never reached
  # (a failed stage before it ended the loop); a down that already ran is not repeated.
  if (( up_attempted && ! keep_stack && ! down_ran )); then
    if t2_stage down; then :; fi
  fi
  ci_finish; exit $?
fi

ci_changed_files "$base"
if (( ${#CI_CHANGED[@]} == 0 )); then ci_note selection 'no changed files'
else ci_partition; ci_selected_stages --full; fi
ci_integration() {
  if [[ ! -f Makefile ]]; then ci_note integration:make 'not present (no Makefile)'; return 0; fi
  ci_check_makefile
}
ci_integration
ci_finish; exit $?
