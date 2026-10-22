# Current state

## Current milestone: M2 — Release-ready delivery
## Current run: (none)
## Cycle step: (none)
## Active waves: (none)

## Run groups (order of execution)

Each run chains related tasks executed by one agent. «Parallel» says which runs can share a wave: RUN-M2-0 runs alone and first, then RUN-M2-1 alone (both later runs depend on OPS-E2E-01); RUN-M2-2 and RUN-M2-3 own disjoint files and can share W4 or run back to back in solo mode. Every local command of every run stays under 10 minutes (U22): the task entries name the pieces, the leases and what is left to CI.

| Run | Milestone | Members | Status | Parallel | Notes |
|---|---|---|---|---|---|
| **RUN-M2-0** | M2 | UI-FIX-01, UI-DEPS-01, OBS-LOG-02 | done (2026-10-22, 9be2b37, 4003b87, 682a2eb, 34c498b) | solo — first, alone in the main checkout (every code and dependency change lands before the recorded run) | single review each; U28–U30 and U32; Codex for the client change and the backend change, Claude subagents (Sonnet 5.5, high) for the name updates across tests; dependency installs under the `deps` lease |
| **RUN-M2-1** | M2 | OPS-STACK-01, OPS-E2E-01 | done (2026-10-22, 466964a, 5a00a5d) | solo — alone in the main checkout, after RUN-M2-0 and before RUN-M2-2 and RUN-M2-3 | double review on OPS-STACK-01 (edge connection limit, compose surface); the composed stack comes up only in the one recorded `make up` + `make e2e` run of OPS-E2E-01, cut into pieces, and OPS-STACK-01 closes with it; Codex for compose, Dockerfile, Makefile and the edge change, Codex plus Claude subagents (Sonnet 5.5, high) for the specs |
| **RUN-M2-2** | M2 | OPS-CI-02 | pending | W4 with RUN-M2-3 (or back to back in solo mode); not with RUN-M2-1 | double review (CI permissions and publication); owns `.github/`, `scripts/ci/`, `tools/versions.env`, `frontend/.node-version` (no change to `frontend/package.json`: UI-DEPS-01 owns the pins); the local proof never repeats `make up` + `make e2e` |
| **RUN-M2-3** | M2 | DOC-README-01 | pending | W4 with RUN-M2-2 (or back to back in solo mode); not with RUN-M2-1 | single review; owns `README.md`, `docs/verification.md`, `docs/api/README.md`, `docs/assets/`; names RUN-M2-2's new files as plain paths and the integrator links them and re-runs the link check; figures come from RUN-M2-1's evidence while the code is unchanged |

## Milestone checklist

### M2 — Release-ready delivery
- [x] **UI-FIX-01** — Accessible names of AC and xʸ, and a client that tolerates older engines [FE] 🔎 findings: «Findings of UI-FIX-01» (a)–(e)
- [x] **UI-DEPS-01** — Dependency pins revisited once [FE] 🔎 findings: «Findings of UI-DEPS-01» (a)–(d)
- [x] **OBS-LOG-02** — Bound the method field of the access log [BE] 🔎 findings: «Findings of OBS-LOG-02» (a), (b)
- [x] **OPS-STACK-01** — Compose stack, all-in-one image and developer commands [BE] 🔎 findings: «Findings of OPS-STACK-01» (a)–(g)
- [x] **OPS-E2E-01** — Playwright against the composed stack [FE] 🔎 findings: «Findings of OPS-E2E-01» (a), (b)
- [ ] **OPS-CI-02** — Complete CI definition and Dependabot [BE] 🔎 findings: «Findings of OPS-CI-01» (f), «Findings of OPS-IMAGE-01» (f)
- [ ] **DOC-README-01** — README, verification record, screenshots and API reference notes [BE] 🔎 findings: «Findings of DOC-ADR-01» (b), «Findings of API-ROUTES-01» (e), «Findings of OPS-EDGE-01» (h), (i), «Findings of OPS-IMAGE-01» (b), (e), «Findings of UI-SCREEN-01» (f)

### Later milestones
(none — M2 is the last milestone of version 1)

## Active blockers
(none)

## Open decision gates
- G1 — when to create the remote, push and enable the workflows; blocks no version 1 task (hosted CI evidence waits for it). See `docs/spec/roadmap.md`, section 1.

## Completed milestones
- M0 — Foundation: done 2026-10-22 (RUN-M0-1, RUN-M0-2)
- M1 — Working calculator: done 2026-10-22 (RUN-M1-1…RUN-M1-8, waves W1–W3); exit criterion checked against the records in `docs/state/history.md`

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
