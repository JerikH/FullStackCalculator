# RUN-M0-2 — Plan

Implements the reviewed `spec.md`. Interfaces, rules and tests; no full bodies. All scripts: `#!/usr/bin/env bash`, `set -euo pipefail` in executables (never in the sourced `env.sh`), bash ≥ 5 checked at start (`BASH_VERSINFO`), shellcheck-clean with no disable directives unless a one-line justification sits next to it, file names with spaces handled (NUL-separated git output, arrays, every expansion quoted).

## Task order and ownership

| # | Task | Member | Owner | Files |
|---|---|---|---|---|
| 1 | Tool pins | OPS-CI-01 | controller (done) | `tools/versions.env` |
| 2 | Environment loader + its evidence check | OPS-ENV-01 | Claude subagent A (Sonnet 5.5, high) | `scripts/ci/env.sh`, `docs/state/runs/RUN-M0-2/evidence/check-env.sh` |
| 3 | Installer | OPS-CI-01 | Claude subagent B (Sonnet 5.5, high) | `scripts/ci/install-tools.sh` |
| 4 | Tier library and tiers | OPS-CI-01 | Codex (one job) | `scripts/ci/lib.sh`, `scripts/ci/t0.sh`, `t1.sh`, `t2.sh`, `t3.sh` |
| 5 | Disabled workflow | OPS-CI-01 | controller | `.github/workflows/ci.yml.disabled` |
| 6 | Tier evidence check (independent of the implementer) | OPS-CI-01 | controller | `docs/state/runs/RUN-M0-2/evidence/check-tiers.sh` |

Tasks 2–4 run in parallel (disjoint files). Task 6 is written by the controller from this plan, not from the implementation, so the implementation is never its own oracle. Only the controller runs git.

---

## Task 2 — `scripts/ci/env.sh` (OPS-ENV-01)

**Interface.** `source scripts/ci/env.sh` from bash. Return 0 on success; 1 on any error (message on stderr starting `env.sh: `). Executed instead of sourced (`[[ "${BASH_SOURCE[0]}" == "$0" ]]`): message `env.sh: source this file: source scripts/ci/env.sh` and `exit 2`.

**Shape.** One function `_calc_env_load` holding all logic in `local` variables; the file calls it, captures its status, `unset -f _calc_env_load`, and `return`s the status. Safe when the caller has `set -u` and/or `set -e` (no unset-variable expansion: use `${VAR-}`; no failing command outside an `if`/`||` that could kill an `errexit` caller).

**Rules (in order):**
1. Repository root = the parent of the script's directory, resolved with `cd -P` (works through the worktree symlinks).
2. Checkout kind: `<root>/.wf-agent` is a file → worker checkout; its agent name is read with `sed` from the JSON key `"agent"` (no jq/python dependency); unreadable → error. Otherwise main checkout.
   - Worker checkout: `WF_AGENT` must equal the file's agent (else `env.sh: this worktree belongs to <agent> but WF_AGENT is '<x>'; run eval "$(.workflow/bin/wf env --export)" first`); `WF_INDEX` must match `^[1-9][0-9]*$` (index 0 is `wf`'s fallback for an unrecorded agent → error naming `WF_INDEX`); `WF_PORT_BASE` must match `^[0-9]+$`; `WF_PORT_END`, when set, an integer ≥ base + 3. Each failure names the variable and returns 1.
   - Main checkout: `WF_AGENT` unset/empty or `main`, and `WF_INDEX` unset/empty or `0`. Both unset → defaults + stderr `env.sh: no agent identity (WF_AGENT/WF_INDEX unset); using the main-checkout defaults` (E1). Any other value → `env.sh: identity mismatch: the main checkout cannot use WF_AGENT=<x> WF_INDEX=<n>` and return 1.
3. Values per the spec table. `COMPOSE_PROJECT_NAME` worker: `fullstackcalculator-` + `WF_AGENT` lowercased with every character outside `[a-z0-9_-]` replaced by `-`.
4. New PATH computed in a local: prepend `$HOME/.local/go/bin` if it is a directory and not already a `PATH` element; prepend `<root>/bin` if not already a `PATH` element (`bin/` ends first). Element comparison is exact on `:`-split entries.
5. Go check with the new PATH (`PATH="$new" command -v go`); missing → stderr `env.sh: Go not found. Install Go 1.27 from https://go.dev/dl/ into $HOME/.local/go (tar -C "$HOME/.local" -xzf go1.27.*.tar.gz) or put go on PATH, then source this file again.` and return 1 with nothing exported (E2).
6. Export the seven variables and `PATH`; one stderr summary line: `env.sh: <agent|main> — web <p> · api <addr> · admin <addr> · vite <p> · compose <name>`.

**Evidence check `evidence/check-env.sh`** (bash, exits non-zero on the first failed assertion, prints one `ok`/`FAIL` line per assertion; each case runs in a fresh `env -i HOME=… PATH=… bash -c` so no state leaks; ports for the side-by-side servers are the real defaults and blocks, freed afterwards by killing only the recorded PIDs):
Worker cases copy `env.sh` into `<tmp>/repo/scripts/ci/` with `<tmp>/repo/.wf-agent` = `{"agent": "RUN-M1-1", "index": 1}` (and likewise for worker 2); main cases use the real file.
- main (`WF_AGENT=main WF_INDEX=0`): the seven exact values; no E1 message.
- no identity: same values; E1 message on stderr.
- worker 1 (`WF_AGENT=RUN-M1-1`, base 4110, end 4119) and worker 2 (`RUN-M1-2`, 4120): exact values; `COMPOSE_PROJECT_NAME=fullstackcalculator-run-m1-1`; the three port sets pairwise disjoint; three distinct project names.
- side by side: `python3 -m http.server --bind 127.0.0.1` on all four ports (web, API, admin, Vite) of main and of worker 1 (8 servers) all up at once and each answering `curl -fsS`; PIDs killed. If a main port is already taken on the machine, the case reports it as `SKIP <port> in use` and fails (never silently passes).
- worker tree with `WF_INDEX=0` (the `wf` fallback), worker tree with `WF_AGENT=RUN-M1-2`, main tree with `WF_AGENT=RUN-M1-1 WF_INDEX=1` → status 1 each, nothing exported.
- missing Go: `HOME` = empty temp dir, `PATH=/usr/bin:/bin` → status 1, hint on stderr, `WEB_PORT`/`COMPOSE_PROJECT_NAME`/`PATH` unchanged.
- executed → exit 2.
- sourced twice → no duplicate `PATH` entries; `bin/` is the first entry.
- `WF_INDEX=x` in a worker tree, worker with `WF_PORT_END=4111`, worker with empty `WF_AGENT` → status 1 and the variable name in the message.
- caller with `set -euo pipefail` sourcing it (main) → succeeds and the shell continues.
- worker tree whose agent is `Run M1/1` (file and `WF_AGENT` agree) → `fullstackcalculator-run-m1-1`.

---

## Task 3 — `scripts/ci/install-tools.sh` (OPS-CI-01)

**Interface.** `scripts/ci/install-tools.sh [golangci-lint|actionlint|hadolint|shellcheck …]`; no argument = all four; unknown name → exit 2 listing the valid names. Exit 0 when every requested tool is installed at its pin; non-zero on the first failure.

**Rules.**
- Reads `tools/versions.env` (repository root from the script location).
- Platform: `uname -s` → `linux`/`darwin`; `uname -m` → `x86_64|amd64` → `amd64`, `aarch64|arm64` → `arm64`; anything else → error `unsupported platform <os>/<arch>: install <tool> <version> manually into <root>/bin`.
- Asset per tool (`V` = version, `o`/`a` = os/arch above):
  - golangci-lint: `https://github.com/golangci/golangci-lint/releases/download/v$V/golangci-lint-$V-$o-$a.tar.gz`, binary `golangci-lint-$V-$o-$a/golangci-lint`; version probe `golangci-lint version` contains `version $V `.
  - actionlint: `https://github.com/rhysd/actionlint/releases/download/v$V/actionlint_${V}_${o}_${a}.tar.gz`, binary `actionlint`; probe `actionlint --version` first line equals `$V`.
  - hadolint: `https://github.com/hadolint/hadolint/releases/download/v$V/hadolint-<os>-<arch>` with os `linux`/`macos`, arch `x86_64`/`arm64` (a bare binary); probe `hadolint --version` contains ` $V`.
  - shellcheck: `https://github.com/koalaman/shellcheck/releases/download/v$V/shellcheck-v$V.<os>.<arch>.tar.gz` with os `linux`/`darwin`, arch `x86_64`/`aarch64`; binary `shellcheck-v$V/shellcheck`; probe `shellcheck --version` has a line `version: $V`.
- Expected hash = `<TOOL>_SHA256_<o>_<a>` (tool upper-cased, `-` → `_`); empty/missing → error.
- Layout: binary at `<root>/bin/.tools/<tool>-<V>/<tool>`; convenience link `<root>/bin/<tool>` → `.tools/<tool>-<V>/<tool>` (relative), replaced atomically (`ln -s` to a temporary name in `bin/`, then `mv -T`). Versions installed by other branches stay untouched.
- Idempotent: if the versioned binary exists, is executable and the probe matches → print `<tool> <V> already installed` (refresh the link if it points elsewhere) and skip the download.
- Download with `curl -fsSL --retry 3 --proto '=https' --tlsv1.2` into a temp dir created **inside** `<root>/bin` (`mktemp -d "<root>/bin/.install.XXXXXX"`, removed by an EXIT trap); verify SHA-256 (`sha256sum`, else `shasum -a 256`) **before** extracting; mismatch → error naming expected and actual, nothing installed. Extract only the named member; `chmod 0755`; `mkdir -p` the versioned directory and `mv -f` the binary into it (same filesystem → atomic rename, safe when two agents install at once through the shared `bin/` link); run the probe on the installed binary; then the link.
- `bin/` created if missing. Never touches anything outside `<root>/bin`.

**Tests (T1, controller-run, recorded in `evidence/install-tools.txt`):** install all four (fresh `bin/`); second run reports «already installed» for all four and changes no mtime; the links resolve to the versioned binaries; a copy of the repository tree whose `versions.env` has one wrong hash fails with the mismatch message and leaves no binary; unknown tool → exit 2; probes print the pinned versions.

---

## Task 4 — `scripts/ci/lib.sh` and `t0.sh`…`t3.sh` (OPS-CI-01)

### lib.sh (sourced by the tier scripts only)

Globals: `CI_ROOT` (repository root via `git -C <script dir> rev-parse --show-toplevel`), `CI_KEEP_GOING` (0/1), result arrays. On load: bash ≥ 5 check; `cd "$CI_ROOT"`; source `tools/versions.env` with `set -a`; PATH = `$HOME/.local/go/bin` (if it exists) then the inherited PATH. Pinned tools are never looked up on `PATH`: `ci_tool <tool>` echoes `$CI_ROOT/bin/.tools/<tool>-<VERSION>/<tool>` (version from `versions.env`), and every stage invokes that absolute path.
- `ci_agent_env`: used by t1 and t2 only. If `WF_INDEX` is unset and `$CI_ROOT/.workflow/bin/wf` is executable → `eval "$("$CI_ROOT/.workflow/bin/wf" env --export)"`; then `source "$CI_ROOT/scripts/ci/env.sh"`; non-zero → recorded failure `agent environment` and the tier stops (even with `--keep-going`).

Functions (names fixed — the evidence script greps output, not internals):
- `ci_run <stage> [-C <dir>] -- <cmd> [args…]`: prints `▶ [<stage>] <cmd quoted with printf %q>` (prefix `(cd <dir>) ` when `-C`), runs it (in a subshell when `-C`), prints `✔ [<stage>] <s.ss>s` or `✘ [<stage>] exit <n> after <s.ss>s`, records the row. On failure and `CI_KEEP_GOING=0` → `ci_finish` and exit 1.
- `ci_note <stage> <text>`: prints `• [<stage>] <text>`, records a row with result `note` (never a failure).
- `ci_need <stage> <tool>`: for pinned tools, the versioned path is not executable; for `go`/`pnpm`, not found on `PATH` → recorded as a failure `missing tool <tool>: run scripts/ci/install-tools.sh <tool>` (or for go: the env.sh install hint; for pnpm: `install Node 24 and pnpm 10`) with fail-fast behaviour as in `ci_run`. Returns 1 so the stage stops.
- `ci_finish`: prints the summary table (stage · command · result · seconds) and `total <s.ss>s`; returns 1 if any row failed, else 0. Every tier ends with `ci_finish; exit $?`.
- `ci_changed_files <base>`: base must resolve to a commit (`git rev-parse --verify --quiet "<base>^{commit}"`, else error `unknown base <base>` exit 2); merge base `git merge-base <base> HEAD`; output (NUL-separated, sorted, unique) = `git diff -z --name-only --no-renames <mb> --` ∪ `git ls-files -z --others --exclude-standard`. Prints `base <base> → merge base <short mb> — <n> changed file(s)`; when the merge base equals `HEAD` it adds `base is HEAD: checking uncommitted changes only`.
- Classifiers over a path: `ci_is_contract` (`backend/api/openapi.yaml`, `redocly.yaml`), `ci_is_workflow` (`.github/workflows/*.{yml,yaml}` and the same with `.disabled`), `ci_is_shell` (`*.sh`), `ci_is_dockerfile` (basename `Dockerfile`, `*.Dockerfile`, `Dockerfile.*`), `ci_is_backend` (`backend/*`), `ci_is_frontend` (`frontend/*`).
- Stages (each takes `--full` or a list of repository-relative paths; deleted paths are filtered out before any linter call; a stage left with no existing file prints a note):
  - `ci_stage_contract`: `ci_need contract pnpm`; `ci_run contract -- pnpm --package=@redocly/cli@$REDOCLY_CLI_VERSION dlx redocly lint backend/api/openapi.yaml`.
  - `ci_stage_workflows`: `ci_need workflows actionlint`; `actionlint <files>`; full = every file matching the classifier under `.github/workflows/` (none → note «not present»).
  - `ci_stage_shell`: shellcheck on files; full = `git ls-files -z '*.sh'` (none → note).
  - `ci_stage_dockerfiles`: hadolint on files; full = tracked Dockerfiles (none → note «not present»).
  - `ci_stage_backend`: no `backend/go.mod` → note `not present (backend/go.mod missing)` (E3). Else `ci_need go`, `ci_need golangci-lint`. Package selection (tier 0): `go.mod`/`go.sum`/`.golangci.yml` touched, or any deleted `*.go` path → `./...`; otherwise each touched path maps to the nearest existing directory at or above it, inside `backend/`, that holds `*.go` files → `./<rel>` (`.` for the module root); paths with no such directory are ignored; none left → note `no Go package touched`. Lint set = touched packages; test set = touched packages + every module package whose `Deps`, `TestImports` or `XTestImports` (from one `go list -f` call over `./...`, run in `backend/`) contains a touched package's import path. Commands, all `-C backend`: `golangci-lint fmt --diff <lint dirs>`, `go vet <lint dirs>`, `golangci-lint run <lint dirs>`, `go test -race <test import paths>`. Full mode: the same four over `./...`.
  - `ci_stage_frontend`: no `frontend/package.json` → note `not present (frontend/package.json missing)`. Else `ci_need pnpm`; no `frontend/node_modules` → failure `run pnpm -C frontend install --frozen-lockfile`. Tier 0 on touched existing files (paths relative to `frontend/`): `pnpm -C frontend run typecheck`; `pnpm -C frontend exec eslint --max-warnings=0 --no-warn-ignored <*.{ts,tsx,js,jsx,mjs,cjs}>`; `pnpm -C frontend exec prettier --check --ignore-unknown <all>`; `pnpm -C frontend exec vitest related --run <*.{ts,tsx,js,jsx}>`; a command whose file list is empty is a note. Full: `pnpm -C frontend run typecheck`, `run lint`, `run format:check`, `run test`.

### t0.sh

`t0.sh [--base <ref>] [--keep-going] [-h]`, default base `main`. Unknown option → usage, exit 2. Collect changed files; zero → `nothing to check` and exit 0 (E4). Partition by the classifiers (a contract path also selects backend); run stages in the order contract, workflows, shell, dockerfiles, backend, frontend, each only if it has paths; none selected → `no checks apply to the <n> changed file(s)` and exit 0. `ci_finish`.

### t1.sh

`t1.sh [--keep-going] <target…>`; no target → usage, exit 2. `ci_agent_env` first. **Validate all targets first**, collecting every error, then exit 1 listing them before running anything (E5):
- `make:<name>` → needs `Makefile` and `make -n <name>` to succeed; else `unknown make target <name>`.
- `backend/<dir>` or `backend/<dir>/...` → needs `backend/go.mod` (`backend/go.mod missing`) and the directory to exist with `*.go` files (`not a Go package: <target>`); runs `go test -race -cover ./<rel>[/...]` `-C backend`.
- `frontend/e2e/**/*.spec.ts` (existing file) → `pnpm -C frontend exec playwright test <rel>`.
- `frontend/**/*.test.{ts,tsx}` (existing file) → `pnpm -C frontend exec vitest run <rel>`.
- anything else → `unknown target <t>`; a test-file-shaped target that does not exist → `missing test file <t>`.
Then run each in order (`ci_run t1 …`), `ci_finish`.

### t2.sh

`t2.sh [--base <ref>] [--keep-going]` (default `main`). `ci_agent_env` first. Same partition as t0; each selected stage runs with `--full`; then `ci_note integration "not present (no Makefile)"` when there is no `Makefile` (OPS-STACK-01 replaces this with the Make targets). Nothing changed → `nothing to check`.

### t3.sh

`t3.sh [--job <name>] [--keep-going]`. Jobs: `contract` = contract + workflows full + shell full; `backend` = backend full; `frontend` = frontend full; `images` = dockerfiles full. No `--job` = all four in that order. Unknown job → exit 2 with `jobs: contract backend frontend images`. Header line `t3: complete suite — for CI; agent sessions run t0/t1 only`.

---

## Task 5 — `.github/workflows/ci.yml.disabled`

As in the spec. Concretely: `name: CI`; `on: pull_request / push: branches [main], tags ['v*'] / workflow_dispatch`; `permissions: contents: read`; `concurrency: { group: ci-${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}, cancel-in-progress: ${{ github.event_name == 'pull_request' }} }`; `defaults.run.shell: bash`; job `contract`: `runs-on: ubuntu-24.04`, `timeout-minutes: 10`, steps:
1. `actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1` with `persist-credentials: false`;
2. `actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0` with `node-version: 24.14.1`;
3. `corepack enable pnpm && corepack install --global pnpm@10.33.0+sha512.10568bb4a6afb58c9eb3630da90cc9516417abebd3fabbe6739f0ae795728da1491e9db5a544c76ad8eb7570f5c4bb3d6c637b2cb41bfdcdb47fa823c8649319`;
4. `scripts/ci/install-tools.sh actionlint shellcheck`;
5. `scripts/ci/t3.sh --job contract`.

## Task 6 — `evidence/check-tiers.sh` (controller)

Runs every scenario in a throwaway clone under `$WF_SCRATCH` (`git clone -q <repo>` then copy the working-tree versions of `scripts/ci/` and `tools/` and commit them as a base commit), so the real repository is never touched. The clone has no `bin/` (ignored): the setup creates `<clone>/bin/.tools/` and symlinks each real versioned tool directory into it, so scenario 17 can remove one link in the clone without touching the shared binaries. The clone has no `.workflow/`, so `ci_agent_env` there takes the E1 path (main defaults). One `ok`/`FAIL` line per assertion; exit non-zero if any failed. Scenarios (each from the clean base commit, reset between scenarios):
1. clean tree → `t0 --base HEAD` exit 0, output `nothing to check` (E4).
2. contract-only: append a description change to `backend/api/openapi.yaml` (valid) → exit 0; output has `redocly lint` and a `✔ [contract]` duration; no `[backend]` command lines other than the `not present` note; no `[workflows]`/`[shell]`/`[dockerfiles]`/`[frontend]` lines.
3. broken YAML in `openapi.yaml` → non-zero, `✘ [contract]`.
4. workflow change (valid) → `actionlint` ran, exit 0; broken expression → non-zero.
5. `*.sh` with an SC2086 defect → non-zero `✘ [shell]`; a clean script → exit 0.
6. Dockerfile `FROM alpine` without tag → hadolint ran; non-zero (DL3006 is a warning: hadolint exits 1 on warnings by default — asserted, not assumed).
7. Go change without `go.mod` (`backend/api/spec.go` touched) → `not present (backend/go.mod missing)`, exit 0 (contract untouched).
8. scratch module `backend/go.mod` (with a `.golangci.yml` enabling the gofumpt and goimports formatters) and packages `a`, `b` (imports `a`), `c`: commit, then touch `a` → vet/lint/fmt name `./a` only; `go test` names `a` and `b`, not `c`; exit 0. Then separately: a misformatted file in `a` → `✘` on `fmt`; a `go vet` defect (`fmt.Printf("%d", "x")`) → `✘` on vet; a failing test in `a` → `✘` on test; each non-zero. Deleting `c/c.go` → backend runs over `./...`.
9. frontend file without `package.json` → `not present (frontend/package.json missing)`.
10. `--keep-going` with broken YAML + shell defect → both `✘` lines, summary lists both, non-zero.
11. `t1` with `nope`, `frontend/x.test.ts` (missing), `make:up` (no Makefile) → non-zero and each named; nothing run.
12. `t1 backend/a` (scratch module) → only `./a` tested; exit 0.
13. `t3 --job nope` → exit 2 listing the jobs; `t3 --job contract` (on the real repository, read-only) → Redocly, actionlint and shellcheck all `✔`.
14. Untracked new file and a file name with a space are detected; a deleted `*.sh` is not passed to shellcheck.
15. `t0 --base does-not-exist` → exit 2, `unknown base`.
16. `--base HEAD` with an uncommitted change → output contains `base is HEAD: checking uncommitted changes only` and the change is checked.
17. a pinned tool missing (versioned path renamed away inside the clone's own `bin/`, not the shared one) → `✘` naming `install-tools.sh <tool>` even though `actionlint` is on `PATH` in `~/.local/bin`.
18. `t1 backend/a` from a clone carrying a `.wf-agent` file whose agent does not match `WF_AGENT` → fails with the env.sh identity message before running tests.

Mutation checks (T1, recorded): (M1) make `ci_run` ignore a non-zero status → scenarios 3/5/8b fail; (M2) remove the `go.mod` key of the backend stage → scenario 7 fails; (M3) drop the reverse-dependency set → scenario 8 fails. Each restored with `git checkout -- scripts/ci/lib.sh` (after the commit) and the check re-run green.

## Targeted checks of the run

```
bash -n scripts/ci/*.sh && bin/shellcheck scripts/ci/*.sh docs/state/runs/RUN-M0-2/evidence/*.sh
bash docs/state/runs/RUN-M0-2/evidence/check-env.sh
bash docs/state/runs/RUN-M0-2/evidence/check-tiers.sh
scripts/ci/install-tools.sh            # second run: all «already installed»
bin/golangci-lint version              # 2.15.0
bin/actionlint .github/workflows/ci.yml.disabled
scripts/ci/t0.sh --base main           # the run's own change set
```

## What NOT to touch

`backend/api/*`, `redocly.yaml`, hygiene files, `README.md`, `docs/spec/*` (spec changes go through the closure with U6), anything under `.workflow/`, `CLAUDE.md`, `AGENTS.md`, `.claude/`. No Makefile, compose, Dockerfiles, `.github/dependabot.yml`, frontend or Go module (later tasks).

## Review log
(step 6)

Amended after the step 4 spec review: checkout kind from `.wf-agent`, versioned tool directories and absolute tool paths, agent environment in t1/t2, deleted Go files → `./...`, base-is-HEAD note, pnpm integrity, PR-only cancellation, extra evidence scenarios 16–18 and the fmt/vet failure cases.
