# Current state

## Current milestone: M0 — Foundation
## Current run: RUN-M0-1
## Cycle step: 7 (implement)
## Active waves: (none)

## Run groups (order of execution)

Each run chains related tasks executed by one agent, in the order listed.

| Run | Milestone | Members | Status | Parallel | Notes |
|---|---|---|---|---|---|
| **RUN-M0-1** | M0 | OPS-REPO-01, API-CONTRACT-01, UI-BASE-01 | pending | solo | single review; nothing from the owner |
| **RUN-M0-2** | M0 | OPS-ENV-01, OPS-CI-01 | pending | solo | single review; per-agent isolation and tiers that every wave needs |
| **RUN-M1-1** | M1 | CALC-CORE-01, CALC-OPS-01, API-HTTPX-01 | pending | W1 with RUN-M1-2, RUN-M1-3 | backend track; double review on API-HTTPX-01 |
| **RUN-M1-2** | M1 | UI-SCAF-01, UI-CLIENT-01 | pending | W1 with RUN-M1-1, RUN-M1-3 | frontend track; consumes the M0 contract |
| **RUN-M1-3** | M1 | DOC-ADR-01 | pending | W1 with RUN-M1-1, RUN-M1-2 | `docs/adr/` only; Claude subagents (no Codex) |
| **RUN-M1-4** | M1 | OBS-METRICS-01, API-ROUTES-01, OBS-RUNTIME-01 | pending | W2 with RUN-M1-5, RUN-M1-6 | backend track; double review on API-ROUTES-01, OBS-RUNTIME-01 |
| **RUN-M1-5** | M1 | UI-MODEL-01 | pending | W2 with RUN-M1-4, RUN-M1-6 | frontend track; double review |
| **RUN-M1-6** | M1 | OPS-EDGE-01 | pending | W2 with RUN-M1-4, RUN-M1-5 | edge files only; double review; Claude subagents (no Codex) |
| **RUN-M1-7** | M1 | OPS-IMAGE-01 | pending | W3 with RUN-M1-8 | backend delivery |
| **RUN-M1-8** | M1 | UI-HOOKS-01, UI-SCREEN-01 | pending | W3 with RUN-M1-7 | frontend track; double review on UI-HOOKS-01; real-browser check against the service from W2 |

## Milestone checklist

### M0 — Foundation
- [ ] **OPS-REPO-01** — Hygiene files, MIT licence, ADR index and template [BE]
- [ ] **API-CONTRACT-01** — OpenAPI 3.1 contract and Redocly configuration [BE]
- [ ] **UI-BASE-01** — Design baseline: PRODUCT.md, DESIGN.md, measured contrast [FE]
- [ ] **OPS-ENV-01** — Per-agent isolated environment (`scripts/ci/env.sh`) [BE]
- [ ] **OPS-CI-01** — Local test tiers and the disabled GitHub workflow [BE]

### M1 — Working calculator
- [ ] **CALC-CORE-01** — Go module, lint configuration, decimal parsing and formatting [BE]
- [ ] **CALC-OPS-01** — Operation catalog and calculator [BE]
- [ ] **API-HTTPX-01** — HTTP platform: problems, decoding, request context, middleware [BE]
- [ ] **OBS-METRICS-01** — Build info, request-aware logger and metrics [BE]
- [ ] **API-ROUTES-01** — Routes, handlers and contract tests [BE]
- [ ] **OBS-RUNTIME-01** — Configuration, lifecycle, admin listener and entrypoint [BE]
- [ ] **OPS-IMAGE-01** — Embedded web handler and the API image [BE]
- [ ] **UI-SCAF-01** — Frontend scaffold, tooling, tokens and generated types [FE]
- [ ] **UI-CLIENT-01** — Typed, never-throwing API client [FE]
- [ ] **UI-MODEL-01** — Pure calculator model [FE]
- [ ] **UI-HOOKS-01** — Effects, keyboard, delayed busy, persistence and theme hooks [FE]
- [ ] **UI-SCREEN-01** — Calculator screen, history, theme control and app shell [FE]
- [ ] **OPS-EDGE-01** — Web image and nginx edge [BE]
- [ ] **DOC-ADR-01** — Architecture decision records [BE]

### Later milestones
- M2 — Release-ready delivery: 4 tasks (OPS-STACK-01, OPS-E2E-01, OPS-CI-02, DOC-README-01) in RUN-M2-1 (solo) and RUN-M2-2 ∥ RUN-M2-3; see `docs/spec/roadmap.md`, section 0.

## Active blockers
(none)

## Open decision gates
- G1 — when to create the remote, push and enable the workflows; blocks no version 1 task. See `docs/spec/roadmap.md`, section 1.

## Completed milestones
(none yet)

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
