#!/usr/bin/env bash
# Backend coverage gate and benchmark gate.
#
# Usage: scripts/coverage.sh backend
#        scripts/coverage.sh gate <profile> [--summary <path>]
#        scripts/coverage.sh bench <file>
#
#   backend  runs the backend tests with race detection and coverage over
#            ./internal/..., writes coverage/backend/{coverage.out,index.html},
#            prints the per-function report and applies the gate to the profile.
#   gate     checks a Go coverage profile: statement coverage of the unique
#            blocks must reach 90.00 %. Writes covered/total/percent to the
#            summary file (default coverage/backend/summary.txt).
#   bench    checks raw `go test -bench` output: every required case is present
#            and the median of its samples stays below its time budget (a single
#            slow sample among several only produces a warning).
#
# Exit status: 0 pass, 1 gate failure, 2 usage error.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Gate thresholds. Integer values only: the decisions below never use floating
# point, so 89.99 % can not round up into a pass.
threshold=90
bench_budget_ns=1000000
worst_budget_ns=50000000

# Cases the benchmark output must contain, joined by ';' (no case name contains
# a semicolon).
required_cases="BenchmarkCalculate/add;BenchmarkCalculate/divide_repeating;BenchmarkCalculate/sqrt_irrational;BenchmarkCalculate/power_large_integer;BenchmarkCalculate/power_fractional;BenchmarkCalculate/power_overflow;BenchmarkCalculateWorstCase/max^0.5;BenchmarkCalculateWorstCase/min^0.5;BenchmarkCalculateWorstCase/max^0.99…9;BenchmarkCalculateWorstCase/min^0.99…9;BenchmarkCalculateWorstCase/max^-0.99…9;BenchmarkCalculateWorstCase/1.5e-6143^-0.99…9;BenchmarkCalculateWorstCase/(-1)^1e6144"

usage() {
  cat >&2 <<'EOF'
usage: scripts/coverage.sh backend
       scripts/coverage.sh gate <profile> [--summary <path>]
       scripts/coverage.sh bench <file>
EOF
  exit 2
}

fail() {
  printf 'coverage: %s\n' "$*" >&2
  exit 1
}

# The Go toolchain may live outside PATH on developer machines.
ensure_go_on_path() {
  if ! command -v go >/dev/null 2>&1 && [ -x "${HOME:-}/.local/go/bin/go" ]; then
    PATH="$HOME/.local/go/bin:$PATH"
    export PATH
  fi
}

# merge_profile <profile>: prints "<covered> <total>" statement counts.
#
# A profile written by `go test ./...` repeats every block once per test binary
# that links the package, so blocks are merged first: the key is the text before
# the last two fields, a block is covered when any copy ran, and each unique
# block is counted once. Without the merge, packages exercised by many test
# binaries would weigh more than the others.
merge_profile() {
  LC_ALL=C awk '
    function bad(msg) {
      printf "coverage: malformed profile: line %d: %s\n", NR, msg > "/dev/stderr"
      failed = 1
      exit 1
    }
    NR == 1 {
      if ($0 != "mode: atomic") {
        bad("first line is \"" $0 "\", expected \"mode: atomic\"")
      }
      next
    }
    $0 !~ /^.+:[0-9]+\.[0-9]+,[0-9]+\.[0-9]+ [0-9]+ [0-9]+$/ {
      bad("not a block line: " $0)
    }
    {
      key = substr($0, 1, length($0) - length($(NF - 1)) - length($NF) - 2)
      stmts = $(NF - 1) + 0
      if (key in statements && statements[key] != stmts) {
        bad("block " key " has different statement counts in its copies")
      }
      statements[key] = stmts
      # The count is compared as text so a huge value never meets float rounding.
      if ($NF ~ /[1-9]/) {
        covered[key] = 1
      }
    }
    END {
      if (failed) {
        exit 1
      }
      for (key in statements) {
        total += statements[key]
        if (key in covered) {
          cov += statements[key]
        }
      }
      printf "%d %d\n", cov, total
    }
  ' "$1"
}

# crosscheck <profile> <hundredths>: compares our figure with `go tool cover`.
# Information only: it prints the figure and warns on a difference, and the
# gate never depends on the Go tool.
crosscheck() {
  local profile="$1" ours="$2" out line pct whole frac theirs delta
  ensure_go_on_path
  if ! command -v go >/dev/null 2>&1; then
    printf 'coverage: cross-check skipped: go not found\n' >&2
    return 0
  fi
  # The profile lists import paths, which only resolve inside the module.
  if ! out="$(cd "$root/backend" && go tool cover -func="$profile" 2>/dev/null)"; then
    printf 'coverage: cross-check skipped: go tool cover could not read the profile\n' >&2
    return 0
  fi
  line="$(printf '%s\n' "$out" | awk '$1 == "total:" { print $NF }')"
  pct="${line%\%}"
  if ! [[ "$pct" =~ ^[0-9]+(\.[0-9]+)?$ ]]; then
    printf 'coverage: cross-check skipped: no total line from go tool cover\n' >&2
    return 0
  fi
  whole="${pct%%.*}"
  frac=""
  if [[ "$pct" == *.* ]]; then
    frac="${pct#*.}"
  fi
  frac="${frac}00"
  theirs=$((10#$whole * 100 + 10#${frac:0:2}))
  delta=$((ours > theirs ? ours - theirs : theirs - ours))
  printf 'go tool cover total: %s%%\n' "$pct"
  if [ "$delta" -gt 10 ]; then
    printf 'coverage: warning: exact percentage %d.%02d differs from go tool cover %s%% by more than 0.1\n' \
      $((ours / 100)) $((ours % 100)) "$pct" >&2
  fi
}

run_gate() {
  local profile="" summary="$root/coverage/backend/summary.txt"
  local merged covered total hundredths percent
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --summary)
        [ "$#" -ge 2 ] || usage
        summary="$2"
        shift 2
        ;;
      -*) usage ;;
      *)
        [ -z "$profile" ] || usage
        profile="$1"
        shift
        ;;
    esac
  done
  [ -n "$profile" ] || usage

  # A stale summary must never outlive a failed run.
  rm -f "$summary"
  [ -f "$profile" ] || fail "profile not found: $profile"
  [ -s "$profile" ] || fail "profile is empty: $profile"

  merged="$(merge_profile "$profile")" || exit 1
  covered="${merged% *}"
  total="${merged#* }"
  [ "$total" -gt 0 ] || fail "profile has no statements: $profile"

  # Truncated to hundredths of a percent: the printed value is never above the
  # real one, so a figure that reads 90.00 really is at least 90.00.
  hundredths=$((covered * 10000 / total))
  printf -v percent '%d.%02d' $((hundredths / 100)) $((hundredths % 100))

  mkdir -p "$(dirname "$summary")"
  printf 'covered %d\ntotal %d\npercent %s\n' "$covered" "$total" "$percent" >"$summary"

  printf 'covered %d of %d statements: percent %s\n' "$covered" "$total" "$percent"
  crosscheck "$(cd "$(dirname "$profile")" && pwd)/$(basename "$profile")" "$hundredths"

  if ! ((covered * 100 >= threshold * total)); then
    fail "statement coverage $percent% is below the $threshold% gate"
  fi
  printf 'coverage gate passed: %s%% >= %d%%\n' "$percent" "$threshold"
}

run_backend() {
  local out="$root/coverage/backend"
  ensure_go_on_path
  command -v go >/dev/null 2>&1 || fail "go not found: install Go or add it to PATH"
  mkdir -p "$out"
  rm -f "$out/coverage.out" "$out/index.html" "$out/summary.txt"

  # -coverpkg makes every test binary report the whole internal tree, so the
  # figure measures the code, not only what each package tests for itself.
  (
    cd "$root/backend"
    go test -race -shuffle=on -count=1 -covermode=atomic -coverpkg=./internal/... \
      -coverprofile=../coverage/backend/coverage.out ./...
  ) || fail "backend tests failed"

  (
    cd "$root/backend"
    go tool cover -html=../coverage/backend/coverage.out -o ../coverage/backend/index.html &&
      go tool cover -func=../coverage/backend/coverage.out
  ) || fail "go tool cover failed"
  [ -s "$out/index.html" ] || fail "coverage report not written: $out/index.html"

  run_gate "$out/coverage.out" --summary "$out/summary.txt"
}

run_bench() {
  local file="$1"
  [ -f "$file" ] || fail "benchmark output not found: $file"
  [ -s "$file" ] || fail "benchmark output is empty: $file"

  # LC_ALL=C: the case names contain a multibyte character; byte matching keeps
  # the comparison independent of the locale.
  LC_ALL=C awk -v required="$required_cases" -v budget="$bench_budget_ns" -v worst="$worst_budget_ns" '
    function err(msg) {
      print "coverage: " msg > "/dev/stderr"
      failed = 1
    }
    function warn(msg) {
      print "coverage: warning: " msg > "/dev/stderr"
    }
    # canonical(field): the required case name the field denotes, or the field
    # itself. A required name may be followed by the GOMAXPROCS suffix "-<digits>",
    # which go test omits when GOMAXPROCS is 1; nothing else is ever removed.
    function canonical(field,    i, rest) {
      for (i = 1; i <= nreq; i++) {
        if (field == req[i]) {
          return field
        }
        if (index(field, req[i] "-") == 1) {
          rest = substr(field, length(req[i]) + 2)
          if (rest ~ /^[0-9]+$/) {
            return req[i]
          }
        }
      }
      return field
    }
    BEGIN {
      nreq = split(required, req, ";")
    }
    # Only the benchmark result lines matter; go test prints other text around them.
    $1 !~ /^Benchmark/ { next }
    {
      name = canonical($1)
      ns = ""
      for (i = 2; i <= NF; i++) {
        if ($i == "ns/op") {
          ns = $(i - 1)
        }
      }
      if (ns !~ /^[0-9]+(\.[0-9]+)?([eE][+-]?[0-9]+)?$/) {
        err("line " NR ": no numeric ns/op for " name ": " $0)
        next
      }
      samples[name]++
      value[name, samples[name]] = ns
    }
    END {
      for (i = 1; i <= nreq; i++) {
        if (!(req[i] in samples)) {
          err("missing benchmark case: " req[i])
        }
      }
      printf "%-62s %7s %16s %16s %14s\n", "case", "samples", "median ns/op", "max ns/op", "budget ns/op"
      count = 0
      for (name in samples) {
        names[++count] = name
      }
      # Insertion sort keeps the table stable without gawk-only features.
      for (i = 2; i <= count; i++) {
        v = names[i]
        for (j = i - 1; j >= 1 && names[j] > v; j--) {
          names[j + 1] = names[j]
        }
        names[j + 1] = v
      }
      for (i = 1; i <= count; i++) {
        name = names[i]
        n = samples[name]
        # Sort the samples numerically (1.5e+06 and 999999 must order correctly).
        for (k = 1; k <= n; k++) {
          sorted[k] = value[name, k]
        }
        for (k = 2; k <= n; k++) {
          v = sorted[k]
          for (j = k - 1; j >= 1 && sorted[j] + 0 > v + 0; j--) {
            sorted[j + 1] = sorted[j]
          }
          sorted[j + 1] = v
        }
        # The middle sample; of two middle samples, the higher one. One slow
        # outlier in a -count run is noise, a slow median is a real regression.
        median = sorted[int(n / 2) + 1]
        maxsample = sorted[n]
        limit = ""
        if (index(name, "BenchmarkCalculateWorstCase/") == 1) {
          limit = worst
        } else if (index(name, "BenchmarkCalculate/") == 1) {
          limit = budget
        }
        printf "%-62s %7d %16s %16s %14s\n", name, n, median, maxsample, (limit == "" ? "-" : limit)
        if (limit != "" && median + 0 >= limit + 0) {
          err("over budget: " name " median " median " ns/op, budget " limit " ns/op")
        } else if (limit != "" && maxsample + 0 >= limit + 0) {
          warn(name " has a sample at " maxsample " ns/op, budget " limit " ns/op, but the median " median " ns/op is within it")
        }
      }
      if (failed) {
        exit 1
      }
    }
  ' "$file" || fail "benchmark gate failed"
  printf 'benchmark gate passed\n'
}

main() {
  [ "$#" -ge 1 ] || usage
  case "$1" in
    backend)
      [ "$#" -eq 1 ] || usage
      run_backend
      ;;
    gate)
      shift
      run_gate "$@"
      ;;
    bench)
      [ "$#" -eq 2 ] || usage
      run_bench "$2"
      ;;
    *) usage ;;
  esac
}

main "$@"
