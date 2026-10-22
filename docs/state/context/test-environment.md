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
| Node / pnpm | nvm (`nvm install 24.22.1`, then `corepack enable pnpm` once per Node version: corepack shims are per installation) | 24.22.1 / 10.33.0 |
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

## M2 delivery pieces (U22; basis: the measured durations above, «expected» where not yet measured)

Each row is one command under `timeout 600`; the lease is taken without `--wait` and other work continues while it is held. The task entries (`tasks/OPS.md`, `tasks/DOC.md`) assign the pieces to tasks.

| Piece | Command | Lease | Duration |
|---|---|---|---|
| Compose render | `docker compose config --quiet` + JSON assertions | — | seconds |
| Base image pull | `docker pull <pinned base image>` (one per image) | — | network, expected < 2 min each |
| API image | `docker compose build api` / `docker build -f backend/Dockerfile …` | heavy | 53 s cold, 7–10 s warm |
| Web image | `docker compose build web` / `docker build -f frontend/Dockerfile …` | heavy | 41 s cold, 2 s warm |
| All-in-one image | `make image-aio` (stages buildable alone with `--target`) | heavy | expected 2–4 min cold |
| Backend coverage | `make coverage-backend` | heavy | 23 s measured with race and `-coverpkg`; expected < 2 min with shuffle and atomic mode |
| Frontend coverage | `make coverage-frontend` | heavy | 64 s |
| Fuzz | `make fuzz` (30 s per target) | heavy | about 80 s |
| Benchmarks | `make bench` alone (`-count=3` over both families) | heavy | 50 s measured |
| Edge smoke against the stub | `edge-smoke.sh` (archived run evidence; extended copy in the run evidence) | — (the image build takes heavy) | about 2 min; a mutation about 3 min each, one piece per mutation |
| Composed stack up | `make up` (images cached) | — | expected seconds |
| E2E per project | `make e2e E2E_ARGS="--project=chromium"`, then `--project=mobile-chromium` | — | expected < 5 min each; split by spec file above 5 min |
| Disruptive E2E specs | last, once, `chromium` only, one worker | — | expected < 2 min |
| All-in-one smoke | `make smoke-aio` (after `make down`, same host port) | — | expected < 1 min |
| `t3.sh --job contract` / `frontend` | per job | — | 9 s measured / expected about 90 s (19 s was measured before the screen existed) |

The composed stack and `make e2e` run once locally (OPS-E2E-01) and every piece is recorded in `docs/verification.md`; after a fix only the failing spec files re-run. Left to CI (gate G1): the hosted run of the six jobs, the Trivy gate, the clean-clone build, the `publish` job.

## CI job pieces and documentation checks (RUN-M2-2, RUN-M2-3; measured 2026-10-22)

`scripts/ci/t3.sh --list` prints the stages of every job; a job runs one stage per command with `--job J --stage S`. Each piece is one command under `timeout 600`; the lease is `heavy` where noted.

| Piece | Result | Time |
|---|---|---|
| `t3.sh --job contract` (all five stages) | pass | 14.9 s |
| `t3.sh --job frontend` typecheck, lint, format, audit | pass | 22.7 s |
| `--stage coverage-frontend --stage build` (heavy) | pass; 100 / 99.77 / 99.15 / 100 % | 33.6 s |
| `--job backend` modules, static, govulncheck, build | pass | 24.8 s |
| `--stage coverage-backend` / `fuzz` / `bench` (heavy) | 98.11 % / 2 targets / all cases under budget | 17.7 s / 62.9 s / 47.8 s |
| images: dockerfiles / compose-config | pass | 0.3 s / 0.2 s |
| images: build-api / build-web / build-aio (heavy; layers cached, cold builds in OPS-STACK-01) | pass | 5.5 s / 2.2 s / 3.6 s |
| images: smoke-api / smoke-edge / smoke-edge-stub / smoke-aio (heavy) | 14 / 80 / 599 / 58 checks | 8.9 s / 14.6 s / 83.3 s / 7.6 s |
| images: export; scan-api / scan-web / scan-aio | three archives (5.3, 25.8, 5.6 MB), manifest; 0 findings | 2.3 s; 27 s first (129 MB database), then 0.6–1.5 s |
| images: edge-mutations `M14` / `MLC MPB` / `M2 M8` (`EDGE_MUTATIONS="ID …"`, one subset per command) | caught | 84 s / 167 s / 172 s |
| `check-workflow.py`; `checker-mutations.sh` (29) | ok; all caught | 0.1 s; seconds |
| `publish-tags-test.sh`; `publish-push-shim-test.sh`; `e2e-shim-test.sh` | 46; 12; 10 cases | under 10 s each |
| `t2.sh --base main`, default stage | the stages of the affected scope pass and all 21 targets are present; no container started | 62 s (integration, with the frontend stages) / 75 s (RUN-M2-2) |
| README checker `check_docs.py --terms-file <list outside the repository>`; `check_docs_mutations.py`; `run_curl_examples.py`; `check_adrs.py`; `make docs-api` | 16 rules; 40/40; 20/20; 0 failures; written | under 1 s; 6.7 s; 0.2 s; 0.8 s; 0.8 s |

Recipe of the documentation checks: build the binary with `go build -o <scratch>/calc ./cmd/calculator`, start it with `CALC_HTTP_ADDR=:<port> CALC_ADMIN_ADDR=:<port+2>` on the agent's own ports, run `python3 -B -I docs/state/archive/runs/RUN-M2-3/evidence/run_curl_examples.py --readme README.md --base http://127.0.0.1:<port>`, stop it by its PID. Screenshots only if the app or the theme changes: see the header of `take_screenshots.mjs`. Needs `pnpm -C frontend install --frozen-lockfile` under the `deps` lease in a fresh worktree (2 s with the shared store).

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
- msw 3 renamed `onUnhandledRequest` to `onUnhandledFrame`; an MSW body stream left open crashes Node 24.14.1's undici on abort (observed on 24.14.1; the inject-an-abort-aware-fetch rule stays) (inject an abort-aware fetch instead); `@playwright/test` 1.64.1 needs Chromium 1248, `npx playwright` 1.62.1 uses 1243 (Findings of UI-SCAF-01 (e)).
- Python evidence scripts: run with python3 -B or stage evidence by name — __pycache__ is not ignored (Findings of DOC-ADR-01 (e)).
- Coverage of one directory at 100 %: pnpm -C frontend exec vitest run --coverage --coverage.include='src/<dir>/**' --coverage.thresholds.100 --coverage.reportsDirectory="$WF_SCRATCH/coverage" src/<dir> after eval "$(.workflow/bin/wf env --export)" (heavy lease); Codex review sandboxes cannot start Vitest (Findings of UI-MODEL-01 (e)).
- go get <module>@<version> does not record go.sum lines for packages nothing imports yet; go get the exact packages a run will import under the deps lease, go mod tidy once at the end (Findings of OBS-METRICS-01 (c)).
- Codex's sandbox cannot bind sockets or write the Go build cache in review mode: socket lifecycle tests are run by the controller (Findings of OBS-RUNTIME-01 (f)).
- Docker and nginx: a plain `--tmpfs` (or compose `tmpfs:`) over an image directory is root-owned with that directory's mode, and nginx-unprivileged's envsubst step then logs `not writable` and starts with no server (only the healthcheck shows it); `return <code> '<text>'` takes the MIME type from the URI extension unless the location resets `types { }`; `proxy_intercept_errors on` intercepts every status that has an `error_page` in that location; round-robin state is per worker; a failed ARP lookup is cached; `docker logs` is asynchronous; do not edit a bash script while a run of it is in progress (Findings of OPS-EDGE-01 (e)).
- A drain check must signal a built binary, not `go run` (it does not forward SIGTERM), and must require at least one draining line, otherwise «no ERROR line» holds trivially; image tags built from `COMPOSE_PROJECT_NAME` need `scripts/ci/env.sh` sourced (Findings of OPS-IMAGE-01 (g)).
- Mutation helpers must assert the pattern was found and `cmp` against the backup afterwards (Findings of OPS-IMAGE-01 (h)). jsdom 29 / user-event 14 / React 19 traps of the hook and screen tests: Findings of UI-HOOKS-01 (b); real-browser traps (Vite lazy modules, visually hidden radios, `oklab()` serialisation, screenshots during a 120 ms transition): Findings of UI-SCREEN-01 (e).
- corepack shims are per Node installation: after `nvm install <version>` run `corepack enable pnpm` once. The archived evidence scripts are not relocatable (`RUN-M1-8/evidence/servers.sh` computes the repository root with a depth that held only before archiving; `RUN-M1-6/evidence/edge-smoke.sh` needs every `$HERE/…` file next to it, `problem-check.py` and `stub-upstream.mjs`): copy them into the run folder (as `RUN-M2-0/evidence/servers.sh` and `evidence/browser/` do) and start servers with output redirected to a file, in the background. The ad hoc browser suite for a UI run lives in `docs/state/archive/runs/RUN-M2-0/evidence/browser/` (axe, flows, touch, layout, abort; `run-piece.sh <spec> <project>`, flows on `mobile-chromium` included, durations 17–36 s per piece). Component axe tests use `src/test/axe.ts` (Findings of UI-FIX-01 (b)).
- The Node pin lives in four places and moves together (UI-DEPS-01, 2026-10-22: 24.22.1): the local nvm installation, `frontend/Dockerfile` (build stage tag and digest), the `node-version` literal of the `contract` job in `.github/workflows/ci.yml.disabled`, and the toolchain table above; the root `Dockerfile` of OPS-STACK-01 and `frontend/.node-version` of OPS-CI-02 take the same value. jsdom 30 declares `node ^22.22.2 || ^24.15.0 || >=26`. The archived `edge-smoke.sh` keeps its historical 24.14.1 image pin (archived evidence is read-only; run a copy with the new pin).
- `scripts/ci/t0.sh` selects the frontend stage for any path under `frontend/`, `frontend/Dockerfile` included, and that stage needs `frontend/node_modules`; a worktree without them gets only the shell and dockerfiles stages (Findings of OPS-EDGE-01 (f)).
- Playwright against the stack: `make up`, then `make e2e E2E_ARGS="--project=chromium"` and `--project=mobile-chromium` (about 4 min each), then `E2E_STACK=1 make e2e E2E_ARGS="--project=chromium e2e/stack-disruptive.spec.ts"` (1 min), `make down`. `t2.sh --stage up --stage e2e --stage down` runs them in order and always ends with `down` (`--keep-stack` keeps the stack). Never run two Playwright runs in one checkout at once: each run removes `frontend/test-results` (Findings of OPS-STACK-01 (e)); use `--output <dir>` for a concurrent proving run. `E2E_COMPOSE_OVERRIDE=<file>` layers a second compose file over the helpers' commands (mutation checks).
- Measured in RUN-M2-1 (full table in `docs/verification.md`): web image build 41 s cold, edge smoke 599 checks 2 min 37 s, an edge mutation 1.5–4.5 min per pair, `make coverage-backend` 7 s warm, `make coverage-frontend` 53 s, `make fuzz` 65 s, `make bench` 54 s, `make lint` 47 s, `make up` 17 s, `make smoke-aio` 10 s.
- The edge smoke and its mutations moved to `docs/state/archive/runs/RUN-M2-1/evidence/edge/` (extended; copy them to run: they are not relocatable): `WEB_PORT=4130 bash edge-smoke.sh calculator-web:local`; `mutations.sh <image> "MLC MPB"` runs a subset (one mutation takes about 2.5 min: keep each command to two or three ids).
- `scripts/ci/t1.sh make:<target>` validates the target and then RUNS it: `t1.sh make:up make:e2e make:down` starts the composed stack and the whole Playwright suite. To prove that targets exist use the default `scripts/ci/t2.sh` («all 21 targets present»). Never pipe `source scripts/ci/env.sh | tail`: the pipeline subshell leaves `COMPOSE_PROJECT_NAME` unset and image builds fall back to the tag `:local`, which belongs to the main checkout (Findings of OPS-CI-02 (f)).
- Codex was not available (CLI not installed): check `codex-companion.mjs status` before relying on a background Codex job (Findings of DOC-README-01 (e)). A fresh worktree has no `frontend/node_modules`; `make docs-api`, the app build and the screenshot script need one install under the `deps` lease (Findings of DOC-README-01 (f)).
