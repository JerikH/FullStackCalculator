# Closure of RUN-M2-1 — 2026-10-22

Solo run in the main checkout; applied by the same session (step 12). Run start commit `d54b0f0`.

## Commits
| Member | Commit(s) on main | Summary |
|---|---|---|
| OPS-STACK-01 | 466964a | compose, root Dockerfile, Makefile (21 targets), coverage and benchmark gates, bootstrap, govulncheck pin, `t2.sh --stage`, edge connection limit and probe body limit (U21), the probes' 503 in the contract (U18) |
| OPS-E2E-01 | 5a00a5d | Playwright config and helpers, 11 spec groups plus the disruptive file, `scripts/smoke-aio.sh` |
| (records) | the `docs(state): close RUN-M2-1` commit | `docs/verification.md`, findings, task entries, traceability, context, run folder archived |

## Per member

### OPS-STACK-01
- **current.md:** check `OPS-STACK-01`; 🔎 findings: «Findings of OPS-STACK-01» (a)–(g).
- **tasks/OPS.md — DONE paragraph:** written by the closer from this run.
- **traceability.md rows:** RF-OPS-03, RF-OPS-09, RF-OPS-14 ✅; UC-OPS-02 / RF-OPS-04…06, RF-OPS-08 and UC-OPS-03 / RF-OPS-07 🟡 (gaps in finding (f)); RNF-OPS-01 🟡 (clean clone left to CI); RNF-SEC-04, RNF-PERF-01, RNF-QUAL-01 notes.
- **context:** `context/OPS.md` (architecture as built) and `context/test-environment.md` (stage names, recipe, traps) applied at closure.
- **Spec changes (owner delegation of 2026-10-22):** decision **U35** (benchmark gate reads the median of a case's samples; image tag rule; `t2.sh` stage set).
- Resolved findings: «Findings of OPS-CI-01» (e), «Findings of OPS-EDGE-01» (b), (c), (h), «Findings of OPS-IMAGE-01» (c) → `[resolved: OPS-STACK-01]`.

### OPS-E2E-01
- **current.md:** check `OPS-E2E-01`; 🔎 findings: «Findings of OPS-E2E-01» (a), (b).
- **tasks/OPS.md — DONE paragraph:** written by the closer; the recorded run is in `docs/verification.md`.
- **traceability.md rows:** RF-OPS-10 ✅.
- Resolved findings: «Findings of OPS-EDGE-01» (g), «Findings of UI-FIX-01» (e) → `[resolved: OPS-E2E-01]`.

## Registered follow-ups for other tasks
- `tasks/OPS.md` → entry `OPS-CI-02`: the `e2e` job calls `make up`, `make e2e E2E_ARGS="--project=…"` per project, `E2E_STACK=1 make e2e E2E_ARGS="--project=chromium e2e/stack-disruptive.spec.ts"` last, logs on failure and `make down`; the stage names of `t2.sh --stage` are the pieces; `scripts/ci/t3.sh` is unchanged; `govulncheck` is pinned in `tools/versions.env` (`GOVULNCHECK_VERSION=1.9.0`, `install-tools.sh govulncheck`); promote `edge-smoke.sh`, `mutations.sh`, `stub-upstream.mjs` and `problem-check.py` from `docs/state/archive/runs/RUN-M2-1/evidence/edge/`; run the pieces of «Findings of OPS-STACK-01» (f). 🔎 findings: «Findings of OPS-STACK-01» (f)
- `tasks/DOC.md` → entry `DOC-README-01`: restoring a stopped `api` needs `make up`; the per-address limits see one address behind Docker's userland proxy; figures (coverage, benchmarks, image sizes in three readings, durations) come from `docs/verification.md`, which this entry completes. 🔎 findings: «Findings of OPS-STACK-01» (c)

## Needs from other tasks (blockers discovered)
none.

## Targeted checks (re-run after any merge)
```
pnpm -C frontend run lint:api && go test -race -count=1 ./api/ ./internal/httpapi/   # 1 s + 52 s
python3 -I docs/state/archive/runs/RUN-M2-1/evidence/stack/check-compose.py          # fed by `docker compose config --format json`
bash docs/state/archive/runs/RUN-M2-1/evidence/gates/check-gates.sh                  # 54 cases, 15 mutations, ~25 s
bash docs/state/archive/runs/RUN-M2-1/evidence/tiers/check-tiers.sh                  # 115 checks, seconds
make lint                                                                            # 47 s
make coverage-backend; make coverage-frontend; make fuzz; make bench                 # 7 s; 53 s; 65 s; 54 s
make image-aio && make smoke-aio                                                     # 6 s + 10 s
```

## Tests and CI changes
- New: `frontend/e2e` (11 groups, about 190 tests per project, plus the disruptive file); edge smoke 599 checks with 5 mutations; gate checks (54 + 15 mutations); tier scenarios (115 + 8 mutations). CI definition: none yet (`ci.yml.disabled` unchanged, OPS-CI-02 owns it).

## Notes for the integrator
none (solo run).
