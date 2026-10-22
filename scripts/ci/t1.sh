#!/usr/bin/env bash
# Run exactly the named tests or Make targets; option: --keep-going.
set -euo pipefail
if (( BASH_VERSINFO[0] < 5 )); then printf 'Bash 5 or newer is required\n' >&2; exit 2; fi
# shellcheck source=scripts/ci/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
usage() { printf 'usage: t1.sh [--keep-going] [-h] <target…>\n'; }
targets=()
while (( $# )); do
  case $1 in
    --keep-going) CI_KEEP_GOING=1 ;;
    -h) usage; exit 0 ;;
    -*) usage >&2; exit 2 ;;
    *) targets+=("$1") ;;
  esac
  shift
done
if (( ${#targets[@]} == 0 )); then usage >&2; exit 2; fi
ci_agent_env
errors=(); kinds=(); arguments=()
make_database=''; make_loaded=0
query_goal=__ci_database_query_$$
for target in "${targets[@]}"; do
  if [[ $target == make:* ]]; then
    name=${target#make:}
    if [[ -f Makefile ]] && (( ! make_loaded )); then
      # An empty query goal prevents + recipes on the default goal from running.
      if make_database=$(make -pRrq --eval=".PHONY: $query_goal" --eval="$query_goal: ;" "$query_goal" 2>/dev/null); then status=0; else status=$?; fi
      make_loaded=1
      if (( status > 1 )); then errors+=('cannot read make target database'); fi
    fi
    # Database entries preceded by "# Not a target:" are files make knows about, not targets.
    found=0; previous=''
    while IFS= read -r line; do
      if [[ $line == "$name:"* && -n $name && $name != "$query_goal" && $previous != '# Not a target:' ]]; then found=1; break; fi
      previous=$line
    done <<<"$make_database"
    if [[ ! -f Makefile ]] || (( ! found )); then errors+=("unknown make target $name"); fi
    kinds+=(make); arguments+=("$name")
  elif [[ $target =~ ^frontend/e2e/.+\.spec\.ts$ || $target =~ ^frontend/.+\.test\.(ts|tsx)$ ]]; then
    if [[ ! -f $target ]]; then errors+=("missing test file $target"); fi
    if [[ $target == frontend/e2e/* ]]; then kinds+=(playwright); else kinds+=(vitest); fi
    arguments+=("${target#frontend/}")
  elif [[ $target =~ ^backend/.+ ]]; then
    if [[ ! -f backend/go.mod ]]; then errors+=('backend/go.mod missing'); fi
    directory=${target%/...}
    gofiles=("$directory"/*.go)
    if [[ ! -d $directory || ! -f ${gofiles[0]} || $directory == *'/../'* || $directory == */.. ]]; then errors+=("not a Go package: $target"); fi
    rel=${target#backend/}
    kinds+=(backend); arguments+=("./$rel")
  else
    errors+=("unknown target $target")
    kinds+=(unknown); arguments+=("$target")
  fi
done
if (( ${#errors[@]} )); then printf '%s\n' "${errors[@]}" >&2; exit 1; fi
for i in "${!targets[@]}"; do
  label=t1:${targets[i]}
  case ${kinds[i]} in
    make) if ci_run "$label" -- make "${arguments[i]}"; then :; fi ;;
    backend) if ci_need "$label" go; then
      if ci_run "$label" -C backend -- go test -race -cover "${arguments[i]}"; then :; fi
    fi ;;
    playwright|vitest) if ci_need "$label" pnpm; then
      if [[ ${kinds[i]} == playwright ]]; then
        if ci_run "$label" -- pnpm -C frontend exec playwright test "${arguments[i]}"; then :; fi
      else
        if ci_run "$label" -- pnpm -C frontend exec vitest run "${arguments[i]}"; then :; fi
      fi
    fi ;;
  esac
done
ci_finish; exit $?
