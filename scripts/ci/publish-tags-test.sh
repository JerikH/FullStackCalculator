#!/usr/bin/env bash
# Tests publish_tags in scratch repositories; never touches the working repository.
#
# Usage: scripts/ci/publish-tags-test.sh
# Environment: PUBLISH_TAGS_SCRIPT selects the library to test (default: the
# sibling publish-tags.sh). No network and no docker are used.
set -euo pipefail
if (( BASH_VERSINFO[0] < 5 )); then printf 'Bash 5 or newer is required\n' >&2; exit 2; fi
here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
lib=${PUBLISH_TAGS_SCRIPT:-$here/publish-tags.sh}
# shellcheck source=scripts/ci/publish-tags.sh
source "$lib"

unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null
scratch=$(mktemp -d)
trap 'rm -rf "$scratch"' EXIT
export PUBLISH_REPO=$scratch/repo

g() { git -C "$PUBLISH_REPO" -c user.name=t -c user.email=t@example.invalid -c commit.gpgsign=false -c tag.gpgsign=false "$@"; }
commit() { g commit -q --allow-empty -m "$1"; g rev-parse HEAD; }

git init -q -b main "$PUBLISH_REPO"
c1=$(commit one)
c2=$(commit two)
c3=$(commit three)   # main tip
g update-ref refs/remotes/origin/main "$c3"
g checkout -q -b side "$c2"
side=$(commit side)
g checkout -q main
g tag v1.2.3 "$c3"
g tag -a -m annotated v2.0.0 "$c3"
g tag v0.0.0 "$c3"
g tag v10.20.30 "$c3"
g tag v3.0.0 "$c1"
g tag v4.0.0 "$c2"
g tag v5.0.0 "$side"
g tag v6.0.0 "$c1"
for bad in v1.2 v1.2.3-rc1 v01.2.3 v1.2.3+b1 1.2.3 V1.2.3 v1.2.3.4; do g tag "$bad" "$c3" 2>/dev/null || true; done

pass=0 fail=0
# expect_ok <case> <expected stdout> <args...>
expect_ok() {
  local name=$1 want=$2 out status=0; shift 2
  out=$(publish_tags "$@" 2>"$scratch/err") || status=$?
  if (( status == 0 )) && [[ $out == "$want" ]]; then pass=$((pass + 1)); printf 'PASS %s\n' "$name"
  else fail=$((fail + 1)); printf 'FAIL %s: status=%s output=%q\n' "$name" "$status" "$out"; fi
}
# expect_fail <case> <args...>
expect_fail() {
  local name=$1 out status=0; shift
  out=$(publish_tags "$@" 2>"$scratch/err") || status=$?
  if (( status == 1 )) && [[ -z $out && -s $scratch/err ]]; then pass=$((pass + 1)); printf 'PASS %s\n' "$name"
  else fail=$((fail + 1)); printf 'FAIL %s: status=%s stdout=%q stderr=%q\n' "$name" "$status" "$out" "$(<"$scratch/err")"; fi
}
nl=$'\n'

expect_ok 'lightweight v1.2.3 on main tip' "sha-$c3${nl}1.2.3" push refs/tags/v1.2.3 "$c3"
expect_ok 'annotated v2.0.0 on main tip' "sha-$c3${nl}2.0.0" push refs/tags/v2.0.0 "$c3"
expect_ok 'v0.0.0' "sha-$c3${nl}0.0.0" push refs/tags/v0.0.0 "$c3"
expect_ok 'v10.20.30' "sha-$c3${nl}10.20.30" push refs/tags/v10.20.30 "$c3"
expect_ok 'tag on an older ancestor of main' "sha-$c1${nl}3.0.0" push refs/tags/v3.0.0 "$c1"
expect_ok 'tag on the middle ancestor of main' "sha-$c2${nl}4.0.0" push refs/tags/v4.0.0 "$c2"
expect_ok 'explicit local main-ref' "sha-$c3${nl}1.2.3" push refs/tags/v1.2.3 "$c3" main
expect_ok 'main push at the tip' "sha-$c3${nl}main" push refs/heads/main "$c3"
expect_ok 'main push at the tip, explicit local main-ref' "sha-$c3${nl}main" push refs/heads/main "$c3" main
expect_ok 'main push of an older commit publishes only the sha tag' "sha-$c2" push refs/heads/main "$c2"
expect_fail 'main push of a commit not on main' push refs/heads/main "$side"
expect_fail 'main push with an unusable main-ref' push refs/heads/main "$c3" --all
expect_fail 'main push, main-ref missing' push refs/heads/main "$c3" origin/absent

for bad in v1.2 v1.2.3-rc1 v01.2.3 v1.2.3+b1 1.2.3 V1.2.3 v1.2.3.4; do
  expect_fail "tag name $bad" push "refs/tags/$bad" "$c3"
done
expect_fail 'tag on a side branch not merged into main' push refs/tags/v5.0.0 "$side"
expect_fail 'tag points at a different commit than sha' push refs/tags/v6.0.0 "$c3"
expect_fail 'valid-looking tag that does not exist' push refs/tags/v9.9.9 "$c3"
expect_fail 'branch feature/x' push refs/heads/feature/x "$c3"
expect_fail 'pull request merge ref' push refs/pull/1/merge "$c3"
expect_fail 'event pull_request' pull_request refs/heads/main "$c3"
expect_fail 'event workflow_dispatch' workflow_dispatch refs/heads/main "$c3"
expect_fail 'event empty' '' refs/heads/main "$c3"
expect_fail '39-character sha' push refs/heads/main "${c3:0:39}"
expect_fail 'upper-case sha' push refs/heads/main "${c3^^}"
expect_fail 'sha with trailing newline' push refs/heads/main "$c3$nl"
expect_fail 'hostile ref with semicolon' push 'refs/tags/v1.2.3;rm -rf x' "$c3"
expect_fail 'hostile ref with command substitution' push "refs/tags/v1.2.3\$(touch x)" "$c3"
expect_fail 'ref with trailing newline' push "refs/tags/v1.2.3$nl" "$c3"
expect_fail 'main ref with trailing newline' push "refs/heads/main$nl" "$c3"
expect_fail 'ref with an extra path segment' push refs/tags/v1.2.3/x "$c3"
expect_fail 'ref refs/tags/ alone' push refs/tags/ "$c3"
expect_fail 'empty ref' push '' "$c3"
expect_fail 'missing main-ref (default origin/main absent)' push refs/tags/v3.0.0 "$c1" origin/absent
expect_fail 'main-ref starting with a dash' push refs/tags/v3.0.0 "$c1" --all

# Default main-ref must be origin/main: repeat in a repository without it.
g update-ref -d refs/remotes/origin/main
expect_fail 'default origin/main is missing' push refs/tags/v1.2.3 "$c3"
g update-ref refs/remotes/origin/main "$c1"
expect_fail 'origin/main behind the tagged commit' push refs/tags/v1.2.3 "$c3"
expect_fail 'main push needs origin/main' push refs/heads/main "$c3"

# CLI behavior.
g update-ref refs/remotes/origin/main "$c3"
cli_out=$("$here/publish-tags.sh" push refs/heads/main "$c3" 2>/dev/null) || cli_out=FAILED
if [[ $cli_out == "sha-$c3${nl}main" ]]; then pass=$((pass + 1)); printf 'PASS cli main push\n'
else fail=$((fail + 1)); printf 'FAIL cli main push: %q\n' "$cli_out"; fi
status=0; "$here/publish-tags.sh" push refs/heads/main >/dev/null 2>&1 || status=$?
if (( status == 2 )); then pass=$((pass + 1)); printf 'PASS cli wrong argument count exits 2\n'
else fail=$((fail + 1)); printf 'FAIL cli wrong argument count exits 2: status=%s\n' "$status"; fi
status=0; "$here/publish-tags.sh" pull_request refs/heads/main "$c3" >/dev/null 2>&1 || status=$?
if (( status == 1 )); then pass=$((pass + 1)); printf 'PASS cli failure exits 1\n'
else fail=$((fail + 1)); printf 'FAIL cli failure exits 1: status=%s\n' "$status"; fi

printf '%d passed, %d failed\n' "$pass" "$fail"
(( fail == 0 ))
