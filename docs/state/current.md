# Current state

## Current milestone: M1 — Working calculator
## Current run: (none)
## Cycle step: (none)
## Active waves: W2 (RUN-M1-4, RUN-M1-5, RUN-M1-6) — plan in `docs/state/waves/W2.md`

## Run groups (order of execution)

Each run chains related tasks executed by one agent, in the order listed.

| Run | Milestone | Members | Status | Parallel | Notes |
|---|---|---|---|---|---|
| **RUN-M0-1** | M0 | OPS-REPO-01, API-CONTRACT-01, UI-BASE-01 | done (2026-10-22, f2b9693, 5d1969f, f2db811, e90d084, 235cc53) | solo | single review; nothing from the owner |
| **RUN-M0-2** | M0 | OPS-ENV-01, OPS-CI-01 | done (2026-10-22, 8e0ed90, d9c7685, 02a52d4) | solo | single review; per-agent isolation and tiers that every wave needs |
| **RUN-M1-1** | M1 | CALC-CORE-01, CALC-OPS-01, API-HTTPX-01 | done (2026-10-22, 5e3ecb5, 29aecc2, 509bc52; W1 merge eb327ca) | W1 with RUN-M1-2, RUN-M1-3 | backend track; double review on API-HTTPX-01 |
| **RUN-M1-2** | M1 | UI-SCAF-01, UI-CLIENT-01 | done (2026-10-22, 9fc0caa, 75d84a1, 24131a9, fbb1984; W1 merge ce02a75) | W1 with RUN-M1-1, RUN-M1-3 | frontend track; consumes the M0 contract |
| **RUN-M1-3** | M1 | DOC-ADR-01 | done (2026-10-22, 8460cea; W1 merge 0f22334) | W1 with RUN-M1-1, RUN-M1-2 | `docs/adr/` only; Claude subagents (no Codex) |
| **RUN-M1-4** | M1 | OBS-METRICS-01, API-ROUTES-01, OBS-RUNTIME-01 | in W2 | W2 with RUN-M1-5, RUN-M1-6 | backend track; double review on API-ROUTES-01, OBS-RUNTIME-01 |
| **RUN-M1-5** | M1 | UI-MODEL-01 | in W2 | W2 with RUN-M1-4, RUN-M1-6 | frontend track; double review |
| **RUN-M1-6** | M1 | OPS-EDGE-01 | in W2 | W2 with RUN-M1-4, RUN-M1-5 | edge files only; double review; Claude subagents (no Codex) |
| **RUN-M1-7** | M1 | OPS-IMAGE-01 | pending | W3 with RUN-M1-8 | backend delivery |
| **RUN-M1-8** | M1 | UI-HOOKS-01, UI-SCREEN-01 | pending | W3 with RUN-M1-7 | frontend track; double review on UI-HOOKS-01; real-browser check against the service from W2 |

## Milestone checklist

### M0 — Foundation
- [x] **OPS-REPO-01** — Hygiene files, MIT licence, ADR index and template [BE] 🔎 findings: «Findings of OPS-REPO-01» (a)
- [x] **API-CONTRACT-01** — OpenAPI 3.1 contract and Redocly configuration [BE] 🔎 findings: «Findings of API-CONTRACT-01» (a)–(d)
- [x] **UI-BASE-01** — Design baseline: PRODUCT.md, DESIGN.md, measured contrast [FE] 🔎 findings: «Findings of UI-BASE-01» (a)–(e)
- [x] **OPS-ENV-01** — Per-agent isolated environment (`scripts/ci/env.sh`) [BE] 🔎 findings: «Findings of OPS-ENV-01» (a)–(c)
- [x] **OPS-CI-01** — Local test tiers and the disabled GitHub workflow [BE] 🔎 findings: «Findings of OPS-CI-01» (a)–(i)

### M1 — Working calculator
- [x] **CALC-CORE-01** — Go module, lint configuration, decimal parsing and formatting [BE] 🔎 findings: «Findings of CALC-CORE-01» (a)–(c)
- [x] **CALC-OPS-01** — Operation catalog and calculator [BE] 🔎 findings: «Findings of CALC-OPS-01» (a)–(e)
- [x] **API-HTTPX-01** — HTTP platform: problems, decoding, request context, middleware [BE] 🔎 findings: «Findings of API-HTTPX-01» (a)–(g)
- [ ] **OBS-METRICS-01** — Build info, request-aware logger and metrics [BE]
- [ ] **API-ROUTES-01** — Routes, handlers and contract tests [BE]
- [ ] **OBS-RUNTIME-01** — Configuration, lifecycle, admin listener and entrypoint [BE]
- [ ] **OPS-IMAGE-01** — Embedded web handler and the API image [BE]
- [x] **UI-SCAF-01** — Frontend scaffold, tooling, tokens and generated types [FE] 🔎 findings: «Findings of UI-SCAF-01» (a)–(g)
- [x] **UI-CLIENT-01** — Typed, never-throwing API client [FE] 🔎 findings: «Findings of UI-CLIENT-01» (a)–(d)
- [ ] **UI-MODEL-01** — Pure calculator model [FE]
- [ ] **UI-HOOKS-01** — Effects, keyboard, delayed busy, persistence and theme hooks [FE]
- [ ] **UI-SCREEN-01** — Calculator screen, history, theme control and app shell [FE]
- [ ] **OPS-EDGE-01** — Web image and nginx edge [BE]
- [x] **DOC-ADR-01** — Architecture decision records [BE] 🔎 findings: «Findings of DOC-ADR-01» (a)–(e)

### Later milestones
- M2 — Release-ready delivery: 4 tasks (OPS-STACK-01, OPS-E2E-01, OPS-CI-02, DOC-README-01) in RUN-M2-1 (solo) and RUN-M2-2 ∥ RUN-M2-3; see `docs/spec/roadmap.md`, section 0.

## Active blockers
(none)

## Open decision gates
- G1 — when to create the remote, push and enable the workflows; blocks no version 1 task. See `docs/spec/roadmap.md`, section 1.

## Completed milestones
- M0 — Foundation: done 2026-10-22 (RUN-M0-1, RUN-M0-2)

## Document map

| What | Where |
|---|---|
| Requirements, use cases, order of work, decisions | `docs/spec/` |
| Full text of each task | `docs/state/tasks/<EPIC>.md` |
| Permanent context per epic; local environment | `docs/state/context/` |
| Open runs; wave plans | `docs/state/runs/`, `docs/state/waves/` |
| Findings by owner and by topic | `docs/state/findings/INDEX.md` |
| What is verified, with which commit | `docs/state/traceability.md` |
| What left this file; closed runs and waves | `docs/state/history.md`, `docs/state/archive/` |
