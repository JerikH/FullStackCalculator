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
# and a non-zero exit like any other failure. CI_STAGE_TIMEOUT (seconds, default 600) lowers the bound;
# `-k 30` kills what ignores the first signal.
ci_stage_make() {
  local label=$1
  shift
  ci_run "$label" -- timeout -k 30 "${CI_STAGE_TIMEOUT:-600}" make "$@"
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

# ---------------------------------------------------------------------------------------------
# T3: CI jobs and stages (scripts/ci/t3.sh). Stage functions are named ci_t3_<job>_<stage>, with
# `-` in the stage name written as `_`; ci_t3_run <job> <stage> dispatches. Every long command runs
# under `timeout -k 30 "${CI_STAGE_TIMEOUT:-600}"`.
# ---------------------------------------------------------------------------------------------
CI_T3_JOBS=(contract backend frontend e2e images publish)
declare -A CI_T3_STAGES=(
  [contract]='contract docs-api workflows shell publish-tags'
  [backend]='modules static coverage-backend fuzz bench govulncheck build'
  [frontend]='typecheck lint format coverage-frontend build audit'
  [e2e]=''
  [images]='dockerfiles compose-config build-api build-web build-aio smoke-api smoke-edge smoke-edge-stub smoke-aio export scan-api scan-web scan-aio'
  [publish]='tags push'
)
# Stages that run only when named (they are not part of the job's default order).
declare -A CI_T3_NAMED=([images]='edge-mutations')
# The three images, in one fixed order: name, archive and (for the scans) report prefix.
CI_IMAGE_NAMES=(calculator-api calculator-web calculator)
CI_IMAGE_FILES=(coverage/images/calculator-api.tar.gz coverage/images/calculator-web.tar.gz coverage/images/calculator.tar.gz)
CI_IMAGE_MANIFEST=coverage/images/image-ids.txt
CI_TRIVY_PREFIX=coverage/images/trivy-
CI_E2E_FAILED=0

# ci_t3_list: one line per job, `<job>: <default stages>`, then ` +<stage>` for stages selected only by name.
ci_t3_list() {
  local job line stage
  for job in "${CI_T3_JOBS[@]}"; do
    line="$job:"
    for stage in ${CI_T3_STAGES[$job]}; do line+=" $stage"; done
    for stage in ${CI_T3_NAMED[$job]:-}; do line+=" +$stage"; done
    printf '%s\n' "$line"
  done
}
# ci_t3_valid_job <job>, ci_t3_valid_stage <job> <stage>
ci_t3_valid_job() { [[ " ${CI_T3_JOBS[*]} " == *" $1 "* ]]; }
ci_t3_valid_stage() { [[ " ${CI_T3_STAGES[$1]:-} ${CI_T3_NAMED[$1]:-} " == *" $2 "* ]]; }
# ci_t3_run <job> [<stage>]: calls ci_t3_<job>_<stage>; the e2e job has no stages and is ci_t3_e2e.
ci_t3_run() {
  local function=ci_t3_$1
  if [[ -n ${2:-} ]]; then function=${function}_${2//-/_}; fi
  if ! declare -F "$function" >/dev/null; then ci_problem "$1" "no stage function $function" || :; return 1; fi
  "$function"
}

# ci_render <word…>: the words as one shell-quoted line (what the command rows show).
ci_render() {
  local word rendered=''
  for word in "$@"; do printf -v word '%q' "$word"; rendered+="${rendered:+ }$word"; done
  printf '%s' "$rendered"
}
# ci_need_cmd <stage> <command…>: one failed row per command that is missing from PATH.
ci_need_cmd() {
  local stage=$1 command missing=0
  shift
  for command in "$@"; do
    if ! command -v "$command" >/dev/null 2>&1; then missing=1; ci_problem "$stage" "missing command $command" || :; fi
  done
  (( ! missing ))
}
# ci_retry <label> <attempts> -- <command…>: runs the command until it succeeds or the attempts are
# used up (CI_RETRY_DELAY seconds apart, default 15). One row records the final result and the total
# time; an attempt that is retried is not a failure.
ci_retry() {
  local label=$1 attempts=$2 rendered start end status=1 attempt
  shift 2
  [[ ${1:-} == -- ]] || { printf 'missing command separator\n' >&2; exit 2; }
  shift
  rendered=$(ci_render "$@")
  printf '▶ [%s] %s (up to %d attempts)\n' "$label" "$rendered" "$attempts"
  start=${EPOCHREALTIME//[!0-9]/}
  for (( attempt = 1; attempt <= attempts; attempt++ )); do
    if "$@"; then status=0; break; else status=$?; fi
    printf '… [%s] attempt %d of %d failed with exit %d\n' "$label" "$attempt" "$attempts" "$status"
    if (( attempt < attempts )); then sleep "${CI_RETRY_DELAY:-15}"; fi
  done
  end=${EPOCHREALTIME//[!0-9]/}
  if (( status == 0 )); then
    printf '✔ [%s] %ss (attempt %d)\n' "$label" "$(ci_seconds "$((end - start))")" "$attempt"
    ci_record "$label" "$rendered" pass "$((end - start))"
  else
    printf '✘ [%s] exit %d after %d attempts, %ss\n' "$label" "$status" "$attempts" "$(ci_seconds "$((end - start))")"
    ci_record "$label" "$rendered" fail "$((end - start))"
    ci_failure
  fi
}
# ci_summary <line…>: appends the lines to the job summary when GitHub provides one.
ci_summary() {
  [[ -n ${GITHUB_STEP_SUMMARY:-} ]] || return 0
  printf '%s\n' "$@" >>"$GITHUB_STEP_SUMMARY" || :
}
# ci_summary_file <title> <file>: a summary section with the content of the file as a text block.
ci_summary_file() {
  [[ -n ${GITHUB_STEP_SUMMARY:-} ]] || return 0
  ci_summary "### $1" '' '```text' "$(cat "$2" 2>/dev/null || :)" '```' ''
}
# ci_require_files <label> <path…>: a failed row naming each file that is missing or empty.
ci_require_files() {
  local label=$1 path missing=0
  shift
  for path in "$@"; do
    if [[ ! -s $path ]]; then missing=1; ci_problem "$label" "missing or empty file: $path" || :; fi
  done
  if (( missing )); then return 1; fi
  printf '✔ [%s] %d file(s) present\n' "$label" "$#"
  ci_record "$label" "files present: $*" pass 0
}
# ci_docker_names: CI_API_IMAGE, CI_WEB_IMAGE and CI_AIO_IMAGE, the references of the three images
# the Makefile and compose.yaml build (after ci_compose_env, which it runs).
ci_docker_names() {
  ci_compose_env
  CI_API_IMAGE=calculator-api:$IMAGE_TAG
  CI_WEB_IMAGE=calculator-web:$IMAGE_TAG
  CI_AIO_IMAGE=calculator:$IMAGE_TAG
}
# ci_ghcr_owner: the lower-cased repository owner, as GHCR requires it; fails when it is not a valid name.
ci_ghcr_owner() {
  local owner=${GITHUB_REPOSITORY_OWNER:-}
  owner=${owner,,}
  [[ $owner =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?$ ]] || return 1
  printf '%s' "$owner"
}
# ci_t3_node_ready <stage>: pnpm and the installed frontend (the workflow installs it first).
ci_t3_node_ready() {
  ci_need "$1" pnpm || return 1
  if [[ ! -d frontend/node_modules ]]; then ci_problem "$1" 'run pnpm -C frontend install --frozen-lockfile' || return 1; fi
}

# --- contract ---
ci_t3_contract_contract() { ci_stage_contract --full; }
ci_t3_contract_docs_api() {
  ci_t3_node_ready docs-api || return 1
  ci_stage_make docs-api:make docs-api || return 1
  ci_require_files docs-api docs/api/index.html
}
ci_t3_contract_workflows() {
  ci_stage_workflows --full
  ci_need_cmd workflows:structure python3 || return 1
  if ! python3 -I -c 'import yaml' >/dev/null 2>&1; then
    ci_problem workflows:structure 'python3 module yaml is missing: install python3-yaml' || :
    return 1
  fi
  ci_run workflows:structure -- env PYTHONDONTWRITEBYTECODE=1 python3 -I scripts/ci/check-workflow.py
}
ci_t3_contract_shell() { ci_stage_shell --full; }
ci_t3_contract_publish_tags() {
  ci_run publish-tags:test -- timeout -k 30 "${CI_STAGE_TIMEOUT:-600}" bash scripts/ci/publish-tags-test.sh
}

# --- backend ---
ci_t3_backend_modules() {
  ci_need backend go || return 1
  ci_run backend:mod-download -C backend -- timeout -k 30 "${CI_STAGE_TIMEOUT:-600}" go mod download || return 1
  ci_run backend:mod-verify -C backend -- timeout -k 30 "${CI_STAGE_TIMEOUT:-600}" go mod verify || return 1
  ci_run backend:mod-tidy -C backend -- timeout -k 30 "${CI_STAGE_TIMEOUT:-600}" go mod tidy -diff
}
ci_t3_backend_static() {
  ci_need backend go || return 1
  ci_need backend golangci-lint || return 1
  local lint
  lint=$(ci_tool golangci-lint)
  ci_run backend:fmt -C backend -- timeout -k 30 "${CI_STAGE_TIMEOUT:-600}" "$lint" fmt --diff ./... || return 1
  ci_run backend:vet -C backend -- timeout -k 30 "${CI_STAGE_TIMEOUT:-600}" go vet ./... || return 1
  ci_run backend:lint -C backend -- timeout -k 30 "${CI_STAGE_TIMEOUT:-600}" "$lint" run ./... || return 1
  ci_run backend:vet-embedui -C backend -- timeout -k 30 "${CI_STAGE_TIMEOUT:-600}" go vet -tags embedui ./... || return 1
  ci_run backend:lint-embedui -C backend -- timeout -k 30 "${CI_STAGE_TIMEOUT:-600}" "$lint" run --build-tags embedui ./internal/web/ || return 1
  ci_run backend:test-embedui -C backend -- timeout -k 30 "${CI_STAGE_TIMEOUT:-600}" go test -race -tags embedui ./internal/web/
}
ci_t3_backend_coverage_backend() {
  local threshold=''
  ci_need backend go || return 1
  ci_stage_make backend:coverage-backend coverage-backend || return 1
  ci_require_files backend:coverage-reports coverage/backend/index.html coverage/backend/coverage.out coverage/backend/summary.txt || return 1
  if [[ -f scripts/coverage.sh ]]; then threshold=$(sed -n 's/^threshold=\([0-9][0-9]*\)$/\1/p' scripts/coverage.sh | head -n 1); fi
  ci_summary '### Backend coverage' '' '```text' "$(cat coverage/backend/summary.txt)" '```'
  if [[ -n $threshold ]]; then ci_summary '' "Gate: statement coverage of the unique blocks must reach $threshold %." ''; fi
}
ci_t3_backend_fuzz() {
  ci_need backend go || return 1
  ci_stage_make backend:fuzz fuzz
}
ci_t3_backend_bench() {
  ci_need backend go || return 1
  ci_stage_make backend:bench bench || return 1
  ci_require_files backend:bench-output coverage/bench/bench.txt || return 1
  ci_summary '### Backend benchmarks' '' '```text' "$(grep '^Benchmark' coverage/bench/bench.txt || :)" '```' ''
}
ci_t3_backend_govulncheck() {
  local tool
  ci_need backend go || return 1
  ci_need backend govulncheck || return 1
  tool=$(ci_tool govulncheck)
  ci_run backend:govulncheck -C backend -- timeout -k 30 "${CI_STAGE_TIMEOUT:-600}" "$tool" ./... || return 1
  ci_run backend:govulncheck-embedui -C backend -- timeout -k 30 "${CI_STAGE_TIMEOUT:-600}" "$tool" -tags embedui ./...
}
ci_t3_backend_build() {
  ci_need backend go || return 1
  ci_run backend:build -C backend -- timeout -k 30 "${CI_STAGE_TIMEOUT:-600}" go build ./... || return 1
  ci_run backend:build-embedui -C backend -- timeout -k 30 "${CI_STAGE_TIMEOUT:-600}" go build -tags embedui ./...
}

# --- frontend ---
ci_t3_frontend_script() { # ci_t3_frontend_script <stage> <package script>
  ci_t3_node_ready "$1" || return 1
  ci_run "frontend:$1" -- timeout -k 30 "${CI_STAGE_TIMEOUT:-600}" pnpm -C frontend run "$2"
}
ci_t3_frontend_typecheck() { ci_t3_frontend_script typecheck typecheck; }
ci_t3_frontend_lint() { ci_t3_frontend_script lint lint; }
ci_t3_frontend_format() { ci_t3_frontend_script format format:check; }
ci_t3_frontend_build() { ci_t3_frontend_script build build; }
ci_t3_frontend_coverage_frontend() {
  local file=coverage/frontend/coverage-summary.json table=''
  ci_t3_node_ready coverage-frontend || return 1
  ci_stage_make frontend:coverage-frontend coverage-frontend || return 1
  ci_require_files frontend:coverage-reports coverage/frontend/index.html coverage/frontend/lcov.info "$file" || return 1
  # The totals come from the report with jq, else python3 (the scripts never need node).
  if command -v jq >/dev/null 2>&1; then
    table=$(jq -r '.total | ["lines", "statements", "functions", "branches"][] as $k | "| \($k) | \(.[$k].pct)% |"' "$file") || table=''
  elif command -v python3 >/dev/null 2>&1; then
    table=$(python3 -I -c 'import json, sys
total = json.load(open(sys.argv[1]))["total"]
for key in ("lines", "statements", "functions", "branches"):
    print("| %s | %s%% |" % (key, total[key]["pct"]))' "$file") || table=''
  fi
  if [[ -n $table ]]; then
    ci_summary '### Frontend coverage' '' '| metric | covered |' '|---|---|' "$table" ''
  else
    ci_note frontend:coverage-frontend 'cannot read the totals of coverage-summary.json (no jq or python3)'
  fi
}
ci_t3_frontend_audit() {
  ci_t3_node_ready audit || return 1
  ci_run frontend:audit -- timeout -k 30 "${CI_STAGE_TIMEOUT:-600}" pnpm -C frontend audit --prod --audit-level high
}

# --- e2e ---
# ci_e2e_save <run>: moves the Playwright report and results of the run that just ended into
# coverage/e2e/<run>/ (the next run would erase them). A source that does not exist is fine: the
# run may have failed before Playwright started.
ci_e2e_save() {
  local run=$1 destination=coverage/e2e/$1 source
  rm -rf "$destination"
  mkdir -p "$destination"
  for source in frontend/playwright-report frontend/test-results; do
    if [[ -e $source ]] && ! mv "$source" "$destination/${source##*/}"; then
      CI_E2E_FAILED=1
      ci_problem "e2e:$run" "cannot move $source to $destination" || :
    fi
  done
}
# ci_e2e_logs: the state and the logs of the composed stack, written once before it is removed.
# A failure to collect is noted and never changes the result.
ci_e2e_logs() {
  local directory=coverage/e2e/logs status
  mkdir -p "$directory"
  if timeout -k 30 120 docker compose ps -a >"$directory/ps.txt" 2>&1; then
    ci_note e2e:logs "docker compose ps -a written to $directory/ps.txt"
    cat "$directory/ps.txt"
  else
    status=$?
    ci_note e2e:logs "docker compose ps -a failed (exit $status); see $directory/ps.txt"
  fi
  if timeout -k 30 120 docker compose logs --no-color --timestamps >"$directory/compose.log" 2>&1; then
    ci_note e2e:logs "docker compose logs written to $directory/compose.log"
  else
    status=$?
    ci_note e2e:logs "docker compose logs failed (exit $status); see $directory/compose.log"
  fi
}
# ci_e2e_playwright <run> <command…>: one Playwright run (skipped after an earlier failure); its
# report is kept under coverage/e2e/<run>/ whatever the result.
ci_e2e_playwright() {
  local run=$1
  shift
  if (( CI_E2E_FAILED )); then ci_note "e2e:$run" 'skipped: an earlier e2e step failed'; return 0; fi
  rm -rf frontend/playwright-report frontend/test-results
  if ! ci_run "e2e:$run" -- "$@"; then CI_E2E_FAILED=1; fi
  ci_e2e_save "$run"
}
# ci_t3_e2e: up, the Playwright runs, down. Failures do not end the sequence early: the logs are
# collected once and `down` runs whenever `up` was attempted; a failed `down` is a failure.
ci_t3_e2e() {
  local saved=$CI_KEEP_GOING up_attempted=0 limit=${CI_STAGE_TIMEOUT:-600}
  CI_KEEP_GOING=1
  CI_E2E_FAILED=0
  ci_compose_env
  if ci_need_cmd e2e make docker; then
    up_attempted=1
    if ! ci_run e2e:up -- timeout -k 30 "$limit" make up; then CI_E2E_FAILED=1; fi
    if (( CI_E2E_FAILED )); then
      ci_note e2e:chromium 'skipped: the stack did not start'
      ci_note e2e:mobile-chromium 'skipped: the stack did not start'
      ci_note e2e:disruptive 'skipped: the stack did not start'
    else
      ci_e2e_playwright chromium timeout -k 30 "$limit" make e2e E2E_ARGS=--project=chromium
      ci_e2e_playwright mobile-chromium timeout -k 30 "$limit" make e2e E2E_ARGS=--project=mobile-chromium
      ci_e2e_playwright disruptive env E2E_STACK=1 timeout -k 30 "$limit" make e2e 'E2E_ARGS=--project=chromium e2e/stack-disruptive.spec.ts'
    fi
    if (( CI_E2E_FAILED )); then ci_e2e_logs; fi
    if (( up_attempted )); then
      if ! ci_run e2e:down -- timeout -k 30 "$limit" make down; then CI_E2E_FAILED=1; fi
    fi
  else
    CI_E2E_FAILED=1
  fi
  CI_KEEP_GOING=$saved
  if (( CI_E2E_FAILED )); then
    ci_failure || :
    return 1
  fi
}

# --- images ---
ci_t3_images_dockerfiles() { ci_stage_dockerfiles --full; }
ci_t3_images_compose_config() {
  ci_need_cmd compose-config docker || return 1
  ci_compose_env
  ci_run images:compose-config -- timeout -k 30 "${CI_STAGE_TIMEOUT:-600}" docker compose config --quiet
}
# ci_t3_build_guard <stage>: a hosted build must come from a clean checkout (its version is the image's label).
ci_t3_build_guard() {
  ci_need_cmd "$1" docker || return 1
  ci_compose_env
  if [[ ${GITHUB_ACTIONS:-} == true && $VERSION == *-dirty ]]; then
    ci_problem "images:$1" "VERSION $VERSION is dirty: build from a clean checkout" || :
    return 1
  fi
}
ci_t3_images_build_api() {
  ci_t3_build_guard build-api || return 1
  ci_run images:build-api -- timeout -k 30 "${CI_STAGE_TIMEOUT:-600}" docker compose build api
}
ci_t3_images_build_web() {
  ci_t3_build_guard build-web || return 1
  ci_run images:build-web -- timeout -k 30 "${CI_STAGE_TIMEOUT:-600}" docker compose build web
}
ci_t3_images_build_aio() {
  ci_t3_build_guard build-aio || return 1
  ci_stage_make images:build-aio image-aio
}
# ci_t3_smoke_ready <stage> [edge]: the commands the smoke scripts use, and for the edge suites their Python modules.
ci_t3_smoke_ready() {
  ci_need_cmd "$1" docker curl jq python3 || return 1
  if [[ ${2:-} == edge ]] && ! python3 -I -c 'import yaml, jsonschema' >/dev/null 2>&1; then
    ci_problem "images:$1" 'python3 modules yaml and jsonschema are missing: install python3-yaml python3-jsonschema' || :
    return 1
  fi
  ci_docker_names
}
ci_t3_images_smoke_api() {
  ci_t3_smoke_ready smoke-api || return 1
  ci_run images:smoke-api -- timeout -k 30 "${CI_STAGE_TIMEOUT:-600}" bash scripts/ci/image-smoke.sh "$CI_API_IMAGE" "$VERSION" "$COMMIT" "$((WEB_PORT + 1))"
}
ci_t3_images_smoke_edge() {
  ci_t3_smoke_ready smoke-edge edge || return 1
  ci_run images:smoke-edge -- timeout -k 30 "${CI_STAGE_TIMEOUT:-600}" bash scripts/ci/edge-smoke.sh "$CI_WEB_IMAGE" "$CI_API_IMAGE"
}
ci_t3_images_smoke_edge_stub() {
  ci_t3_smoke_ready smoke-edge-stub edge || return 1
  ci_run images:smoke-edge-stub -- timeout -k 30 "${CI_STAGE_TIMEOUT:-600}" bash scripts/ci/edge-stub-smoke.sh "$CI_WEB_IMAGE"
}
ci_t3_images_smoke_aio() {
  ci_t3_smoke_ready smoke-aio || return 1
  ci_stage_make images:smoke-aio smoke-aio
}
# edge-mutations: only by name. EDGE_MUTATIONS (space-separated ids) selects a subset; unset runs the script's whole list.
ci_t3_images_edge_mutations() {
  ci_t3_smoke_ready edge-mutations edge || return 1
  ci_run images:edge-mutations -- timeout -k 30 "${CI_STAGE_TIMEOUT:-600}" bash scripts/ci/edge-mutations.sh "$CI_WEB_IMAGE" ${EDGE_MUTATIONS:+"$EDGE_MUTATIONS"}
}
# export: the three images as gzip archives plus the manifest `<name> <ref> <image id> <commit> <version>`
# that the publish job checks. Nothing stale survives, and a failed `docker save` leaves no archive.
ci_t3_images_export() {
  local i name ref archive temporary
  ci_need_cmd images:export docker gzip || return 1
  ci_docker_names
  local -a refs=("$CI_API_IMAGE" "$CI_WEB_IMAGE" "$CI_AIO_IMAGE")
  mkdir -p coverage/images
  rm -f "${CI_IMAGE_FILES[@]}" "$CI_IMAGE_MANIFEST"
  rm -f coverage/images/*.tar.gz.tmp "$CI_IMAGE_MANIFEST.tmp"
  : >"$CI_IMAGE_MANIFEST.tmp"
  for i in "${!CI_IMAGE_NAMES[@]}"; do
    name=${CI_IMAGE_NAMES[i]} ref=${refs[i]} archive=${CI_IMAGE_FILES[i]} temporary=${CI_IMAGE_FILES[i]}.tmp
    # shellcheck disable=SC2016 # the bash -c body is single-quoted on purpose: its values arrive as arguments.
    if ! ci_run "images:export-$name" -- timeout -k 30 "${CI_STAGE_TIMEOUT:-600}" \
      bash -c 'set -o pipefail; docker save "$1" | gzip -n >"$3" && mv "$3" "$2"' _ "$ref" "$archive" "$temporary"; then
      rm -f "$temporary"
      return 1
    fi
    ci_run_capture "images:export-id-$name" CI_IMAGE_ID -- docker image inspect --format '{{.Id}}' "$ref" || return 1
    if [[ ! $CI_IMAGE_ID =~ ^sha256:[0-9a-f]{64}$ ]]; then
      ci_problem "images:export-id-$name" "unexpected image id '$CI_IMAGE_ID'" || :
      return 1
    fi
    printf '%s %s %s %s %s\n' "$name" "$ref" "$CI_IMAGE_ID" "$COMMIT" "$VERSION" >>"$CI_IMAGE_MANIFEST.tmp"
  done
  mv "$CI_IMAGE_MANIFEST.tmp" "$CI_IMAGE_MANIFEST"
  printf '✔ [images:export-manifest] %s\n' "$CI_IMAGE_MANIFEST"
  ci_record images:export-manifest "$CI_IMAGE_MANIFEST" pass 0
  ci_summary '### Exported images' '' '```text' "$(cat "$CI_IMAGE_MANIFEST")" '```' ''
}
# ci_t3_scan_image <api|web|aio>: Trivy on the exported archive. Row 1 loads the database and writes the
# JSON report (retried); row 2 is an informational table with the unfixed findings; row 3, last, is the
# gate: fixable HIGH and CRITICAL findings fail (exit 5, distinct from Trivy's own error code 1).
ci_t3_scan_image() {
  local short=$1 label=images:scan-$1 index name archive json all gate trivy keep status
  case $short in api) index=0 ;; web) index=1 ;; *) index=2 ;; esac
  name=${CI_IMAGE_NAMES[index]} archive=${CI_IMAGE_FILES[index]}
  json=$CI_TRIVY_PREFIX$name.json all=$CI_TRIVY_PREFIX$name-all.txt gate=$CI_TRIVY_PREFIX$name-gate.txt
  if [[ ! -s $archive ]]; then ci_problem "$label" "$archive is missing: run the export stage first" || :; return 1; fi
  ci_need "$label" trivy || return 1
  trivy=$(ci_tool trivy)
  rm -f "$json" "$all" "$all.body" "$gate"
  ci_retry "$label:db" 3 -- timeout -k 30 "${CI_STAGE_TIMEOUT:-600}" "$trivy" image --input "$archive" \
    --scanners vuln --no-progress --skip-version-check --format json --exit-code 0 --output "$json" || return 1
  if timeout -k 30 "${CI_STAGE_TIMEOUT:-600}" "$trivy" convert --scanners vuln --quiet --format table \
    --severity HIGH,CRITICAL --exit-code 0 --output "$all.body" "$json"; then
    {
      printf 'Informational: every HIGH and CRITICAL finding of %s, including those without a fix. Not a gate;\n' "$name"
      printf 'the gate (findings with a fix) is the next row.\n\n'
      cat "$all.body"
    } >"$all"
    ci_note "$label:all" "informational table in $all (findings without a fix included; not part of the gate)"
  else
    ci_note "$label:all" 'informational table could not be produced (not part of the gate)'
  fi
  rm -f "$all.body"
  keep=$CI_KEEP_GOING
  CI_KEEP_GOING=1
  if ci_run "$label:gate" -- timeout -k 30 "${CI_STAGE_TIMEOUT:-600}" "$trivy" image --input "$archive" \
    --scanners vuln --skip-db-update --skip-version-check --quiet --severity HIGH,CRITICAL --ignore-unfixed \
    --exit-code 5 --format table --output "$gate"; then status=0; else status=1; fi
  CI_KEEP_GOING=$keep
  if [[ -s $gate ]]; then
    cat "$gate"
    ci_summary_file "Trivy $name: fixable HIGH/CRITICAL" "$gate"
  else
    ci_summary "### Trivy $name: fixable HIGH/CRITICAL" '' 'No fixable HIGH or CRITICAL findings.' ''
  fi
  if (( status )); then ci_failure || :; return 1; fi
}
ci_t3_images_scan_api() { ci_t3_scan_image api; }
ci_t3_images_scan_web() { ci_t3_scan_image web; }
ci_t3_images_scan_aio() { ci_t3_scan_image aio; }

# --- publish ---
# ci_t3_publish_tags_compute <label>: the tags for EVENT_NAME, REF and SHA (GITHUB_EVENT_NAME, GITHUB_REF and
# GITHUB_SHA when unset), in CI_PUB_TAGS and CI_PUB_TAG_LIST. The ref is only matched, never evaluated.
ci_t3_publish_tags_compute() {
  local event=${EVENT_NAME:-${GITHUB_EVENT_NAME:-}} ref=${REF:-${GITHUB_REF:-}} sha=${SHA:-${GITHUB_SHA:-}}
  # shellcheck source=scripts/ci/publish-tags.sh
  source "$CI_ROOT/scripts/ci/publish-tags.sh" || { ci_problem "$1" 'cannot load scripts/ci/publish-tags.sh' || :; return 1; }
  ci_run_capture "$1" CI_PUB_TAGS -- publish_tags "$event" "$ref" "$sha" || return 1
  CI_PUB_TAG_LIST=()
  mapfile -t CI_PUB_TAG_LIST <<<"$CI_PUB_TAGS"
  if (( ${#CI_PUB_TAG_LIST[@]} == 0 )) || [[ -z ${CI_PUB_TAG_LIST[0]} ]]; then
    ci_problem "$1" 'no tags for this ref' || :
    return 1
  fi
}
ci_t3_publish_tags() {
  ci_t3_publish_tags_compute publish:tags || return 1
  printf '%s\n' "${CI_PUB_TAG_LIST[@]}"
}
# ci_ghcr_login: the token goes in on stdin, never as an argument and never to the output.
ci_ghcr_login() { printf '%s' "$GITHUB_TOKEN" | docker login ghcr.io -u "$GITHUB_ACTOR" --password-stdin; }
ci_ghcr_logout() { docker logout ghcr.io >/dev/null 2>&1 || :; }
# push: only inside GitHub Actions with a token; recomputes the tags itself; pushes the exact images the
# images job tested (their archives, checked against the manifest before the login).
ci_t3_publish_push() {
  local label=publish:push directory=${PUBLISH_IMAGES_DIR:-coverage/images} manifest owner name tag remote digest failed=0
  local -A ref_of=() id_of=()
  local -a rows=() names=("${CI_IMAGE_NAMES[@]}")
  local mname mref mid
  if [[ ${GITHUB_ACTIONS:-} != true ]]; then ci_problem "$label" 'refusing to push outside GitHub Actions (GITHUB_ACTIONS is not true)' || :; return 1; fi
  if [[ -z ${GITHUB_TOKEN:-} ]]; then ci_problem "$label" 'refusing to push without GITHUB_TOKEN' || :; return 1; fi
  if [[ -z ${GITHUB_ACTOR:-} ]]; then ci_problem "$label" 'refusing to push without GITHUB_ACTOR' || :; return 1; fi
  ci_t3_publish_tags_compute publish:push-tags || return 1
  for tag in "${CI_PUB_TAG_LIST[@]}"; do
    if [[ ! $tag =~ ^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$ ]]; then ci_problem "$label" "invalid image tag '$tag'" || :; return 1; fi
  done
  if ! owner=$(ci_ghcr_owner); then ci_problem "$label" 'GITHUB_REPOSITORY_OWNER is not a valid registry owner' || :; return 1; fi
  ci_need_cmd "$label" docker || return 1
  manifest=$directory/image-ids.txt
  local -a files=("$manifest")
  for name in "${names[@]}"; do files+=("$directory/$name.tar.gz"); done
  ci_require_files publish:images "${files[@]}" || return 1
  while read -r mname mref mid _; do
    [[ -n $mname ]] || continue
    ref_of[$mname]=$mref id_of[$mname]=$mid
  done <"$manifest"
  for name in "${names[@]}"; do
    if [[ -z ${ref_of[$name]:-} || -z ${id_of[$name]:-} ]]; then ci_problem publish:verify "image $name is not in $manifest" || :; return 1; fi
  done
  for name in "${names[@]}"; do
    ci_run "publish:load-$name" -- timeout -k 30 "${CI_STAGE_TIMEOUT:-600}" docker load -i "$directory/$name.tar.gz" || return 1
  done
  for name in "${names[@]}"; do
    ci_run_capture "publish:inspect-$name" CI_LOADED_ID -- docker image inspect --format '{{.Id}}' "${ref_of[$name]}" || return 1
    if [[ $CI_LOADED_ID != "${id_of[$name]}" ]]; then ci_problem publish:verify "image $name differs from the tested image" || failed=1; fi
  done
  if (( failed )); then return 1; fi
  trap ci_ghcr_logout EXIT
  ci_run publish:login -- ci_ghcr_login || return 1
  for name in "${names[@]}"; do
    for tag in "${CI_PUB_TAG_LIST[@]}"; do
      remote=ghcr.io/$owner/$name:$tag
      if ! ci_run "publish:tag-$name:$tag" -- docker tag "${ref_of[$name]}" "$remote"; then failed=1; continue; fi
      if ! ci_run_capture "publish:push-$name:$tag" CI_PUSH_OUT -- timeout -k 30 "${CI_STAGE_TIMEOUT:-600}" docker push "$remote"; then failed=1; continue; fi
      printf '%s\n' "$CI_PUSH_OUT"
      digest='(not reported)'
      if [[ $CI_PUSH_OUT =~ digest:\ (sha256:[0-9a-f]{64}) ]]; then digest=${BASH_REMATCH[1]}; fi
      rows+=("| $name | $tag | \`$digest\` |")
    done
  done
  if (( ${#rows[@]} )); then ci_summary '### Published images' '' '| image | tag | digest |' '|---|---|---|' "${rows[@]}" ''; fi
  (( ! failed ))
}
