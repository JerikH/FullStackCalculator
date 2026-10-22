# Closure of RUN-M1-2 — 2026-10-22

Parallel worker of wave W1 on branch `wf/RUN-M1-2`; the integrator applies this closure to the shared state exactly as written. Every item names its target file. Evidence paths below are written as they will be after the run folder moves to `docs/state/archive/runs/RUN-M1-2/`.

## Commits
| Member | Commit(s) on wf/RUN-M1-2 | Summary |
|---|---|---|
| UI-SCAF-01 | 9fc0caa, 75d84a1 | `frontend/` scaffold (package, configs, tokens, theme bootstrap, favicon, placeholder, safeStorage, cx, test setup, generated types); contract stage from the frontend lockfile with a generated-types drift check, frontend stage fixes, `tools/versions.env`, disabled `contract` job |
| UI-CLIENT-01 | 24131a9, fbb1984 | `frontend/src/shared/api/` typed never-throwing client, problem guard, context and provider; contract-field rebuild and stale-body handling after the security review |
| Run records | 6141ded, 5b5906d, 7afd1fe, and the closing `docs(state)` commit | Spec, reviewed spec and plan, plan review triage, findings, closure, evidence |

## Per member

### UI-SCAF-01
- **current.md:** check `UI-SCAF-01`; add 🔎 findings: «Findings of UI-SCAF-01» (a)–(g).
- **tasks/UI.md — DONE paragraph** (replaces «Open.»; the four Registered follow-up lines stay, now resolved):
  `- [x] **DONE 2026-10-22 (run RUN-M1-2, commits 9fc0caa, 75d84a1; 🔎 findings: «Findings of UI-SCAF-01» (a)–(g)).** Built frontend/ as calculator-web (pnpm 10.33.0 with the CI job's corepack integrity, Node ≥ 24, exact versions and lockfile; U10 applied under declared peer and engine constraints, Findings of UI-SCAF-01 (c)): strict TypeScript with the @/ alias, ESLint strictTypeChecked + stylisticTypeChecked + jsx-a11y + react-hooks under ESLint 10 (theme-init.js and the config file linted too), Prettier, Vitest with 90/90/90/85 thresholds, Vite dev server on VITE_PORT (strict port) proxying /api to API_PROXY_TARGET, the package scripts of the scope (lint:api/docs:api with Redocly telemetry off), tokens.css from DESIGN.md in the three blocks (light focus #b45309, dark focus in both dark blocks, display danger in all three), global.css, the blocking external theme-init.js, a 263-byte favicon, the placeholder main.tsx, safeStorage, cx, the test setup and src/shared/api/schema.gen.ts. The contract stage now runs pnpm -C frontend lint:api plus a drift check of the generated types and needs the frontend install; REDOCLY_CLI_VERSION left tools/versions.env; the frontend stage re-checks the whole package for package-wide inputs and records only Vitest's «no affected test files» case as a note. Verified: pnpm test/typecheck/lint/format:check/build green (97 tests), coverage 100 % statements/branches/functions/lines, gen:api twice without diff, contract:types failing on a hand edit and on a generator that exits non-zero, contrast.py --css exit 0 (a mutation removing the dark focus fails), dist/index.html without inline script/style and with /theme-init.js in <head> before the module script, Chromium at 320/393/768/1280 and Pixel 7 against dist/ served with the RNF-SEC-03 headers (theme set before <body> exists for stored light/dark, absent for system/junk/blocked storage, page background per light/dark/system-dark/light-under-dark-OS, no horizontal scroll, no console errors, no CSP violations; 222 checks, and a mutation moving theme-init.js to <body> fails), Vite on 4123 proxying to a stub on 4121 and refusing an occupied port or VITE_PORT=abc, tier harness (43 assertions, 5 lib.sh mutations caught), t0 --base main green, impeccable detect clean. Evidence in docs/state/archive/runs/RUN-M1-2/evidence/.`
- **traceability.md row(s):**
  - replace `| RF-API-10 | ⬜ | — | — | UI-SCAF-01 |` with `| RF-API-10 | ✅ | 9fc0caa, 75d84a1 | Targeted tests: gen:api twice without diff, contract:types drift check in t0/t3 with two failure scenarios (2026-10-22) | Generated types committed; the drift check runs in the contract stage |`;
  - replace `| RF-UI-14 | 🟡 | e90d084, 235cc53 | … |` with `| RF-UI-14 | 🟡 | e90d084, 235cc53, 9fc0caa | Targeted tests: contrast.py DESIGN.md and --css on tokens.css (exit 0, mutation caught); browser token background per theme (2026-10-22) | tokens.css, global.css and favicon done; component styling on the tokens is UI-SCREEN-01 |`;
  - replace `| UC-UI-04 / RF-UI-11 | ⬜ | — | — | UI-SCAF-01, UI-HOOKS-01, UI-SCREEN-01 |` with `| UC-UI-04 / RF-UI-11 | 🟡 | 9fc0caa | Targeted tests: theme-init.test.ts (real file), Chromium + Pixel 7 bootstrap under the RNF-SEC-03 CSP (2026-10-22) | Bootstrap done; useTheme and the radio group are UI-HOOKS-01 and UI-SCREEN-01 |`;
  - replace `| RNF-SEC-03 | ⬜ | — | — | OPS-EDGE-01, OPS-IMAGE-01, UI-SCAF-01, OPS-E2E-01 |` with `| RNF-SEC-03 | 🟡 | 9fc0caa | Targeted tests: check-dist.sh, browser check with the policy header, zero CSP violations (2026-10-22) | App side done (no inline script/style, external theme bootstrap); headers by OPS-IMAGE-01/OPS-EDGE-01, E2E by OPS-E2E-01 |`;
  - replace `| RNF-QUAL-01 | ⬜ | — | — | UI-SCAF-01, OPS-STACK-01 |` with `| RNF-QUAL-01 | 🟡 | 9fc0caa, fbb1984 | Measured: frontend coverage 100/100/100/100 against thresholds 90/90/90/85 (2026-10-22) | Frontend gate in Vitest; backend gate and make coverage are OPS-STACK-01 |`;
  - replace `| RNF-QUAL-02 | ⬜ | — | — | CALC-CORE-01, UI-SCAF-01 |` with `| RNF-QUAL-02 | 🟡 | 9fc0caa | Targeted tests: pnpm lint/typecheck/format:check zero warnings; jsx-a11y fixture under ESLint 10 (2026-10-22) | Frontend static checks done; backend side is CALC-CORE-01 |`;
  - RF-OPS-03 row: append to its notes `; frontend stage exercised and fixed by UI-SCAF-01 (75d84a1, check-tiers-frontend.sh)` and add `75d84a1` to its commits;
  - RF-OPS-11 row: notes become `contract job (Redocly lint from the frontend lockfile, generated-types drift, actionlint, shellcheck); docs-api and the other five jobs are OPS-CI-02`, commits `02a52d4, 75d84a1`.
- **context/UI.md additions:** «Architecture as built»: replace `(nothing yet)` with: `frontend/` package calculator-web (Findings of UI-SCAF-01 (a)); `src/shared/styles/{tokens,global}.css`, `src/shared/storage/safeStorage.ts`, `src/shared/ui/cx.ts`, `public/theme-init.js`, `src/shared/api/` (client, Findings of UI-CLIENT-01 (a)), `src/test/setup.ts` (matchMedia stub; vitest-axe typing in `src/test/vitest-axe.d.ts`); `src/main.tsx` is a placeholder until UI-SCREEN-01. Invariants add: «Package-wide frontend inputs re-check the whole package in the tiers (Findings of UI-SCAF-01 (b))»; «`@playwright/test` 1.64.1 runs Chromium build 1248 (Findings of UI-SCAF-01 (e))».
- **context/test-environment.md additions:** toolchain row «Redocly CLI» becomes `contract stage: pnpm -C frontend run lint:api (version from frontend/pnpm-lock.yaml, telemetry off) | 2.69.0`; add rows `Frontend packages | pnpm -C frontend install --frozen-lockfile (deps lease) | see frontend/package.json` and `Playwright (frontend) | @playwright/test 1.64.1, Chromium 1248 installed by pnpm -C frontend exec playwright install chromium | 1.64.1`; «Services» Vite row: `pnpm -C frontend dev` (strict port VITE_PORT, proxy to API_PROXY_TARGET); tier table: `t0 --base main` over RUN-M1-2 measured 19.7 s (contract 2.1 s, frontend typecheck 3.0 s, lint 7.5 s, format 1.2 s, tests 4.6 s); known traps: add Findings of UI-SCAF-01 (d) and (e) (Vitest related / no-passWithNoTests messages, jsdom matchMedia, msw onUnhandledFrame and the streaming crash, Playwright browser build) and remove the dlx Redocly trap line's «until UI-SCAF-01» wording (keep it as history of API-CONTRACT-01 (c)).
- **context/API.md:** «Architecture as built» contract line: lint is `pnpm -C frontend run lint:api` (Redocly pinned by the frontend lockfile); generated TypeScript types in `frontend/src/shared/api/schema.gen.ts`, drift checked by the contract stage.
- **methodology.md:** UI stays 🟡; «Done» adds the scaffold, tokens, theme bootstrap and the typed API client (RUN-M1-2).
- **Spec changes:** none.

### UI-CLIENT-01
- **current.md:** check `UI-CLIENT-01`; add 🔎 findings: «Findings of UI-CLIENT-01» (a)–(d).
- **tasks/UI.md — DONE paragraph** (replaces «Open.»; its Registered follow-up line stays, now resolved):
  `- [x] **DONE 2026-10-22 (run RUN-M1-2, commits 24131a9, fbb1984; 🔎 findings: «Findings of UI-CLIENT-01» (a)–(d)).** Built frontend/src/shared/api/: types from the generated schema, PROBLEM_CODES (compile-time two-way check against the contract enum), isProblem (every required Problem field, a known code, integer status 400–599, instance and errors checked when present), createCalculatorApi on openapi-fetch with a late-bound fetch, an always-present 8 s timeout combined with the caller signal, results rebuilt from the contract fields with Decimal checks, problem only when the body status equals the HTTP status (detail and requestId copied as given), first-aborting-signal classification (timeout vs aborted, stale bodies never ok), unparsable 2xx → unexpected(status) by error name, everything else network; never rejects. resolveBaseUrl (empty VITE_API_BASE_URL → page origin), CalculatorApiContext, useCalculatorApi, CalculatorApiProvider, index. Verified: 84 tests in src/shared/api — client and guard in the Node environment with MSW 3 (success, all 13 codes, malformed problems, status mismatch, HTML/JSON non-problems, wrong-shape/other-operation/non-Decimal/empty/204/unparsable 2xx, foreign-realm parse error, network, non-Error rejection, synchronous throw, timeout with and without a caller signal, stalled body, abort in flight/before the call/after the body, both abort orders, frozen operands, base URL), provider and hook in jsdom; 9 source mutations and 2 compile-time mutations of PROBLEM_CODES each caught; typecheck, lint, Prettier green; coverage 100 %. Independent security review: no P0–P2 (Findings of UI-CLIENT-01 (d)). Evidence in docs/state/archive/runs/RUN-M1-2/evidence/client-mutations.txt.`
- **traceability.md row(s):** replace `| UC-UI-01 / RF-UI-01, … RF-UI-13 | ⬜ | — | — | UI-CLIENT-01, UI-MODEL-01, UI-HOOKS-01, UI-SCREEN-01 |` with the same row at `🟡 | 24131a9, fbb1984 | Targeted tests: src/shared/api (84 tests), 11 mutations (2026-10-22) | RF-UI-09 client done (single instance wired by UI-SCREEN-01); model, hooks and screen pending |`.
- **context/UI.md additions:** invariant «The API client never rejects; only `CalculatorApiProvider` supplies it; hook and component tests inject a fake; only `src/shared/api` tests use MSW, in the Node environment with `onUnhandledFrame: 'error'` (Findings of UI-CLIENT-01 (a), UI-SCAF-01 (e))».
- **context/test-environment.md additions:** none beyond UI-SCAF-01's.
- **methodology.md:** covered by UI-SCAF-01's line.
- **Spec changes:** none.

## Resolved findings of earlier tasks (edit the existing items in findings/*.md)
- `findings/UI.md` «Findings of UI-BASE-01» (a): `[target: UI-SCAF-01]` → `[resolved: UI-SCAF-01]`.
- `findings/OPS.md` «Findings of OPS-CI-01» (b), (c), (i): `[target: UI-SCAF-01]` → `[resolved: UI-SCAF-01]`.
- `findings/API.md` «Findings of API-CONTRACT-01» (b): `[target: UI-CLIENT-01, OPS-EDGE-01]` → `[target: OPS-EDGE-01]` (the client side is done: isProblem requires detail and requestId and the problem result copies them; the edge side stays open).

## Registered follow-ups for other tasks
- `tasks/UI.md` → `UI-MODEL-01`: `- Registered follow-up (from UI-CLIENT-01): the error copy treats an empty requestId as unavailable (no bare «Ref: ») and the screen renders requestId only as text; title and detail are never shown. 🔎 findings: «Findings of UI-CLIENT-01» (b)`
- `tasks/UI.md` → `UI-SCREEN-01`: `- Registered follow-up (from UI-CLIENT-01): the real main.tsx creates the client once with resolveBaseUrl(import.meta.env.VITE_API_BASE_URL, window.location.origin) and wraps the app in CalculatorApiProvider. 🔎 findings: «Findings of UI-CLIENT-01» (c)`
- `tasks/OPS.md` → `OPS-CI-02`: `- Registered follow-up (from UI-SCAF-01): when the Node version comes from the frontend package and reaches 24.15 or later, take jsdom 30.x; revisit typescript 6.x once openapi-typescript and typescript-eslint accept it, and drop the jsx-a11y peer override once the plugin declares ESLint 10. 🔎 findings: «Findings of UI-SCAF-01» (c)`

## Needs from other tasks (blockers discovered)
- none.

## Targeted checks (the integrator re-runs these after merging)
```
pnpm -C frontend install --frozen-lockfile
pnpm -C frontend test && pnpm -C frontend typecheck && pnpm -C frontend lint && pnpm -C frontend format:check && pnpm -C frontend build
pnpm -C frontend gen:api && git diff --exit-code -- frontend/src/shared/api/schema.gen.ts
python3 docs/state/archive/runs/RUN-M0-1/evidence/contrast.py DESIGN.md --css frontend/src/shared/styles/tokens.css
scripts/ci/t3.sh --job contract && scripts/ci/t3.sh --job frontend
bash docs/state/archive/runs/RUN-M1-2/evidence/check-dist.sh
bash docs/state/archive/runs/RUN-M1-2/evidence/check-tiers-frontend.sh
grep -rn REDOCLY_CLI_VERSION scripts tools .github          # no output
```

## Tests and CI changes
- New Vitest suites: `src/shared/storage/safeStorage.test.ts`, `src/shared/ui/cx.test.ts`, `src/shared/theme-init.test.ts`, `src/shared/api/{problem,calculatorApi}.test.ts`, `src/shared/api/CalculatorApiProvider.test.tsx` (97 tests).
- `scripts/ci/lib.sh`: `ci_is_contract_input`, `ci_is_contract_any`, `ci_is_frontend_global`, `ci_frontend_related`; `ci_stage_contract` (frontend lint:api, contract:types, install check), `ci_stage_frontend` (package-wide re-check, related tests with `--no-passWithNoTests`, `frontend:build` in full mode), `ci_partition` (contract inputs). `ci_stage_backend` untouched.
- `tools/versions.env`: `REDOCLY_CLI_VERSION` removed. `.github/workflows/ci.yml.disabled`: the `contract` job runs `pnpm -C frontend install --frozen-lockfile` before `t3.sh --job contract` (actionlint clean).

## Notes for the integrator
- Merge order per the wave plan: this branch last. Expected textual overlap: `scripts/ci/lib.sh` only if RUN-M1-1 changed `ci_stage_backend`; this branch's hunks start four lines after that function (`wf conflicts --wave W1`: clean on 2026-10-22). After merging, `t0.sh`/`t2.sh` need `pnpm -C frontend install --frozen-lockfile` before the contract stage (the stage fails with that message otherwise).
- Contracts: `PROBLEM_CODES` (`frontend/src/shared/api/problem.ts`) equals the contract's `ProblemCode` enum in contract order — compare with `httpx.Codes()` of RUN-M1-1. RUN-M1-1 was told about the contract-stage switch (bus, `contract` message).
- The old RUN-M0-2 harness `docs/state/archive/runs/RUN-M0-2/evidence/check-tiers.sh` asserts the dlx Redocly command line and is now stale by design; `check-tiers-frontend.sh` covers the new stage.
- The client has run only against MSW and injected fetches: no Go service exists on this branch. The first real-API proof is UI-SCREEN-01's browser check against `go run ./cmd/calculator`.
- Owner decision U10: four packages are not at their absolute latest for the reasons in Findings of UI-SCAF-01 (c); the owner may want to confirm.
