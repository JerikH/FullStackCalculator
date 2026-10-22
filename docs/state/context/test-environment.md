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
| Redocly CLI | contract stage: `pnpm -C frontend run lint:api` (version from `frontend/pnpm-lock.yaml`, telemetry off) | 2.69.0 |
| Frontend packages | `pnpm -C frontend install --frozen-lockfile` (`deps` lease) | see `frontend/package.json` |
| Playwright (frontend) | `@playwright/test` 1.64.1, Chromium 1248 installed by `pnpm -C frontend exec playwright install chromium` | 1.64.1 |

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
| Go service (dev) | `CALC_HTTP_ADDR`, admin `CALC_ADMIN_ADDR` | `cd backend && go run ./cmd/calculator` (exists since RUN-M1-4; worker: `CALC_HTTP_ADDR`/`CALC_ADMIN_ADDR` from env.sh; `make dev-backend` from OPS-STACK-01) | per agent |
| Vite dev server | `VITE_PORT`, proxies `/api` to `API_PROXY_TARGET` | `pnpm -C frontend dev` (strict port `VITE_PORT`, proxy to `API_PROXY_TARGET`; `make dev-frontend` later) | per agent |
| Composed stack | `WEB_PORT` → web:8080 | `make up` / `make down` with the agent's `COMPOSE_PROJECT_NAME` (from OPS-STACK-01) | per agent; image builds serialized |

No database, cache or external service.

## Tier commands
| Tier | Command | Measured duration |
|---|---|---|
| 0 | `scripts/ci/t0.sh --base main` (uncommitted changes in the main checkout); solo runs re-check their commits with `--base <run start commit>`; the contract stage needs `pnpm -C frontend install --frozen-lockfile` first | 4.0 s over RUN-M0-2 (shellcheck ~3.9 s, actionlint 0.03 s, Redocly 0.55 s warm); 19.7 s over RUN-M1-2 (contract 2.1 s, frontend typecheck 3.0 s, lint 7.5 s, format 1.2 s, tests 4.6 s) |
| Backend T0 | `scripts/ci/t0.sh --base main` (backend stage: golangci-lint fmt --diff, go vet, golangci-lint run, go test -race; ./... when go.mod/go.sum/.golangci.yml change) | 4.7 s full (RUN-M1-1), 5.0 s one package |
| 1 | `scripts/ci/t1.sh backend/<pkg>[/...] \| frontend/<file>.test.ts \| frontend/e2e/<file>.spec.ts \| make:<target>` (all validated before anything runs) | — |
| 2 | `scripts/ci/t2.sh --base <pre-merge main>` | integrator only; 4.7 s while only scripts exist; 31.7 s over W1 (contract, workflows, shell, backend, frontend with build); 69.4 s over W2 (shell, dockerfiles, backend with `go test -race ./...` 22.2 s, frontend with build) |
| 3 | `scripts/ci/t3.sh [--job contract\|backend\|frontend\|images]` | CI; `--job contract` 6.6 s (8.6 s after W1, with the types drift check), `--job frontend` 18.9 s |
| Options | `--keep-going` collects every failure; `-h` usage | — |
| Edge image | under the heavy lease: `docker build -f frontend/Dockerfile -t calculator-web:local .` (41 s cold, seconds warm); `bash docs/state/archive/runs/RUN-M1-6/evidence/edge-smoke.sh calculator-web:local` (PREFIX, WEB_PORT; about 2 min; uses WEB_PORT and WEB_PORT+4); `mutations.sh` (about 3 min per mutation) | 520 checks, 15 mutations (RUN-M1-6); 520 checks in 80 s on the merged image (W2) |
| Browser checks | M1: `go run ./cmd/calculator` + `pnpm -C frontend dev` on the agent's ports, Playwright ad hoc; M2: `make up` + `make e2e` | — |
| API image | `source scripts/ci/env.sh` first (`wf env --export` does not set `COMPOSE_PROJECT_NAME`), under the heavy lease `timeout 600 docker build -f backend/Dockerfile -t calculator-api:$COMPOSE_PROJECT_NAME --build-arg VERSION=… --build-arg COMMIT=… .`, then `docs/state/archive/runs/RUN-M1-7/evidence/image-smoke.sh <image> <version> <commit> <port>` (container removed by name) | build 53 s with the base images pulled, 7–10 s warm; smoke 9–10 s (RUN-M1-7); 10 s and 10 s merged (W3) |
| Ad hoc real-browser pieces | `docs/state/archive/runs/RUN-M1-8/evidence/`: `servers.sh start\|stop [BASE]` (Go service + Vite for a port block, PIDs recorded), `run-piece.sh <spec> <project>` (copies the specs to `$WF_SCRATCH/e2e` with a `node_modules` symlink, `timeout 600`, writes `results/` and `shots/` next to the specs: archived paths are read-only evidence, copy the specs to a scratch folder to re-run them), the five specs and `mutations.py`; against any base URL with `E2E_URL` | flows 25 s, touch 6 s, layout 20–24 s per project, axe 17 s per project, policy 12 s (RUN-M1-8); policy against the embedded binary 34 s (W3); coverage 41 s / 64 s, t0 55 s |
| Wave integration | `docs/state/archive/waves/W3-evidence/`: `embedded-headers.sh <base-url> <repo>` (header set and cache policy of the embedded app, API responses, 304, missing file, dotfile), `edge-real-service-image.sh <web-image> <api-image> <scratch>` (W2 script with the hardened API image instead of a host binary), `checks.md` (every command and duration) | 3 s; 13 s; whole integration about 10 minutes of commands, none above 90 s |
| Mutation check | break the named rule in the source, run the single test file/package, watch it fail, restore with `git checkout -- <file>` before anyone else runs tests | — |

## 10-minute limit on every local command (U22, every run from W3 on)

No local command — test suite, coverage run, benchmark, image build, Playwright or browser check, tier script — may take 10 minutes of wall-clock time or more.

- **Bound it.** Wrap any command that could run long in `timeout 600` (`timeout 600 scripts/ci/t1.sh …`, `timeout 600 docker build …`, `timeout 600 pnpm -C frontend exec playwright test …`); give polling loops their own shorter bound (`timeout 120 bash -c 'until …; do sleep 2; done'`). Background servers (`go run ./cmd/calculator`, `pnpm -C frontend dev`) are started with their PID recorded and stopped by that PID; they are not waited on.
- **Split what cannot fit.** A check that does not fit is cut into targeted pieces that each fit (one package, one test file, one Playwright project or spec, one width group, one image), each run under its own `timeout 600`. Only when no split fits is it left to CI, recorded in the run's `closure.md` with the reason.
- **Never wait idle.** Do not sit on a running command or on a lease with nothing else to do: run long pieces in the background and keep working (review, next dispatch, records), or move on. Leases: `wf lease acquire <name>` without `--wait` first; when it is held, do other work and retry; `--wait` only with `--timeout 600` and only when nothing else can advance.
- **A timeout is a finding.** Record it (`[type: trap]` or `debt` with a target) and fix it by narrowing the scope — fewer files, one project, smaller matrix pieces. Never raise the limit, drop assertions, lower thresholds or skip the check to make it fit.
- **Record durations.** Every bounded check lists its measured duration in the run's evidence; a piece above 5 minutes is named in the closure so the next run can split it further.

## Too long for a session (pipeline or integrator only)
- Tier 3 / the complete suite; the full CI workflow; image builds of all three images in one go.
- `make up` + `make e2e` run once locally in OPS-E2E-01 (recorded in `docs/verification.md`); afterwards only failing spec files are re-run.

## Known traps (summary)
- Node's fetch rejects jsdom's `AbortSignal`: MSW tests run in the Node environment only.
- `openapi-fetch` captures `globalThis.fetch` at creation: pass `fetch: (request) => globalThis.fetch(request)` so MSW's patch applies.
- `backend/api/spec.go` compiles only with `backend/go.mod`, which exists since CALC-CORE-01: `go build ./api/` is part of `go vet ./...`.
- `pnpm dlx @redocly/cli@<version> lint` fails with `ERR_PNPM_DLX_MULTIPLE_BINS`; name the binary: `pnpm --package=@redocly/cli@<version> dlx redocly lint` (Findings of API-CONTRACT-01 (c)); history — the contract stage now runs Redocly from the frontend lockfile.
- `git check-ignore -q` accepts a single path; check several paths one at a time (or use `-v` without `-q`).
- `wf env --export` gives index 0 and the main port block to an agent it has no record for; `env.sh` refuses that in a worktree. `go` is on `PATH` only in interactive shells: source `env.sh` or use the tiers (Findings of OPS-ENV-01 (c)).
- In the main checkout `t0.sh --base main` sees only uncommitted changes (the tier says «base is HEAD»). actionlint lints `*.yml.disabled` only when named, takes shellcheck from `PATH` unless `-shellcheck` is given, and has no `-x`. `make -n` / `make -pRrq <goal>` run `+` recipes. hadolint exits 1 on warnings (Findings of OPS-CI-01 (g)).
- go mod tidy in backend/ downloads github.com/lib/pq (a test dependency of apd) into the module cache; it is not a module requirement (Findings of CALC-CORE-01 (c)).
- Fuzzing, benchmarks and coverage runs take the heavy lease: go test ./internal/calc -run '^$' -fuzz FuzzParse -fuzztime 20s; … -fuzz FuzzCalculate -fuzztime 30s; … -bench . -benchmem. Benchmarks run alone: an overlapping install or test run inflates them (Findings of W1 (c)).
- encoding/json matches keys case-insensitively, decodes null into a struct without error and puts input map keys in UnmarshalTypeError.Field; a streaming decoder over MaxBytesReader reports syntax errors before the size limit (Findings of API-HTTPX-01 (b)).
- Vitest 5 `related` forces passWithNoTests unless `--no-passWithNoTests`, and then reports «No affected test files found» (exit 1); `vitest list` has no `--related`; jsdom 29 `matchMedia` is not a function; vitest-axe typing needs `src/test/vitest-axe.d.ts` (Findings of UI-SCAF-01 (d)).
- msw 3 renamed `onUnhandledRequest` to `onUnhandledFrame`; an MSW body stream left open crashes Node 24.14.1's undici on abort (inject an abort-aware fetch instead); `@playwright/test` 1.64.1 needs Chromium 1248, `npx playwright` 1.62.1 uses 1243 (Findings of UI-SCAF-01 (e)).
- Python evidence scripts: run with python3 -B or stage evidence by name — __pycache__ is not ignored (Findings of DOC-ADR-01 (e)).
- Coverage of one directory at 100 %: pnpm -C frontend exec vitest run --coverage --coverage.include='src/<dir>/**' --coverage.thresholds.100 --coverage.reportsDirectory="$WF_SCRATCH/coverage" src/<dir> after eval "$(.workflow/bin/wf env --export)" (heavy lease); Codex review sandboxes cannot start Vitest (Findings of UI-MODEL-01 (e)).
- go get <module>@<version> does not record go.sum lines for packages nothing imports yet; go get the exact packages a run will import under the deps lease, go mod tidy once at the end (Findings of OBS-METRICS-01 (c)).
- Codex's sandbox cannot bind sockets or write the Go build cache in review mode: socket lifecycle tests are run by the controller (Findings of OBS-RUNTIME-01 (f)).
- Docker and nginx: a plain `--tmpfs` (or compose `tmpfs:`) over an image directory is root-owned with that directory's mode, and nginx-unprivileged's envsubst step then logs `not writable` and starts with no server (only the healthcheck shows it); `return <code> '<text>'` takes the MIME type from the URI extension unless the location resets `types { }`; `proxy_intercept_errors on` intercepts every status that has an `error_page` in that location; round-robin state is per worker; a failed ARP lookup is cached; `docker logs` is asynchronous; do not edit a bash script while a run of it is in progress (Findings of OPS-EDGE-01 (e)).
- A drain check must signal a built binary, not `go run` (it does not forward SIGTERM), and must require at least one draining line, otherwise «no ERROR line» holds trivially; image tags built from `COMPOSE_PROJECT_NAME` need `scripts/ci/env.sh` sourced (Findings of OPS-IMAGE-01 (g)).
- Mutation helpers must assert the pattern was found and `cmp` against the backup afterwards (Findings of OPS-IMAGE-01 (h)). jsdom 29 / user-event 14 / React 19 traps of the hook and screen tests: Findings of UI-HOOKS-01 (b); real-browser traps (Vite lazy modules, visually hidden radios, `oklab()` serialisation, screenshots during a 120 ms transition): Findings of UI-SCREEN-01 (e).
- `scripts/ci/t0.sh` selects the frontend stage for any path under `frontend/`, `frontend/Dockerfile` included, and that stage needs `frontend/node_modules`; a worktree without them gets only the shell and dockerfiles stages (Findings of OPS-EDGE-01 (f)).
