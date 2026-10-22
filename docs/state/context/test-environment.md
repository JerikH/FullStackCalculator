# Development and test environment — operational notes

How to run things locally in this project. All traps: `findings/by-owner/_traps.md`.

## Toolchain (installed 2026-10-22, U1)

| Tool | Location | Version |
|---|---|---|
| Go | `$HOME/.local/go/bin` (on `PATH` via `~/.bashrc`) | 1.27.3 |
| actionlint | `$HOME/.local/bin` | 1.7.12 |
| hadolint | `$HOME/.local/bin` | 2.15.1 |
| golangci-lint v2 | repository `bin/` (ignored; installed by OPS-CI-01) | latest v2 at install |
| Node / pnpm | nvm | 24.14.1 / 10.33.0 |
| Docker / Compose | system | 29.3.1 / v5.1.1 |
| Playwright | `npx playwright` (Chromium installed) | 1.62.1 |
| Redocly CLI | `pnpm dlx @redocly/cli@latest` (pinned in `frontend/` from UI-SCAF-01) | — |

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
`eval "$(.workflow/bin/wf env --export)"` then `source scripts/ci/env.sh` — written by OPS-ENV-01, which records here the exact variables it exports (`WEB_PORT`, `CALC_HTTP_ADDR`, `CALC_ADMIN_ADDR`, `VITE_PORT`, `API_PROXY_TARGET`, `E2E_BASE_URL`, `COMPOSE_PROJECT_NAME`, `PATH`).

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
| 0 | `scripts/ci/t0.sh --base main` | written by OPS-CI-01 |
| 1 | `scripts/ci/t1.sh <packages, test files or targets>` | written by OPS-CI-01 |
| 2 | `scripts/ci/t2.sh --base main` | integrator only |
| 3 | `scripts/ci/t3.sh` | never in a session |
| Browser checks | M1: `go run ./cmd/calculator` + `pnpm -C frontend dev` on the agent's ports, Playwright ad hoc; M2: `make up` + `make e2e` | — |
| Mutation check | break the named rule in the source, run the single test file/package, watch it fail, restore with `git checkout -- <file>` before anyone else runs tests | — |

## Too long for a session (pipeline or integrator only)
- Tier 3 / the complete suite; the full CI workflow; image builds of all three images in one go.
- `make up` + `make e2e` run once locally in OPS-E2E-01 (recorded in `docs/verification.md`); afterwards only failing spec files are re-run.

## Known traps (summary)
- Node's fetch rejects jsdom's `AbortSignal`: MSW tests run in the Node environment only.
- `openapi-fetch` captures `globalThis.fetch` at creation: pass `fetch: (request) => globalThis.fetch(request)` so MSW's patch applies.
- `backend/api/spec.go` compiles only once `backend/go.mod` exists (CALC-CORE-01).
