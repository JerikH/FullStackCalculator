# RUN-M0-2 — Spec

Members: OPS-ENV-01, OPS-CI-01. Mode: solo, main checkout. Review level: single for both members.

Owner answers (step 1 batch, 2026-10-22), recorded as owner decision U6:
- **shellcheck joins the tiers now:** a pinned, checksum-verified shellcheck is installed into `bin/`; tier 0 runs it on changed `*.sh` files, tier 3 and the CI `contract` job on every tracked `*.sh`.
- **`tools/versions.env` is created now** as the single home of the standalone tool pins (versions and per-platform SHA-256); OPS-STACK-01 extends it instead of creating it.

What exists (step 2): the code knowledge graph holds `backend/api/spec.go`, `backend/api/openapi.yaml`, `redocly.yaml` and the `docs/` records; no `scripts/`, `tools/`, `.github/`, `backend/go.mod` or `frontend/`. `.gitignore` already ignores `/bin/`. `wf env --export` gives the main checkout `WF_AGENT=main`, `WF_INDEX=0`, `WF_PORT_BASE=4100`; worker *n* gets base `4100 + 10·n` and block size 10; worker agent names are run IDs (`RUN-M1-1`). In a non-interactive shell `go` is not on `PATH` (it is added by `~/.bashrc` only), so the scripts must find `$HOME/.local/go/bin` themselves. Installed: actionlint 1.7.12 and hadolint 2.15.1 (`$HOME/.local/bin`), Node 24.14.1, pnpm 10.33.0. Latest stable at implementation time: golangci-lint v2.15.0, shellcheck v0.11.0, Redocly CLI 2.69.0, `actions/checkout` v7.0.1 (`3d3c42e5aac5ba805825da76410c181273ba90b1`), `actions/setup-node` v7.1.0 (`949feb2413d6458794dcd2491c4babbbce0c15c1`).

---

## OPS-ENV-01 — Per-agent isolated environment

**Scope:** UC-OPS-01 steps 1–2 and extensions E1, E2, E6; RF-OPS-02.

**Missing:** `scripts/ci/env.sh`; the recipe in `docs/state/context/test-environment.md` (applied at closure).

**Decisions:**
- **Sourced, never executed.** `source scripts/ci/env.sh` (bash) after `eval "$(.workflow/bin/wf env --export)"`. Executed directly it prints how to source it and exits 2. All work happens inside one function with local variables that is unset afterwards, so sourcing leaves only the exported variables behind and never `exit`s the caller's shell (`return` codes only).
- **Identity → ports.** `WF_INDEX` unset or empty (not inside a `wf` checkout, e.g. CI): main-checkout defaults and one line on stderr saying so (E1). `WF_INDEX=0`: defaults silently. `WF_INDEX ≥ 1`: worker; `WF_PORT_BASE` must be an integer, `WF_PORT_END` (when set) must be ≥ base + 3, and `WF_AGENT` must be non-empty — otherwise an error naming the variable and return 1. A non-integer `WF_INDEX` is an error.

  | Variable | Main (index 0 / no identity) | Worker (base *b*) |
  |---|---|---|
  | `WEB_PORT` | `8080` | *b* |
  | `CALC_HTTP_ADDR` | `:8081` | `:`*b+1* |
  | `CALC_ADMIN_ADDR` | `:9091` | `:`*b+2* |
  | `VITE_PORT` | `5173` | *b+3* |
  | `API_PROXY_TARGET` | `http://localhost:8081` | `http://localhost:`*b+1* |
  | `E2E_BASE_URL` | `http://127.0.0.1:8080` | `http://127.0.0.1:`*b* |
  | `COMPOSE_PROJECT_NAME` | `fullstackcalculator` | `fullstackcalculator-<agent>` lowercased, every character outside `[a-z0-9_-]` replaced by `-` |

  Values are always derived from the identity (no pre-set overrides): a variable left over from another agent's shell can never leak into this one; a developer who wants a custom port sets it after sourcing.
- **PATH.** Prepends `$HOME/.local/go/bin` (when that directory exists) and the repository `bin/` (always, so tools installed later are found), each only if not already on `PATH` (sourcing twice does not grow it). The repository root comes from the script's own location, so worktrees (whose `bin` is a symlink to the main checkout's) work unchanged.
- **Go required (E2).** After computing the new `PATH`, `go` must resolve; otherwise it prints the install instruction (Go 1.27 from https://go.dev/dl/ extracted to `$HOME/.local/go`, or any Go on `PATH`) and returns 1 **before exporting anything** (fail closed: no half-applied environment).
- **Summary line** on stderr after success: identity, the four ports and the compose project name.
- **E6** holds by construction: main uses 8080/8081/9091/5173, worker blocks start at 4110 and are 10 wide, so no two identities share a port or a project name; the tier scripts write no report files (later report paths live inside each worktree).

**Verification (T0/T1, evidence script `evidence/check-env.sh`):** main, no identity (message on stderr), worker 1 (`RUN-M1-1`, base 4110) and worker 2 (base 4120) → expected values, pairwise disjoint port sets and distinct project names; two `python3 -m http.server` processes per identity (web and API ports of main and worker 1) running side by side and answering; missing Go (`HOME` pointing at an empty directory and a `PATH` without Go) → non-zero, the hint, and none of the variables exported; executed instead of sourced → exit 2; sourcing twice keeps `PATH` entries unique; invalid `WF_INDEX`, a too-small `WF_PORT_END` and a missing `WF_AGENT` → non-zero naming the variable; `bash -n` and shellcheck clean.

**Files:** `scripts/ci/env.sh`, `docs/state/runs/RUN-M0-2/evidence/check-env.sh` (+ its output).

---

## OPS-CI-01 — Local test tiers and the disabled GitHub workflow

**Scope:** RF-OPS-03, RF-OPS-11 (initial definition: the `contract` job), RNF-OPS-02; UC-OPS-01 steps 3–6 and extensions E3, E4, E5; the registered follow-up from API-CONTRACT-01 (c) (Redocly through `pnpm --package=@redocly/cli@<version> dlx redocly lint`); U1 (golangci-lint v2 in `bin/`); U6 (shellcheck, `tools/versions.env`).

**Missing:** `tools/versions.env`, `scripts/ci/lib.sh`, `scripts/ci/install-tools.sh`, `scripts/ci/t0.sh`…`t3.sh`, `.github/workflows/ci.yml.disabled`; measured durations in `context/test-environment.md` (closure).

**Decisions:**
- **`tools/versions.env`** — plain `KEY=value` lines (sourceable by bash, readable by Make later): `GOLANGCI_LINT_VERSION=2.15.0`, `ACTIONLINT_VERSION=1.7.12`, `HADOLINT_VERSION=2.15.1`, `SHELLCHECK_VERSION=0.11.0`, `REDOCLY_CLI_VERSION=2.69.0`, and `<TOOL>_SHA256_<os>_<arch>` for linux/darwin × amd64/arm64 taken from the official release checksum files (shellcheck publishes none: its four archives are hashed once at pin time). Node and pnpm are not here: they belong to `frontend/package.json` once it exists.
- **`scripts/ci/install-tools.sh [tool…]`** (default: all four binaries) installs the pinned versions into the repository `bin/`: explicit OS/arch mapping (linux/darwin, amd64/arm64; anything else → error with the manual alternative), download over HTTPS to a temporary directory, SHA-256 verified against the pin **before** extraction (mismatch → error, nothing installed), atomic move into `bin/`. Idempotent: an installed binary reporting the pinned version is kept; a different version is replaced. Never edits shell profiles, never pipes a download into a shell.
- **`scripts/ci/lib.sh`** — sourced by the four tier scripts only (never by `env.sh`, so an interactive shell is not polluted). Provides: repository root; `PATH` with `bin/` first, then `$HOME/.local/go/bin` when present; the pins from `tools/versions.env`; the runner (prints `▶ <command>` before and `✔ <seconds>s` / `✘ exit <n> after <seconds>s` after each command, timing with `EPOCHREALTIME`); stop on the first failure unless `--keep-going`, which runs everything and exits non-zero if anything failed; a final summary table (stage, command, result, duration, total); notes for «not present», «no changes» and «nothing to check»; a missing tool is a **failure** naming `scripts/ci/install-tools.sh <tool>` (never a skip). Stages, each callable on a file/package list (tier 0) or in full mode (tiers 2–3):
  - **contract** — `pnpm --package=@redocly/cli@${REDOCLY_CLI_VERSION} dlx redocly lint backend/api/openapi.yaml` from the repository root (picks up `redocly.yaml`). Runs whether or not `backend/go.mod` exists (E3).
  - **workflows** — `actionlint <files>`; full mode: every `.github/workflows/*.yml|*.yaml|*.yml.disabled|*.yaml.disabled`.
  - **shell** — `shellcheck <files>`; full mode: every tracked `*.sh`.
  - **dockerfiles** — `hadolint <files>`; full mode: every tracked `Dockerfile`, `*.Dockerfile`, `Dockerfile.*`; none → «not present».
  - **backend** — keyed on `backend/go.mod` (absent → «not present», E3). In `backend/`: `golangci-lint fmt --diff` (gofumpt/goimports as configured), `go vet`, `golangci-lint run` on the touched packages; `go test -race` on the touched packages **plus the packages that import them** (directly or transitively, including test imports), so a change to the embedded contract also runs the contract tests that import `backend/api`. A changed non-Go file under `backend/` belongs to the nearest enclosing directory with Go files (embedded files, testdata); `go.mod`, `go.sum` or `.golangci.yml` → `./...`. Full mode: `./...`.
  - **frontend** — keyed on `frontend/package.json` (absent → «not present», E3); missing `frontend/node_modules` → failure with the install hint. Tier 0: `pnpm -C frontend run typecheck`; ESLint (`--max-warnings=0`) and `prettier --check --ignore-unknown` on the touched files; `vitest related --run` on the touched source files. Full mode: `typecheck`, `lint`, `format:check`, `test` package scripts. First real exercise is UI-SCAF-01 (follow-up registered).
- **`t0.sh [--base <ref>] [--keep-going]`** (default base `main`): changed files = working tree versus `git merge-base <base> HEAD` (committed, staged and unstaged, renames as add+delete) plus untracked non-ignored files; an unknown base → error. Classification: `backend/api/openapi.yaml` or `redocly.yaml` → contract (and backend, because the contract is embedded); workflow files → workflows; `*.sh` → shell; Dockerfiles → dockerfiles; `backend/**` → backend; `frontend/**` → frontend. Deleted files select stages but are never passed to linters. No changed file → «nothing to check», exit 0 (E4); files changed but no stage applies → says so, exit 0. Order: contract, workflows, shell, dockerfiles, backend, frontend (fast static checks first).
- **`t1.sh [--keep-going] <target…>`** — exactly the named targets, all validated before anything runs; an unknown or missing target → non-zero naming every bad one (E5); no target → usage, exit 2. Targets: `backend/<dir>` or `backend/<dir>/...` (a directory with Go files; needs `backend/go.mod`) → `go test -race -cover`; `frontend/**/*.test.ts(x)` → `vitest run <file>`; `frontend/e2e/**/*.spec.ts` → `playwright test <file>`; `make:<target>` → `make <target>` (needs a `Makefile` defining it). Coverage targets arrive as `make:coverage-*` with OPS-STACK-01.
- **`t2.sh [--base <ref>] [--keep-going]`** — the integration tier: every stage touched versus the base runs in full mode; then the Makefile integration targets (tests with coverage, images, composed stack, E2E, all-in-one smoke) — reported «not present (no Makefile)» until OPS-STACK-01 wires them.
- **`t3.sh [--job <name>] [--keep-going]`** — the complete CI-equivalent suite: jobs `contract` (Redocly lint, actionlint on every workflow, shellcheck on every script), `backend`, `frontend`, `images` (hadolint on every Dockerfile) in full mode; `--job` runs one job (unknown → error listing the jobs). Never run inside an agent session; the CI jobs call it, so the YAML holds no check logic.
- **`.github/workflows/ci.yml.disabled`** — header comment: disabled, how the owner enables it, kept in sync with `scripts/ci/`. Triggers `pull_request`, `push` to `main`, tags `v*`, `workflow_dispatch`; `permissions: contents: read`; concurrency group `ci-${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}` cancelling superseded runs; job `contract` on `ubuntu-24.04`, 10-minute timeout: checkout (full SHA, `persist-credentials: false`), setup-node (full SHA, Node 24.14.1), pnpm 10.33.0 through corepack, `scripts/ci/install-tools.sh actionlint shellcheck`, `scripts/ci/t3.sh --job contract`. No secrets, no `pull_request_target`, no write permission.
- **No logic duplicated**: the YAML only installs toolchains and calls `t3.sh`.

**Verification (T0/T1, evidence script `evidence/check-tiers.sh`, run in a throwaway clone under the scratch directory):** E4 on a clean tree; a change limited to the contract (a clone at the contract commit with the scripts copied in, `t0.sh --base HEAD~1`) runs Redocly only and prints durations; a deliberately broken YAML makes t0 exit non-zero; a workflow change runs actionlint and a broken one fails; a `*.sh` change runs shellcheck and a defect fails; a Dockerfile change runs hadolint; a Go change without `go.mod` reports backend «not present»; with a scratch module of three packages (`a`, `b` importing `a`, `c` independent) a change in `a` vets/lints `a` only and tests `a` and `b`, not `c`, and a failing test fails the tier; a frontend change without `package.json` reports «not present»; `--keep-going` collects two failures; `t1.sh` with an unknown target, a missing file and a `make:` target without a Makefile → non-zero naming each; `t1.sh backend/<pkg>` runs exactly that package; `t3.sh --job nope` fails listing the jobs; `t3.sh --job contract` on the real repository runs Redocly, actionlint and shellcheck clean; `install-tools.sh` twice (second run keeps the binaries), a corrupted pin fails before installing; `bin/golangci-lint version` reports 2.15.0; `actionlint .github/workflows/ci.yml.disabled` clean; the action SHAs resolve to the commented tags. Mutation checks: drop failure propagation in the runner, and drop the `go.mod` key of the backend stage → the evidence script fails each time; restored. Measured durations recorded in `context/test-environment.md`.

**Files:** `tools/versions.env`, `scripts/ci/lib.sh`, `scripts/ci/install-tools.sh`, `scripts/ci/t0.sh`, `scripts/ci/t1.sh`, `scripts/ci/t2.sh`, `scripts/ci/t3.sh`, `.github/workflows/ci.yml.disabled`, `docs/state/runs/RUN-M0-2/evidence/check-tiers.sh` (+ outputs).

**Consumers:** every later run (T0/T1 commands); UI-SCAF-01 (frontend stage, `VITE_PORT`, `API_PROXY_TARGET`); CALC-CORE-01 (backend stage, `bin/golangci-lint`); OPS-STACK-01 (extends `tools/versions.env`, wires Makefile targets into t1–t3); OPS-CI-02 (extends the workflow with jobs calling `t3.sh --job`).

---

## Review log
(step 4)
