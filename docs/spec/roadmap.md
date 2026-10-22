# Roadmap — FullStackCalculator

**Date:** 2026-10-22 · Owner decisions are recorded in section 1; the live checklist was `docs/state/current.md`.

> Paths under `docs/state/` mentioned in this file point to process records that are no longer part of the working tree; they remain in the git history.

## 0. Milestones

| Milestone | Goal | Exit criterion | Who can use the product after it |
|---|---|---|---|
| **M0** | Foundation: repository hygiene, the API contract, the design baseline, per-agent environments, local test tiers, the disabled CI definition | `redocly lint` passes on the contract; `PRODUCT.md`/`DESIGN.md` record the tokens with measured contrast; two agent identities get disjoint ports and compose projects; `scripts/ci/t0.sh` runs and reports durations; the disabled workflow passes actionlint | nobody (internal) |
| **M1** | Working calculator: Go service and web app built in two parallel tracks | In a local checkout, `go run ./cmd/calculator` plus the Vite dev server give a calculator on which a visitor completes UC-UI-01…04 in a real browser against the real API; backend and frontend unit and contract tests pass; the API and web images build and start hardened; the eight ADRs exist | developers and reviewers running it locally |
| **M2** | Release-ready delivery: composed stack, all-in-one image, Makefile, E2E, complete CI definition, README | `docker compose up --build --wait` serves the app on `:8080` with healthy containers; `docker run -p 8080:8080 calculator:local` serves the same app; coverage gates and benchmark budget pass; Playwright passes on both projects against the composed stack (one recorded local run); the CI definition is complete and actionlint-clean; the README documents everything with measured numbers | anyone with the repository |

### Milestone contents

`Parallel`: `solo` = runs alone; `any` = may share a wave with any compatible run; `not with <ID>` = must not share a wave with that task.

#### M0 — Foundation
| Task | Track | Epic | Summary | Depends on | Parallel |
|---|---|---|---|---|---|
| OPS-REPO-01 | [BE] | OPS | Hygiene files (`.gitignore`, `.gitattributes`, `.editorconfig`, `.dockerignore`), MIT licence, ADR index and template | — | solo |
| API-CONTRACT-01 | [BE] | API | OpenAPI 3.1 contract `backend/api/openapi.yaml`, its embedding file, `redocly.yaml`; Redocly lint clean | OPS-REPO-01 | solo |
| UI-BASE-01 | [FE] | UI | Design baseline: `PRODUCT.md`, `DESIGN.md` (tokens, key variants, layout, accessibility rules), measured contrast of every text/background token pair in both themes; `context/UI.md` | OPS-REPO-01 | solo |
| OPS-ENV-01 | [BE] | OPS | `scripts/ci/env.sh`: per-agent ports (edge/web, API, admin, Vite), `COMPOSE_PROJECT_NAME`, Go and `bin/` on `PATH`; recipe in `context/test-environment.md` | OPS-REPO-01 | solo |
| OPS-CI-01 | [BE] | OPS | `scripts/ci/t0.sh`…`t3.sh` (package commands now, Makefile targets once they exist); golangci-lint v2 in `bin/`; `.github/workflows/ci.yml.disabled` with the contract job; actionlint | OPS-ENV-01, API-CONTRACT-01 | solo |

#### M1 — Working calculator
| Task | Track | Epic | Summary | Depends on | Parallel |
|---|---|---|---|---|---|
| CALC-CORE-01 | [BE] | CALC | Go module, lint configuration, decimal `Parse`/`Format`, `FuzzParse` | M0 | any |
| CALC-OPS-01 | [BE] | CALC | Operation catalog, `Calculator`, error classification and outcomes, `FuzzCalculate`, `BenchmarkCalculate` | CALC-CORE-01 | any |
| API-HTTPX-01 | [BE] | API | HTTP platform: problem details, strict JSON decoding, request context and IDs, route tagging, middleware (access log, recover, secure headers), method dispatcher | CALC-CORE-01 | any |
| OBS-METRICS-01 | [BE] | OBS | Build info, request-aware slog logger, Prometheus metrics middleware and calculator decorator | API-HTTPX-01, CALC-OPS-01 | any |
| API-ROUTES-01 | [BE] | API | Routes and handlers (catalog, calculate, contract, probes), domain-error mapping, contract tests; contract served with `no-store` | OBS-METRICS-01 | any |
| OBS-RUNTIME-01 | [BE] | OBS | Configuration, application lifecycle and drain, admin listener, handler-chain order, healthcheck subcommand, `cmd/calculator`; creates the API-only `backend/internal/web/noembed.go` that OPS-IMAGE-01 completes | API-ROUTES-01 | any |
| OPS-IMAGE-01 | [BE] | OPS | Embedded web handler (build tag `embedui`) and the hardened API image | OBS-RUNTIME-01 | any |
| OBS-LOG-01 | [BE] | OBS | Access-log levels and field bounds: draining readiness 503 at `info`, `path` and `user_agent` truncated to 256 characters (U19, U20) | OBS-RUNTIME-01 | any |
| UI-SCAF-01 | [FE] | UI | Vite + React 19 strict scaffold, ESLint/Prettier, tokens and global styles, `theme-init.js`, favicon, safe storage, generated API types, Vitest setup with coverage thresholds, dev proxy | M0 | any |
| UI-CLIENT-01 | [FE] | UI | Typed never-throwing API client with timeout, error kinds, problem guard and context injection | UI-SCAF-01 | any |
| UI-MODEL-01 | [FE] | UI | Pure model: types, `KEYPAD` table, entry editing, reducer state machine, display/history selectors, error copy, history codec | UI-CLIENT-01 | any |
| UI-HOOKS-01 | [FE] | UI | `useCalculator` effects with abort and stale guard, keyboard shortcuts, delayed busy, history persistence, theme hook and bootstrap test | UI-MODEL-01 | any |
| UI-SCREEN-01 | [FE] | UI | Display, keypad, history panel, theme toggle, app shell and `main.tsx`; responsive CSS; vitest-axe; real-browser verification against the real API | UI-HOOKS-01, OBS-RUNTIME-01 | not with OBS-RUNTIME-01 |
| OPS-EDGE-01 | [BE] | OPS | Web image and nginx edge: routes, caching, browser policy, gzip, rate limit, request IDs, edge problems, health | UI-SCAF-01 | any |
| DOC-ADR-01 | [BE] | DOC | Eight ADRs and the ADR index | OPS-REPO-01 | any |

Run grouping (each run chains related tasks executed by one agent):

| Run | Members | Wave | Why grouped |
|---|---|---|---|
| RUN-M1-1 | CALC-CORE-01, CALC-OPS-01, API-HTTPX-01 | W1 | backend chain: numeric core → operations → HTTP platform |
| RUN-M1-2 | UI-SCAF-01, UI-CLIENT-01 | W1 | frontend chain: scaffold and generated types → API client |
| RUN-M1-3 | DOC-ADR-01 | W1 | independent documentation (`docs/adr/` only) |
| RUN-M1-4 | OBS-METRICS-01, API-ROUTES-01, OBS-RUNTIME-01 | W2 | backend chain: observability → routes and contract tests → runnable service |
| RUN-M1-5 | UI-MODEL-01 | W2 | frontend pure model (largest frontend specification) |
| RUN-M1-6 | OPS-EDGE-01 | W2 | edge files only (`frontend/Dockerfile`, `deploy/nginx/`) |
| RUN-M1-7 | OPS-IMAGE-01, OBS-LOG-01 | W3 | backend delivery: embedded handler and API image; access-log bounds of the same service |
| RUN-M1-8 | UI-HOOKS-01, UI-SCREEN-01 | W3 | frontend chain: effects and hooks → screens, verified against the service integrated in W2 |

#### M2 — Release-ready delivery
| Task | Track | Epic | Summary | Depends on | Parallel |
|---|---|---|---|---|---|
| UI-FIX-01 | [FE] | UI | Accessible names `AC, all clear` and `xʸ, power` (U28) with the label-in-name axe rule enabled; the API client's combined signal inside its `try` with a fallback for engines without `AbortSignal.any` (U29) | M1 | solo |
| UI-DEPS-01 | [FE] | UI | Dependency pins revisited once (U32): TypeScript 6.x, the jsx-a11y override, jsdom 30 with the Node pin, everything else at latest stable | M1 | solo |
| OBS-LOG-02 | [BE] | OBS | Access-log `method` truncated to 256 characters (U30) | M1 | any |
| OPS-STACK-01 | [BE] | OPS | `compose.yaml`, root all-in-one `Dockerfile`, `Makefile`, `.env.example`, `tools/versions.env`, `scripts/bootstrap.sh`, `scripts/coverage.sh`; tier scripts switched to Makefile targets and `t2.sh --stage` (U27); the edge connection limit (U21) and the probe 503 in the contract (U18) | UI-FIX-01, UI-DEPS-01, OBS-LOG-02 | solo |
| OPS-E2E-01 | [FE] | OPS | Playwright configuration, E2E specs and helpers, `scripts/smoke-aio.sh`; the one recorded local composed-stack run | OPS-STACK-01 | solo |
| OPS-CI-02 | [BE] | OPS | Complete `.github/workflows/ci.yml.disabled` (six jobs, publish gating) and `.github/dependabot.yml` | OPS-E2E-01 | any |
| DOC-README-01 | [BE] | DOC | README in the fixed section order, `docs/verification.md`, screenshots, `docs/api/README.md` | OPS-E2E-01 | any |

Run grouping: RUN-M2-0 = UI-FIX-01, UI-DEPS-01, OBS-LOG-02 (solo, first: every code and dependency change lands before the recorded run); RUN-M2-1 = OPS-STACK-01, OPS-E2E-01 (solo); RUN-M2-2 = OPS-CI-02 and RUN-M2-3 = DOC-README-01 (W4, or back to back in solo mode).

## 1. Decisions

### Decided by the owner
| ID | Date | Decision | Affects |
|---|---|---|---|
| U1 | 2026-10-22 | The development toolchain is installed on the machine before M0: Go 1.27.3 under `$HOME/.local/go` (on `PATH` through `~/.bashrc`), actionlint 1.7.12 and hadolint 2.15.1 under `$HOME/.local/bin`, all checksum-verified; golangci-lint v2 goes into the repository's ignored `bin/`. | OPS-ENV-01, OPS-CI-01, CALC-CORE-01 |
| U2 | 2026-10-22 | Parallel worker sessions start in the `bypassPermissions` permission mode. | M1 and M2 waves |
| U3 | 2026-10-22 | Dependabot is committed active as `.github/dependabot.yml`; GitHub workflows are committed disabled (`*.yml.disabled`) until the owner enables them. | OPS-CI-01, OPS-CI-02 |
| U4 | 2026-10-22 | M1 runs as three parallel waves of up to three runs; the backend and frontend tracks advance side by side; each run chains 1–3 related tasks executed by one agent. | M1 |
| U5 | 2026-10-22 | Design baseline: the product record (web; the anonymous visitor as primary user and the technical reviewer as secondary audience) and the design north star «The Precision Instrument» are confirmed; the two measured contrast failures are fixed by token values — light focus ring `#b45309` (dark stays `#f59e0b`, declared in both dark blocks) and a dedicated display error colour `--color-display-danger` `#ff8a80`. | UI-BASE-01, UI-SCAF-01, UI-SCREEN-01 |
| U6 | 2026-10-22 | shellcheck joins the local tiers and the CI contract job (pinned, checksum-verified, in `bin/`); `tools/versions.env` is created in M0 as the single home of standalone tool pins and OPS-STACK-01 extends it. | OPS-CI-01, OPS-STACK-01 |
| U7 | 2026-10-22 | Wave W1 = RUN-M1-1, RUN-M1-2, RUN-M1-3 as three parallel sessions, launched manually by the owner. | RUN-M1-1, RUN-M1-2, RUN-M1-3 |
| U8 | 2026-10-22 | In W1, `scripts/ci/lib.sh` is split: RUN-M1-2 owns the contract and frontend stages, `tools/versions.env` and `.github/workflows/ci.yml.disabled`; RUN-M1-1 may change only `ci_stage_backend`, and only to fix a defect its first real `t0.sh` run exposes. | CALC-CORE-01, UI-SCAF-01 |
| U9 | 2026-10-22 | Parallel sessions take the `deps` lease for dependency installs and the `heavy` lease for fuzzing, benchmarks and coverage runs; targeted tests take no lease. | M1 waves |
| U10 | 2026-10-22 | The frontend package pins `packageManager` to `pnpm@10.33.0` (the CI pin) and `engines.node` to `>=24`; every other dependency at its latest stable release with the lockfile committed, `@redocly/cli` at 2.69.0. | UI-SCAF-01 |
| U11 | 2026-10-22 | The eight ADRs are committed with status «Accepted» and date 2026-10-22, on the existing template (no author field). | DOC-ADR-01 |
| U12 | 2026-10-22 | The worst-case cost of fractional powers (range-edge operands) is measured by a separate `BenchmarkCalculateWorstCase` with its own budget of < 50,000,000 ns/op per case; the six `BenchmarkCalculate` cases keep < 1,000,000 ns/op; RNF-PERF-01 names both budgets; ADR 0002 stands unchanged; the README and `docs/verification.md` publish both. | API-ROUTES-01 (adds the benchmark in RUN-M1-4), OPS-STACK-01, DOC-README-01 |
| U13 | 2026-10-22 | `typescript` 5.9.3, `jsdom` 29, `@types/node` 24 and the jsx-a11y peer override for ESLint 10 stay as recorded until OPS-CI-02; nobody changes `frontend/package.json` or the lockfile in W2; the web image build stage uses Node 24.14.1, the local and CI pin. | UI-MODEL-01, OPS-EDGE-01, OPS-CI-02 |
| U14 | 2026-10-22 | The edge serves the source maps of the production build as hashed static files under `/assets/` with the immutable cache policy; the build configuration is unchanged. | OPS-EDGE-01 |
| U15 | 2026-10-22 | Wave W2 = RUN-M1-4, RUN-M1-5, RUN-M1-6 as three parallel sessions, launched manually by the owner; Codex in RUN-M1-4 and RUN-M1-5, Claude subagents only in RUN-M1-6. | RUN-M1-4, RUN-M1-5, RUN-M1-6 |
| U16 | 2026-10-22 | A binary operator pressed after a unary result or a history recall issues the pending operation and chains (`9 + 16 √ × 2 =` → add `["9","4"]`, then multiply `["13","2"]`; `9 + [recall 36] × 2 =` likewise); only a value that is itself the stored left operand — right after a binary operator or a chained result — has its pending operator replaced (`2 + × 3 =` → 6). RF-UI-04 is reworded accordingly (asked in RUN-M1-5, «Findings of UI-MODEL-01» (d)). | UI-MODEL-01, UI-HOOKS-01, UI-SCREEN-01 |
| U17 | 2026-10-22 | `instance` keeps the full request path (RF-API-05: it identifies the request; a truncated path would name a different resource). RNF-SEC-02 lists it as a reflected input: JSON-escaped, served as `application/problem+json` with `nosniff` and `default-src 'none'`, bounded by the 16 KiB header limit. No code change («Findings of API-ROUTES-01» (b)). | API-ROUTES-01, RNF-SEC-02 |
| U18 | 2026-10-22 | The contract declares the edge's 503 `SERVICE_UNAVAILABLE` problem on `/healthz` (the `ServiceUnavailable` response) and as an `application/problem+json` `Problem` alternative to the Health JSON 503 of `/readyz`, both described as emitted by the edge proxy when the service is unreachable; the generated types are regenerated and the contract linted in the same change («Findings of OPS-EDGE-01» (b)). | OPS-STACK-01, OPS-E2E-01 |
| U19 | 2026-10-22 | The draining readiness 503 is an expected state and its access line is logged at `info`; every other 5xx stays `error`. The readiness handler sets the level for its response; the access log never matches paths («Findings of OBS-RUNTIME-01» (c)). | OBS-LOG-01 |
| U20 | 2026-10-22 | The access log truncates `path` and `user_agent` to their first 256 characters without splitting a UTF-8 sequence; `remote_addr` stays as RF-OBS-05 lists it — behind the edge it is the edge's address, and abuse diagnosis of a direct client needs it («Findings of OBS-RUNTIME-01» (d)). | OBS-LOG-01 |
| U21 | 2026-10-22 | The edge adds a per-address connection limit: `limit_conn_zone $binary_remote_addr`, 20 concurrent connections on `/api/`, answered with the `RATE_LIMITED` 429 problem; the probes stay without a connection limit but their body limit drops to 16 KiB (no probe body is buffered to `/tmp`); static files stay unlimited; the compose stack caps the web `/tmp` tmpfs at 64 MiB («Findings of OPS-EDGE-01» (h)). | OPS-STACK-01, OPS-E2E-01, DOC-README-01 |
| U22 | 2026-10-22 | Standing rule — 10-minute limit on local verification: every local command (test suite, coverage run, benchmark, image build, Playwright or browser check) finishes in under 10 minutes of wall-clock time; any that could run long is wrapped in `timeout 600`; a check that cannot fit is split into targeted pieces that each fit, or left to CI and recorded in the run's closure with the reason; nobody sits waiting on a running command or on a lease with nothing else to do (work continues in parallel or moves on); a timeout is a finding to fix by narrowing the scope, never a reason to raise the limit or weaken the check. Recipe in `docs/state/context/test-environment.md`. | every run from W3 on |
| U23 | 2026-10-22 | Wave W3 = RUN-M1-7, RUN-M1-8 as two parallel sessions, launched manually by the owner; the worker sessions run on Claude Sonnet 5.5 at high effort; Codex in both runs (two jobs on the machine), Claude implementation subagents alongside. | RUN-M1-7, RUN-M1-8 |
| U24 | 2026-10-22 | The theme bootstrap and the screen under the real browser policy (RNF-SEC-03) are verified in W3 by RUN-M1-8 on the web image built from its own branch (`frontend/Dockerfile`, `heavy` lease) with `API_UPSTREAM` pointing at the service of its worktree: Chromium desktop, System, Light and Dark, initial and error states, zero CSP violations and a clean console. The Vite dev server stays the main real-browser target. | UI-SCREEN-01 |
| U25 | 2026-10-22 | The calculator screen is shaped and built from the approved design baseline (U5) without an owner stop after the shape step; Codex may produce desktop and mobile comps; the owner reviews the screenshots in the run evidence at integration. | UI-SCREEN-01 |
| U26 | 2026-10-22 | In W3, RUN-M1-8 may add frontend devDependencies its tests need, at their latest stable release, under the `deps` lease, with `frontend/pnpm-lock.yaml` committed; the U13 pins (`typescript` 5.9.3, `jsdom` 29, `@types/node` 24, the jsx-a11y peer override) and the `packageManager`/`engines` pins (U10) stay unchanged. | UI-HOOKS-01, UI-SCREEN-01 |
| U27 | 2026-10-22 | Tier 2 of RF-OPS-03 runs the checks of the affected stages in full by default; lint, tests with coverage, images, the composed stack, E2E and the all-in-one smoke are stages selected by name with `t2.sh --stage <name>`, each under 10 minutes, so the default T2 never starts the composed stack (the one local `make up` + `make e2e` run stays in OPS-E2E-01). | OPS-STACK-01, OPS-E2E-01 |
| U28 | 2026-10-22 | The accessible names of the two keys whose visible label is not in their name are amended (RF-UI-01): `AC, all clear` and `xʸ, power`; the axe rule `label-content-name-mismatch` (tagged `wcag21a`, not experimental; corrected in RUN-M2-0) runs in the component and browser checks and reports zero violations (12 keys pass, the 11 single-symbol keys are not applicable); the pinned deviation test goes away («Findings of UI-SCREEN-01» (b)). | UI-FIX-01, OPS-E2E-01 |
| U29 | 2026-10-22 | The API client builds its combined abort signal inside its `try` with a fallback for engines without `AbortSignal.any` or `AbortSignal.timeout`, so an older engine never leaves the display busy; no minimum-browser caveat is documented instead («Findings of UI-SCREEN-01» (c)). | UI-FIX-01 |
| U30 | 2026-10-22 | The access log truncates `method` to its first 256 characters like `path` and `user_agent` (RF-OBS-05 amended); `remote_addr` stays («Findings of OBS-LOG-01» (b)). | OBS-LOG-02 |
| U31 | 2026-10-22 | The reading of «API image under 20 MB» (RF-OPS-05) is the sum of the image layers (16.5 MB measured); the README and `docs/verification.md` publish also the compressed content (5.3 MB) and the `docker images` listing under the containerd store (21.8 MB), each named. | OPS-CI-02, DOC-README-01 |
| U32 | 2026-10-22 | The U13 pins are revisited once, before the recorded run, in UI-DEPS-01: `typescript` 6.x if `openapi-typescript` and `typescript-eslint` accept it, the jsx-a11y peer override dropped if the plugin declares ESLint 10, `jsdom` 30 together with the Node pin if Node 24.15 or later is stable and installable (the Node pin then moves everywhere at once: `frontend/Dockerfile`, the root Dockerfile, the workflow literal, the local installation), every other dependency at its latest stable release (U10); a package that cannot move keeps its pin with the reason recorded. | UI-DEPS-01 |
| U33 | 2026-10-22 | M2 runs as RUN-M2-0 (UI-FIX-01, UI-DEPS-01, OBS-LOG-02; solo, first), RUN-M2-1 (OPS-STACK-01, OPS-E2E-01; solo) and wave W4 = RUN-M2-2 ∥ RUN-M2-3, launched manually by the owner; screenshots are taken at 1280 × 800 and Pixel 7 in the System theme on a light OS showing `1 ÷ 3 =` with the history open, from the embedded binary; Trivy is pinned and run once locally on the API image when it fits in 10 minutes. U27–U33 were decided by the controller under the owner's standing delegation of 2026-10-22 («take the decisions that give the project the most complete result; fix what is cheap instead of accepting debt»). | M2 |
| U34 | 2026-10-22 | The history rows have the same label-in-name defect as the two keys (measured in RUN-M2-0 in a real browser: `Use result 5` against the visible `2 + 3 = 5`): their accessible name becomes `<visible expression>, use result` (RF-UI-10, UC-UI-03 step 3, `PRODUCT.md`, `DESIGN.md`), so the rule of U28 passes with history rows on screen; OPS-E2E-01 queries the new names. Decided by the controller under the standing delegation of 2026-10-22. | UI-FIX-01, OPS-E2E-01 |
| U35 | 2026-10-22 | Controller decisions inside OPS-STACK-01 (owner delegation of 2026-10-22): the benchmark gate reads the median of the samples of each case (a lone slow sample among `-count=3` only warns; the budgets of RNF-PERF-01 are unchanged); local image tags are `local` for the project `fullstackcalculator` and the project name otherwise; `t2.sh --stage` takes the names `lint test coverage-backend coverage-frontend fuzz bench image-api image-web image-aio up e2e e2e-disruptive down smoke-aio docs-api`, runs only those and follows `up` with `down`. | OPS-STACK-01 |
| U36 | 2026-10-22 | Standing rule — build first, verify after (owner instruction, W4 planning): inside a run nobody edits a line and then runs a package of hundreds of tests, over and over. The session implements the complete change first (every file of the member, its tests written, the records drafted); while building it runs at most the cheapest check that unblocks the next edit (a compile, a typecheck, one test file). Only after the build is complete it runs the checks relevant to what changed, once each (the touched package or spec, the task's targeted pieces, the mutation checks the review requires); a failure re-runs only the failing piece and then the relevant pieces once more. Broad suites, coverage, fuzz, benchmark and image pieces run when the task names them as its proof or when something more important requires it (a gate, a shared piece that failed, a mutation proof) — never as a per-edit loop. U22's 10-minute limit still applies to every command. | every run from W4 on |
| U37 | 2026-10-22 | Controller decisions inside W4 (owner delegation of 2026-10-22): `scripts/ci/edge-smoke.sh` is the real-service check (the web image in front of the hardened API image, promoted from `docs/state/archive/waves/W3-evidence/edge-real-service-image.sh`), the path RUN-M2-3 names; the stub-based edge suite of RUN-M2-1 (`edge-smoke.sh`, `mutations.sh`, `stub-upstream.mjs`, `problem-check.py` in `docs/state/archive/runs/RUN-M2-1/evidence/edge/`) is promoted under distinct names (`scripts/ci/edge-stub-smoke.sh`, `scripts/ci/edge-mutations.sh`, and the helper files beside them) so no name collides; the Node pin of `frontend/.node-version` is the Node tag of `frontend/Dockerfile` (24.22.1 after UI-DEPS-01; the 24.14.1 in the OPS-CI-02 scope text predates it); the figures RUN-M2-3 publishes are valid while `git diff --stat 5a00a5d -- backend frontend deploy compose.yaml Dockerfile Makefile scripts tools` is empty, and after the W4 merge a diff confined to `scripts/ci/**` (not `env.sh`) and `tools/versions.env` leaves them valid. | OPS-CI-02, DOC-README-01 |
| U38 | 2026-10-22 | Owner instruction after W4: the method reflected in the 405 problem `detail` is cut to 256 characters like the access log (RNF-SEC-02 reworded: the HTTP token grammar does not bound its length, the 16 KiB header limit is the only other bound); the spec lines that quoted the workflow tool's environment command are reworded to the self-contained `source scripts/ci/env.sh` (UC-OPS-01 step 1). | OBS-LOG-02 (b), DOC-README-01 (g) |

### Adopted for planning (recommended defaults; the owner can override at any task's step 1)
| Topic | Default adopted | Why |
|---|---|---|
| Local ports | Main checkout: edge/web 8080, API 8081, admin 9091, Vite 5173. Worker n: the `wf` port block (base 4100 + 10·n): web = base, API = base+1, admin = base+2, Vite = base+3; `COMPOSE_PROJECT_NAME=fullstackcalculator-<agent>` | Documented defaults stay intact; blocks never collide with them |
| Disabled CI file | `.github/workflows/ci.yml.disabled`, created in M0 with the contract job and completed by OPS-CI-02; enabled by renaming to `ci.yml` | GitHub only runs `.yml`/`.yaml`; the definition stays current with the tier scripts |
| Go version | `go.mod` directive set to the installed Go release (≥ 1.25), no `toolchain` line; build images use the same minor | Latest stable at implementation time |
| Local composed-stack run | One `make up` + `make e2e` during OPS-E2E-01, recorded in `docs/verification.md`; after a fix only the failing spec files are re-run | Long suites belong to CI |
| Benchmark budget | `make bench` saves the raw output under `coverage/` and fails when any `BenchmarkCalculate` case reaches 1,000,000 ns/op or any `BenchmarkCalculateWorstCase` case reaches 50,000,000 ns/op (U12) | Makes RNF-PERF-01 a gate |
| History disclosure | A small breakpoint hook opens history at ≥ 768 px and keeps the user's toggle within a breakpoint | Single semantic list for both layouts |
| Quoted input in details | `unknown field "x"` keeps the submitted field name quoted with `%q` (bounded by the 4 KiB body, JSON-encoded), like the operation name | The decoder detail is part of the specified error copy |
| Repeated JSON keys | Not rejected; the last occurrence wins (standard decoder behavior), pinned by a transport test | Keeps strict decoding without a custom parser |
| Real-browser checks in M1 | UI-SCREEN-01 runs Playwright ad hoc against `go run ./cmd/calculator` + Vite on the agent's ports; the committed E2E suite targets the composed stack in M2 | The service is integrated before W3 |

### Decision gates (each blocks only the tasks it names)
| Gate | Question for the owner | Blocks | Status |
|---|---|---|---|
| G1 | When to create the GitHub remote, push, and enable the workflows (rename `ci.yml.disabled`), which also starts GHCR publication through the gated `publish` job | none of version 1 (hosted CI evidence is added to `docs/verification.md` once enabled) | open |

## 2. Constraints the plan must respect
- Stack: Go ≥ 1.25 stdlib `net/http` (no framework), `cockroachdb/apd/v3`, slog, `prometheus/client_golang`; React 19, TypeScript ≥ 5.9 strict, Vite ≥ 7, pnpm 10 via corepack, Node 24; CSS Modules + custom-property tokens; nginx-unprivileged, distroless, Docker Compose, GitHub Actions. No database.
- Module path `github.com/JerikH/FullStackCalculator/backend`; GHCR references lowercase `ghcr.io/jerikh/fullstackcalculator/{calculator-api,calculator-web,calculator}`; linux/amd64.
- Versions: latest stable at implementation time, lockfiles committed, base images by tag, actions by full SHA, tools in `tools/versions.env`.
- Hosting: local only (`docker compose`, `docker run`); no public hosting. No paid services.
- The owner creates the remote, pushes, enables workflows and publishes images; agents never do.
- No frontend arithmetic; no CORS; no inline scripts or styles; no `any` or non-null `!`; no weakened checks.
- Local verification: short targeted checks; one recorded local composed-stack E2E run; no local command over 10 minutes (U22).
- English everywhere in the repository; exact strings from `srs.md`.

## 3. Version 1 scope
Version 1 is launched when: (1) every requirement of `srs.md` traces to an artifact in `docs/spec/traceability.md`; (2) `docker compose up --build --wait` brings the stack up on `http://localhost:8080` with healthy containers; (3) `docker run -p 8080:8080 calculator:local` serves the same app from one container; (4) every check the CI definition runs passes when its command runs — lint and typecheck, unit tests with the coverage gates, contract checks, E2E against the composed stack, image builds, the vulnerability scan — and the workflow file is complete and actionlint-clean; (5) the README alone explains how to run the project, call the API and why it is built this way; (6) all seven operations run end to end (UI → Go service) in Playwright on desktop Chromium and Pixel 7; (7) measured coverage totals and benchmark numbers are in the README and `docs/verification.md`. Epics: OPS, API, CALC, OBS, UI, DOC — every Must requirement.

## 4. Validation metrics
| Metric | Threshold |
|---|---|
| Backend statement coverage (`./internal/...`) | ≥ 90 % |
| Frontend lines / statements / functions / branches | ≥ 90 / 90 / 90 / 85 % |
| `BenchmarkCalculate` per case (`add`, `divide_repeating`, `sqrt_irrational`, `power_large_integer`, `power_fractional`, `power_overflow`) | < 1,000,000 ns/op |
| `BenchmarkCalculateWorstCase` per case (fractional powers with range-edge operands) | < 50,000,000 ns/op |
| axe violations | 0 |
| Trivy fixable HIGH/CRITICAL | 0 |
| API image size (layer sum, U31) | expected < 20 MB |

## 5. Risks
| Risk | Likelihood | Impact | Mitigation | Owner task |
|---|---|---|---|---|
| apd conditions or formatting differ from the expected behavior (sqrt exactness, underflow, overflow of huge exponents) | M | M | Tests pin observable behavior; classification and pre-checks are fixed, never the expectation tables | CALC-OPS-01 |
| The OpenAPI 3.1 validator rejects valid responses (server URLs, API changes between versions) | M | M | Build requests with the matching host; adapt the call to the installed version, never relax the contract | API-ROUTES-01 |
| `openapi-fetch` behavior for non-JSON error bodies misclassifies errors | M | M | Client tests (Node environment, MSW) pin every error kind; adapt the client, not the tests | UI-CLIENT-01 |
| A late response after AC reuses request number 1 and overwrites the new calculation | M | H | Effect-instance `active` flag plus request-identity guard, with a dedicated regression test | UI-HOOKS-01 |
| jsdom `AbortSignal` is rejected by Node's fetch in tests | H | L | MSW only in Node-environment client tests; hooks and UI use an injected fake | UI-CLIENT-01, UI-HOOKS-01 |
| nginx `add_header` inheritance drops security headers in some locations | M | H | Shared header snippet included in every location; E2E asserts headers on HTML, assets, API and errors | OPS-EDGE-01, OPS-E2E-01 |
| Frontend branch coverage below 85 % | M | M | Table-driven model tests and component tests for every state; no exclusions | UI-MODEL-01, UI-SCREEN-01 |
| Parallel members collide on shared files or ports | L | M | Tracks own disjoint trees (`backend/`, `frontend/src/`, `deploy/`, `docs/adr/`); per-agent ports from `scripts/ci/env.sh`; contract fixed in M0 | OPS-ENV-01 |
| Machine capacity (4 CPUs) saturated by parallel race tests and builds | M | M | Agents run targeted tests only; image builds take the `heavy` lease of the agent coordination tool | OPS-IMAGE-01, OPS-EDGE-01 |
| The single local composed-stack run fails late | M | M | Images and edge are verified in M1; after a fix only the failing specs re-run | OPS-E2E-01 |

## 6. Change log
| Date | Change | Decision |
|---|---|---|
| 2026-10-22 | Initial roadmap | U1–U4 |
| 2026-10-22 | Specification review applied: `noembed.go` handoff, handler-chain order, risk owners | review |
| 2026-10-22 | Owner decision U5 (design baseline and measured token changes) | U5 |
| 2026-10-22 | Owner decision U6 (shellcheck in the tiers; tool pins from M0) | U6 |
| 2026-10-22 | Wave W1 planned (RUN-M1-1, RUN-M1-2, RUN-M1-3); owner decisions U7–U11 | U7–U11 |
| 2026-10-22 | Wave W2 planned (RUN-M1-4, RUN-M1-5, RUN-M1-6); owner decisions U12–U15; worst-case benchmark budget in the adopted defaults and the validation metrics | U12–U15 |
| 2026-10-22 | Wave W2 closed; owner decision U16 (operator chaining after a unary result or a recall, RF-UI-04) | U16 |
| 2026-10-22 | Owner decisions U17–U21 on the W2 backlog items; task OBS-LOG-01 added to RUN-M1-7 | U17–U21 |
| 2026-10-22 | Wave W3 planned (RUN-M1-7, RUN-M1-8); standing 10-minute limit on local verification; owner decisions U22–U26 | U22–U26 |
| 2026-10-22 | Milestone M1 completed (exit criterion checked against the records, `docs/state/history.md`); M2 expanded into `docs/state/current.md` and `docs/state/tasks/` with the pieces of every local command (U22); use cases UC-OPS-02, UC-OPS-03 and UC-DOC-01 completed; backlog items of W3 re-pointed to M2 tasks pending the owner's answers | milestone transition |
| 2026-10-22 | Owner delegation: the controller decides the open M2 items for the most complete result; owner decisions U27–U33; tasks UI-FIX-01, UI-DEPS-01 and OBS-LOG-02 and run RUN-M2-0 added; RF-OPS-03, RF-UI-01 and RF-OBS-05 amended | U27–U33 |
| 2026-10-22 | RUN-M2-0: decision U34 (history row names); U28 wording corrected (the axe rule is not experimental); RF-UI-10 and UC-UI-03 amended | U34 |
| 2026-10-22 | RUN-M2-1: decision U35 (benchmark gate on the median, image tags, `t2.sh` stages); RF-OPS-14 and RNF-PERF-01 read as «the median of a case's samples reaches the budget» | U35 |
| 2026-10-22 | Wave W4 planned (RUN-M2-2, RUN-M2-3); standing rule «build first, verify after» (U36); controller decisions on promoted script names, the Node pin source and the validity of the published figures (U37) | U36, U37 |
| 2026-10-22 | After W4: decision U38 (405 `detail` bound; UC-OPS-01 step 1 reworded; RNF-SEC-02 amended) | U38 |
