# Closure of RUN-M0-2 — 2026-10-22

Solo run on `main`; the session applies this closure itself. Every item names its target file.

## Commits
| Member | Commit(s) on main | Summary |
|---|---|---|
| OPS-ENV-01 | 8e0ed90, d9c7685 | `scripts/ci/env.sh`: per-agent ports, compose project and PATH; worktree identity; port-block guard |
| OPS-CI-01 | 02a52d4 | `scripts/ci/lib.sh`, `t0.sh`…`t3.sh`, `install-tools.sh`, `tools/versions.env`, `.github/workflows/ci.yml.disabled` |
| Run records | ff049da, 5dc5574, b4fa9d7 | Spec, reviewed spec and plan, plan review triage |

## Per member

### OPS-ENV-01
- **current.md:** check `OPS-ENV-01`; add 🔎 findings: «Findings of OPS-ENV-01» (a)–(c).
- **tasks/OPS.md — DONE paragraph** (replaces «Open.»):
  `- [x] **DONE 2026-10-22 (run RUN-M0-2, commits 8e0ed90, d9c7685; 🔎 findings: «Findings of OPS-ENV-01» (a)–(c)).** Built `scripts/ci/env.sh` (sourced after `eval "$(.workflow/bin/wf env --export)"`): exports WEB_PORT, CALC_HTTP_ADDR, CALC_ADMIN_ADDR, VITE_PORT, API_PROXY_TARGET, E2E_BASE_URL and COMPOSE_PROJECT_NAME from the agent identity (main 8080/:8081/:9091/5173 and «fullstackcalculator»; worker base b: b…b+3 and «fullstackcalculator-<agent>»), prepends the repository bin/ and $HOME/.local/go/bin once; the worktree's .wf-agent decides worker vs main, so the wf index-0 fallback, a mismatching agent, a port base below 1024 or a block over the main ports are refused; without Go it prints the install instruction and exports nothing (E2); no identity → main defaults with a note (E1). Verified: evidence/check-env.sh, 85 assertions (exact values for main, no identity, two workers, pairwise disjoint ports and project names, eight listeners on all four ports of main and a worker answering side by side, every refusal exporting nothing, strict callers, no leaked helper) and four mutations each caught; shellcheck 0.11.0 clean. The real Vite + Go side-by-side check moves to UI-SCREEN-01. Evidence in docs/state/archive/runs/RUN-M0-2/evidence/check-env.txt.`
- **traceability.md row(s):** replace `| UC-OPS-01 / RF-OPS-02, RF-OPS-03 | ⬜ | — | — | OPS-ENV-01, OPS-CI-01 |` with
  `| UC-OPS-01 | 🟡 | 8e0ed90, d9c7685, 02a52d4 | Targeted tests: check-env.sh (85), check-tiers.sh (133), 8 mutations, real-repository tier runs (2026-10-22) | Steps 1–6 and E1–E6 proven; acceptance «a Vite dev server and a Go service of each identity side by side» waits for both servers (UI-SCREEN-01, Findings of OPS-ENV-01 (b)) |`,
  `| RF-OPS-02 | 🟡 | 8e0ed90, d9c7685 | Targeted tests: check-env.sh, listeners on all four ports of two identities (2026-10-22) | Ports, project names and PATH done; real dev servers side by side in UI-SCREEN-01 |`.
- **context/OPS.md additions:** see «Context additions» below.
- **context/test-environment.md additions:** see below.
- **methodology.md:** OPS stays 🟡; «Done» adds per-agent environment, local tiers, pinned tools and the disabled contract job (RUN-M0-2).
- **Spec changes:** roadmap §1 «Decided by the owner» row U6 and a change-log row (below).

### OPS-CI-01
- **current.md:** check `OPS-CI-01`; add 🔎 findings: «Findings of OPS-CI-01» (a)–(i).
- **tasks/OPS.md — DONE paragraph** (replaces «Open.»; the existing Registered follow-up line from API-CONTRACT-01 stays, now resolved):
  `- [x] **DONE 2026-10-22 (run RUN-M0-2, commit 02a52d4; 🔎 findings: «Findings of OPS-CI-01» (a)–(i)).** Built scripts/ci/lib.sh and t0.sh…t3.sh (each command printed with its duration; first failure stops unless --keep-going; stages contract, workflows, shell, dockerfiles, backend keyed on backend/go.mod with tests extended to dependent packages, frontend keyed on frontend/package.json; t1 validates every target before running; t2 full mode plus the integration step; t3 = the CI jobs), scripts/ci/install-tools.sh (SHA-256 verified before extraction, versioned installs under bin/.tools, links bin/<tool>), tools/versions.env (golangci-lint 2.15.0, actionlint 1.7.12, hadolint 2.15.1, shellcheck 0.11.0, Redocly CLI 2.69.0; U6) and .github/workflows/ci.yml.disabled (contract job; SHA-pinned actions, contents: read, persist-credentials: false, pnpm with its corepack integrity, PR-only cancellation). Redocly runs as pnpm --package=@redocly/cli@2.69.0 dlx redocly lint with telemetry off. Verified: evidence/check-tiers.sh, 133 assertions over 28 scenario groups in a throwaway clone (E3, E4, E5, E6, contract-only change runs Redocly only, every linter's failure fails the tier, Go selection a+b+d+e not c, deleted files, untracked files, renames, spaces and option-like names, pinned tools over PATH copies, make validation runs no recipe), four mutations each caught; the CI contract job's commands pass on the repository (t3 --job contract 6.6 s); install-tools twice idempotent, a wrong pin fails before installing; bin/golangci-lint version 2.15.0; actionlint clean; action SHAs equal their tags; corepack rejects a tampered pnpm hash. Evidence in docs/state/archive/runs/RUN-M0-2/evidence/.`
- **traceability.md row(s):**
  `| RF-OPS-03 | 🟡 | 02a52d4 | Targeted tests: check-tiers.sh (133), 4 mutations, real-repository t0/t1/t2/t3 (2026-10-22) | Tiers built on package commands; Makefile targets wired by OPS-STACK-01; frontend stage first exercised by UI-SCAF-01 |`;
  RF-OPS-11 → `| RF-OPS-11 | 🟡 | 02a52d4 | Targeted tests: actionlint, YAML parse, action SHAs, the contract job's commands run locally (2026-10-22) | contract job only (Redocly lint, actionlint, shellcheck); type drift, docs-api and the other five jobs are OPS-CI-02 |`;
  `RNF-OPS-01, RNF-OPS-02` → split: `| RNF-OPS-01 | ⬜ | — | — | OPS-STACK-01 |` and `| RNF-OPS-02 | 🟡 | 02a52d4 | Measured: t0 4.0 s over the run, t3 --job contract 6.6 s (2026-10-22) | Tiers 0–1 for sessions in place; durations of the Go and frontend stages measured when they exist |`.
- **Spec changes:** U6 (above).

## Registered follow-ups for other tasks
- `tasks/UI.md` → `UI-SCREEN-01`: `- Registered follow-up (from OPS-ENV-01): start the Go service and Vite for this agent and for a second identity's ports at the same time and record both answering (UC-OPS-01 acceptance). 🔎 findings: «Findings of OPS-ENV-01» (b)`
- `tasks/UI.md` → `UI-SCAF-01`: `- Registered follow-up (from OPS-CI-01): pin @redocly/cli 2.69.0 in the frontend lockfile, switch the contract stage of scripts/ci/lib.sh to pnpm -C frontend lint:api (CI contract job installs the frontend first) and drop REDOCLY_CLI_VERSION from tools/versions.env. 🔎 findings: «Findings of OPS-CI-01» (b)`
- `tasks/UI.md` → `UI-SCAF-01`: `- Registered follow-up (from OPS-CI-01): run scripts/ci/t0.sh on the scaffold and fix the frontend stage if needed (typecheck/lint/format:check/test scripts, ESLint --no-warn-ignored, vitest related with no related test, without --passWithNoTests). 🔎 findings: «Findings of OPS-CI-01» (c)`
- `tasks/UI.md` → `UI-SCAF-01`: `- Registered follow-up (from OPS-CI-01): the lint:api and docs:api scripts run Redocly with REDOCLY_TELEMETRY=off and REDOCLY_SUPPRESS_UPDATE_NOTICE=true. 🔎 findings: «Findings of OPS-CI-01» (i)`
- `tasks/CALC.md` → `CALC-CORE-01`: `- Registered follow-up (from OPS-CI-01): backend/.golangci.yml enables the gofumpt and goimports formatters; run scripts/ci/t0.sh on the change (first real backend stage, ./... because go.mod is new). 🔎 findings: «Findings of OPS-CI-01» (d)`
- `tasks/OPS.md` → `OPS-STACK-01`: `- Registered follow-up (from OPS-CI-01): extend tools/versions.env (same layout), make scripts/bootstrap.sh call scripts/ci/install-tools.sh, and wire the integration targets into t2.sh (compose up with a down afterwards) and make:<target> into t1.sh in the commit that adds the Makefile. 🔎 findings: «Findings of OPS-CI-01» (e)`
- `tasks/OPS.md` → `OPS-CI-02`: `- Registered follow-up (from OPS-CI-01): take Node and pnpm versions from frontend/package.json instead of literals; every job calls scripts/ci/t3.sh --job <name>. 🔎 findings: «Findings of OPS-CI-01» (f)`

## Needs from other tasks (blockers discovered)
- none.

## Context additions
- **context/OPS.md «Architecture as built»:** `scripts/ci/env.sh` (per-agent environment), `scripts/ci/lib.sh` + `t0.sh`…`t3.sh` (tiers), `scripts/ci/install-tools.sh` + `tools/versions.env` (pinned tools in `bin/.tools/<tool>-<version>/`), `.github/workflows/ci.yml.disabled` (contract job). **Invariants:** worker isolation is enforced by `env.sh` from the worktree's `.wf-agent`, never by the index alone (Findings of OPS-ENV-01 (a), (c)); tier scripts call pinned tools by versioned path and stages return failures as `✘` rows, never skips (Findings of OPS-CI-01 (a)); every CI job calls `scripts/ci/t3.sh --job <name>`; Redocly runs with telemetry off (Findings of OPS-CI-01 (i)).
- **context/test-environment.md:** toolchain table (golangci-lint 2.15.0 and shellcheck 0.11.0 in `bin/`, installed by `scripts/ci/install-tools.sh`; Redocly through the contract stage); «Environment loading» with the exact exports and the identity rules; tier table with commands and measured durations (t0 over this run 4.0 s, of which shellcheck ~3.9 s; Redocly lint 0.55 s with a warm dlx cache; t3 --job contract 6.6 s; check-tiers.sh ~24 s); recipes: solo runs re-check commits with `t0.sh --base <run start commit>`, the integrator runs `t2.sh --base <pre-merge main>`; traps of Findings of OPS-ENV-01 (c) and OPS-CI-01 (g).

## Spec changes
- `docs/spec/roadmap.md` §1 «Decided by the owner»: `| U6 | 2026-10-22 | shellcheck joins the local tiers and the CI contract job (pinned, checksum-verified, in bin/); tools/versions.env is created in M0 as the single home of standalone tool pins and OPS-STACK-01 extends it. | OPS-CI-01, OPS-STACK-01 |`; §6 change log: `| 2026-10-22 | Owner decision U6 (shellcheck in the tiers; tool pins from M0) | U6 |`.

## Targeted checks (re-run after any change to these files)
```
bin/shellcheck -x scripts/ci/*.sh
bash docs/state/archive/runs/RUN-M0-2/evidence/check-env.sh
bash docs/state/archive/runs/RUN-M0-2/evidence/check-tiers.sh
scripts/ci/install-tools.sh                       # all «already installed»
bin/actionlint -shellcheck bin/shellcheck .github/workflows/ci.yml.disabled
scripts/ci/t3.sh --job contract
```

## Tests and CI changes
- New: `scripts/ci/` tiers, installer and environment; `tools/versions.env`; `.github/workflows/ci.yml.disabled` (contract job), actionlint-clean. Evidence scripts `check-env.sh` and `check-tiers.sh` (run folder) are the regression checks for these scripts.

## Notes for the integrator
- Solo run; nothing to merge. Every later run sources `scripts/ci/env.sh` and runs `scripts/ci/t0.sh` / `t1.sh` (Findings of OPS-CI-01 (g) for the base ref).
