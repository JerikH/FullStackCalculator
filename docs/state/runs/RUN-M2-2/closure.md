# Closure of RUN-M2-2 — 2026-10-22

Parallel worker of wave W4 (index 1), branch `wf/RUN-M2-2`, written for the integrator. Run start commit `9602690`. The run's one member is OPS-CI-02; nothing outside `.github/`, `scripts/ci/`, `tools/versions.env`, `frontend/.node-version` and the run folder changed.

## Commits
| Member | Commit(s) on wf/RUN-M2-2 | Summary |
|---|---|---|
| OPS-CI-02 | 994158c | Six-job `ci.yml.disabled`, active `dependabot.yml`, the `t3.sh` stage runner, pinned Trivy, promoted `image-smoke.sh` / `edge-smoke.sh` / `edge-stub-smoke.sh` / `edge-mutations.sh` / `stub-upstream.mjs` / `problem-check.py`, `publish-tags.sh` and its test, `setup-pnpm.sh`, `check-workflow.py`, `frontend/.node-version` |
| OPS-CI-02 | b772db9 | Review fixes: main re-run never moves `main`, release version never overwritten, manifest validation, summaries on failed gates, mobile still runs after a desktop failure, stricter structural check |
| (records) | 1ac6efb, 0b953f3, ccb9f23 (spec, plan), the final `docs(state): RUN-M2-2 closure` commit | spec, plan with review logs, evidence, findings, this closure |

## Per member

### OPS-CI-02
- **current.md:** check `OPS-CI-02`; 🔎 findings: «Findings of OPS-CI-02» (a)–(i). Resolve (`[resolved: OPS-CI-02]`): «Findings of OPS-CI-01» (f), «Findings of OPS-IMAGE-01» (f), «Findings of OPS-STACK-01» (f) (its open pieces moved to «Findings of OPS-CI-02» (i), target OPS-backlog).
- **tasks/OPS.md — DONE paragraph** (replaces «Open.»):
  `- [x] **DONE 2026-10-22 (run RUN-M2-2, commits 994158c, b772db9; 🔎 findings: «Findings of OPS-CI-02» (a)–(i)).** Built: .github/workflows/ci.yml.disabled with the jobs contract, backend, frontend, e2e, images and publish (every step is scripts/ci/t3.sh --job <name> --stage <stage>; Node from frontend/.node-version, pnpm from the packageManager field via scripts/ci/setup-pnpm.sh, Go from backend/go.mod; contents: read at the top, packages: write only in publish; actions pinned to SHAs; uploads with 7/14-day retention and coverage/benchmark/scan totals in the job summary; publish runs only on a push to main or a validated vX.Y.Z tag reachable from main and pushes the tested archives as sha-<SHA>, main and X.Y.Z), .github/dependabot.yml (weekly, minor/patch grouped, six ecosystem/directory pairs), the t3.sh stage runner (t3.sh --list), Trivy 0.76.1 pinned in tools/versions.env and install-tools.sh, scripts/ci/image-smoke.sh, edge-smoke.sh (real service), edge-stub-smoke.sh, edge-mutations.sh, stub-upstream.mjs, problem-check.py, publish-tags.sh (+ test), check-workflow.py (30 rules). Verified locally one piece per command (U22): actionlint clean; check-workflow.py ok and 29 rule mutations caught; action SHAs equal their tags (git ls-remote); publish-tags-test.sh 46 cases and 3 mutations; publish push stage and e2e job through PATH shims (12 and 10 cases, 6 mutations of lib.sh caught); t3 contract 15 s; frontend typecheck/lint/format/audit, coverage 29 s (lines 100 %, statements 99.77 %, functions 99.15 %, branches 100 %) and build; backend modules, static, govulncheck (both build modes), build, coverage 17.7 s (98.11 %), fuzz 63 s, bench 48 s; images: hadolint, compose config, three builds, image-smoke 14/14, edge-smoke 80/80, stub suite 599/599 (83 s), smoke-aio 58/58, export, Trivy on all three archives 0 HIGH/CRITICAL; edge mutation subsets M14, MLC MPB and M2 M8 all caught (84, 167 and 172 s); the empty-dist root Dockerfile mutation fails at the app assertion; default t2.sh reports all 21 Make targets and starts nothing; playwright --list 374 tests in 11 files. Left to the first hosted run (gate G1): the six jobs end to end, publish on main and on tags, GHCR linkage, the owner rulesets (findings (c), (d)). Evidence in docs/state/archive/runs/RUN-M2-2/evidence/.`
- **traceability.md rows:**
  - `| RF-OPS-11 | 🟡 | 994158c, b772db9 | Targeted tests: every job piece run locally one stage per command (checks.md), actionlint, check-workflow.py 30 rules and 29 mutations, e2e job through PATH shims | hosted run of the six jobs waits for G1 |`
  - `| RF-OPS-12 | 🟡 | 994158c, b772db9 | Targeted tests: publish-tags-test.sh 46 cases + 3 mutations, push stage shim test 12 cases + 3 mutations | publish on a real push/tag and GHCR linkage wait for G1 |`
  - `| RF-OPS-13 | 🟡 | 994158c | Targeted tests: dependabot rules of check-workflow.py (set, weekly, groups) and 5 mutations | GitHub's acceptance of the file waits for the remote |`
  - `| RNF-SEC-05 | ✅ | 994158c, b772db9 | Targeted tests: govulncheck clean (default and embedui builds), pnpm audit --prod --audit-level high clean, Trivy fixable HIGH/CRITICAL = 0 on the three images (2026-10-22) | enforced by the jobs backend, frontend, images |`
  - `| RNF-SEC-06 | ✅ | 994158c, b772db9 | Targeted tests: actionlint, check-workflow.py rules (permissions, pins, persist-credentials, no pull_request_target, token only in the push step) and their mutations; two independent security reads | — |`
  - RNF-QUAL-01, RNF-QUAL-02, RNF-PERF-01: add «enforced by the jobs (2026-10-22, pieces run locally)» to the existing rows; RNF-OPS-01 stays 🟡 (clean clone left to the hosted jobs).
- **context/OPS.md additions:** replace the line «Planned (M2): the complete `.github/workflows/ci.yml.disabled`, `.github/dependabot.yml`, `scripts/ci/image-smoke.sh` (OPS-CI-02); README (DOC-README-01)» by: «CI definition (RUN-M2-2): `ci.yml.disabled` (six jobs; each step `scripts/ci/t3.sh --job J --stage S`, stages listed by `t3.sh --list`), `dependabot.yml`, `scripts/ci/{image-smoke,edge-smoke,edge-stub-smoke,edge-mutations}.sh` + `stub-upstream.mjs` + `problem-check.py`, `publish-tags.sh` (+ test), `setup-pnpm.sh`, `check-workflow.py`; Trivy pinned in `tools/versions.env`. Rules as built: «Findings of OPS-CI-02» (a), (e), (g), (h).» Invariants to add: «Every workflow `uses:` is a SHA with a version comment and the file passes `check-workflow.py`; `frontend/.node-version` equals the Node tag of both Dockerfiles (a Dependabot bump of one needs a hand edit of the others); publish tags are computed by `scripts/ci/publish-tags.sh` only; the `scripts/ci/*.sh` and every tracked `*.sh` (evidence under `docs/` included) pass `shellcheck -x` in the `contract/shell` stage.»
- **context/test-environment.md additions:** the stage pieces of the T3 jobs with measured durations (table below), the traps «`t1.sh make:<target>` runs the target» and «never pipe `source scripts/ci/env.sh`» (Findings of OPS-CI-02 (f)), `t3.sh --list`, `EDGE_MUTATIONS="ID …"` for `images/edge-mutations`, the Trivy installation (`scripts/ci/install-tools.sh trivy`, database 129 MB cached in `~/.cache/trivy`), the evidence harnesses of this run (`e2e-shim-test.sh`, `publish-push-shim-test.sh`, `checker-mutations.sh`, `action-shas.sh`).
- **methodology.md:** OPS epic: CI definition delivered; hosted verification left to G1.
- **Spec changes:** none (the publish version tag is `X.Y.Z` without `v`, and a run for an older commit of `main` publishes only `sha-<SHA>`: both inside RF-OPS-12's wording; U37 covers the file names and the Node pin source).

Measured pieces (each one command under `timeout`; `heavy` lease where noted):

| Piece | Result | Time |
|---|---|---|
| `t3.sh --job contract` (all five stages) | pass | 14.9 s |
| `t3.sh --job frontend` typecheck, lint, format, audit | pass | 22.7 s |
| `--stage coverage-frontend --stage build` (heavy) | pass; 100 / 99.77 / 99.15 / 100 % | 33.6 s |
| `--job backend` modules, static, govulncheck, build | pass | 24.8 s |
| `--stage coverage-backend` / `fuzz` / `bench` (heavy) | pass; 98.11 % (782 of 797) / 2 targets / all cases under budget | 17.7 s / 62.9 s / 47.8 s |
| images: dockerfiles / compose-config | pass | 0.3 s / 0.2 s |
| images: build-api / build-web / build-aio (layers cached; cold builds were measured in OPS-STACK-01) | pass | 5.5 s / 2.2 s / 3.6 s |
| smoke-api / smoke-edge / smoke-edge-stub / smoke-aio | 14 / 80 / 599 / 58 checks, 0 failures | 8.9 s / 14.6 s / 83.3 s / 7.6 s |
| export (three archives 5.3 + 25.8 + 5.6 MB gzip, manifest) | pass | 2.3 s |
| scan-api / scan-web / scan-aio (database cached; first download 129 MB in 13 s) | 0 findings, gate pass | 27 s first, then 0.6–1.5 s |
| edge mutation subsets M14 / MLC MPB / M2 M8 (`EDGE_MUTATIONS`) | 1 of 1, 2 of 2, 2 of 2 caught | 84 s / 167 s / 172 s |
| `check-workflow.py` + `checker-mutations.sh` (29) | ok / all caught | 0.1 s / seconds |
| `publish-tags-test.sh`; `publish-push-shim-test.sh`; `e2e-shim-test.sh` | 46; 12; 10 cases pass | < 10 s each |
| default `t2.sh --base main` | all 21 targets present, nothing started | 75 s |
| `playwright test --list` | 374 tests in 11 files | 3 s |

## Registered follow-ups for other tasks
- `tasks/DOC.md` → entry `DOC-README-01`: `- Registered follow-up (from OPS-CI-02): the README CI/CD section states the six jobs, the four triggers, that renaming ci.yml.disabled to ci.yml enables it (no badge, no hosted link), the publish tags (sha-<SHA> always, main on a main push at its tip, X.Y.Z on a vX.Y.Z tag reachable from main, never overwritten) and the image names ghcr.io/<owner>/calculator-api|calculator-web|calculator; that Dependabot reads only .yml workflow files so action pins are updated by hand while the file is disabled; and the owner steps of gate G1 (tag and main rulesets, package linkage). 🔎 findings: «Findings of OPS-CI-02» (a), (d), (e)`
- `tasks/DOC.md` → entry `DOC-README-01` (verification document): add RUN-M2-2's local pieces (table above) to `docs/verification.md` after the merge; the figures it quotes are unchanged (no product file changed: `git diff --stat 5a00a5d -- backend frontend deploy compose.yaml Dockerfile Makefile scripts tools` is confined to `scripts/ci/**` and `tools/versions.env`, plus the new `frontend/.node-version`, U37).

## Needs from other tasks (blockers discovered)
- none. (The Dockerfile `org.opencontainers.image.source` label is a possible change to files owned by OPS-STACK-01's closed work: registered as debt with target OPS-backlog, «Findings of OPS-CI-02» (d).)

## Targeted checks (the integrator re-runs these after merging)
```
PYTHONDONTWRITEBYTECODE=1 python3 -I scripts/ci/check-workflow.py                  # ok: 30 rules
bin/actionlint -shellcheck bin/shellcheck .github/workflows/ci.yml.disabled
scripts/ci/t3.sh --list
scripts/ci/t3.sh --job contract                                                      # about 15 s
bash docs/state/archive/runs/RUN-M2-2/evidence/checker-mutations.sh                  # every mutation CAUGHT
bash docs/state/archive/runs/RUN-M2-2/evidence/e2e-shim-test.sh                      # 10 PASS
bash docs/state/archive/runs/RUN-M2-2/evidence/publish-push-shim-test.sh             # 12 PASS
bash docs/state/archive/runs/RUN-M2-2/evidence/action-shas.sh                        # needs the network
scripts/ci/t2.sh --base <pre-merge main>                                             # default T2: 21 targets, nothing started
git diff --stat 5a00a5d -- backend frontend deploy compose.yaml Dockerfile Makefile scripts tools   # only scripts/ci/** (not env.sh), tools/versions.env, frontend/.node-version
```
Heavy pieces (one per command, `heavy` lease, `timeout 600`): `t3.sh --job backend --stage coverage-backend|fuzz|bench`, `--job frontend --stage coverage-frontend`, and the `images` stages in the order of `t3.sh --list` with `source scripts/ci/env.sh` first and `VERSION`/`COMMIT` exported once.

## Tests and CI changes
- New: `scripts/ci/publish-tags-test.sh` (46 cases), `scripts/ci/check-workflow.py` (30 rules); the stage functions of `lib.sh` (T3 block) and the new `t3.sh` interface; the whole workflow file; `.github/dependabot.yml`; Trivy in `tools/versions.env` and `install-tools.sh`.
- The `contract/shell` stage lints every tracked `*.sh` including evidence scripts under `docs/`: the committed evidence harnesses pass `shellcheck -x`.
- `t0.sh`, `t1.sh`, `t2.sh`, `env.sh`: unchanged (`ci_stage_make` only gained `timeout -k 30`).

## Notes for the integrator
- Contract with RUN-M2-3 (sent once): the four paths (`.github/workflows/ci.yml.disabled`, `.github/dependabot.yml`, `scripts/ci/image-smoke.sh`, `scripts/ci/edge-smoke.sh`) and the publish tags; additional new paths: `scripts/ci/edge-stub-smoke.sh`, `edge-mutations.sh`, `publish-tags.sh`, `check-workflow.py`. After this merge: link them from the README, compare the README's CI/CD section with the merged workflow (job names, triggers, publish tags, «renaming enables it», no badge), run the link checker, and re-run `git diff --stat 5a00a5d …` (U37).
- Merge conflicts: none expected (disjoint tracked files; `wf conflicts --wave W4` was clean at closing).
- Files not in the repository were created or changed on this machine: `bin/.tools/trivy-0.76.1` (shared `bin/`), the Docker images `calculator-*:fullstackcalculator-run-m2-2`, `~/.cache/trivy` (all untracked). One run-time incident: `t1.sh make:up …` started the composed stack and the Playwright suite of this worktree's own project for about a minute (Findings of OPS-CI-02 (f)); it was killed and `make down` removed the containers and network; the image `calculator-api:local` was rebuilt once from identical product sources (a piped `source env.sh`, same finding).
- Semantic interaction to read together: the README's image-size reading (U31), the `e2e` job's commands and the Trivy scope against `ci.yml.disabled` and `lib.sh`; `docs/verification.md` is the place for the table above.
