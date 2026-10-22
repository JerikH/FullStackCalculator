# Current state

## Current milestone: M2 — Release-ready delivery
## Current run: (none)
## Cycle step: (none)
## Active waves: (none)

## Run groups (order of execution)

Each run chains related tasks executed by one agent. «Parallel» says which runs can share a wave: RUN-M2-1 runs alone and first (both later runs depend on OPS-E2E-01); RUN-M2-2 and RUN-M2-3 own disjoint files and can share W4 or run back to back in solo mode. Every local command of every run stays under 10 minutes (U22): the task entries name the pieces, the leases and what is left to CI.

| Run | Milestone | Members | Status | Parallel | Notes |
|---|---|---|---|---|---|
| **RUN-M2-1** | M2 | OPS-STACK-01, OPS-E2E-01 | pending | solo — alone in the main checkout, before RUN-M2-2 and RUN-M2-3 | double review on OPS-STACK-01 (edge connection limit, compose surface); the composed stack comes up only in the one recorded `make up` + `make e2e` run of OPS-E2E-01, cut into pieces, and OPS-STACK-01 closes with it; Codex for compose, Dockerfile, Makefile and the edge change, Codex plus Claude subagents (Sonnet 5.5, high) for the specs; owner answers pending on the M2 question batch |
| **RUN-M2-2** | M2 | OPS-CI-02 | pending | W4 with RUN-M2-3 (or back to back in solo mode); not with RUN-M2-1 | double review (CI permissions and publication); owns `.github/`, `scripts/ci/`, `tools/versions.env`, `frontend/.node-version` and, only if the owner allows a pin change, `frontend/package.json` plus its lockfile (a change there makes RUN-M2-3 run after it, not beside it); the local proof never repeats `make up` + `make e2e` |
| **RUN-M2-3** | M2 | DOC-README-01 | pending | W4 with RUN-M2-2 (or back to back in solo mode); not with RUN-M2-1 | single review; owns `README.md`, `docs/verification.md`, `docs/api/README.md`, `docs/assets/`; names RUN-M2-2's new files as plain paths and the integrator links them and re-runs the link check; figures come from RUN-M2-1's evidence while the code is unchanged |

## Milestone checklist

### M2 — Release-ready delivery
- [ ] **OPS-STACK-01** — Compose stack, all-in-one image and developer commands [BE] 🔎 findings: «Findings of OPS-CI-01» (e), «Findings of CALC-OPS-01» (c), «Findings of OPS-EDGE-01» (b), (c), (h), «Findings of OPS-IMAGE-01» (c)
- [ ] **OPS-E2E-01** — Playwright against the composed stack [FE] 🔎 findings: «Findings of OPS-EDGE-01» (b), (c), (g), (h), «Findings of OPS-IMAGE-01» (d), «Findings of UI-SCREEN-01» (b), (e)
- [ ] **OPS-CI-02** — Complete CI definition and Dependabot [BE] 🔎 findings: «Findings of OPS-CI-01» (f), «Findings of UI-SCAF-01» (c), «Findings of OPS-IMAGE-01» (f)
- [ ] **DOC-README-01** — README, verification record, screenshots and API reference notes [BE] 🔎 findings: «Findings of DOC-ADR-01» (b), «Findings of API-ROUTES-01» (e), «Findings of OPS-EDGE-01» (h), (i), «Findings of OPS-IMAGE-01» (b), (e), «Findings of UI-SCREEN-01» (b), (c), (f), «Findings of OBS-LOG-01» (b)

### Later milestones
(none — M2 is the last milestone of version 1)

## Active blockers
(none)

## Pending owner decisions (M2 question batch; defaults apply until answered)
- Tier 2 split (amends RF-OPS-03): default T2 = affected-stage checks; lint, coverage, images, composed stack, E2E and the all-in-one smoke are stages selected with `--stage`.
- «Findings of UI-SCREEN-01» (b) accessible names of AC and xʸ: default accept and pin the deviation (OPS-E2E-01, DOC-README-01); amending adds a UI task before RUN-M2-1.
- «Findings of UI-SCREEN-01» (c) `AbortSignal.any`: default document the minimum browsers (DOC-README-01); the fallback adds a UI task.
- «Findings of OBS-LOG-01» (b) raw `method`: default accept and document (DOC-README-01); truncation or `OTHER` adds a backend task.
- API image size reading for RF-OPS-05: default the layer sum (16.5 MB), published with the compressed and `docker images` readings.
- U13 pins in OPS-CI-02: default no change to `frontend/package.json`.
- W4 as a wave or RUN-M2-2 and RUN-M2-3 back to back.

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
