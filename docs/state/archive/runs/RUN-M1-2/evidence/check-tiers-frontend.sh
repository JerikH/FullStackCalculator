#!/usr/bin/env bash
# Evidence for UI-SCAF-01 (RF-API-10; Findings of OPS-CI-01 (b), (c), (i)): runs the tier scripts in
# a throwaway clone of the current branch through the contract and frontend scenarios and asserts
# on their output and exit status. The real worktree is never modified; the clone links the
# worktree's frontend/node_modules and pinned tools read-only.
# Usage: [SCRIPTS_SRC=<dir with lib.sh, t0..t3.sh, env.sh>] [SHOW=1] bash check-tiers-frontend.sh
set -uo pipefail

repo=$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)
src=${SCRIPTS_SRC:-$repo/scripts/ci}
work=$(mktemp -d "${WF_SCRATCH:-${TMPDIR:-/tmp}}/check-tiers-frontend.XXXXXX")
trap 'rm -rf "$work"' EXIT
clone=$work/clone
G=(git -C "$clone" -c user.name=check -c user.email=check@localhost -c commit.gpgsign=false)

fails=0
ok() { printf 'ok   %s\n' "$1"; }
bad() { printf 'FAIL %s\n' "$1"; fails=$((fails + 1)); }
has() { if grep -qF -- "$2" <<<"$OUT"; then ok "$1"; else bad "$1 (missing: $2)"; printf '%s\n' "$OUT" | sed 's/^/     | /' | tail -25; fi; }
hasnt() { if grep -qF -- "$2" <<<"$OUT"; then bad "$1 (unexpected: $2)"; else ok "$1"; fi; }
rc_is() { if [[ "$RC" == "$2" ]]; then ok "$1 (exit $RC)"; else bad "$1 (exit $RC, want $2)"; printf '%s\n' "$OUT" | sed 's/^/     | /' | tail -25; fi; }
rc_nz() { if [[ "$RC" != 0 ]]; then ok "$1 (exit $RC)"; else bad "$1 (exit 0, want non-zero)"; fi; }
run() {
  OUT=$(cd "$clone" && env -u WF_AGENT -u WF_INDEX -u WF_PORT_BASE -u WF_PORT_END -u WF_HOME "$@" 2>&1)
  RC=$?
  if [[ -n ${SHOW-} ]]; then printf '   $ %s  → exit %s\n' "$*" "$RC"; printf '%s\n' "$OUT" | sed 's/^/     | /'; fi
}
restore() { "${G[@]}" checkout -q -- . && "${G[@]}" clean -fdq -e frontend/node_modules; }

echo "# setup: clone of HEAD, scripts under test, linked node_modules and tools"
git clone -q "$repo" "$clone"
cp "$src"/lib.sh "$src"/t0.sh "$src"/t1.sh "$src"/t2.sh "$src"/t3.sh "$src"/env.sh "$clone/scripts/ci/"
if [[ -n $("${G[@]}" status --porcelain) ]]; then "${G[@]}" commit -qam "scripts under test"; fi
ln -s "$repo/frontend/node_modules" "$clone/frontend/node_modules"
# The link is a file to Git (the node_modules/ ignore pattern matches directories only).
printf 'frontend/node_modules\n' >>"$clone/.git/info/exclude"
mkdir -p "$clone/bin/.tools"
for d in "$repo"/bin/.tools/*/; do ln -s "${d%/}" "$clone/bin/.tools/$(basename "$d")"; done

echo "# 1 clean tree"
run scripts/ci/t0.sh --base HEAD
rc_is "clean tree" 0
has "nothing to check" "nothing to check"

echo "# 2 contract input only (pnpm lockfile pins Redocly): contract stage, never the backend stage"
printf '\n' >>"$clone/frontend/pnpm-lock.yaml"
run scripts/ci/t0.sh --base HEAD
rc_is "lockfile change" 0
has "redocly through the frontend script" "▶ [contract:redocly] pnpm -C frontend run lint:api"
has "redocly passed" "✔ [contract:redocly]"
has "types drift check ran" "▶ [contract:types]"
has "types drift check passed" "✔ [contract:types]"
hasnt "no backend stage for a frontend contract input" "[backend"
has "lockfile is a package-wide frontend input" "package-wide input touched"
restore

echo "# 3 contract input: the generated file edited by hand → drift fails"
printf '// hand edit\n' >>"$clone/frontend/src/shared/api/schema.gen.ts"
run scripts/ci/t0.sh --base HEAD
rc_nz "drift detected"
has "types check failed" "✘ [contract:types]"
has "diff shows the hand edit" "-// hand edit"
restore

echo "# 4 contract file edited without regenerating the types → drift fails"
sed -i 's/True when the exact result was rounded/True when the result was rounded/' "$clone/backend/api/openapi.yaml"
run scripts/ci/t0.sh --base HEAD
has "contract stage ran" "✔ [contract:redocly]"
has "generated types now drift from the edited contract" "✘ [contract:types]"
rc_nz "edited contract without regenerated types fails"
restore

echo "# 5 missing frontend install → the contract stage fails with the install command"
rm "$clone/frontend/node_modules"
sed -i 's/^  title: Calculator API$/  title: Calculator API (edited)/' "$clone/backend/api/openapi.yaml"
run scripts/ci/t0.sh --base HEAD
rc_nz "no node_modules"
has "install message" "✘ [contract] run pnpm -C frontend install --frozen-lockfile"
hasnt "Redocly not attempted" "▶ [contract:redocly]"
restore
ln -s "$repo/frontend/node_modules" "$clone/frontend/node_modules"

echo "# 6 source with a related test → the related test runs"
printf '\n// touched\n' >>"$clone/frontend/src/shared/ui/cx.ts"
run scripts/ci/t0.sh --base HEAD
rc_is "related run" 0
has "vitest related command" "vitest related --run --no-passWithNoTests src/shared/ui/cx.ts"
has "the related test file ran" "Affected  1 of"
has "vitest passed" "✔ [frontend:vitest]"
hasnt "no package-wide run" "package-wide input touched"
restore

echo "# 7 source without a related test → noted, stage passes"
printf '\n// touched\n' >>"$clone/frontend/src/vite-env.d.ts"
run scripts/ci/t0.sh --base HEAD
rc_is "no related test" 0
has "noted" "• [frontend:vitest] no related tests"
hasnt "not a failure" "✘ [frontend:vitest]"
restore

echo "# 8 a failing related test fails the stage"
sed -i "s/join(' ')/join(',')/" "$clone/frontend/src/shared/ui/cx.ts"
run scripts/ci/t0.sh --base HEAD
rc_nz "failing related test"
has "vitest failed" "✘ [frontend:vitest]"
hasnt "not noted as no tests" "no related tests"
restore

echo "# 9 package-wide input (vite.config.ts) → whole package checked"
printf '\n// touched\n' >>"$clone/frontend/vite.config.ts"
run scripts/ci/t0.sh --base HEAD
rc_is "package-wide" 0
has "noted" "package-wide input touched"
has "full lint" "✔ [frontend:lint]"
has "full format check" "✔ [frontend:format]"
has "full test run" "✔ [frontend:test]"
restore

echo "# 10 HTML only → typecheck, Prettier, no vitest"
sed -i 's|<title>Calculator</title>|<title>Calculator (edited)</title>|' "$clone/frontend/index.html"
run scripts/ci/t0.sh --base HEAD
has "prettier ran on the file" "▶ [frontend:prettier]"
has "no applicable test files" "• [frontend:vitest] no applicable files"
restore

echo "# 11 CI-equivalent jobs"
run scripts/ci/t3.sh --job contract
rc_is "t3 contract" 0
has "t3 contract types" "✔ [contract:types]"
run scripts/ci/t3.sh --job frontend
rc_is "t3 frontend" 0
has "t3 frontend build" "✔ [frontend:build]"

echo "# 12 no remaining reader of REDOCLY_CLI_VERSION"
OUT=$(grep -rn REDOCLY_CLI_VERSION "$clone/scripts" "$clone/tools" "$clone/.github" 2>&1); RC=$?
rc_is "grep finds nothing" 1

echo "# 13 generator prints the right output but exits non-zero → contract:types fails (pipefail)"
rm "$clone/frontend/node_modules"
mkdir "$clone/frontend/node_modules"
for entry in "$repo"/frontend/node_modules/* "$repo"/frontend/node_modules/.[!.]*; do
  [[ $(basename "$entry") == .bin ]] || ln -s "$entry" "$clone/frontend/node_modules/$(basename "$entry")"
done
cp -a "$repo/frontend/node_modules/.bin" "$clone/frontend/node_modules/.bin"
printf '#!/bin/sh\n"%s/frontend/node_modules/.bin/openapi-typescript" "$@"\nexit 1\n' "$repo" >"$clone/frontend/node_modules/.bin/openapi-typescript"
run scripts/ci/t3.sh --job contract --keep-going
rc_nz "failing generator detected"
has "types check failed" "✘ [contract:types]"

printf '\n%d failure(s)\n' "$fails"
(( fails == 0 ))
