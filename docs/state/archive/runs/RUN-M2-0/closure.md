# Closure of RUN-M2-0 — 2026-10-22

Solo run in the main checkout; applied by the same session (step 12). Run start commit `31b3443`.

## Commits
| Member | Commit(s) on main | Summary |
|---|---|---|
| (run folder) | 51d8ddc, then the amendment commits `docs(state): RUN-M2-0 spec review applied` and `docs(state): RUN-M2-0 plan and spec amendments` | spec, plan, reviews |
| OBS-LOG-02 | 9be2b37 | access-log `method` bounded to 256 characters, test, mutation and live proof |
| UI-DEPS-01 | 4003b87, 682a2eb | `@redocly/cli` 2.70.0; `jsdom` 30.1.3 with Node 24.22.1 in the web image, workflow literal and records |
| UI-FIX-01 | 34c498b | `AC, all clear` / `xʸ, power`, history rows named `<expression>, use result` (U34), axe wrapper that really runs the rule, tolerant client signal |

## Per member

### UI-FIX-01
- **current.md:** check `UI-FIX-01`; 🔎 findings: «Findings of UI-FIX-01» (a)–(e).
- **tasks/UI.md — DONE paragraph** (replaces «Open.»): written by the closer from this run (names, rows, axe wrapper, client helper, evidence list in `archive/runs/RUN-M2-0/evidence/`).
- **traceability.md rows:** UC-UI-01 / RF-UI-01…, UC-UI-03 / RF-UI-10, RNF-A11Y-01 (note: the deviation is gone), RNF-REL-01 (client part).
- **context/UI.md additions:** applied in 34c498b (label in name holds; axe wrapper). **context/test-environment.md:** trap bullets (corepack per Node installation; archived scripts not relocatable) — applied at closure.
- **Spec changes (applied in 34c498b, owner delegation of 2026-10-22):** RF-UI-10 (accessible name of a history row), UC-UI-03 step 3, `PRODUCT.md` binding copy, `DESIGN.md`, `.impeccable/`; roadmap decision **U34** added and the wording of **U28** corrected (the axe rule is not experimental).
- Resolved findings: «Findings of UI-SCREEN-01» (b), (c) → `[resolved: UI-FIX-01]`.

### UI-DEPS-01
- **current.md:** check `UI-DEPS-01`; 🔎 findings: «Findings of UI-DEPS-01» (a)–(d).
- **tasks/UI.md — DONE paragraph:** written by the closer.
- **traceability.md rows:** RNF-QUAL-02 (commits and verification), RNF-OPS-01 stays ⬜ (OPS-STACK-01).
- **context:** `test-environment.md` and `OPS.md` applied in 682a2eb.
- Resolved findings: «Findings of UI-SCAF-01» (c) → `[resolved: UI-DEPS-01]` (what could not move is recorded in «Findings of UI-DEPS-01» (b)).

### OBS-LOG-02
- **current.md:** check `OBS-LOG-02`; 🔎 findings: «Findings of OBS-LOG-02» (a), (b).
- **tasks/OBS.md — DONE paragraph:** written by the closer.
- **traceability.md rows:** RF-OBS-05 (note: all three fields bounded), RNF-SEC-02 (note: the 405 detail finding).
- **context/OBS.md:** applied in 9be2b37.
- Resolved findings: «Findings of OBS-LOG-01» (b) → `[resolved: OBS-LOG-02]`.

## Registered follow-ups for other tasks
- `tasks/OPS.md` → entry `OPS-E2E-01`: query the names `AC, all clear`, `xʸ, power` and `<expression>, use result`; run the history recall flow on `mobile-chromium` with focus moved off the History summary. 🔎 findings: «Findings of UI-FIX-01» (e)
- `tasks/OPS.md` → entry `OPS-STACK-01`: the root `Dockerfile` takes the Node pin 24.22.1 (`node:24.22.1-alpine3.24@sha256:06d7adf3e0ef61a13f1d28682726366f97a15aa1888c934d3ecec86c33918b53`, same as `frontend/Dockerfile`). 🔎 findings: «Findings of UI-DEPS-01» (a)
- `tasks/OPS.md` → entry `OPS-CI-02`: `frontend/.node-version` and the `contract` job literal use 24.22.1 (jsdom 30 needs `^24.15.0`). 🔎 findings: «Findings of UI-DEPS-01» (a)

## Needs from other tasks (blockers discovered)
none. Open debt discovered: «Findings of OBS-LOG-02» (b) → `OBS-backlog` (question for the owner: bound the 405 `detail`, or correct the RNF-SEC-02 sentence).

## Targeted checks (re-run after any merge; durations measured in this run)
```
cd backend && go test -race -count=1 -cover ./internal/platform/httpx/ ./internal/httpapi/ ./internal/app/      # 27 s
pnpm -C frontend typecheck && pnpm -C frontend lint && pnpm -C frontend format:check && pnpm -C frontend test    # 6 s, 15 s, 3 s, 35 s
pnpm -C frontend exec vitest run src/shared/api                                                                  # seconds
python3 -B docs/state/archive/runs/RUN-M2-0/evidence/mutations-client.py        # 9 mutations, ~35 s
python3 -B docs/state/archive/runs/RUN-M2-0/evidence/mutations-names.py         # 3 mutations, ~20 s
scripts/ci/t0.sh --base HEAD                                                                                     # 58 s
```

## Tests and CI changes
- New: `TestAccessLogBoundsMethod`; `frontend/src/test/axe.ts` (+ `axe.test.ts`), keypad and history name tests, client compatibility tests (103 in `src/shared/api`; 1309 → 1342 frontend tests in total); every component axe test uses the wrapper. CI definition: the `node-version` literal in `.github/workflows/ci.yml.disabled` is 24.22.1 (actionlint clean); no new job or script.

## Notes for the integrator
none (solo run).
