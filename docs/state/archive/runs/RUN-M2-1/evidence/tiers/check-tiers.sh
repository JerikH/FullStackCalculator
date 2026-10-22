#!/usr/bin/env bash
# Evidence for the tier scripts wired to the Makefile (RF-OPS-03): runs t1.sh and t2.sh in a
# throwaway git repository whose Makefile is a fake (21 targets that append their name to a log)
# and whose docker is a shim, so nothing real is built, started or stopped. The real repository is
# never modified. Mutation checks edit copies of the scripts inside the throwaway repository.
# Usage: [SCRIPTS_SRC=<dir with lib.sh, t0..t3.sh, env.sh>] [SHOW=1] bash check-tiers.sh
# Single-quoted fixtures and sed expressions keep $ literal on purpose (SC2016); sed prefixes lines of
# multi-line output (SC2001); `A && ok || bad` cannot misfire because ok never fails (SC2015).
# shellcheck disable=SC2016,SC2001,SC2015
set -uo pipefail

repo=$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)
src=${SCRIPTS_SRC:-$repo/scripts/ci}
work=$(mktemp -d "${TMPDIR:-/tmp}/check-tiers.XXXXXX")
trap 'rm -rf "$work"' EXIT
sandbox=$work/repo
MKLOG=$work/make.log
DLOG=$work/docker.log
export MKLOG DLOG
G=(git -C "$sandbox" -c user.name=check -c user.email=check@localhost -c commit.gpgsign=false)

fails=0
ok() { printf 'PASS %s\n' "$1"; }
bad() { printf 'FAIL %s\n' "$1"; fails=$((fails + 1)); }
has() { if grep -qF -- "$2" <<<"$OUT"; then ok "$1"; else bad "$1 (missing: $2)"; sed 's/^/     | /' <<<"$OUT" | tail -20; fi; }
hasnt() { if grep -qF -- "$2" <<<"$OUT"; then bad "$1 (unexpected: $2)"; else ok "$1"; fi; }
rc_is() { if [[ $RC == "$2" ]]; then ok "$1 (exit $RC)"; else bad "$1 (exit $RC, want $2)"; sed 's/^/     | /' <<<"$OUT" | tail -20; fi; }
rc_nz() { if [[ $RC != 0 ]]; then ok "$1 (exit $RC)"; else bad "$1 (exit 0, want non-zero)"; fi; }
# log_is <label> <expected>: the make log holds exactly these target names, in this order.
log_is() {
  local got
  got=$(tr '\n' ' ' <"$MKLOG")
  got=${got% }
  if [[ $got == "$2" ]]; then ok "$1 (make log: ${got:-empty})"; else bad "$1 (make log: '${got}', want '$2')"; fi
}
log_has() { if grep -qF -- "$2" "$MKLOG"; then ok "$1"; else bad "$1 (make log lacks: $2)"; fi; }
docker_log_empty() { if [[ ! -s $DLOG ]]; then ok "$1 (docker never called)"; else bad "$1 (docker called: $(cat "$DLOG"))"; fi; }
# run <cmd…>: run in the sandbox with no agent identity inherited; sets OUT and RC.
run() {
  : >"$MKLOG"; : >"$DLOG"
  OUT=$(cd "$sandbox" && env -u WF_AGENT -u WF_INDEX -u WF_PORT_BASE -u WF_PORT_END -u WF_HOME \
    -u COMPOSE_PROJECT_NAME -u WEB_PORT -u E2E_ARGS -u E2E_STACK -u CI_STAGE_TIMEOUT \
    -u FAIL_TARGET -u SLOW_TARGET -u VERSION -u COMMIT -u IMAGE_TAG "$@" 2>&1)
  RC=$?
  if [[ -n ${SHOW-} ]]; then printf '   $ %s  -> exit %s\n' "$*" "$RC"; sed 's/^/     | /' <<<"$OUT"; fi
}
install_scripts() {
  mkdir -p "$sandbox/scripts/ci"
  cp "$src"/lib.sh "$src"/t0.sh "$src"/t1.sh "$src"/t2.sh "$src"/t3.sh "$src"/env.sh "$sandbox/scripts/ci/"
}

targets=(help bootstrap gen lint test coverage coverage-backend coverage-frontend fuzz bench dev-backend
  dev-frontend up down logs e2e image-aio run-aio smoke-aio docs-api clean)
write_makefile() { # write_makefile [skipped target…]
  local t skip defined=()
  for t in "${targets[@]}"; do
    for skip in "$@"; do [[ $t == "$skip" ]] && continue 2; done
    defined+=("$t")
  done
  {
    printf '.PHONY: %s\n' "${defined[*]}"
    for t in "${defined[@]}"; do
      printf '%s:\n\t@echo %s >> "$$MKLOG"; if [ "$$FAIL_TARGET" = %s ]; then exit 1; fi; if [ "$$SLOW_TARGET" = %s ]; then sleep 5; fi\n' "$t" "$t" "$t" "$t"
      if [[ $t == e2e ]]; then printf '\t@echo "e2e-env E2E_STACK=$$E2E_STACK ARGS=$(E2E_ARGS)" >> "$$MKLOG"\n'; fi
    done
  } >"$sandbox/Makefile"
}

echo "# setup: throwaway repository with the scripts under test, a fake Makefile and a docker shim"
mkdir -p "$sandbox/tools" "$sandbox/bin"
"${G[@]}" init -q
install_scripts
cp "$repo/tools/versions.env" "$sandbox/tools/"
write_makefile
cat >"$sandbox/bin/docker" <<'SHIM'
#!/usr/bin/env bash
printf 'docker %s | VERSION=%s COMMIT=%s IMAGE_TAG=%s COMPOSE_PROJECT_NAME=%s WEB_PORT=%s\n' \
  "$*" "${VERSION-}" "${COMMIT-}" "${IMAGE_TAG-}" "${COMPOSE_PROJECT_NAME-}" "${WEB_PORT-}" >>"$DLOG"
SHIM
chmod +x "$sandbox/bin/docker"
"${G[@]}" add -A . && "${G[@]}" commit -qm base
clean_makefile=$(cat "$sandbox/Makefile")

# ---------------------------------------------------------------------------------------------
case_lint_up() {
  echo "# 1 --stage lint --stage up: lint, up, then down automatically; nothing else"
  run scripts/ci/t2.sh --stage lint --stage up
  rc_is "lint+up" 0
  log_is "order" "lint up down"
  has "lint is bounded by timeout 600" "timeout 600 make lint"
  has "up is bounded by timeout 600" "timeout 600 make up"
  has "down is bounded by timeout 600" "timeout 600 make down"
  hasnt "no affected-stage selection" "changed file"
  hasnt "no Makefile check" "integration:make"
  docker_log_empty "lint+up"
  local header down_line
  header=$(grep -nF 'stage · command · result · seconds' <<<"$OUT" | head -1 | cut -d: -f1)
  down_line=$(grep -nF '▶ [stage:down]' <<<"$OUT" | head -1 | cut -d: -f1)
  if [[ -n $header && -n $down_line && $header -gt $down_line ]]; then ok "summary is printed after the cleanup down"; else bad "summary before down (header $header, down $down_line)"; fi
  has "down has its summary row" "stage:down · "
}
case_lint_fails() {
  echo "# 2 a failing lint before up"
  run FAIL_TARGET=lint scripts/ci/t2.sh --stage lint --stage up
  rc_nz "lint fails"
  log_is "up and down never run without --keep-going" "lint"
  has "lint is a failed row" "✘ [stage:lint]"
  run FAIL_TARGET=lint scripts/ci/t2.sh --stage lint --stage up --keep-going
  rc_nz "lint fails with --keep-going"
  log_is "with --keep-going up runs and down follows" "lint up down"
  run FAIL_TARGET=e2e scripts/ci/t2.sh --stage up --stage e2e --stage down
  rc_nz "e2e fails before a named down"
  log_is "a named down that was never reached still runs, once" "up e2e down"
}
case_keep_stack() {
  echo "# 3 down handling"
  run scripts/ci/t2.sh --stage up --keep-stack
  rc_is "--keep-stack" 0
  log_is "--keep-stack does not run down" "up"
  run scripts/ci/t2.sh --stage up --stage down
  rc_is "up and down named" 0
  log_is "down runs once" "up down"
  run FAIL_TARGET=up scripts/ci/t2.sh --stage up
  rc_nz "up fails"
  log_is "a failed up is still followed by down" "up down"
  has "failed up row" "✘ [stage:up]"
  run scripts/ci/t2.sh --stage down
  rc_is "down alone" 0
  log_is "down alone runs once" "down"
}
case_unknown() {
  echo "# 4 unknown and malformed stages"
  run scripts/ci/t2.sh --stage nope
  rc_is "unknown stage" 2
  has "message" "unknown stage nope; valid:"
  for name in lint test coverage-backend coverage-frontend fuzz bench image-api image-web image-aio up e2e e2e-disruptive down smoke-aio docs-api; do
    has "valid list names $name" " $name"
  done
  log_is "nothing ran" ""
  run scripts/ci/t2.sh --stage lint --stage nope
  rc_is "known stage before an unknown one" 2
  log_is "validation happens before anything runs" ""
  run scripts/ci/t2.sh --stage
  rc_is "--stage without a name" 2
  run scripts/ci/t2.sh --stage=lint
  rc_is "--stage=name form is not accepted" 2
  log_is "nothing ran for the rejected forms" ""
}
case_mapping() {
  echo "# 5 make-mapped stages run one target each"
  run scripts/ci/t2.sh --stage lint --stage test --stage coverage-backend --stage coverage-frontend --stage fuzz \
    --stage bench --stage image-aio --stage up --stage e2e --stage down --stage smoke-aio --stage docs-api
  rc_is "all make-mapped stages" 0
  log_is "one target per stage, down once" "lint test coverage-backend coverage-frontend fuzz bench image-aio up e2e e2e-env E2E_STACK= ARGS= down smoke-aio docs-api"
  run E2E_ARGS=e2e/layout.spec.ts scripts/ci/t2.sh --stage e2e
  log_has "e2e forwards E2E_ARGS from the environment" "e2e-env E2E_STACK= ARGS=e2e/layout.spec.ts"
  run scripts/ci/t2.sh -h
  rc_is "-h" 0
  has "usage forbids starting the stack by default" "the default T2 never starts the composed stack: up, e2e, e2e-disruptive, down and smoke-aio run only when named"
  has "usage documents E2E_ARGS" "E2E_ARGS"
  has "usage signature" "usage: t2.sh [--base <ref>] [--stage <name>]… [--keep-stack] [--keep-going] [-h]"
}
case_images() {
  echo "# 6 image stages: docker compose build with the Makefile's variables"
  run scripts/ci/t2.sh --stage image-web
  rc_is "image-web" 0
  has "docker compose build web, bounded" "timeout 600 docker compose build web"
  grep -q '^docker compose build web |' "$DLOG" && ok "shim saw: compose build web" || bad "shim saw: $(cat "$DLOG")"
  log_is "no make call" ""
  run scripts/ci/t2.sh --stage image-api
  grep -q '^docker compose build api |' "$DLOG" && ok "shim saw: compose build api" || bad "shim saw: $(cat "$DLOG")"
  # The shim's view of the variables, three ways to name the project.
  local seen
  : >"$DLOG"
  env -u COMPOSE_PROJECT_NAME -u IMAGE_TAG -u VERSION -u COMMIT -u WEB_PORT bash -c 'source "$1/scripts/ci/lib.sh"; ci_compose_env; docker compose build web' _ "$sandbox" >/dev/null 2>&1
  seen=$(cat "$DLOG")
  if [[ $seen == *' IMAGE_TAG=local COMPOSE_PROJECT_NAME=fullstackcalculator WEB_PORT=8080'* ]]; then ok "COMPOSE_PROJECT_NAME unset -> IMAGE_TAG=local, defaults applied"; else bad "unset: $seen"; fi
  if [[ $seen =~ VERSION=[^[:space:]]+\ COMMIT=[^[:space:]]+\  ]]; then ok "VERSION and COMMIT non-empty"; else bad "VERSION/COMMIT: $seen"; fi
  : >"$DLOG"
  COMPOSE_PROJECT_NAME=fullstackcalculator env -u IMAGE_TAG -u VERSION -u COMMIT -u WEB_PORT bash -c 'source "$1/scripts/ci/lib.sh"; ci_compose_env; docker compose build web' _ "$sandbox" >/dev/null 2>&1
  seen=$(cat "$DLOG")
  if [[ $seen == *' IMAGE_TAG=local COMPOSE_PROJECT_NAME=fullstackcalculator '* ]]; then ok "COMPOSE_PROJECT_NAME=fullstackcalculator -> IMAGE_TAG=local"; else bad "main: $seen"; fi
  : >"$DLOG"
  COMPOSE_PROJECT_NAME=fullstackcalculator-w2 env -u IMAGE_TAG -u VERSION -u COMMIT -u WEB_PORT bash -c 'source "$1/scripts/ci/lib.sh"; ci_compose_env; docker compose build web' _ "$sandbox" >/dev/null 2>&1
  seen=$(cat "$DLOG")
  if [[ $seen == *' IMAGE_TAG=fullstackcalculator-w2 COMPOSE_PROJECT_NAME=fullstackcalculator-w2 '* ]]; then ok "COMPOSE_PROJECT_NAME=fullstackcalculator-w2 -> IMAGE_TAG=fullstackcalculator-w2"; else bad "worker: $seen"; fi
  # End to end through t2.sh as a worker (the agent environment names the project and the port).
  printf '{\n  "agent": "w2"\n}\n' >"$sandbox/.wf-agent"
  run WF_AGENT=w2 WF_INDEX=1 WF_PORT_BASE=20000 scripts/ci/t2.sh --stage image-web
  rm -f "$sandbox/.wf-agent"
  rc_is "image-web as worker w2" 0
  seen=$(cat "$DLOG")
  if [[ $seen == *' IMAGE_TAG=fullstackcalculator-w2 COMPOSE_PROJECT_NAME=fullstackcalculator-w2 WEB_PORT=20000'* ]]; then ok "worker run: tag, project and port reach docker"; else bad "worker run: $seen"; fi
}
case_default() {
  echo "# 7 the default T2"
  run scripts/ci/t2.sh --base HEAD
  rc_is "default T2 with 21 targets" 0
  has "Makefile check passes" "all 21 targets present"
  has "pass row in the summary" "integration:make · all 21 targets present · pass"
  log_is "no make target ran" ""
  docker_log_empty "default T2"
  # Missing targets, including a name that exists only as a prerequisite («Not a target»).
  write_makefile logs
  run scripts/ci/t2.sh --base HEAD
  rc_nz "one target missing"
  has "names the missing target" "missing Make target logs"
  hasnt "does not claim all present" "targets present"
  log_is "still no make target ran" ""
  write_makefile logs gen
  run scripts/ci/t2.sh --base HEAD --keep-going
  rc_nz "two targets missing with --keep-going"
  has "first missing target" "missing Make target gen"
  has "second missing target" "missing Make target logs"
  write_makefile logs
  printf 'up: logs\n' >>"$sandbox/Makefile"
  run scripts/ci/t2.sh --base HEAD
  rc_nz "target known only as a prerequisite"
  has "prerequisite-only name is missing" "missing Make target logs"
  printf '%s\n' "$clean_makefile" >"$sandbox/Makefile"
  rm -f "$sandbox/Makefile"
  run scripts/ci/t2.sh --base HEAD
  rc_is "no Makefile" 0
  has "no Makefile note" "not present (no Makefile)"
  printf '%s\n' "$clean_makefile" >"$sandbox/Makefile"
  "${G[@]}" checkout -q -- Makefile
}
case_timeout() {
  echo "# 8 a stage beyond its time limit"
  run CI_STAGE_TIMEOUT=1 SLOW_TARGET=lint scripts/ci/t2.sh --stage lint --stage test
  rc_nz "timeout without --keep-going"
  has "timeout is a failed row" "✘ [stage:lint] exit 124"
  log_is "the next stage does not run" "lint"
  run CI_STAGE_TIMEOUT=1 SLOW_TARGET=lint scripts/ci/t2.sh --stage lint --stage test --keep-going
  rc_nz "timeout with --keep-going"
  has "timeout row again" "✘ [stage:lint] exit 124"
  log_is "the next stage runs" "lint test"
  has "limit shown in the command" "timeout 1 make lint"
}
case_disruptive() {
  echo "# 9 e2e-disruptive"
  run scripts/ci/t2.sh --stage e2e-disruptive
  rc_is "e2e-disruptive" 0
  log_has "E2E_STACK=1 and the disruptive file" "e2e-env E2E_STACK=1 ARGS=--project=chromium e2e/stack-disruptive.spec.ts"
  has "bounded by timeout" "timeout 600 make e2e"
}
case_t1() {
  echo "# 10 t1.sh"
  run scripts/ci/t1.sh make:up make:e2e make:down
  rc_is "make targets" 0
  log_is "the targets ran" "up e2e e2e-env E2E_STACK= ARGS= down"
  run scripts/ci/t1.sh make:nope
  rc_is "unknown make target" 1
  has "message" "unknown make target nope"
  log_is "nothing ran" ""
  run scripts/ci/t1.sh frontend/e2e/missing.spec.ts
  rc_is "missing test file" 1
  has "missing test file message" "missing test file frontend/e2e/missing.spec.ts"
  run scripts/ci/t1.sh nonsense
  rc_is "unknown token" 1
  has "unknown token message" "unknown target nonsense"
  write_makefile logs
  printf 'up: logs\n' >>"$sandbox/Makefile"
  run scripts/ci/t1.sh make:logs
  rc_is "prerequisite-only name" 1
  has "prerequisite-only name is unknown" "unknown make target logs"
  rm -f "$sandbox/Makefile"
  run scripts/ci/t1.sh make:up
  rc_is "no Makefile" 1
  has "no Makefile message" "unknown make target up"
  "${G[@]}" checkout -q -- Makefile
  run scripts/ci/t1.sh -h
  has "usage mentions make:<target>" "make:<target>"
}

case_lint_up; case_lint_fails; case_keep_stack; case_unknown; case_mapping; case_images; case_default
case_timeout; case_disruptive; case_t1

# ---------------------------------------------------------------------------------------------
# Mutation checks: each breaks one behavior in the sandbox copy; the matching case must FAIL.
mutate() { # mutate <label> <file> <sed expression> <case function>
  local label=$1 file=$2 expr=$3 fn=$4 before after
  install_scripts
  sed -i "$expr" "$sandbox/scripts/ci/$file"
  if cmp -s "$sandbox/scripts/ci/$file" "$src/$file"; then bad "mutation '$label' changed nothing"; install_scripts; return; fi
  before=$fails
  "$fn" >/dev/null 2>&1
  after=$fails
  fails=$before
  if (( after > before )); then ok "mutation detected: $label"; else bad "mutation survived: $label"; fi
  install_scripts
}
echo "# 11 mutation checks"
write_makefile
mutate 'stage-name validation removed' t2.sh "s/^    \*) printf 'unknown stage.*\$/    *) ;;/" case_unknown
mutate 'default T2 runs make up' t2.sh 's/^  ci_check_makefile$/  ci_check_makefile; ci_stage_make integration:up up/' case_default
mutate 'timeout dropped from ci_stage_make' lib.sh 's/timeout "\${CI_STAGE_TIMEOUT:-600}" make/make/' case_timeout
mutate 'down without the up-attempted guard' t2.sh 's/if (( up_attempted \&\& ! keep_stack \&\& ! down_ran )); then/if (( ! keep_stack \&\& ! down_ran )); then/' case_lint_fails
mutate 'image stage drops the compose environment' t2.sh 's/^      ci_compose_env$/      :/' case_images
mutate 'IMAGE_TAG always local' lib.sh 's/IMAGE_TAG=\$COMPOSE_PROJECT_NAME; fi/IMAGE_TAG=local; fi/' case_images
mutate 'missing target not reported' lib.sh 's/ci_problem integration:make "missing Make target \$target" || :/:/' case_default
mutate 'down skipped for a failed up' t2.sh 's/if \[\[ \$stage == up \]\]; then up_attempted=1; fi/:/' case_keep_stack

echo
if (( fails )); then printf '%d FAILED\n' "$fails"; exit 1; fi
echo "all checks passed"
