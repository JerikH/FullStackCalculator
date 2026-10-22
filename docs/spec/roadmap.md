# Roadmap — FullStackCalculator

**Date:** 2026-10-22 · Owner decisions are recorded in section 1; the live checklist is `docs/state/current.md`.

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
| RUN-M1-7 | OPS-IMAGE-01 | W3 | backend delivery: embedded handler and API image |
| RUN-M1-8 | UI-HOOKS-01, UI-SCREEN-01 | W3 | frontend chain: effects and hooks → screens, verified against the service integrated in W2 |

#### M2 — Release-ready delivery
| Task | Track | Epic | Summary | Depends on | Parallel |
|---|---|---|---|---|---|
| OPS-STACK-01 | [BE] | OPS | `compose.yaml`, root all-in-one `Dockerfile`, `Makefile`, `.env.example`, `tools/versions.env`, `scripts/bootstrap.sh`, `scripts/coverage.sh`; tier scripts switched to Makefile targets | M1 | solo |
| OPS-E2E-01 | [FE] | OPS | Playwright configuration, E2E specs and helpers, `scripts/smoke-aio.sh`; the one recorded local composed-stack run | OPS-STACK-01 | solo |
| OPS-CI-02 | [BE] | OPS | Complete `.github/workflows/ci.yml.disabled` (six jobs, publish gating) and `.github/dependabot.yml` | OPS-E2E-01 | any |
| DOC-README-01 | [BE] | DOC | README in the fixed section order, `docs/verification.md`, screenshots, `docs/api/README.md` | OPS-E2E-01 | any |

Run grouping: RUN-M2-1 = OPS-STACK-01, OPS-E2E-01 (solo); RUN-M2-2 = OPS-CI-02 and RUN-M2-3 = DOC-README-01 (W4, or back to back in solo mode).

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

### Adopted for planning (recommended defaults; the owner can override at any task's step 1)
| Topic | Default adopted | Why |
|---|---|---|
| Local ports | Main checkout: edge/web 8080, API 8081, admin 9091, Vite 5173. Worker n: the `wf` port block (base 4100 + 10·n): web = base, API = base+1, admin = base+2, Vite = base+3; `COMPOSE_PROJECT_NAME=fullstackcalculator-<agent>` | Documented defaults stay intact; blocks never collide with them |
| Disabled CI file | `.github/workflows/ci.yml.disabled`, created in M0 with the contract job and completed by OPS-CI-02; enabled by renaming to `ci.yml` | GitHub only runs `.yml`/`.yaml`; the definition stays current with the tier scripts |
| Go version | `go.mod` directive set to the installed Go release (≥ 1.25), no `toolchain` line; build images use the same minor | Latest stable at implementation time |
| Local composed-stack run | One `make up` + `make e2e` during OPS-E2E-01, recorded in `docs/verification.md`; after a fix only the failing spec files are re-run | Long suites belong to CI |
| Benchmark budget | `make bench` saves the raw output under `coverage/` and fails when any case reaches 1,000,000 ns/op | Makes RNF-PERF-01 a gate |
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
- Local verification: short targeted checks; one recorded local composed-stack E2E run.
- English everywhere in the repository; exact strings from `srs.md`.

## 3. Version 1 scope
Version 1 is launched when: (1) every requirement of `srs.md` traces to an artifact in `docs/state/traceability.md`; (2) `docker compose up --build --wait` brings the stack up on `http://localhost:8080` with healthy containers; (3) `docker run -p 8080:8080 calculator:local` serves the same app from one container; (4) every check the CI definition runs passes when its command runs — lint and typecheck, unit tests with the coverage gates, contract checks, E2E against the composed stack, image builds, the vulnerability scan — and the workflow file is complete and actionlint-clean; (5) the README alone explains how to run the project, call the API and why it is built this way; (6) all seven operations run end to end (UI → Go service) in Playwright on desktop Chromium and Pixel 7; (7) measured coverage totals and benchmark numbers are in the README and `docs/verification.md`. Epics: OPS, API, CALC, OBS, UI, DOC — every Must requirement.

## 4. Validation metrics
| Metric | Threshold |
|---|---|
| Backend statement coverage (`./internal/...`) | ≥ 90 % |
| Frontend lines / statements / functions / branches | ≥ 90 / 90 / 90 / 85 % |
| `BenchmarkCalculate` per case (`add`, `divide_repeating`, `sqrt_irrational`, `power_large_integer`, `power_fractional`, `power_overflow`) | < 1,000,000 ns/op |
| axe violations | 0 |
| Trivy fixable HIGH/CRITICAL | 0 |
| API image size | expected < 20 MB |

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
