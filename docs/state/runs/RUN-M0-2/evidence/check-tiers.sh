#!/usr/bin/env bash
# Evidence for OPS-CI-01 (RF-OPS-03; UC-OPS-01 steps 3-6, E3, E4, E5, E6): runs the tier
# scripts in a throwaway clone through 23 scenarios and asserts on their output and exit
# status. The real repository is never modified.
# Usage: [SCRIPTS_SRC=<dir with lib.sh, t0..t3.sh, env.sh>] [SHOW=1] bash check-tiers.sh
# SHOW=1 prints every tier run's output under its command.
# Fixture scripts are written with single-quoted printf formats on purpose ($1 stays literal).
# shellcheck disable=SC2016
set -uo pipefail

repo=$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)
src=${SCRIPTS_SRC:-$repo/scripts/ci}
work=$(mktemp -d "${WF_SCRATCH:-${TMPDIR:-/tmp}}/check-tiers.XXXXXX")
trap 'rm -rf "$work"' EXIT
clone=$work/clone
tiers_tmp=$work/tmp
mkdir -p "$tiers_tmp"
G=(git -C "$clone" -c user.name=check -c user.email=check@localhost -c commit.gpgsign=false)

fails=0
ok() { printf 'ok   %s\n' "$1"; }
bad() { printf 'FAIL %s\n' "$1"; fails=$((fails + 1)); }
has() { if grep -qF -- "$2" <<<"$OUT"; then ok "$1"; else bad "$1 (missing: $2)"; printf '%s\n' "$OUT" | sed 's/^/     | /' | tail -25; fi; }
hasnt() { if grep -qF -- "$2" <<<"$OUT"; then bad "$1 (unexpected: $2)"; else ok "$1"; fi; }
rc_is() { if [[ "$RC" == "$2" ]]; then ok "$1 (exit $RC)"; else bad "$1 (exit $RC, want $2)"; printf '%s\n' "$OUT" | sed 's/^/     | /' | tail -25; fi; }
rc_nz() { if [[ "$RC" != 0 ]]; then ok "$1 (exit $RC)"; else bad "$1 (exit 0, want non-zero)"; fi; }
# line_has <label> <command label> <word…>: the ▶ line of that check contains every word.
line_has() {
  local name=$1 label=$2 line w
  shift 2
  line=$(grep -F -- "▶ [$label]" <<<"$OUT" | head -1)
  for w in "$@"; do
    if [[ " $line " == *" $w "* || " $line " == *" $w/"* ]]; then ok "$name: $w"; else bad "$name: $w not in: $line"; fi
  done
}
line_lacks() {
  local name=$1 label=$2 line w
  shift 2
  line=$(grep -F -- "▶ [$label]" <<<"$OUT" | head -1)
  for w in "$@"; do
    if [[ "$line" == *"$w"* ]]; then bad "$name: unexpected $w in: $line"; else ok "$name: no $w"; fi
  done
}
# run <cmd…>: run in the clone with no agent identity inherited; sets OUT and RC.
run() {
  OUT=$(cd "$clone" && env -u WF_AGENT -u WF_INDEX -u WF_PORT_BASE -u WF_PORT_END -u WF_HOME TMPDIR="$tiers_tmp" "$@" 2>&1)
  RC=$?
  if [[ -n ${SHOW-} ]]; then printf '   $ %s  → exit %s\n' "$*" "$RC"; printf '%s\n' "$OUT" | sed 's/^/     | /'; fi
}
reset_to() {
  "${G[@]}" reset -q --hard "$1"
  "${G[@]}" clean -fdq
}
commit() { "${G[@]}" add -A . && "${G[@]}" commit -qm "$1"; }

echo "# setup: clone, scripts under test committed as the base"
git clone -q "$repo" "$clone"
mkdir -p "$clone/scripts/ci" "$clone/tools" "$clone/.github/workflows"
cp "$src"/lib.sh "$src"/t0.sh "$src"/t1.sh "$src"/t2.sh "$src"/t3.sh "$src"/env.sh "$clone/scripts/ci/"
cp "$repo/tools/versions.env" "$clone/tools/"
cp "$repo/.github/workflows/ci.yml.disabled" "$clone/.github/workflows/"
printf '#!/usr/bin/env bash\necho "sample $1"\n' >"$clone/scripts/sample.sh"
commit "base: scripts under test"
base=$("${G[@]}" rev-parse HEAD)
mkdir -p "$clone/bin/.tools"
for d in "$repo"/bin/.tools/*/; do ln -s "${d%/}" "$clone/bin/.tools/$(basename "$d")"; done

echo "# 1 clean tree (E4)"
run scripts/ci/t0.sh --base HEAD
rc_is "clean tree" 0
has "nothing to check" "nothing to check"

echo "# 2 contract-only change"
sed -i 's/^  title: Calculator API$/  title: Calculator API (edited)/' "$clone/backend/api/openapi.yaml"
run scripts/ci/t0.sh --base HEAD
rc_is "contract-only" 0
has "redocly ran" "▶ [contract:redocly]"
has "redocly passed with a duration" "✔ [contract:redocly]"
has "telemetry off on the Redocly call" "REDOCLY_TELEMETRY=off"
has "base-is-HEAD note (16)" "base is HEAD: checking uncommitted changes only"
has "backend not present (E3)" "not present (backend/go.mod missing)"
hasnt "no backend command" "▶ [backend"
hasnt "no workflows stage" "[workflows"
hasnt "no shell stage" "[shell"
hasnt "no dockerfiles stage" "[dockerfiles"
hasnt "no frontend stage" "[frontend"
reset_to "$base"

echo "# 3 broken contract YAML"
printf 'broken: [unclosed\n' >>"$clone/backend/api/openapi.yaml"
run scripts/ci/t0.sh --base HEAD
rc_nz "broken YAML fails"
has "redocly failed" "✘ [contract:redocly]"
reset_to "$base"

echo "# 4 workflow change"
printf '# comment\n' >>"$clone/.github/workflows/ci.yml.disabled"
run scripts/ci/t0.sh --base HEAD
rc_is "valid workflow" 0
has "actionlint passed" "✔ [workflows:actionlint]"
sed -i 's#run: scripts/ci/t3.sh --job contract#run: echo ${{ github.no_such_property }}#' "$clone/.github/workflows/ci.yml.disabled"
run scripts/ci/t0.sh --base HEAD
rc_nz "broken workflow fails"
has "actionlint failed" "✘ [workflows:actionlint]"
reset_to "$base"

echo "# 5 shell scripts"
printf '#!/usr/bin/env bash\necho $1\n' >"$clone/scripts/defect.sh"
run scripts/ci/t0.sh --base HEAD
rc_nz "SC2086 defect fails"
has "shellcheck failed" "✘ [shell:shellcheck]"
reset_to "$base"
printf '#!/usr/bin/env bash\necho "$1"\n' >"$clone/scripts/clean.sh"
run scripts/ci/t0.sh --base HEAD
rc_is "clean script" 0
has "shellcheck passed" "✔ [shell:shellcheck]"
reset_to "$base"

echo "# 6 Dockerfile"
mkdir -p "$clone/deploy"
printf 'FROM alpine\n' >"$clone/deploy/Dockerfile"
run scripts/ci/t0.sh --base HEAD
has "hadolint ran" "▶ [dockerfiles:hadolint]"
rc_nz "untagged base image fails (DL3006 warning exits 1)"
reset_to "$base"

echo "# 7 Go change without go.mod (E3)"
printf '\n// edited\n' >>"$clone/backend/api/spec.go"
run scripts/ci/t0.sh --base HEAD
rc_is "Go change without module" 0
has "backend not present" "not present (backend/go.mod missing)"
hasnt "contract not selected" "[contract"
reset_to "$base"

echo "# 8 Go module: touched packages and their dependents"
b=$clone/backend
mkdir -p "$b/a" "$b/b" "$b/c" "$b/d" "$b/e"
printf 'module example.com/m\n\ngo 1.27\n' >"$b/go.mod"
printf 'version: "2"\nformatters:\n  enable:\n    - gofumpt\n    - goimports\n' >"$b/.golangci.yml"
printf 'package a\n\nfunc A() int { return 1 }\n' >"$b/a/a.go"
printf 'package b\n\nimport "example.com/m/a"\n\nfunc B() int { return a.A() }\n' >"$b/b/b.go"
printf 'package c\n\nfunc C() int { return 3 }\n' >"$b/c/c.go"
printf 'package e\n\nimport "example.com/m/a"\n\nfunc E() int { return a.A() }\n' >"$b/e/e.go"
printf 'package d\n\nfunc D() int { return 4 }\n' >"$b/d/d.go"
printf 'package d\n\nimport (\n\t"testing"\n\n\t"example.com/m/e"\n)\n\nfunc TestD(t *testing.T) {\n\tif e.E() != 1 {\n\t\tt.Fatal("e")\n\t}\n}\n' >"$b/d/d_test.go"
commit "scratch module"
mod_base=$("${G[@]}" rev-parse HEAD)
sed -i 's/return 1/return 1 + 0/' "$b/a/a.go"
run scripts/ci/t0.sh --base HEAD
rc_is "8a touched a" 0
line_has "8a fmt names a" backend:fmt ./a
line_lacks "8a fmt only a" backend:fmt ./b ./c ./d ./e ./...
line_has "8a vet names a" backend:vet ./a
line_lacks "8a vet only a" backend:vet ./b ./c ./d ./e
line_has "8a lint names a" backend:lint ./a
line_lacks "8a lint only a" backend:lint ./b ./c ./d ./e
line_has "8a test names dependents" backend:test example.com/m/a example.com/m/b example.com/m/e example.com/m/d
line_lacks "8a test skips c" backend:test example.com/m/c
reset_to "$mod_base"
printf 'package a\nfunc   X() {}\n' >"$b/a/bad.go"
run scripts/ci/t0.sh --base HEAD
rc_nz "8b misformatted file fails"
has "8b fmt failed" "✘ [backend:fmt]"
reset_to "$mod_base"
printf 'package a\n\nimport "fmt"\n\nfunc V() {\n\tfmt.Printf("%%d", "x")\n}\n' >"$b/a/v.go"
run scripts/ci/t0.sh --base HEAD
rc_nz "8c vet defect fails"
has "8c vet failed" "✘ [backend:vet]"
reset_to "$mod_base"
printf 'package a\n\nimport "testing"\n\nfunc TestA(t *testing.T) {\n\tif A() != 2 {\n\t\tt.Fatal("want 2")\n\t}\n}\n' >"$b/a/a_test.go"
run scripts/ci/t0.sh --base HEAD
rc_nz "8d failing test fails"
has "8d test failed" "✘ [backend:test]"
reset_to "$mod_base"
rm "$b/c/c.go"
run scripts/ci/t0.sh --base HEAD
line_has "8e deleted Go file tests the module" backend:test ./...
reset_to "$base"

echo "# 9 frontend without package.json (E3)"
mkdir -p "$clone/frontend/src"
printf 'export const x = 1;\n' >"$clone/frontend/src/x.ts"
run scripts/ci/t0.sh --base HEAD
rc_is "frontend change without package" 0
has "frontend not present" "not present (frontend/package.json missing)"
reset_to "$base"

echo "# 10 --keep-going collects failures"
printf 'broken: [unclosed\n' >>"$clone/backend/api/openapi.yaml"
printf '#!/usr/bin/env bash\necho $1\n' >"$clone/scripts/defect.sh"
run scripts/ci/t0.sh --base HEAD --keep-going
rc_nz "keep-going exits non-zero"
has "contract failure recorded" "✘ [contract:redocly]"
has "shell failure recorded" "✘ [shell:shellcheck]"
run scripts/ci/t0.sh --base HEAD
hasnt "without keep-going it stops at the first failure" "▶ [shell:shellcheck]"
reset_to "$base"

echo "# 11 t1 rejects bad targets before running anything (E5)"
run scripts/ci/t1.sh nope frontend/x.test.ts make:up
rc_nz "bad targets"
has "unknown target named" "unknown target nope"
has "missing test file named" "missing test file frontend/x.test.ts"
has "make target named" "make target up"
hasnt "nothing ran" "▶ [t1:"
run scripts/ci/t1.sh
rc_is "no target is a usage error" 2

echo "# 12 t1 runs exactly the named Go package"
reset_to "$mod_base"
run scripts/ci/t1.sh backend/a
rc_is "t1 backend/a" 0
line_has "t1 tests a" t1:backend/a ./a
line_lacks "t1 only a" t1:backend/a ./b ./c ./...
if [[ $(grep -c -F '▶ [t1:' <<<"$OUT") == 1 ]]; then ok "exactly one t1 command"; else bad "exactly one t1 command"; fi
reset_to "$base"

echo "# 13 t3 jobs"
run scripts/ci/t3.sh --job nope
rc_is "unknown job" 2
has "jobs listed" "jobs: contract backend frontend images"
run scripts/ci/t3.sh --job contract
rc_is "t3 contract job" 0
has "t3 redocly" "✔ [contract:redocly]"
has "t3 actionlint" "✔ [workflows:actionlint]"
has "t3 shellcheck" "✔ [shell:shellcheck]"
line_has "t3 shellcheck covers every tracked script" shell:shellcheck scripts/ci/t0.sh scripts/sample.sh

echo "# 14 untracked, spaces, deletions"
printf '#!/usr/bin/env bash\necho $1\n' >"$clone/scripts/my script.sh"
run scripts/ci/t0.sh --base HEAD
rc_nz "untracked file with a space is checked"
has "file with a space reached shellcheck" "my script.sh"
reset_to "$base"
rm "$clone/scripts/sample.sh"
run scripts/ci/t0.sh --base HEAD
rc_is "deleted script" 0
hasnt "deleted script not passed to shellcheck" "▶ [shell:shellcheck]"
reset_to "$base"

echo "# 15 unknown base"
run scripts/ci/t0.sh --base does-not-exist
rc_is "unknown base" 2
has "unknown base named" "unknown base does-not-exist"

echo "# 17 a missing pinned tool fails even if another copy is on PATH"
mv "$clone/bin/.tools/actionlint-1.7.12" "$clone/bin/.tools/actionlint-hidden"
printf '# comment\n' >>"$clone/.github/workflows/ci.yml.disabled"
run env PATH="$HOME/.local/bin:$PATH" scripts/ci/t0.sh --base HEAD
rc_nz "missing pinned actionlint"
has "install hint" "install-tools.sh actionlint"
mv "$clone/bin/.tools/actionlint-hidden" "$clone/bin/.tools/actionlint-1.7.12"
reset_to "$base"

echo "# 18 t1 refuses a mismatching agent identity"
reset_to "$mod_base"
python3 -c 'import json; print(json.dumps({"agent": "RUN-M1-1", "index": 1, "wave": "W1", "branch": "wf/RUN-M1-1", "worktree": "/x"}, indent=2))' >"$clone/.wf-agent"
run scripts/ci/t1.sh backend/a
rc_nz "identity mismatch stops t1"
has "env.sh identity message" "this worktree belongs to RUN-M1-1"
hasnt "no test ran" "▶ [t1:"
reset_to "$base"

echo "# 19 t2"
run scripts/ci/t2.sh --base HEAD
rc_is "t2 clean" 0
has "t2 no changed files" "no changed files"
has "t2 integration step always runs" "not present (no Makefile)"
printf '#!/usr/bin/env bash\necho "z $1"\n' >"$clone/scripts/z.sh"
commit "shell-only change"
run scripts/ci/t2.sh --base HEAD~1
rc_is "t2 shell-only commit" 0
line_has "t2 full shellcheck" shell:shellcheck scripts/ci/t0.sh scripts/sample.sh scripts/z.sh
reset_to "$base"

echo "# 20 a change no stage covers"
printf '\nmore\n' >>"$clone/README.md"
run scripts/ci/t0.sh --base HEAD
rc_is "README only" 0
has "no checks apply" "no checks apply to the 1 changed file(s)"
reset_to "$base"

echo "# 21 rename"
"${G[@]}" mv scripts/sample.sh scripts/moved.sh
run scripts/ci/t0.sh --base HEAD
rc_is "renamed script" 0
line_has "new path checked" shell:shellcheck scripts/moved.sh
line_lacks "old path not passed" shell:shellcheck scripts/sample.sh
reset_to "$base"

echo "# 22 make target validation runs no recipe"
printf 'up:\n\t+touch SIDE_EFFECT\n' >"$clone/Makefile"
run scripts/ci/t1.sh make:up make:nope
rc_nz "unknown make target"
has "nope named" "unknown make target nope"
hasnt "up accepted" "unknown make target up"
if [[ -e "$clone/SIDE_EFFECT" ]]; then bad "validation executed a recipe"; else ok "validation executed no recipe"; fi
reset_to "$base"

echo "# 24 t2 full mode includes untracked files"
printf '#!/usr/bin/env bash\necho $1\n' >"$clone/scripts/new-defect.sh"
printf 'FROM alpine\n' >"$clone/Dockerfile"
run scripts/ci/t2.sh --base HEAD --keep-going
rc_nz "t2 fails on untracked defects"
has "t2 shellcheck failed" "✘ [shell:shellcheck]"
has "t2 hadolint failed" "✘ [dockerfiles:hadolint]"
reset_to "$base"

echo "# 25 a deleted frontend file still runs typecheck"
mkdir -p "$clone/frontend/src" "$clone/frontend/node_modules"
printf '{\n  "name": "fixture",\n  "private": true,\n  "scripts": { "typecheck": "echo typecheck-ran" }\n}\n' >"$clone/frontend/package.json"
printf 'export const u = 1;\n' >"$clone/frontend/src/util.ts"
commit "frontend fixture"
"${G[@]}" rm -q frontend/src/util.ts
run scripts/ci/t0.sh --base HEAD
has "typecheck ran for a deletion" "▶ [frontend:typecheck]"
has "the package script ran" "typecheck-ran"
reset_to "$base"

echo "# 26 non-package directories and the contract inside the module"
reset_to "$mod_base"
mkdir -p "$b/a/testdata"
printf 'this is not Go\n' >"$b/a/testdata/golden.go"
run scripts/ci/t0.sh --base HEAD
rc_is "testdata file maps to its package" 0
line_has "vet names a" backend:vet ./a
line_lacks "vet skips testdata" backend:vet testdata
reset_to "$mod_base"
sed -i 's/^  title: Calculator API$/  title: Calculator API (edited)/' "$clone/backend/api/openapi.yaml"
run scripts/ci/t0.sh --base HEAD
rc_is "contract change with the module" 0
has "redocly ran" "✔ [contract:redocly]"
line_has "embedded contract tests its package" backend:test example.com/m/api
reset_to "$base"

echo "# 27 actionlint uses the pinned shellcheck"
sed -i 's#run: scripts/ci/t3.sh --job contract#run: echo $FOO#' "$clone/.github/workflows/ci.yml.disabled"
run env PATH=/usr/bin:/bin:"$(dirname "$(command -v pnpm)")" scripts/ci/t0.sh --base HEAD
rc_nz "shell issue inside run: is caught without shellcheck on PATH"
has "actionlint failed" "✘ [workflows:actionlint]"
reset_to "$base"

echo "# 28 file names that look like options"
printf '#!/usr/bin/env bash\necho "$1"\n' >"$clone/-V.sh"
run scripts/ci/t0.sh --base HEAD
rc_is "a script named -V.sh" 0
line_has "passed as a path" shell:shellcheck ./-V.sh
reset_to "$base"

echo "# 29 make files are not targets; -h"
printf 'up:\n\t@true\n' >"$clone/Makefile"
run scripts/ci/t1.sh make:Makefile
rc_nz "make:Makefile rejected"
has "Makefile is not a target" "unknown make target Makefile"
reset_to "$base"
for tier in t0 t1 t2 t3; do
  run "scripts/ci/$tier.sh" -h
  rc_is "$tier -h" 0
done

echo "# 23 E6: the tiers write no files (after every scenario)"
status=$("${G[@]}" status --porcelain --ignored)
if [[ "$status" == '!! bin/' ]]; then ok "no file left in the clone (only the bin/ links)"; else bad "files left: $status"; fi
leftover=$(find "$tiers_tmp" -maxdepth 1 -name 'tmp.*')
if [[ -z $leftover ]]; then ok "no temporary file of the tiers left behind"; else bad "temporary files left: $leftover"; fi
printf '     (tool caches in TMPDIR, not written by the tiers: %s)\n' "$(find "$tiers_tmp" -mindepth 1 -maxdepth 1 -printf '%f ')"

echo
if ((fails)); then
  echo "check-tiers: $fails assertion(s) failed"
  exit 1
fi
echo "check-tiers: all assertions passed"
