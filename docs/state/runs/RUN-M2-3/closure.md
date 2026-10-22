# Closure of RUN-M2-3 — 2026-10-22

Worker of wave W4 (agent index 2), branch `wf/RUN-M2-3`, started from `9602690`. Documentation only: no product code changed (`git diff --stat 5a00a5d -- backend frontend deploy compose.yaml Dockerfile Makefile scripts tools` is empty).

## Commits
| Member | Commit(s) on wf/RUN-M2-3 | Summary |
|---|---|---|
| (records) | f017faa | `docs(state): RUN-M2-3 spec and plan` (spec with its review log, plan with its review log) |
| DOC-README-01 | 4b08b5f (README, `docs/verification.md`, `docs/api/README.md`, screenshots, ADR 0001 path fix, run folder) | README in the twelve sections of RF-DOC-01, verification record completed, API reference notes, two screenshots |

## Per member

### DOC-README-01
- **current.md:** check `DOC-README-01`; 🔎 findings: «Findings of DOC-ADR-01» (b), «Findings of API-ROUTES-01» (e), «Findings of OPS-EDGE-01» (h), (i), «Findings of OPS-IMAGE-01» (b), (e), «Findings of UI-SCREEN-01» (f), «Findings of OPS-STACK-01» (c), «Findings of DOC-README-01» (a)–(g).
- **tasks/DOC.md — DONE paragraph** (replaces «Open.»):
  `- [x] **DONE 2026-10-22 (run RUN-M2-3, commit 4b08b5f; 🔎 findings: «Findings of DOC-README-01» (a)–(g)).** README.md with the twelve sections of RF-DOC-01 in order: Overview with the two screenshots, Features, Quick start (prerequisites, split stack, all-in-one, local development, the 21 Make targets), Architecture (both topology diagrams), API usage (copyable curl for the seven operations, the catalog, the errors 400/404/405/413/415/422 and the probe, each with a reproducible `X-Request-ID: demo-1`; the 13-code problem catalog), Design decisions (the eight ADRs), Testing & coverage (coverage totals, both benchmark families with budgets per case, durations, the three image-size readings, the test tiers), Configuration (every variable read by the service, the Make targets, Compose, the dev servers and the e2e helpers), Observability, CI/CD (disabled workflow, six jobs, triggers, publish tags, Dependabot), Project layout and Trade-offs & future work (every registered follow-up). docs/verification.md completed (measured revision 5a00a5d, benchmark and coverage tables, a corrected duration, section 6 with this run's checks); docs/api/README.md; docs/assets/calculator-desktop.png (1280 × 800) and calculator-mobile.png (Pixel 7, 1082 × 2279); ADR 0001 lockfile paths corrected. Verified by evidence/check_docs.py (15 rules pass, rule C15 reports the six RUN-M2-2 paths pending), its mutation harness (40/40 caught), run_curl_examples.py (20/20 against a live service, fails on a mutated README), the screenshot script (all assertions, byte-identical on a second run), make docs-api plus check_api_page.mjs, check_adrs.py (0 failures), an independent spec review, plan review and README fact-check; evidence in docs/state/archive/runs/RUN-M2-3/evidence/.`
- **traceability.md rows:** `UC-DOC-01 / RF-DOC-01, RF-DOC-03, RF-DOC-04` ✅ with the merge commit, verified by the commands under «Targeted checks» (statically and against a live service; hosted rendering is left to CI); `RF-DOC-02` unchanged (ADR 0001 path correction only); `RNF-PERF-01` and `RNF-QUAL-01` note: numbers published in README and `docs/verification.md` (revision 5a00a5d); `RF-OPS-08` and `RF-OPS-11` note: documentation side done (the README CI/CD section must be compared with the merged workflow, finding (a)).
- **context/DOC.md additions:** README, `docs/api/README.md`, `docs/assets/`, `docs/verification.md` exist; the README tables (Design decisions, Configuration, Problem catalog, Make targets) are checked against their sources by `check_docs.py` (run it after any change to the contract, config, Makefile, ADR index, `env.sh`, Compose or the edge template); the curl examples are exercised by `run_curl_examples.py`; the screenshots are regenerated with `take_screenshots.mjs`; figures change only with a re-measurement that updates `docs/verification.md` first.
- **context/test-environment.md additions:** the recipe of the documentation checks (below) and the traps of findings (e) and (f).
- **methodology.md:** DOC epic status: ✅ once this run is integrated (all of DOC-ADR-01 and DOC-README-01 done); CALC row note «published benchmark numbers wait for DOC-README-01» can be removed.
- **Spec changes:** none.
- **Resolved findings** (mark `[resolved: DOC-README-01]`): «Findings of DOC-ADR-01» (b); «Findings of API-ROUTES-01» (e); «Findings of OPS-EDGE-01» (i); «Findings of OPS-STACK-01» (c) (both copies, the one in `findings/OPS.md` and the one in the RUN-M2-1 run findings).

## Registered follow-ups for other tasks
- none (the new open item, finding (g), targets `DOC-backlog`).

## Needs from other tasks (blockers discovered)
- none.

## Targeted checks (the integrator re-runs these after merging)
```
git diff --stat 5a00a5d -- backend frontend deploy compose.yaml Dockerfile Makefile scripts tools   # U37: only scripts/ci/** (not env.sh) and tools/versions.env may differ
python3 -B -I docs/state/archive/runs/RUN-M2-3/evidence/check_docs.py --terms-file <term list outside the repository>   # seconds; after the merge rule C15 passes (the six paths exist) once the README spans are links
python3 -B -I docs/state/archive/runs/RUN-M2-3/evidence/check_docs_mutations.py                                          # 7 s, 40/40
python3 -B -I docs/state/archive/runs/RUN-M2-3/evidence/run_curl_examples.py --readme README.md --base http://127.0.0.1:<port>   # service built with `go build ./cmd/calculator`, started with CALC_HTTP_ADDR and CALC_ADMIN_ADDR on your own ports
python3 -B -I docs/state/archive/runs/RUN-M1-3/evidence/check_adrs.py                                                     # 0 failures
make docs-api && git check-ignore -q docs/api/index.html                                                                  # 1 s (needs `pnpm -C frontend install --frozen-lockfile`)
python3 .workflow/scripts/reindex.py --check
```
Screenshots only if the app or the theme changes: `pnpm -C frontend build`, copy `frontend/dist/.` into `backend/internal/web/dist/`, `go build -tags embedui -o <scratch>/calc-embed ./cmd/calculator`, start it with `CALC_HTTP_ADDR=:<port> CALC_ADMIN_ADDR=:<port+2>`, then `cd frontend && node ../docs/state/archive/runs/RUN-M2-3/evidence/take_screenshots.mjs --base http://127.0.0.1:<port> --out ../docs/assets`; remove the copied files from `backend/internal/web/dist` except `.gitkeep`.

## Tests and CI changes
- New evidence scripts only (run folder): `check_docs.py`, `check_docs_mutations.py`, `run_curl_examples.py`, `take_screenshots.mjs`, `check_api_page.mjs`. No test, `scripts/ci/` or workflow change. Left to continuous integration: how the pages render on a hosting service (gate G1), and the clean-clone walk-through of `make bootstrap`.

## Notes for the integrator
- **Merge order:** RUN-M2-2 first, then this branch (disjoint tracked files, either order merges). After both: turn the six plain code spans of the README into links (`.github/dependabot.yml`, `scripts/ci/image-smoke.sh`, `scripts/ci/edge-smoke.sh`, `scripts/ci/edge-stub-smoke.sh`, `scripts/ci/edge-mutations.sh`, `scripts/ci/publish-tags.sh`: lines in «CI/CD»), re-run the checker, add RUN-M2-2's local pieces to `docs/verification.md`, and compare the README «CI/CD» section with the merged `ci.yml.disabled` (finding (a)); the README says «a superseded pull-request run is cancelled», «the jobs use the same Make targets and `scripts/ci` scripts as the local tiers», tags `sha-<full 40-character SHA>`, `main`, `X.Y.Z`, no registry path (finding (b)).
- **Contract received:** bus message #12 (RUN-M2-2: tags and file names) was applied. No contract was provided to anyone.
- **Figures:** copied unchanged from RUN-M2-1 (revision 5a00a5d); one correction: the disruptive Playwright file took 1 min 10 s, not 1 min 2 s (finding (d)). If the merged diff since 5a00a5d leaves `scripts/ci/**` (other than `env.sh`) or `tools/versions.env`, re-measure the affected figure first.
- **Screenshots** were produced from the embedded binary on this agent's ports with the System theme on a light OS; the owner reviews them in `docs/assets/` (they are also in the evidence output `screenshots-output.txt`).
- **Process:** Codex was unavailable (finding (e)); a Claude subagent wrote the checker. The term list used by rule C11 is outside the repository: the integrator re-runs it with the same list from the project instructions.
- **Evidence path:** `docs/verification.md` section 6 cites `docs/state/archive/runs/RUN-M2-3/evidence/`, which exists once the run folder is archived with `git mv`; until then the files are in `docs/state/runs/RUN-M2-3/evidence/`.
- **Final read-only fact-check** (Claude subagent) found 13 items; 10 corrected in the documents (contract-test command, `VERSION`/`COMMIT` fallback, web image health check, hardening wording, tier descriptions, shutdown timeout, Redocly rule set, benchmark wording, layout, enablement wording); the CI/CD prose items depend on RUN-M2-2's merged files (finding (a)).
- **Untracked build output** produced and removed by this run: `frontend/node_modules` (ignored), `backend/internal/web/dist/*` (removed), `docs/api/index.html` (ignored, kept locally).
