#!/usr/bin/env bash
# Evidence for OPS-ENV-01 (UC-OPS-01 E1, E2, E6; RF-OPS-02): sources scripts/ci/env.sh
# in clean shells for the main checkout and simulated worker worktrees and checks
# every exported value, the failure paths and side-by-side listeners.
# Usage: bash docs/state/runs/RUN-M0-2/evidence/check-env.sh [<env.sh to test>]
# The bash -c programs below are single-quoted on purpose: they expand in the child shell.
# shellcheck disable=SC2016
set -euo pipefail

repo=$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)
env_sh=${1:-$repo/scripts/ci/env.sh}
work=$(mktemp -d "${TMPDIR:-/tmp}/check-env.XXXXXX")
pids=()
cleanup() {
  local p
  for p in "${pids[@]}"; do kill "$p" 2>/dev/null || true; done
  rm -rf "$work"
}
trap cleanup EXIT

fails=0
ok() { printf 'ok   %s\n' "$1"; }
bad() { printf 'FAIL %s\n' "$1"; fails=$((fails + 1)); }
check() { if [[ "$2" == "$3" ]]; then ok "$1"; else bad "$1 (got '$2', want '$3')"; fi; }
contains() { if [[ "$2" == *"$3"* ]]; then ok "$1"; else bad "$1 (missing '$3' in: $2)"; fi; }

VARS=(WEB_PORT CALC_HTTP_ADDR CALC_ADMIN_ADDR VITE_PORT API_PROXY_TARGET E2E_BASE_URL COMPOSE_PROJECT_NAME PATH)
BASE_PATH=/usr/bin:/bin

# make_tree <dir> [<agent> <index>]: a repository-shaped tree holding a copy of env.sh,
# plus a .wf-agent written exactly as wf writes it when an agent is given.
make_tree() {
  mkdir -p "$1/scripts/ci"
  cp "$env_sh" "$1/scripts/ci/env.sh"
  if [[ $# -ge 3 ]]; then
    python3 -c 'import json, sys; print(json.dumps({"agent": sys.argv[1], "index": int(sys.argv[2]), "wave": "W1", "branch": "wf/" + sys.argv[1], "worktree": "/x"}, indent=2))' "$2" "$3" >"$1/.wf-agent"
  fi
}

# probe <tree> <home> [VAR=value…]: sources env.sh in a clean bash; sets OUT (rc and the
# variables, one per line) and ERR (stderr).
probe() {
  local tree=$1 home=$2
  shift 2
  ERR=$(mktemp "$work/err.XXXXXX")
  OUT=$(env -i HOME="$home" PATH="$BASE_PATH" "$@" bash -c '
    source "$1/scripts/ci/env.sh"
    rc=$?
    printf "rc=%s\n" "$rc"
    shift
    for v in "$@"; do printf "%s=%s\n" "$v" "${!v-}"; done
  ' _ "$tree" "${VARS[@]}" 2>"$ERR")
  ERR=$(cat "$ERR")
}
get() { sed -n "s/^$1=//p" <<<"$OUT"; }

main_tree=$work/main
make_tree "$main_tree"
w1=$work/w1
make_tree "$w1" RUN-M1-1 1
w2=$work/w2
make_tree "$w2" RUN-M1-2 2
odd=$work/odd
make_tree "$odd" 'Run M1/1' 1

echo "# main checkout (WF_AGENT=main WF_INDEX=0)"
probe "$main_tree" "$HOME" WF_AGENT=main WF_INDEX=0 WF_PORT_BASE=4100 WF_PORT_END=4109
check "main rc" "$(get rc)" 0
check "main WEB_PORT" "$(get WEB_PORT)" 8080
check "main CALC_HTTP_ADDR" "$(get CALC_HTTP_ADDR)" :8081
check "main CALC_ADMIN_ADDR" "$(get CALC_ADMIN_ADDR)" :9091
check "main VITE_PORT" "$(get VITE_PORT)" 5173
check "main API_PROXY_TARGET" "$(get API_PROXY_TARGET)" http://localhost:8081
check "main E2E_BASE_URL" "$(get E2E_BASE_URL)" http://127.0.0.1:8080
check "main COMPOSE_PROJECT_NAME" "$(get COMPOSE_PROJECT_NAME)" fullstackcalculator
check "main PATH starts with bin/ then Go" "$(get PATH)" "$main_tree/bin:$HOME/.local/go/bin:$BASE_PATH"
if [[ "$ERR" == *"no agent identity"* ]]; then bad "main: no E1 message"; else ok "main: no E1 message"; fi
contains "main summary line" "$ERR" "env.sh: main — web 8080 · api :8081 · admin :9091 · vite 5173 · compose fullstackcalculator"

echo "# no identity (E1)"
probe "$main_tree" "$HOME"
check "E1 rc" "$(get rc)" 0
check "E1 WEB_PORT" "$(get WEB_PORT)" 8080
check "E1 COMPOSE_PROJECT_NAME" "$(get COMPOSE_PROJECT_NAME)" fullstackcalculator
contains "E1 message" "$ERR" "env.sh: no agent identity (WF_AGENT/WF_INDEX unset); using the main-checkout defaults"

echo "# worker 1 and worker 2"
probe "$w1" "$HOME" WF_AGENT=RUN-M1-1 WF_INDEX=1 WF_PORT_BASE=4110 WF_PORT_END=4119
check "w1 rc" "$(get rc)" 0
check "w1 WEB_PORT" "$(get WEB_PORT)" 4110
check "w1 CALC_HTTP_ADDR" "$(get CALC_HTTP_ADDR)" :4111
check "w1 CALC_ADMIN_ADDR" "$(get CALC_ADMIN_ADDR)" :4112
check "w1 VITE_PORT" "$(get VITE_PORT)" 4113
check "w1 API_PROXY_TARGET" "$(get API_PROXY_TARGET)" http://localhost:4111
check "w1 E2E_BASE_URL" "$(get E2E_BASE_URL)" http://127.0.0.1:4110
check "w1 COMPOSE_PROJECT_NAME" "$(get COMPOSE_PROJECT_NAME)" fullstackcalculator-run-m1-1
w1_ports="$(get WEB_PORT) $(get CALC_HTTP_ADDR) $(get CALC_ADMIN_ADDR) $(get VITE_PORT)"
w1_name=$(get COMPOSE_PROJECT_NAME)
probe "$w2" "$HOME" WF_AGENT=RUN-M1-2 WF_INDEX=2 WF_PORT_BASE=4120 WF_PORT_END=4129
check "w2 rc" "$(get rc)" 0
check "w2 ports" "$(get WEB_PORT) $(get CALC_HTTP_ADDR) $(get CALC_ADMIN_ADDR) $(get VITE_PORT)" "4120 :4121 :4122 4123"
w2_ports="$(get WEB_PORT) $(get CALC_HTTP_ADDR) $(get CALC_ADMIN_ADDR) $(get VITE_PORT)"
w2_name=$(get COMPOSE_PROJECT_NAME)
read -ra ports <<<"8080 8081 9091 5173 ${w1_ports//:/} ${w2_ports//:/}"
all=$(printf '%s\n' "${ports[@]}" | sort)
check "E6: twelve ports, pairwise disjoint" "$(uniq <<<"$all" | wc -l | tr -d ' ')" 12
check "E6: three distinct project names" "$(printf '%s\n' fullstackcalculator "$w1_name" "$w2_name" | sort -u | wc -l | tr -d ' ')" 3

echo "# worker agent name sanitised"
probe "$odd" "$HOME" "WF_AGENT=Run M1/1" WF_INDEX=1 WF_PORT_BASE=4110
check "odd name rc" "$(get rc)" 0
check "odd name project" "$(get COMPOSE_PROJECT_NAME)" fullstackcalculator-run-m1-1

echo "# identity mismatches (nothing exported)"
mismatch() {
  local label=$1 tree=$2 needle=$3
  shift 3
  probe "$tree" "$HOME" "$@"
  check "$label rc" "$(get rc)" 1
  check "$label WEB_PORT not exported" "$(get WEB_PORT)" ""
  check "$label PATH unchanged" "$(get PATH)" "$BASE_PATH"
  contains "$label message" "$ERR" "$needle"
}
mismatch "worker with wf fallback index 0" "$w1" WF_INDEX WF_AGENT=RUN-M1-1 WF_INDEX=0 WF_PORT_BASE=4100
mismatch "worker with another agent" "$w1" "this worktree belongs to RUN-M1-1 but WF_AGENT is 'RUN-M1-2'" WF_AGENT=RUN-M1-2 WF_INDEX=2 WF_PORT_BASE=4120
mismatch "worker without identity" "$w1" "this worktree belongs to RUN-M1-1"
mismatch "main with a worker identity" "$main_tree" "identity mismatch: the main checkout cannot use WF_AGENT=RUN-M1-1 WF_INDEX=1" WF_AGENT=RUN-M1-1 WF_INDEX=1 WF_PORT_BASE=4110
mismatch "worker WF_INDEX=x" "$w1" WF_INDEX WF_AGENT=RUN-M1-1 WF_INDEX=x WF_PORT_BASE=4110
mismatch "worker WF_PORT_END too small" "$w1" WF_PORT_END WF_AGENT=RUN-M1-1 WF_INDEX=1 WF_PORT_BASE=4110 WF_PORT_END=4111
mismatch "worker WF_PORT_BASE missing" "$w1" WF_PORT_BASE WF_AGENT=RUN-M1-1 WF_INDEX=1
mismatch "worker WF_PORT_BASE below 1024" "$w1" "WF_PORT_BASE must be at least 1024" WF_AGENT=RUN-M1-1 WF_INDEX=1 WF_PORT_BASE=80
mismatch "worker block overlapping main's Vite port" "$w1" "overlaps the main checkout's port 5173" WF_AGENT=RUN-M1-1 WF_INDEX=1 WF_PORT_BASE=5170

echo "# missing Go (E2)"
empty_home=$work/home
mkdir -p "$empty_home"
probe "$main_tree" "$empty_home" WF_AGENT=main WF_INDEX=0
check "E2 rc" "$(get rc)" 1
check "E2 WEB_PORT not exported" "$(get WEB_PORT)" ""
check "E2 COMPOSE_PROJECT_NAME not exported" "$(get COMPOSE_PROJECT_NAME)" ""
check "E2 PATH unchanged" "$(get PATH)" "$BASE_PATH"
contains "E2 install hint" "$ERR" "env.sh: Go not found. Install Go 1.27 from https://go.dev/dl/"

echo "# executed instead of sourced"
set +e
exec_err=$(env -i HOME="$HOME" PATH="$BASE_PATH" bash "$main_tree/scripts/ci/env.sh" 2>&1)
exec_rc=$?
set -e
check "executed exit code" "$exec_rc" 2
contains "executed message" "$exec_err" "env.sh: source this file: source scripts/ci/env.sh"

echo "# sourced twice; strict caller"
twice=$(env -i HOME="$HOME" PATH="$BASE_PATH" WF_AGENT=main WF_INDEX=0 bash -c '
  source "$1/scripts/ci/env.sh" 2>/dev/null
  source "$1/scripts/ci/env.sh" 2>/dev/null
  printf "%s" "$PATH"' _ "$main_tree")
check "PATH unchanged by a second source" "$twice" "$main_tree/bin:$HOME/.local/go/bin:$BASE_PATH"
strict=$(env -i HOME="$HOME" PATH="$BASE_PATH" WF_AGENT=main WF_INDEX=0 bash -c '
  set -euo pipefail
  source "$1/scripts/ci/env.sh" 2>/dev/null
  echo "continued $WEB_PORT"' _ "$main_tree" || true)
check "caller with set -euo pipefail continues" "$strict" "continued 8080"
strict_fail=$(env -i HOME="$HOME" PATH="$BASE_PATH" WF_AGENT=RUN-M1-2 WF_INDEX=2 WF_PORT_BASE=4120 bash -c '
  set -euo pipefail
  if source "$1/scripts/ci/env.sh" 2>/dev/null; then echo loaded; else echo "refused $?"; fi' _ "$w1" || true)
check "strict caller sees a refusal as status 1" "$strict_fail" "refused 1"
leak=$(env -i HOME="$HOME" PATH="$BASE_PATH" WF_AGENT=main WF_INDEX=0 bash -c '
  before=$(compgen -v | sort); source "$1/scripts/ci/env.sh" 2>/dev/null
  comm -13 <(printf "%s\n" "$before") <(compgen -v | sort) | grep -v -x -e before -e PIPESTATUS | tr "\n" " "
  declare -F _calc_env_load || true' _ "$main_tree")
check "only the seven variables are added; no helper left" "$leak" "API_PROXY_TARGET CALC_ADMIN_ADDR CALC_HTTP_ADDR COMPOSE_PROJECT_NAME E2E_BASE_URL VITE_PORT WEB_PORT "

echo "# side by side: all four ports of main and worker 1 (E6)"
for port in 8080 8081 9091 5173 4110 4111 4112 4113; do
  if (exec 3<>"/dev/tcp/127.0.0.1/$port") 2>/dev/null; then
    bad "SKIP $port in use: cannot prove side-by-side listeners"
    continue
  fi
  python3 -m http.server "$port" --bind 127.0.0.1 --directory "$work" >/dev/null 2>&1 &
  pids+=("$!")
done
for port in 8080 8081 9091 5173 4110 4111 4112 4113; do
  up=0
  for _ in $(seq 50); do
    if curl -fsS -o /dev/null "http://127.0.0.1:$port/" 2>/dev/null; then up=1; break; fi
    sleep 0.1
  done
  check "listener on $port answers" "$up" 1
done
together=0
for port in 8080 8081 9091 5173 4110 4111 4112 4113; do
  curl -fsS -o /dev/null "http://127.0.0.1:$port/" && together=$((together + 1))
done
check "all eight listeners answer at the same time" "$together" 8

echo
if ((fails)); then
  echo "check-env: $fails assertion(s) failed"
  exit 1
fi
echo "check-env: all assertions passed"
