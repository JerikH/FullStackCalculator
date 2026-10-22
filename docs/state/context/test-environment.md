# Development and test environment — operational notes

How to run things locally in this project. All traps: `findings/by-owner/_traps.md`.

## Toolchain (installed 2026-10-22, U1)

| Tool | Location | Version |
|---|---|---|
| Go | `$HOME/.local/go/bin` (on `PATH` via `~/.bashrc`) | 1.27.3 |
| actionlint | `$HOME/.local/bin`; the tiers use `bin/.tools/actionlint-1.7.12/` | 1.7.12 |
| hadolint | `$HOME/.local/bin`; the tiers use `bin/.tools/hadolint-2.15.1/` | 2.15.1 |
| golangci-lint | repository `bin/.tools/golangci-lint-2.15.0/` (link `bin/golangci-lint`), `scripts/ci/install-tools.sh` | 2.15.0 |
| shellcheck | repository `bin/.tools/shellcheck-0.11.0/` (link `bin/shellcheck`), `scripts/ci/install-tools.sh` | 0.11.0 |
| Node / pnpm | nvm | 24.14.1 / 10.33.0 |
| Docker / Compose | system | 29.3.1 / v5.1.1 |
| Playwright | `npx playwright` (Chromium installed) | 1.62.1 |
| Redocly CLI | contract stage: `REDOCLY_TELEMETRY=off pnpm --package=@redocly/cli@$REDOCLY_CLI_VERSION dlx redocly lint backend/api/openapi.yaml` (version in `tools/versions.env` until UI-SCAF-01 pins it in the frontend lockfile); 0.55 s warm, about 2 s cold | 2.69.0 |

Pinned tools: `scripts/ci/install-tools.sh [tool…]` installs or confirms every pin of `tools/versions.env` (SHA-256 verified before extraction; idempotent; safe for two agents at once). Updating a pin: change the version and its four SHA-256 values in one commit, run the installer, then `scripts/ci/t0.sh`.

Machine: 4 CPUs, 14 GB RAM. Image builds and coverage runs are serialized between agents.

## Per-agent resources

| Variable | Meaning | How the project uses it |
|---|---|---|
| `WF_AGENT`, `WF_INDEX` | Identity (`main` = 0, workers 1..n) | Selects defaults (main) or the port block (workers) |
| `WF_DB_SUFFIX` | `""` for main, `_w<n>` for workers | Not used: the project has no database |
| `WF_PORT_BASE`..`WF_PORT_END` | Port block of this agent (base 4100 + 10·n) | Workers: web/edge = base, API = base+1, admin = base+2, Vite = base+3. Main: 8080 / 8081 / 9091 / 5173 |
| `WF_CACHE_DB` | Cache/queue database index | Not used: the project has no cache |
| `WF_SCRATCH` | Private scratch directory | Temporary files, logs, screenshots before they move to evidence |

## Environment loading
`eval "$(.workflow/bin/wf env --export)"` then `source scripts/ci/env.sh` (bash). It exports `WEB_PORT`, `CALC_HTTP_ADDR`, `CALC_ADMIN_ADDR`, `VITE_PORT`, `API_PROXY_TARGET`, `E2E_BASE_URL`, `COMPOSE_PROJECT_NAME` and prepends the repository `bin/` and `$HOME/.local/go/bin` to `PATH`:

| | Main checkout | Worker (port base *b*) |
|---|---|---|
| Web / API / admin / Vite | 8080 / `:8081` / `:9091` / 5173 | *b* / `:b+1` / `:b+2` / *b+3* |
| Proxy target, E2E URL | `http://localhost:8081`, `http://127.0.0.1:8080` | `http://localhost:b+1`, `http://127.0.0.1:b` |
| Compose project | `fullstackcalculator` | `fullstackcalculator-<agent, lowercased>` |

A worktree (it has `.wf-agent`) needs `WF_AGENT` equal to its agent and `WF_INDEX ≥ 1`; the main checkout accepts no other identity. Errors return 1 and export nothing; without any identity (CI) the main defaults apply with a note. `t1.sh` and `t2.sh` load this environment themselves.

## Services
| Service | Address | How to start / reset | Shared? (lease) |
|---|---|---|---|
| Go service (dev) | `CALC_HTTP_ADDR`, admin `CALC_ADMIN_ADDR` | `cd backend && go run ./cmd/calculator` (from OBS-RUNTIME-01; `make dev-backend` from OPS-STACK-01) | per agent |
| Vite dev server | `VITE_PORT`, proxies `/api` to `API_PROXY_TARGET` | `pnpm -C frontend dev` (from UI-SCAF-01; `make dev-frontend` later) | per agent |
| Composed stack | `WEB_PORT` → web:8080 | `make up` / `make down` with the agent's `COMPOSE_PROJECT_NAME` (from OPS-STACK-01) | per agent; image builds serialized |

No database, cache or external service.

## Tier commands
| Tier | Command | Measured duration |
|---|---|---|
| 0 | `scripts/ci/t0.sh --base main` (uncommitted changes in the main checkout); solo runs re-check their commits with `--base <run start commit>` | 4.0 s over RUN-M0-2 (shellcheck ~3.9 s, actionlint 0.03 s, Redocly 0.55 s warm) |
| 1 | `scripts/ci/t1.sh backend/<pkg>[/...] \| frontend/<file>.test.ts \| frontend/e2e/<file>.spec.ts \| make:<target>` (all validated before anything runs) | — |
| 2 | `scripts/ci/t2.sh --base <pre-merge main>` | integrator only; 4.7 s while only scripts exist |
| 3 | `scripts/ci/t3.sh [--job contract\|backend\|frontend\|images]` | CI; `--job contract` 6.6 s |
| Options | `--keep-going` collects every failure; `-h` usage | — |
| Browser checks | M1: `go run ./cmd/calculator` + `pnpm -C frontend dev` on the agent's ports, Playwright ad hoc; M2: `make up` + `make e2e` | — |
| Mutation check | break the named rule in the source, run the single test file/package, watch it fail, restore with `git checkout -- <file>` before anyone else runs tests | — |

## Too long for a session (pipeline or integrator only)
- Tier 3 / the complete suite; the full CI workflow; image builds of all three images in one go.
- `make up` + `make e2e` run once locally in OPS-E2E-01 (recorded in `docs/verification.md`); afterwards only failing spec files are re-run.

## Known traps (summary)
- Node's fetch rejects jsdom's `AbortSignal`: MSW tests run in the Node environment only.
- `openapi-fetch` captures `globalThis.fetch` at creation: pass `fetch: (request) => globalThis.fetch(request)` so MSW's patch applies.
- `backend/api/spec.go` compiles only once `backend/go.mod` exists (CALC-CORE-01).
- `pnpm dlx @redocly/cli@<version> lint` fails with `ERR_PNPM_DLX_MULTIPLE_BINS`; name the binary: `pnpm --package=@redocly/cli@<version> dlx redocly lint` (Findings of API-CONTRACT-01 (c)).
- `git check-ignore -q` accepts a single path; check several paths one at a time (or use `-v` without `-q`).
- `wf env --export` gives index 0 and the main port block to an agent it has no record for; `env.sh` refuses that in a worktree. `go` is on `PATH` only in interactive shells: source `env.sh` or use the tiers (Findings of OPS-ENV-01 (c)).
- In the main checkout `t0.sh --base main` sees only uncommitted changes (the tier says «base is HEAD»). actionlint lints `*.yml.disabled` only when named, takes shellcheck from `PATH` unless `-shellcheck` is given, and has no `-x`. `make -n` / `make -pRrq <goal>` run `+` recipes. hadolint exits 1 on warnings (Findings of OPS-CI-01 (g)).
