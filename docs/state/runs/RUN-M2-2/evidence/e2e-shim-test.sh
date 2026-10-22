#!/usr/bin/env bash
# Proves the order and the cleanup of `t3.sh --job e2e` without starting the stack: `make` and
# `docker` are shims on PATH that record every call (and create fake Playwright output folders),
# and fail on demand. Usage: e2e-shim-test.sh   (from anywhere inside the worktree)
set -uo pipefail
root=$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)
cd "$root" || exit 2
work=$(mktemp -d)
trap 'rm -rf "$work" coverage/e2e frontend/playwright-report frontend/test-results' EXIT
mkdir -p "$work/shim"
cat > "$work/shim/make" <<'EOF'
#!/usr/bin/env bash
printf 'make %s E2E_STACK=%s\n' "$*" "${E2E_STACK:-0}" >> "$SHIM_LOG"
case "$1" in
  e2e)
    mkdir -p frontend/playwright-report frontend/test-results
    printf '%s\n' "$*" > frontend/playwright-report/index.html
    printf '{}\n' > frontend/test-results/report.json ;;
esac
# SHIM_FAIL_ON is a glob matched against the whole argument string.
# shellcheck disable=SC2053
if [[ -n ${SHIM_FAIL_ON:-} && "$*" == $SHIM_FAIL_ON ]]; then exit 1; fi
exit 0
EOF
cat > "$work/shim/docker" <<'EOF'
#!/usr/bin/env bash
printf 'docker %s\n' "$*" >> "$SHIM_LOG"
case "$*" in
  *"compose ps"*) echo "NAME STATUS (shim)" ;;
  *"compose logs"*) echo "shim log line" ;;
esac
exit 0
EOF
chmod +x "$work/shim/make" "$work/shim/docker"
fail=0
assert() { # assert <description> <command…>
  local description=$1
  shift
  if "$@"; then printf 'PASS %s\n' "$description"; else printf 'FAIL %s\n' "$description"; fail=1; fi
}
# shellcheck disable=SC2329 # invoked indirectly through assert
report_is() { [[ $(cat "coverage/e2e/$1/playwright-report/index.html") == *"$2"* ]]; }
# shellcheck disable=SC2329 # invoked indirectly through assert
report_kept_and_skipped() { [[ -s coverage/e2e/mobile-chromium/playwright-report/index.html && ! -e coverage/e2e/disruptive ]]; }
# shellcheck disable=SC2329 # invoked indirectly through assert
logs_collected() { [[ -s coverage/e2e/logs/ps.txt && -s coverage/e2e/logs/compose.log ]]; }
run() { # run <name> <fail-on> <expected log file content>
  local name=$1 fail_on=$2 expected=$3 status log="$work/$1.log"
  rm -rf coverage/e2e frontend/playwright-report frontend/test-results
  : > "$log"
  PATH="$work/shim:$PATH" SHIM_LOG="$log" SHIM_FAIL_ON="$fail_on" timeout 120 scripts/ci/t3.sh --job e2e > "$work/$name.out" 2>&1
  status=$?
  if [[ $name == ok ]]; then want=0; else want=1; fi
  if (( status == want )) && diff -u <(printf '%s\n' "$expected") "$log" > "$work/$name.diff"; then
    printf 'PASS %s (exit %d)\n' "$name" "$status"
  else
    printf 'FAIL %s (exit %d, want %d)\n' "$name" "$status" "$want"; cat "$work/$name.diff" 2> /dev/null; tail -20 "$work/$name.out"; fail=1
  fi
}
up='make up E2E_STACK=0'
chromium='make e2e E2E_ARGS=--project=chromium E2E_STACK=0'
mobile='make e2e E2E_ARGS=--project=mobile-chromium E2E_STACK=0'
disruptive='make e2e E2E_ARGS=--project=chromium e2e/stack-disruptive.spec.ts E2E_STACK=1'
down='make down E2E_STACK=0'
ps='docker compose ps -a'
logs='docker compose logs --no-color --timestamps'

run ok '' "$(printf '%s\n' "$up" "$chromium" "$mobile" "$disruptive" "$down")"
for d in chromium mobile-chromium disruptive; do
  [[ -s coverage/e2e/$d/playwright-report/index.html && -s coverage/e2e/$d/test-results/report.json ]] || { echo "FAIL ok: coverage/e2e/$d missing"; fail=1; }
done
assert 'ok: the chromium run kept its own report' report_is chromium '--project=chromium'
assert 'ok: the mobile run kept its own report' report_is mobile-chromium 'mobile-chromium'

run mobile-fails '*project=mobile-chromium' "$(printf '%s\n' "$up" "$chromium" "$mobile" "$ps" "$logs" "$down")"
assert 'mobile-fails: the failed run kept its report and the disruptive run was skipped' report_kept_and_skipped
assert 'mobile-fails: ps and logs collected' logs_collected

run up-fails 'up' "$(printf '%s\n' "$up" "$ps" "$logs" "$down")"
run chromium-fails 'e2e E2E_ARGS=--project=chromium' "$(printf '%s\n' "$up" "$chromium" "$mobile" "$ps" "$logs" "$down")"
run disruptive-fails '*stack-disruptive*' "$(printf '%s\n' "$up" "$chromium" "$mobile" "$disruptive" "$ps" "$logs" "$down")"
run down-fails 'down' "$(printf '%s\n' "$up" "$chromium" "$mobile" "$disruptive" "$down")"
exit "$fail"
