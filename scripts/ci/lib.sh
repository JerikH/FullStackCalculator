#!/usr/bin/env bash
# Shared command reporting and checks for the local test tiers.
if (( BASH_VERSINFO[0] < 5 )); then
  printf 'Bash 5 or newer is required\n' >&2
  exit 2
fi
CI_ROOT=$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)
cd "$CI_ROOT" || exit 2
set -a
# shellcheck source=tools/versions.env
source "$CI_ROOT/tools/versions.env"
set +a
PATH="$CI_ROOT/bin:$PATH"
if [[ -n ${HOME-} && -d "$HOME/.local/go/bin" ]]; then PATH="$CI_ROOT/bin:$HOME/.local/go/bin:${PATH#*:}"; fi
export PATH
CI_KEEP_GOING=0
CI_START=${EPOCHREALTIME//[!0-9]/}
declare -a CI_LABELS=() CI_COMMANDS=() CI_RESULTS=() CI_TIMES=() CI_CHANGED=()

ci_seconds() { printf '%d.%02d' "$(($1 / 1000000))" "$(($1 % 1000000 / 10000))"; }
ci_tool() {
  local key=${1^^}
  key=${key//-/_}_VERSION
  printf '%s/bin/.tools/%s-%s/%s\n' "$CI_ROOT" "$1" "${!key}" "$1"
}
ci_record() {
  CI_LABELS+=("$1"); CI_COMMANDS+=("$2"); CI_RESULTS+=("$3"); CI_TIMES+=("$4")
}
ci_note() { printf '• [%s] %s\n' "$1" "$2"; ci_record "$1" "$2" note 0; }
ci_finish() {
  local i failed=0 now=${EPOCHREALTIME//[!0-9]/}
  printf '\nstage · command · result · seconds\n'
  for i in "${!CI_LABELS[@]}"; do
    printf '%s · %s · %s · %ss\n' "${CI_LABELS[i]}" "${CI_COMMANDS[i]}" "${CI_RESULTS[i]}" "$(ci_seconds "${CI_TIMES[i]}")"
    if [[ ${CI_RESULTS[i]} == fail ]]; then failed=1; fi
  done
  printf 'total %ss\n' "$(ci_seconds "$((now - CI_START))")"
  return "$failed"
}
ci_failure() {
  if (( CI_KEEP_GOING )); then return 1; fi
  if ci_finish; then exit 1; else exit 1; fi
}
ci_problem() {
  printf '✘ [%s] %s\n' "$1" "$2" >&2
  ci_record "$1" "$2" fail 0
  ci_failure
}
ci_execute() {
  local label=$1 capture=$2 directory='' rendered='' word start end status=0 output=''
  shift 2
  if [[ ${1:-} == -C ]]; then directory=$2; shift 2; fi
  [[ ${1:-} == -- ]] || { printf 'missing command separator\n' >&2; exit 2; }
  shift
  for word in "$@"; do printf -v word '%q' "$word"; rendered+="${rendered:+ }$word"; done
  if [[ -n $directory ]]; then printf -v word '%q' "$directory"; rendered="(cd $word) $rendered"; fi
  printf '▶ [%s] %s\n' "$label" "$rendered"
  start=${EPOCHREALTIME//[!0-9]/}
  if [[ -n $capture ]]; then
    if [[ -n $directory ]]; then
      if output=$(cd "$directory" && "$@"); then status=0; else status=$?; fi
    else
      if output=$("$@"); then status=0; else status=$?; fi
    fi
    printf -v "$capture" '%s' "$output"
  elif [[ -n $directory ]]; then
    if (cd "$directory" && "$@"); then status=0; else status=$?; fi
  else
    if "$@"; then status=0; else status=$?; fi
  fi
  end=${EPOCHREALTIME//[!0-9]/}
  if (( status == 0 )); then
    printf '✔ [%s] %ss\n' "$label" "$(ci_seconds "$((end - start))")"
    ci_record "$label" "$rendered" pass "$((end - start))"
  else
    printf '✘ [%s] exit %d after %ss\n' "$label" "$status" "$(ci_seconds "$((end - start))")"
    ci_record "$label" "$rendered" fail "$((end - start))"
    ci_failure
  fi
}
ci_run() { ci_execute "$1" '' "${@:2}"; }
ci_run_capture() { ci_execute "$1" "$2" "${@:3}"; }
ci_need() {
  local stage=$1 tool=$2 message
  case $tool in
    go) command -v go >/dev/null && return 0
      message="Go not found: install Go 1.27 into \$HOME/.local/go or put go on PATH" ;;
    pnpm) command -v pnpm >/dev/null && return 0
      message='install Node 24 and pnpm 10' ;;
    *) [[ -x $(ci_tool "$tool") ]] && return 0
      message="missing tool $tool: run scripts/ci/install-tools.sh $tool" ;;
  esac
  ci_problem "$stage" "$message"
}
ci_agent_env_load() {
  local exports
  if [[ ! ${WF_INDEX+x} && -x "$CI_ROOT/.workflow/bin/wf" ]]; then
    exports=$("$CI_ROOT/.workflow/bin/wf" env --export) || return 1
    eval "$exports" || return 1
  fi
  # shellcheck disable=SC2317 # The sourced environment can return failure after validating identity or Go.
  # shellcheck source=scripts/ci/env.sh
  source "$CI_ROOT/scripts/ci/env.sh" || return 1
}
ci_agent_env() {
  local start end status
  printf '▶ [env:agent] agent environment\n'
  start=${EPOCHREALTIME//[!0-9]/}
  if ci_agent_env_load; then status=0; else status=$?; fi
  end=${EPOCHREALTIME//[!0-9]/}
  if (( status == 0 )); then
    printf '✔ [env:agent] %ss\n' "$(ci_seconds "$((end - start))")"
    ci_record env:agent 'agent environment' pass "$((end - start))"
  else
    printf '✘ [env:agent] exit %d after %ss\n' "$status" "$(ci_seconds "$((end - start))")"
    ci_record env:agent 'agent environment' fail "$((end - start))"
    if ci_finish; then exit 1; else exit 1; fi
  fi
}
ci_changed_files() {
  local base=$1 mb temporary
  if ! git rev-parse --verify --quiet "$base^{commit}" >/dev/null; then printf 'unknown base %s\n' "$base" >&2; exit 2; fi
  if ! mb=$(git merge-base "$base" HEAD); then exit 2; fi
  temporary=$(mktemp)
  if ! git diff -z --name-only --no-renames "$mb" -- >"$temporary"; then rm -f "$temporary"; exit 2; fi
  if ! git ls-files -z --others --exclude-standard >>"$temporary"; then rm -f "$temporary"; exit 2; fi
  if ! LC_ALL=C sort -zu "$temporary" -o "$temporary"; then rm -f "$temporary"; exit 2; fi
  mapfile -d '' -t CI_CHANGED <"$temporary"
  rm -f "$temporary"
  printf 'base %s → merge base %s — %d changed file(s)\n' "$base" "$(git rev-parse --short "$mb")" "${#CI_CHANGED[@]}" >&2
  if [[ $mb == "$(git rev-parse HEAD)" ]]; then printf 'base is HEAD: checking uncommitted changes only\n' >&2; fi
}
ci_is_contract() { [[ $1 =~ ^(backend/api/openapi\.yaml|redocly\.yaml)$ ]]; }
# Frontend files that pin the contract tools or shape the generated types: contract stage only.
ci_is_contract_input() { [[ $1 =~ ^frontend/(package\.json|pnpm-lock\.yaml|\.prettierrc\.json|src/shared/api/schema\.gen\.ts)$ ]]; }
ci_is_contract_any() { ci_is_contract "$1" || ci_is_contract_input "$1"; }
# Frontend files that change how every frontend file is checked: the whole package is re-checked.
ci_is_frontend_global() {
  [[ $1 =~ ^frontend/(package\.json|pnpm-lock\.yaml|vite\.config\.ts|tsconfig[^/]*\.json|eslint\.config\.js|\.prettierrc\.json|\.prettierignore|src/test/.+)$ ]]
}
ci_is_workflow() { [[ $1 =~ ^\.github/workflows/[^/]+\.ya?ml(\.disabled)?$ ]]; }
ci_is_shell() { [[ $1 =~ \.sh$ ]]; }
ci_is_dockerfile() { [[ ${1##*/} =~ ^(Dockerfile|.*\.Dockerfile|Dockerfile\..*)$ ]]; }
ci_is_backend() { [[ $1 =~ ^backend/ ]]; }
ci_is_frontend() { [[ $1 =~ ^frontend/ ]]; }

# File collection uses temporary files so Git failures stay in the parent shell.
ci_files() {
  local classifier=$1 mode=${2:-} path temporary
  shift
  CI_FILES=()
  if [[ $mode == --full ]]; then
    temporary=$(mktemp)
    if ! git ls-files -z >"$temporary"; then rm -f "$temporary"; exit 2; fi
    if ! git ls-files -z --others --exclude-standard >>"$temporary"; then rm -f "$temporary"; exit 2; fi
    mapfile -d '' -t CI_FILES <"$temporary"
    rm -f "$temporary"
  else CI_FILES=("$@"); fi
  local -a selected_files=()
  for path in "${CI_FILES[@]}"; do
    if [[ -f $path ]] && "$classifier" "$path"; then selected_files+=("$path"); fi
  done
  CI_FILES=("${selected_files[@]}")
  ci_option_safe CI_FILES
}
# ci_option_safe <array name>: prefixes ./ to entries starting with -, so no path is read as an option.
ci_option_safe() {
  local -n entries=$1
  local i
  for i in "${!entries[@]}"; do
    if [[ ${entries[i]} == -* ]]; then entries[i]=./${entries[i]}; fi
  done
}
ci_stage_contract() {
  if [[ ${1:-} == --full ]]; then
    ci_files ci_is_contract_any "$@"
    if (( ${#CI_FILES[@]} == 0 )); then ci_note contract 'not present'; return 0; fi
  fi
  ci_need contract pnpm || return 0
  # Redocly and openapi-typescript are pinned by the frontend lockfile.
  if [[ ! -d frontend/node_modules ]]; then ci_problem contract 'run pnpm -C frontend install --frozen-lockfile' || return 0; fi
  # lint:api turns Redocly's usage telemetry and update notice off.
  ci_run contract:redocly -- pnpm -C frontend run lint:api || return 0
  # Regenerated types must equal the committed file; nothing is written.
  ci_run contract:types -C frontend -- bash -c 'set -o pipefail
    pnpm exec openapi-typescript ../backend/api/openapi.yaml \
      | pnpm exec prettier --stdin-filepath src/shared/api/schema.gen.ts \
      | diff -u src/shared/api/schema.gen.ts -' || return 0
}
ci_stage_workflows() {
  ci_files ci_is_workflow "$@"
  if (( ${#CI_FILES[@]} == 0 )); then ci_note workflows 'not present'; return 0; fi
  ci_need workflows actionlint || return 0
  ci_need workflows shellcheck || return 0
  ci_run workflows:actionlint -- "$(ci_tool actionlint)" -shellcheck "$(ci_tool shellcheck)" "${CI_FILES[@]}" || return 0
}
ci_stage_shell() {
  ci_files ci_is_shell "$@"
  if (( ${#CI_FILES[@]} == 0 )); then ci_note shell 'not present'; return 0; fi
  ci_need shell shellcheck || return 0
  ci_run shell:shellcheck -- "$(ci_tool shellcheck)" -x "${CI_FILES[@]}" || return 0
}
ci_stage_dockerfiles() {
  ci_files ci_is_dockerfile "$@"
  if (( ${#CI_FILES[@]} == 0 )); then ci_note dockerfiles 'not present'; return 0; fi
  ci_need dockerfiles hadolint || return 0
  ci_run dockerfiles:hadolint -- "$(ci_tool hadolint)" "${CI_FILES[@]}" || return 0
}
ci_stage_backend() {
  if [[ ! -f backend/go.mod ]]; then ci_note backend 'not present (backend/go.mod missing)'; return 0; fi
  ci_need backend go || return 0
  ci_need backend golangci-lint || return 0
  local path directory rel full=0 module='' line package deps key changed variant
  local -a lint=() tests=()
  local -A touched=() dependencies=() selected=()
  if [[ ${1:-} == --full ]]; then full=1; fi
  for path in "$@"; do
    if [[ $path =~ ^backend/(go\.(mod|sum)|\.golangci\.yml)$ || ( $path == *.go && ! -f $path ) ]]; then full=1; fi
  done
  if (( full )); then lint=(./...); tests=(./...)
  else
    # Package directories as Go sees them (testdata, _ and . directories are not packages).
    ci_run_capture backend:packages CI_GO_PACKAGE_DIRS -C backend -- go list -e -f '{{.Dir}}' ./... || return 0
    local backend_dir
    local -A package_dirs=()
    backend_dir=$(cd backend && pwd -P)
    while IFS= read -r line; do
      [[ -n $line ]] || continue
      rel=${line#"$backend_dir"}; rel=${rel#/}
      package_dirs[${rel:-.}]=1
    done <<<"$CI_GO_PACKAGE_DIRS"
    for path in "$@"; do
      directory=$path
      if [[ ! -d $directory ]]; then directory=${directory%/*}; fi
      while [[ $directory == backend || $directory == backend/* ]]; do
        rel=${directory#backend}; rel=${rel#/}; rel=${rel:-.}
        if [[ ${package_dirs[$rel]+yes} ]]; then
          if [[ ! ${touched[$rel]+yes} ]]; then touched[$rel]=1; if [[ $rel == . ]]; then lint+=(.); else lint+=("./$rel"); fi; fi
          break
        fi
        [[ $directory != backend ]] || break
        directory=${directory%/*}
      done
    done
    if (( ${#lint[@]} == 0 )); then ci_note backend 'no Go package touched'; return 0; fi
    ci_run_capture backend:golist CI_GO_LIST_OUTPUT -C backend -- go list -e -test -f '{{.ImportPath}} {{join .Deps " "}}' ./... || return 0
    while IFS= read -r line; do
      if [[ $line =~ ^module[[:space:]]+([^[:space:]]+) ]]; then module=${BASH_REMATCH[1]//\"/}; break; fi
    done <backend/go.mod
    for rel in "${!touched[@]}"; do
      if [[ $rel == . ]]; then selected[$module]=1; else selected[$module/$rel]=1; fi
    done
    while IFS= read -r line; do
      if [[ $line =~ ^([^[:space:]]+)([[:space:]]+\[[^]]+\])?[[:space:]]*(.*)$ ]]; then
        package=${BASH_REMATCH[1]}; variant=${BASH_REMATCH[2]}; deps=${BASH_REMATCH[3]}
        if [[ -n $variant ]]; then
          package=${variant#*'['}; package=${package%'.test]'}
        elif [[ $package == *.test ]]; then
          package=${package%.test}
        fi
        dependencies[$package]+=" $deps"
      fi
    done <<<"$CI_GO_LIST_OUTPUT"
    changed=1
    while (( changed )); do
      changed=0
      for package in "${!dependencies[@]}"; do
        [[ ! ${selected[$package]+yes} ]] || continue
        for key in "${!selected[@]}"; do
          if [[ " ${dependencies[$package]} " == *" $key "* ]]; then selected[$package]=1; changed=1; break; fi
        done
      done
    done
    for package in "${!selected[@]}"; do tests+=("$package"); done
  fi
  ci_run backend:fmt -C backend -- "$(ci_tool golangci-lint)" fmt --diff "${lint[@]}" || return 0
  ci_run backend:vet -C backend -- go vet "${lint[@]}" || return 0
  ci_run backend:lint -C backend -- "$(ci_tool golangci-lint)" run "${lint[@]}" || return 0
  ci_run backend:test -C backend -- go test -race "${tests[@]}" || return 0
  # The embedded app is compiled only with the embedui tag: vet everything with it, and
  # lint and test the web package under it. Other packages are not re-tested with the tag:
  # an empty dist makes the router's catch-all the web handler, which their tests do not expect.
  ci_run backend:vet-embedui -C backend -- go vet -tags embedui "${lint[@]}" || return 0
  # $module is parsed only outside --full mode; the arithmetic test short-circuits before it is read.
  if (( full )) || [[ ${selected[$module/internal/web]+yes} ]]; then
    ci_run backend:lint-embedui -C backend -- "$(ci_tool golangci-lint)" run --build-tags embedui ./internal/web/ || return 0
    ci_run backend:test-embedui -C backend -- go test -race -tags embedui ./internal/web/ || return 0
  fi
}
ci_stage_frontend() {
  if [[ ! -f frontend/package.json ]]; then ci_note frontend 'not present (frontend/package.json missing)'; return 0; fi
  ci_need frontend pnpm || return 0
  if [[ ! -d frontend/node_modules ]]; then ci_problem frontend 'run pnpm -C frontend install --frozen-lockfile' || return 0; fi
  local path global=0
  local -a files=() eslint=() related=()
  if [[ ${1:-} == --full ]]; then
    ci_run frontend:typecheck -- pnpm -C frontend run typecheck || return 0
    ci_run frontend:lint -- pnpm -C frontend run lint || return 0
    ci_run frontend:format -- pnpm -C frontend run format:check || return 0
    ci_run frontend:test -- pnpm -C frontend run test || return 0
    ci_run frontend:build -- pnpm -C frontend run build || return 0
    return 0
  fi
  for path in "$@"; do
    if ci_is_frontend_global "$path"; then global=1; fi
  done
  # Deleted files still change what compiles: typecheck runs for any touched path.
  ci_run frontend:typecheck -- pnpm -C frontend run typecheck || return 0
  if (( global )); then
    ci_note frontend 'package-wide input touched: checking the whole package'
    ci_run frontend:lint -- pnpm -C frontend run lint || return 0
    ci_run frontend:format -- pnpm -C frontend run format:check || return 0
    ci_run frontend:test -- pnpm -C frontend run test || return 0
    return 0
  fi
  for path in "$@"; do
    [[ -f $path ]] || continue
    files+=("${path#frontend/}")
    if [[ ${files[-1]} == -* ]]; then files[-1]=./${files[-1]}; fi
    if [[ $path =~ \.(ts|tsx|js|jsx|mjs|cjs)$ ]]; then eslint+=("${path#frontend/}"); fi
    if [[ $path =~ \.(ts|tsx|js|jsx)$ ]]; then related+=("${path#frontend/}"); fi
  done
  ci_option_safe eslint
  ci_option_safe related
  if (( ${#files[@]} == 0 )); then ci_note frontend 'no remaining files to lint'; return 0; fi
  if (( ${#eslint[@]} )); then
    ci_run frontend:eslint -- pnpm -C frontend exec eslint --max-warnings=0 --no-warn-ignored "${eslint[@]}" || return 0
  else ci_note frontend:eslint 'no applicable files'; fi
  ci_run frontend:prettier -- pnpm -C frontend exec prettier --check --ignore-unknown "${files[@]}" || return 0
  if (( ${#related[@]} )); then
    ci_frontend_related "${related[@]}" || return 0
  else ci_note frontend:vitest 'no applicable files'; fi
}
# ci_frontend_related <files…>: related tests of the touched files. Vitest's `related` passes with no
# test unless told otherwise; with --no-passWithNoTests «tests exist but none is affected» is its own
# exit-1 message, noted here. An empty suite («No test files found») still fails.
ci_frontend_related() {
  local rendered='' word start end status=0 output=''
  local -a command=(pnpm -C frontend exec vitest related --run --no-passWithNoTests "$@")
  for word in "${command[@]}"; do printf -v word '%q' "$word"; rendered+="${rendered:+ }$word"; done
  printf '▶ [frontend:vitest] %s\n' "$rendered"
  start=${EPOCHREALTIME//[!0-9]/}
  if output=$("${command[@]}" 2>&1); then status=0; else status=$?; fi
  end=${EPOCHREALTIME//[!0-9]/}
  printf '%s\n' "$output"
  if (( status == 0 )); then
    printf '✔ [frontend:vitest] %ss\n' "$(ci_seconds "$((end - start))")"
    ci_record frontend:vitest "$rendered" pass "$((end - start))"
  elif (( status == 1 )) && [[ $output == *'No affected test files found, exiting with code 1'* && $output != *FAIL* ]]; then
    printf '• [frontend:vitest] no related tests\n'
    ci_record frontend:vitest 'no related tests' note "$((end - start))"
  else
    printf '✘ [frontend:vitest] exit %d after %ss\n' "$status" "$(ci_seconds "$((end - start))")"
    ci_record frontend:vitest "$rendered" fail "$((end - start))"
    ci_failure
  fi
}
ci_partition() {
  local path
  CI_CONTRACT=(); CI_WORKFLOWS=(); CI_SHELL=(); CI_DOCKERFILES=(); CI_BACKEND=(); CI_FRONTEND=()
  for path in "${CI_CHANGED[@]}"; do
    if ci_is_contract_any "$path"; then CI_CONTRACT+=("$path"); fi
    if ci_is_workflow "$path"; then CI_WORKFLOWS+=("$path"); fi
    if ci_is_shell "$path"; then CI_SHELL+=("$path"); fi
    if ci_is_dockerfile "$path"; then CI_DOCKERFILES+=("$path"); fi
    if ci_is_backend "$path" || ci_is_contract "$path"; then CI_BACKEND+=("$path"); fi
    if ci_is_frontend "$path"; then CI_FRONTEND+=("$path"); fi
  done
}
ci_selected_stages() {
  local stage name mode=${1:-} count=0
  for stage in contract workflows shell dockerfiles backend frontend; do
    name=CI_${stage^^}
    local -n paths=$name
    if (( ${#paths[@]} )); then
      count=$((count + 1))
      if [[ $mode == --full ]]; then "ci_stage_$stage" --full; else "ci_stage_$stage" "${paths[@]}"; fi
    fi
  done
  if (( count == 0 )); then ci_note selection "no checks apply to the ${#CI_CHANGED[@]} changed file(s)"; fi
}

# ci_stage_make <label> <make-target…>: one bounded `make` call. A timeout (exit 124) is a ✘ row
# and a non-zero exit like any other failure. CI_STAGE_TIMEOUT (seconds, default 600) lowers the bound.
ci_stage_make() {
  local label=$1
  shift
  ci_run "$label" -- timeout "${CI_STAGE_TIMEOUT:-600}" make "$@"
}
# ci_compose_env: exports what the Makefile exports for `docker compose`, so a compose command run
# from a tier script finds the same images as `make up`. The Makefile is the reference for these
# expressions (VERSION, COMMIT, IMAGE_TAG, COMPOSE_PROJECT_NAME/WEB_PORT defaults); keep them equal.
ci_compose_env() {
  local version commit
  if [[ -z ${VERSION:-} ]]; then
    if version=$(git describe --tags --always --dirty 2>/dev/null) && [[ -n $version ]]; then VERSION=$version; else VERSION=dev; fi
  fi
  if [[ -z ${COMMIT:-} ]]; then
    if commit=$(git rev-parse HEAD 2>/dev/null) && [[ -n $commit ]]; then COMMIT=$commit; else COMMIT=unknown; fi
  fi
  : "${COMPOSE_PROJECT_NAME:=fullstackcalculator}"
  : "${WEB_PORT:=8080}"
  if [[ -z ${IMAGE_TAG:-} ]]; then
    if [[ $COMPOSE_PROJECT_NAME == fullstackcalculator ]]; then IMAGE_TAG=local; else IMAGE_TAG=$COMPOSE_PROJECT_NAME; fi
  fi
  export VERSION COMMIT IMAGE_TAG COMPOSE_PROJECT_NAME WEB_PORT
}
# The Make targets of the developer interface; the default T2 checks that every one exists.
ci_makefile_targets=(help bootstrap gen lint test coverage coverage-backend coverage-frontend fuzz bench
  dev-backend dev-frontend up down logs e2e image-aio run-aio smoke-aio docs-api clean)
CI_MAKE_DATABASE=''; CI_MAKE_LOADED=0; CI_MAKE_STATUS=0
CI_MAKE_QUERY_GOAL=__ci_database_query_$$
# ci_make_load: reads the make database once (CI_MAKE_STATUS: make's exit status, above 1 = unreadable).
ci_make_load() {
  (( CI_MAKE_LOADED )) && return 0
  CI_MAKE_LOADED=1; CI_MAKE_STATUS=0; CI_MAKE_DATABASE=''
  [[ -f Makefile ]] || return 0
  # An empty query goal prevents + recipes on the default goal from running.
  if CI_MAKE_DATABASE=$(make -pRrq --eval=".PHONY: $CI_MAKE_QUERY_GOAL" --eval="$CI_MAKE_QUERY_GOAL: ;" "$CI_MAKE_QUERY_GOAL" 2>/dev/null); then CI_MAKE_STATUS=0; else CI_MAKE_STATUS=$?; fi
}
# ci_make_has_target <name>: the loaded database defines the target (needs ci_make_load first).
ci_make_has_target() {
  local name=$1 line previous=''
  [[ -n $name && $name != "$CI_MAKE_QUERY_GOAL" ]] || return 1
  # Database entries preceded by "# Not a target:" are files make knows about, not targets.
  while IFS= read -r line; do
    if [[ $line == "$name:"* && $previous != '# Not a target:' ]]; then return 0; fi
    previous=$line
  done <<<"$CI_MAKE_DATABASE"
  return 1
}
# ci_check_makefile: every target of ci_makefile_targets exists in the make database.
ci_check_makefile() {
  local target missing=0
  ci_make_load
  if (( CI_MAKE_STATUS > 1 )); then ci_problem integration:make 'cannot read make target database' || :; return 0; fi
  for target in "${ci_makefile_targets[@]}"; do
    if ! ci_make_has_target "$target"; then missing=1; ci_problem integration:make "missing Make target $target" || :; fi
  done
  if (( ! missing )); then
    printf '✔ [integration:make] all %d targets present\n' "${#ci_makefile_targets[@]}"
    ci_record integration:make "all ${#ci_makefile_targets[@]} targets present" pass 0
  fi
  return 0
}
