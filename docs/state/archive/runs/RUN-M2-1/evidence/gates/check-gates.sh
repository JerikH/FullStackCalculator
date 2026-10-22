#!/usr/bin/env bash
# Checks for scripts/coverage.sh: the coverage gate and the benchmark gate.
#
# Usage: docs/state/runs/RUN-M2-1/evidence/gates/check-gates.sh
#
# Every fixture is generated into a temporary directory, so nothing generated is
# committed and the repository coverage/ directory is never touched. After the
# direct checks, the script mutates a copy of coverage.sh in ways that must break
# it and runs the same checks against each copy: a mutation that survives means
# the checks are too weak. Exits non-zero when any check or mutation check fails.
# The sed and awk expressions in single quotes below are meant to stay literal.
# shellcheck disable=SC2016
set -uo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "$here/../../../../../.." && pwd)"
real_cov="${COVERAGE_SH:-$repo/scripts/coverage.sh}"

scratch_parent="${WF_SCRATCH:-${TMPDIR:-/tmp}}"
mkdir -p "$scratch_parent"
work="$(mktemp -d "$scratch_parent/check-gates.XXXXXX")"
trap 'rm -rf "$work"' EXIT

[ -f "$real_cov" ] || { printf 'coverage.sh not found: %s\n' "$real_cov" >&2; exit 2; }

# ---------------------------------------------------------------- case plumbing

cov="$real_cov"   # script under test
quiet=0           # 1 while running against a mutated copy
failures=0        # failed cases in the current run
cases=0
case_ok=1
case_desc=""
case_detail=""
rc=0
out=""
err=""
sum=""
seq_no=0

begin() {
  case_desc="$1"
  case_ok=1
  case_detail=""
}

mismatch() {
  case_ok=0
  case_detail+="${case_detail:+; }$*"
}

end_case() {
  cases=$((cases + 1))
  if [ "$case_ok" -eq 1 ]; then
    [ "$quiet" -eq 1 ] || printf 'PASS: %s\n' "$case_desc"
  else
    failures=$((failures + 1))
    [ "$quiet" -eq 1 ] || printf 'FAIL: %s (%s)\n' "$case_desc" "$case_detail"
  fi
}

want_rc() {
  [ "$rc" -eq "$1" ] || mismatch "exit $rc, expected $1"
}

want_sum() {
  [ "$sum" = "$1" ] || mismatch "summary was [${sum//$'\n'/|}], expected [${1//$'\n'/|}]"
}

want_no_sum() {
  [ -z "$sum" ] || mismatch "summary should not exist, got [${sum//$'\n'/|}]"
}

want_out() {
  case "$out" in *"$1"*) ;; *) mismatch "stdout lacks [$1]" ;; esac
}

want_out_re() {
  [[ "$out" =~ $1 ]] || mismatch "stdout does not match /$1/"
}

want_no_out() {
  case "$out" in *"$1"*) mismatch "stdout has [$1]" ;; esac
}

want_err() {
  case "$err" in *"$1"*) ;; *) mismatch "stderr lacks [$1]" ;; esac
}

want_no_err() {
  case "$err" in *"$1"*) mismatch "stderr has [$1]" ;; esac
}

# run_cov <args...>: runs the script under test and captures rc/out/err.
run_cov() {
  seq_no=$((seq_no + 1))
  rc=0
  out="$("$cov" "$@" 2>"$work/err.$seq_no")" || rc=$?
  err="$(cat "$work/err.$seq_no")"
}

# gate_run <profile>: runs the gate with a private summary file.
gate_run() {
  local summary="$work/summary.$((seq_no + 1))"
  run_cov gate "$1" --summary "$summary"
  sum="$(cat "$summary" 2>/dev/null || true)"
}

bench_run() {
  run_cov bench "$1"
}

# ---------------------------------------------------------------- fixtures

# profile <file> <block...>: writes "mode: atomic" and one line per block.
# Each block is "<name> <statements> <count>" and becomes a valid block line.
profile() {
  local file="$1" b name stmts count
  shift
  printf 'mode: atomic\n' >"$file"
  for b in "$@"; do
    read -r name stmts count <<<"$b"
    printf 'example.test/m/internal/%s.go:1.1,2.2 %s %s\n' "$name" "$stmts" "$count" >>"$file"
  done
}

# ratio_profile <file> <covered> <total>: one covered block, one uncovered block.
ratio_profile() {
  profile "$1" "cov $2 1" "unc $(($3 - $2)) 0"
}

base_cases=(
  "BenchmarkCalculate/add"
  "BenchmarkCalculate/divide_repeating"
  "BenchmarkCalculate/sqrt_irrational"
  "BenchmarkCalculate/power_large_integer"
  "BenchmarkCalculate/power_fractional"
  "BenchmarkCalculate/power_overflow"
  "BenchmarkCalculateWorstCase/max^0.5"
  "BenchmarkCalculateWorstCase/min^0.5"
  "BenchmarkCalculateWorstCase/max^0.99…9"
  "BenchmarkCalculateWorstCase/min^0.99…9"
  "BenchmarkCalculateWorstCase/max^-0.99…9"
  "BenchmarkCalculateWorstCase/1.5e-6143^-0.99…9"
  "BenchmarkCalculateWorstCase/(-1)^1e6144"
)

# make_bench <file> [arg...]: writes go test -bench style output for the 13
# required cases. Arguments change it:
#   <name>=<ns>   set the ns/op of that case
#   +<name>=<ns>  add one more sample line for that case
#   -<name>       leave the case out
#   !<name>       write the case without any ns/op number
# BENCH_COUNT repeats every case line (go test -count) and BENCH_PROCS sets the
# GOMAXPROCS suffix ("none" omits it, as go test does when GOMAXPROCS is 1).
make_bench() {
  local file="$1" name ns i a kv sfx="-${BENCH_PROCS:-4}"
  local -A over=() dropped=() broken=()
  local extras=()
  shift
  [ "${BENCH_PROCS:-}" != none ] || sfx=""
  for a in "$@"; do
    case "$a" in
      +*) extras+=("${a#+}") ;;
      -*) dropped["${a#-}"]=1 ;;
      '!'*) broken["${a#!}"]=1 ;;
      *) over["${a%%=*}"]="${a#*=}" ;;
    esac
  done
  {
    printf 'goos: linux\ngoarch: amd64\npkg: example.test/m/internal/calc\n'
    for name in "${base_cases[@]}"; do
      [ -z "${dropped[$name]-}" ] || continue
      case "$name" in
        BenchmarkCalculateWorstCase/*) ns=2000000 ;;
        *) ns=5000 ;;
      esac
      ns="${over[$name]-$ns}"
      for ((i = 0; i < ${BENCH_COUNT:-1}; i++)); do
        if [ -n "${broken[$name]-}" ]; then
          printf '%s%s\t1000\t120 B/op\t3 allocs/op\n' "$name" "$sfx"
        else
          printf '%s%s\t1000\t%s ns/op\t120 B/op\t3 allocs/op\n' "$name" "$sfx" "$ns"
        fi
      done
    done
    for kv in "${extras[@]}"; do
      printf '%s%s\t1000\t%s ns/op\t120 B/op\t3 allocs/op\n' "${kv%%=*}" "$sfx" "${kv#*=}"
    done
    printf 'PASS\nok  \texample.test/m/internal/calc\t12.3s\n'
  } >"$file"
}

# ---------------------------------------------------------------- the checks

run_checks() {
  local f="$work/fx"
  local b

  # ---- gate: threshold boundary and exact arithmetic
  ratio_profile "$f.1" 90 100
  begin "gate: exactly 90.00 % passes and prints percent 90.00"
  gate_run "$f.1"
  want_rc 0
  want_sum $'covered 90\ntotal 100\npercent 90.00'
  want_out "percent 90.00"
  end_case

  ratio_profile "$f.2" 8999 10000
  begin "gate: 89.99 % fails"
  gate_run "$f.2"
  want_rc 1
  want_sum $'covered 8999\ntotal 10000\npercent 89.99'
  want_err "below the 90% gate"
  end_case

  ratio_profile "$f.3" 89996 100000
  begin "gate: 89.996 % fails and prints 89.99 (truncated, never 90.00)"
  gate_run "$f.3"
  want_rc 1
  want_out "percent 89.99"
  want_no_out "90.00"
  want_sum $'covered 89996\ntotal 100000\npercent 89.99'
  end_case

  ratio_profile "$f.4" 90004 100000
  begin "gate: 90.004 % passes and prints 90.00"
  gate_run "$f.4"
  want_rc 0
  want_sum $'covered 90004\ntotal 100000\npercent 90.00'
  end_case

  profile "$f.5" "all 40 3"
  begin "gate: 100 % passes and prints 100.00"
  gate_run "$f.5"
  want_rc 0
  want_sum $'covered 40\ntotal 40\npercent 100.00'
  end_case

  # ---- gate: duplicate blocks (one copy per test binary)
  profile "$f.6" "dup 10 0" "dup 10 5" "other 1 0"
  begin "gate: block in two copies with counts 0 and 5 counts once and as covered"
  gate_run "$f.6"
  want_rc 0
  want_sum $'covered 10\ntotal 11\npercent 90.90'
  end_case

  profile "$f.7" "dup 10 5" "dup 10 0" "other 1 0"
  begin "gate: copy order does not matter (counts 5 then 0)"
  gate_run "$f.7"
  want_rc 0
  want_sum $'covered 10\ntotal 11\npercent 90.90'
  end_case

  profile "$f.8" "dup 10 0" "dup 10 0" "ok 9 1"
  begin "gate: block uncovered in every copy stays uncovered and counts once"
  gate_run "$f.8"
  want_rc 1
  want_sum $'covered 9\ntotal 19\npercent 47.36'
  end_case

  profile "$f.9" "dup 10 1" "dup 11 1"
  begin "gate: copies with different statement counts are malformed"
  gate_run "$f.9"
  want_rc 1
  want_err "malformed"
  want_no_sum
  end_case

  # ---- gate: weighting by statements
  profile "$f.10" "small 10 1" "big_cov 850 1" "big_unc 150 0"
  begin "gate: unequal package sizes are weighted by statements (85.14 %, not an average)"
  gate_run "$f.10"
  want_rc 1
  want_sum $'covered 860\ntotal 1010\npercent 85.14'
  end_case

  # ---- gate: malformed input
  printf 'mode: set\nexample.test/m/a.go:1.1,2.2 5 1\n' >"$f.11"
  begin "gate: mode set fails"
  gate_run "$f.11"
  want_rc 1
  want_err "mode: atomic"
  want_no_sum
  end_case

  printf 'mode: count\nexample.test/m/a.go:1.1,2.2 5 1\n' >"$f.12"
  begin "gate: mode count fails"
  gate_run "$f.12"
  want_rc 1
  want_err "mode: atomic"
  end_case

  : >"$f.13"
  begin "gate: empty file fails"
  gate_run "$f.13"
  want_rc 1
  want_err "empty"
  want_no_sum
  end_case

  begin "gate: missing file fails"
  gate_run "$f.does-not-exist"
  want_rc 1
  want_err "not found"
  end_case

  printf 'mode: atomic\nexample.test/m/a.go:1.1,2.2 5 many\n' >"$f.14"
  begin "gate: non-numeric count fails"
  gate_run "$f.14"
  want_rc 1
  want_err "malformed"
  end_case

  printf 'mode: atomic\nexample.test/m/a.go:1.1,2.2 5\n' >"$f.15"
  begin "gate: line with a missing field fails"
  gate_run "$f.15"
  want_rc 1
  want_err "malformed"
  end_case

  printf 'mode: atomic\nexample.test/m/a.go:1.1,2.2 -5 1\n' >"$f.16"
  begin "gate: negative statement count fails"
  gate_run "$f.16"
  want_rc 1
  want_err "malformed"
  end_case

  printf 'mode: atomic\nexample.test/m/a.go:1.1,2.2 5 1\n\nexample.test/m/b.go:1.1,2.2 5 1\n' >"$f.17"
  begin "gate: blank line inside the profile fails"
  gate_run "$f.17"
  want_rc 1
  want_err "malformed"
  end_case

  printf 'mode: atomic\n' >"$f.18"
  begin "gate: profile with no blocks (0 statements) fails"
  gate_run "$f.18"
  want_rc 1
  want_err "no statements"
  end_case

  profile "$f.19" "zero 0 1"
  begin "gate: blocks with 0 statements in total fail"
  gate_run "$f.19"
  want_rc 1
  want_err "no statements"
  end_case

  # ---- gate: working directory and usage
  begin "gate: works from another current directory"
  seq_no=$((seq_no + 1))
  rc=0
  out="$(cd / && "$cov" gate "$f.1" --summary "$work/summary.cwd" 2>"$work/err.$seq_no")" || rc=$?
  err="$(cat "$work/err.$seq_no")"
  sum="$(cat "$work/summary.cwd" 2>/dev/null || true)"
  want_rc 0
  want_sum $'covered 90\ntotal 100\npercent 90.00'
  end_case

  begin "usage: no argument exits 2"
  run_cov
  want_rc 2
  end_case

  begin "usage: unknown subcommand exits 2"
  run_cov frobnicate
  want_rc 2
  end_case

  begin "usage: gate without a profile exits 2"
  run_cov gate
  want_rc 2
  end_case

  begin "usage: bench without a file exits 2"
  run_cov bench
  want_rc 2
  end_case

  # ---- bench: budgets
  make_bench "$f.b1"
  begin "bench: 13 cases under budget pass and the table lists names with ^ … ( ) -"
  bench_run "$f.b1"
  want_rc 0
  want_out "BenchmarkCalculate/add "
  want_out "BenchmarkCalculateWorstCase/max^-0.99…9 "
  want_out "BenchmarkCalculateWorstCase/1.5e-6143^-0.99…9 "
  want_out "BenchmarkCalculateWorstCase/(-1)^1e6144 "
  want_no_out "-4 "
  want_out "benchmark gate passed"
  end_case

  make_bench "$f.b2" "BenchmarkCalculate/add=1000000"
  begin "bench: BenchmarkCalculate/add at 1000000 ns/op fails"
  bench_run "$f.b2"
  want_rc 1
  want_err "over budget: BenchmarkCalculate/add"
  end_case

  make_bench "$f.b3" "BenchmarkCalculate/add=999999"
  begin "bench: BenchmarkCalculate/add at 999999 ns/op passes"
  bench_run "$f.b3"
  want_rc 0
  end_case

  make_bench "$f.b3a" "BenchmarkCalculate/add=999999.9"
  begin "bench: fractional 999999.9 ns/op passes"
  bench_run "$f.b3a"
  want_rc 0
  end_case

  make_bench "$f.b3b" "BenchmarkCalculate/add=1000000.5"
  begin "bench: fractional 1000000.5 ns/op fails"
  bench_run "$f.b3b"
  want_rc 1
  end_case

  make_bench "$f.b4" "BenchmarkCalculateWorstCase/max^0.5=50000000"
  begin "bench: worst-case sample at 50000000 ns/op fails"
  bench_run "$f.b4"
  want_rc 1
  want_err "over budget: BenchmarkCalculateWorstCase/max^0.5"
  end_case

  make_bench "$f.b5" "BenchmarkCalculateWorstCase/max^0.5=49999999"
  begin "bench: worst-case sample at 49999999 ns/op passes"
  bench_run "$f.b5"
  want_rc 0
  end_case

  BENCH_COUNT=3 make_bench "$f.b6" "+BenchmarkCalculate/sqrt_irrational=2500000"
  begin "bench: -count=3 with one bad sample among three good ones passes with a warning"
  bench_run "$f.b6"
  want_rc 0
  want_err "warning: BenchmarkCalculate/sqrt_irrational has a sample at 2500000"
  end_case

  BENCH_COUNT=3 make_bench "$f.b6a" "+BenchmarkCalculate/sqrt_irrational=2500000" "+BenchmarkCalculate/sqrt_irrational=2500000"
  begin "bench: two bad samples among five (median still good) pass with a warning"
  bench_run "$f.b6a"
  want_rc 0
  want_err "warning"
  end_case

  { printf 'BenchmarkCalculate/add-4\t10\t5000 ns/op\n'
    printf 'BenchmarkCalculate/add-4\t10\t2000000 ns/op\n'
    printf 'BenchmarkCalculate/add-4\t10\t3000000 ns/op\n'
  } >"$f.b6b"
  make_bench "$f.b6c" "-BenchmarkCalculate/add"
  { sed '/^PASS/,$d' "$f.b6c"; cat "$f.b6b"; } >"$f.b6d"
  begin "bench: two bad samples of three (median bad) fail"
  bench_run "$f.b6d"
  want_rc 1
  want_err "over budget: BenchmarkCalculate/add median 2000000"
  end_case

  { printf 'BenchmarkCalculate/add-4\t10\t5000 ns/op\n'
    printf 'BenchmarkCalculate/add-4\t10\t2000000 ns/op\n'
  } >"$f.b6e"
  { sed '/^PASS/,$d' "$f.b6c"; cat "$f.b6e"; } >"$f.b6f"
  begin "bench: with two samples the higher one is the median (good + bad fails)"
  bench_run "$f.b6f"
  want_rc 1
  end_case

  { printf 'BenchmarkCalculate/add-4\t10\t2000000 ns/op\n'
    printf 'BenchmarkCalculate/add-4\t10\t5000 ns/op\n'
    printf 'BenchmarkCalculate/add-4\t10\t6000 ns/op\n'
  } >"$f.b6g"
  { sed '/^PASS/,$d' "$f.b6c"; cat "$f.b6g"; } >"$f.b6h"
  begin "bench: the median ignores sample order (bad sample first, two good after)"
  bench_run "$f.b6h"
  want_rc 0
  want_out "6000"
  end_case

  BENCH_COUNT=3 make_bench "$f.b7"
  begin "bench: -count=3 with every sample good passes, 3 samples, no warning"
  bench_run "$f.b7"
  want_rc 0
  want_out_re $'BenchmarkCalculate/add +3 +5000 +5000 '
  want_out_re $'\nBenchmarkCalculateWorstCase/max\\^0.5 +3 '

  want_no_err "warning"
  end_case

  make_bench "$f.b8" "-BenchmarkCalculate/power_overflow"
  begin "bench: a missing required case fails"
  bench_run "$f.b8"
  want_rc 1
  want_err "missing benchmark case: BenchmarkCalculate/power_overflow"
  end_case

  make_bench "$f.b9" "-BenchmarkCalculateWorstCase/(-1)^1e6144"
  begin "bench: a missing worst-case case fails"
  bench_run "$f.b9"
  want_rc 1
  want_err "missing benchmark case: BenchmarkCalculateWorstCase/(-1)^1e6144"
  end_case

  make_bench "$f.b10" "!BenchmarkCalculate/add"
  begin "bench: a line without a numeric ns/op fails"
  bench_run "$f.b10"
  want_rc 1
  want_err "no numeric ns/op"
  end_case

  make_bench "$f.b11" "BenchmarkCalculate/add=1.5e+06"
  begin "bench: exponent form 1.5e+06 is compared numerically (fails)"
  bench_run "$f.b11"
  want_rc 1
  want_err "over budget: BenchmarkCalculate/add"
  end_case

  make_bench "$f.b12" "BenchmarkCalculate/add=9.9e+05"
  begin "bench: exponent form 9.9e+05 passes"
  bench_run "$f.b12"
  want_rc 0
  end_case

  make_bench "$f.b13" "BenchmarkCalculateWorstCase/min^0.5=5e+07"
  begin "bench: worst-case 5e+07 (50000000) fails"
  bench_run "$f.b13"
  want_rc 1
  end_case

  make_bench "$f.b14" "BenchmarkCalculateWorstCase/min^0.5=5e+06"
  begin "bench: worst-case 5e+06 passes (not read as text)"
  bench_run "$f.b14"
  want_rc 0
  end_case

  BENCH_PROCS=16 make_bench "$f.b15"
  begin "bench: a two-digit GOMAXPROCS suffix is removed too"
  bench_run "$f.b15"
  want_rc 0
  want_no_out "-16"
  end_case

  BENCH_PROCS=none make_bench "$f.b15a"
  begin "bench: names without any GOMAXPROCS suffix (GOMAXPROCS=1) parse"
  bench_run "$f.b15a"
  want_rc 0
  want_out "BenchmarkCalculateWorstCase/max^-0.99…9 "
  end_case

  BENCH_PROCS=none make_bench "$f.b15b" "-BenchmarkCalculate/add" "+BenchmarkCalculate/add_more=2000"
  begin "bench: a name that only starts like a required case is not that case (add_more is not add)"
  bench_run "$f.b15b"
  want_rc 1
  want_err "missing benchmark case: BenchmarkCalculate/add"
  end_case

  BENCH_PROCS=none make_bench "$f.b15c" "+BenchmarkCalculate/extra-2=2000"
  begin "bench: a name outside the required cases is never stripped (extra-2 stays extra-2)"
  bench_run "$f.b15c"
  want_rc 0
  want_out "BenchmarkCalculate/extra-2 "
  end_case

  make_bench "$f.b16" "+BenchmarkOther/x=999999999" "+BenchmarkCalculate/extra=2000000"
  begin "bench: an unrelated benchmark is ignored but an extra BenchmarkCalculate case is budgeted"
  bench_run "$f.b16"
  want_rc 1
  want_err "over budget: BenchmarkCalculate/extra"
  want_no_err "BenchmarkOther"
  end_case

  make_bench "$f.b17" "+BenchmarkOther/x=999999999"
  begin "bench: an unrelated benchmark alone does not fail the gate"
  bench_run "$f.b17"
  want_rc 0
  end_case

  begin "bench: missing file fails"
  bench_run "$f.nope"
  want_rc 1
  end_case

  : >"$f.b18"
  begin "bench: empty file fails"
  bench_run "$f.b18"
  want_rc 1
  end_case

  printf 'goos: linux\nPASS\n' >"$f.b19"
  begin "bench: output with no benchmark lines fails (all cases missing)"
  bench_run "$f.b19"
  want_rc 1
  want_err "missing benchmark case"
  end_case

  b=""
  : "$b"
}

# ---------------------------------------------------------------- mutations

# mutate <label> <sed-expression>: copies coverage.sh with the change applied
# and requires the whole check set to fail on it.
mutate() {
  local label="$1" expr="$2" dir copy
  mutations=$((mutations + 1))
  dir="$work/mut.$mutations/scripts"
  mkdir -p "$dir"
  copy="$dir/coverage.sh"
  sed "$expr" "$real_cov" >"$copy"
  chmod +x "$copy"
  if cmp -s "$real_cov" "$copy"; then
    printf 'FAIL: mutation "%s" did not change the script\n' "$label"
    mutation_failures=$((mutation_failures + 1))
    return
  fi
  cov="$copy"
  quiet=1
  failures=0
  cases=0
  run_checks
  quiet=0
  cov="$real_cov"
  if [ "$failures" -gt 0 ]; then
    printf 'PASS: mutation "%s" is caught (%d of %d cases fail)\n' "$label" "$failures" "$cases"
  else
    printf 'FAIL: mutation "%s" survived (no case failed)\n' "$label"
    mutation_failures=$((mutation_failures + 1))
  fi
}

mutations=0
mutation_failures=0

printf '== direct checks against %s\n' "$real_cov"
run_checks
direct_failures=$failures
printf '== %d cases, %d failed\n\n' "$cases" "$direct_failures"

printf '== mutation checks\n'
mutate "threshold 90 lowered to 89" 's/^threshold=90$/threshold=89/'
mutate "gate comparison >= made strict (>)" 's/covered \* 100 >= threshold/covered * 100 > threshold/'
mutate "gate comparison direction reversed" 's/! *((covered \* 100 >= threshold \* total))/((covered * 100 >= threshold * total))/'
mutate "percentage rounded instead of truncated" 's|covered \* 10000 / total|(covered * 10000 + total / 2) / total|'
mutate "duplicate blocks not merged" 's/^      key = substr(.*/      key = NR/'
mutate "different statement counts accepted" 's/if (key in statements && statements\[key\] != stmts)/if (0)/'
mutate "mode check dropped" 's/if (\$0 != "mode: atomic")/if (0)/'
mutate "bench budget 1000000 raised to 10000000" 's/^bench_budget_ns=1000000$/bench_budget_ns=10000000/'
mutate "worst-case budget raised to 500000000" 's/^worst_budget_ns=50000000$/worst_budget_ns=500000000/'
mutate "bench budget comparison >= made strict" 's/median + 0 >= limit + 0/median + 0 > limit + 0/'
mutate "missing cases not reported" 's/if (!(req\[i\] in samples))/if (0)/'
mutate "ns/op ordered as text, not as numbers" 's/sorted\[j\] + 0 > v + 0/sorted[j] "" > v ""/'
mutate "max sample used instead of the median" 's/median = sorted\[int(n \/ 2) + 1\]/median = sorted[n]/'
mutate "lower middle used for an even count" 's/median = sorted\[int(n \/ 2) + 1\]/median = sorted[int((n + 1) \/ 2)]/'
mutate "GOMAXPROCS suffix stripped generically" 's/^    function canonical(field,    i, rest) {$/    function canonical(field,    i, rest) { sub(\/-[0-9]+$\/, "", field); return field/'
printf '== %d mutations, %d not caught\n\n' "$mutations" "$mutation_failures"

if [ "$direct_failures" -eq 0 ] && [ "$mutation_failures" -eq 0 ]; then
  printf 'ALL CHECKS PASSED\n'
  exit 0
fi
printf 'CHECKS FAILED\n'
exit 1
