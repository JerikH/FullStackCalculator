# Traceability matrix

Per requirement and use case: is it covered, by which commits, and with what evidence. Rows are never deleted.

**Status:** ✅ complete chain verified · 🟡 exists with a gap (in Notes) · ⬜ no evidence · 🔴 blocked. **Verified:** Live (date) · Targeted tests (list) · Integrated (wave, tier 2) · Code (file:line only).

## Summary

| | ✅ | 🟡 | ⬜ | 🔴 | Total |
|---|---|---|---|---|---|
| **UC** | 0 | 3 | 8 | 0 | 11 |
| **RF** | 3 | 24 | 36 | 0 | 63 |

## OPS — Repository, environments and delivery

| ID | Status | Commit(s) | Verified | Notes |
|---|---|---|---|---|
| UC-OPS-01 | 🟡 | 8e0ed90, d9c7685, 02a52d4 | Targeted tests: check-env.sh (85), check-tiers.sh (133), 8 mutations, real-repository tier runs (2026-10-22) | Steps 1–6 and E1–E6 proven; acceptance «a Vite dev server and a Go service of each identity side by side» waits for both servers (UI-SCREEN-01, Findings of OPS-ENV-01 (b)) |
| RF-OPS-02 | 🟡 | 8e0ed90, d9c7685 | Targeted tests: check-env.sh, listeners on all four ports of two identities (2026-10-22) | Ports, project names and PATH done; real dev servers side by side in UI-SCREEN-01 |
| RF-OPS-03 | 🟡 | 02a52d4, 75d84a1 (merge ce02a75) | Targeted tests: check-tiers.sh (133), 4 mutations, real-repository t0/t1/t2/t3 (2026-10-22); Integrated (W1, T2 31.7 s, 2026-10-22) | Tiers built on package commands; Makefile targets wired by OPS-STACK-01; frontend stage exercised and fixed by UI-SCAF-01 (75d84a1, check-tiers-frontend.sh); backend stage first real run by CALC-CORE-01 (no change needed) |
| UC-OPS-02 / RF-OPS-04, RF-OPS-05, RF-OPS-06, RF-OPS-08 | ⬜ | — | — | OPS-EDGE-01, OPS-IMAGE-01, OPS-STACK-01 |
| UC-OPS-03 / RF-OPS-07 | ⬜ | — | — | OPS-IMAGE-01 (handler), OPS-STACK-01 |
| RF-OPS-01 | ✅ | f2b9693 | Targeted tests: git check-ignore (15 ignored, 2 kept), licence text diff (2026-10-22) | — |
| RF-OPS-09 | ⬜ | — | — | OPS-STACK-01 |
| RF-OPS-10 | ⬜ | — | — | OPS-E2E-01 |
| RF-OPS-11 | 🟡 | 02a52d4, 75d84a1 (merge ce02a75) | Targeted tests: actionlint, YAML parse, action SHAs, the contract job's commands run locally (2026-10-22); Integrated (W1, t3 --job contract 8.6 s, 2026-10-22) | contract job (Redocly lint from the frontend lockfile, generated-types drift, actionlint, shellcheck); docs-api and the other five jobs are OPS-CI-02 |
| RF-OPS-12 | ⬜ | — | — | OPS-CI-02 |
| RF-OPS-13 | ⬜ | — | — | OPS-CI-02 |
| RF-OPS-14 | ⬜ | — | — | CALC-CORE-01, CALC-OPS-01 (tests), OPS-STACK-01 (targets) |

## API — HTTP API and contract

| ID | Status | Commit(s) | Verified | Notes |
|---|---|---|---|---|
| UC-API-01 / RF-API-01, RF-API-02, RF-API-07, RF-API-08, RF-CALC-01 | ⬜ | — | — | API-CONTRACT-01, API-HTTPX-01, API-ROUTES-01; contract, httpx and catalog parts done (W1), the use case runs through the routes of API-ROUTES-01 |
| UC-API-02 / RF-API-03, RF-API-04, RF-API-05, RF-API-06, RF-API-11, RF-API-12, RF-CALC-02…RF-CALC-10 | ⬜ | — | — | API-HTTPX-01, API-ROUTES-01, OBS-RUNTIME-01, CALC-*; engine and httpx parts done (W1), the use case runs through the routes of API-ROUTES-01 |
| RF-API-01 | 🟡 | 5d1969f, f2db811 | Targeted tests: Redocly lint 2.69.0, contract shape check with mutations, Go embed (2026-10-22); `go build ./api/` with the real module (W1, 2026-10-22) | Document, components, Redocly configuration and api.Spec done; serving it at GET /api/v1/openapi.yaml with no-store is API-ROUTES-01 |
| RF-API-04 | 🟡 | 509bc52 (merge eb327ca) | Targeted tests: TestDecodeJSON (rules 2–4), TestDecodeJSONRepeatedKeyKeepsLastOccurrence, TestDecodeJSONTopLevelKeysFollowStructTags; Integrated (W1, T2, 2026-10-22) | Rules 2–4 in httpx; rules 1 and 5–8 and the order through the route in API-ROUTES-01 |
| RF-API-05 | 🟡 | 509bc52 (merge eb327ca) | Targeted tests: TestProblemCatalog, TestCodesIsSortedAndComplete, TestWriteProblem, problem JSON tests; Integrated (W1, T2, 2026-10-22) | Catalog verified; `Codes()` ⊆ contract enum = client `PROBLEM_CODES` confirmed at integration (Findings of W1 (a)); domain-error mapping and contract validation in API-ROUTES-01 |
| RF-API-06 | 🟡 | 509bc52 (merge eb327ca) | Targeted tests: TestMethodsDispatches, TestMethodsRejectsWithSortedAllow, TestNotFound; Integrated (W1, T2, 2026-10-22) | Dispatcher verified; router wiring in API-ROUTES-01 |
| RF-API-07 | 🟡 | 509bc52 (merge eb327ca) | Targeted tests: TestRequestContext* (valid/invalid/128/129 ids), TestWriteProblem (requestId = header); Integrated (W1, T2, 2026-10-22) | Middleware verified; on every route in API-ROUTES-01 / OBS-RUNTIME-01 |
| RF-API-08 | 🟡 | 509bc52 (merge eb327ca) | Targeted tests: TestSecureHeaders, TestWriteJSON/TestWriteProblem (no-store); Integrated (W1, T2, 2026-10-22) | Headers verified; on the composed handler in OBS-RUNTIME-01 |
| RF-API-09 | ⬜ | — | — | API-ROUTES-01 |
| RF-API-10 | ✅ | 9fc0caa, 75d84a1 (merge ce02a75) | Targeted tests: gen:api twice without diff, contract:types drift check in t0/t3 with two failure scenarios (2026-10-22); Integrated (W1, T2: gen:api without diff, contract:types pass, 2026-10-22) | Generated types committed; the drift check runs in the contract stage |
| RF-API-11 | 🟡 | 509bc52 (merge eb327ca) | Targeted tests: TestRecover*; Integrated (W1, T2, 2026-10-22) | Recovery verified with a test logger; end-to-end in OBS-RUNTIME-01 («Findings of API-HTTPX-01» (f)) |

## CALC — Calculation engine

| ID | Status | Commit(s) | Verified | Notes |
|---|---|---|---|---|
| RF-CALC-01 | 🟡 | 29aecc2 (merge eb327ca) | Targeted tests: TestOperationsCatalog; Integrated (W1, T2, 2026-10-22) | Catalog verified; GET /api/v1/operations and the contract enum test in API-ROUTES-01 |
| RF-CALC-02 | 🟡 | 5e3ecb5, 29aecc2 (merge eb327ca) | Targeted tests: TestCalculatorContext, TestCalculateResults (underflow/flush rows), TestCalculatePowerQuadrants; Integrated (W1, T2, 2026-10-22) | Engine verified; through the HTTP API in API-ROUTES-01 |
| RF-CALC-03 | 🟡 | 5e3ecb5, 29aecc2 (merge eb327ca) | Targeted tests: TestParseAcceptsValidNumbers, TestParseRejectsInvalidNumbers, TestOperandErrorTexts, TestCalculateCollectsEveryInvalidOperand; FuzzParse 20 s (worker and integrator, 2026-10-22) | Engine verified; `errors[]` mapping in API-ROUTES-01 |
| RF-CALC-04 | 🟡 | 5e3ecb5 (merge eb327ca) | Targeted tests: TestFormat; FuzzParse 20 s; Decimal syntax identical in the contract, `calc` and the client (W1 integration, 2026-10-22) | Engine verified; response bodies in API-ROUTES-01 |
| RF-CALC-05 | 🟡 | 29aecc2 (merge eb327ca) | Targeted tests: TestCalculateResults, TestCalculateErrors; Integrated (W1, T2, 2026-10-22) | Engine verified; HTTP 422 mapping in API-ROUTES-01 |
| RF-CALC-06 | 🟡 | 29aecc2 (merge eb327ca) | Targeted tests: TestCalculateResults, TestCalculateErrors, TestCalculatePowerQuadrants, TestCalculateFractionalPowerValue, TestIsExactFractionalPower; Integrated (W1, T2, 2026-10-22) | Engine verified |
| RF-CALC-07 | 🟡 | 29aecc2 (merge eb327ca) | Targeted tests: TestCalculateResults, TestCalculateErrors, TestIsExactSquareRoot; Integrated (W1, T2, 2026-10-22) | Engine verified |
| RF-CALC-08 | 🟡 | 29aecc2 (merge eb327ca) | Targeted tests: TestCalculateResults; Integrated (W1, T2, 2026-10-22) | Engine verified |
| RF-CALC-09 | 🟡 | 29aecc2 (merge eb327ca) | Targeted tests: TestCalculateErrors (arity), TestCalculateFractionalPowerValue (inexact), TestCalculateRejectsNonFiniteResults; FuzzCalculate 30 s (worker and integrator, 2026-10-22) | Engine verified; residual exactness bound in «Findings of CALC-OPS-01» (d) |
| RF-CALC-10 | 🟡 | 29aecc2 (merge eb327ca) | Targeted tests: TestCalculateHonoursCanceledContext, TestCalculateContextAndValidationOrder, TestOutcome; Integrated (W1, T2, 2026-10-22) | Engine verified; metric labels in OBS-METRICS-01 |

## OBS — Service runtime and observability

| ID | Status | Commit(s) | Verified | Notes |
|---|---|---|---|---|
| UC-OBS-01 / RF-OBS-01…RF-OBS-09 | ⬜ | — | — | OBS-METRICS-01, API-ROUTES-01 (probes), OBS-RUNTIME-01; access-log middleware of RF-OBS-05 done (W1) |
| RF-OBS-05 | 🟡 | 509bc52 (merge eb327ca) | Targeted tests: TestAccessLog*; Integrated (W1, T2, 2026-10-22) | Access-log line verified; request-aware logger in OBS-METRICS-01 |

## UI — Calculator web app

| ID | Status | Commit(s) | Verified | Notes |
|---|---|---|---|---|
| UC-UI-01 / RF-UI-01, RF-UI-02, RF-UI-04, RF-UI-05, RF-UI-06, RF-UI-07, RF-UI-08, RF-UI-09, RF-UI-12, RF-UI-13 | 🟡 | 24131a9, fbb1984 (merge ce02a75) | Targeted tests: src/shared/api (84 tests), 11 mutations (2026-10-22); Integrated (W1, T2, 2026-10-22) | RF-UI-09 client done (single instance wired by UI-SCREEN-01); model, hooks and screen pending |
| UC-UI-02 / RF-UI-03, RF-UI-04 | ⬜ | — | — | UI-MODEL-01, UI-SCREEN-01 |
| UC-UI-03 / RF-UI-10 | ⬜ | — | — | UI-MODEL-01, UI-HOOKS-01, UI-SCREEN-01 |
| UC-UI-04 / RF-UI-11 | 🟡 | 9fc0caa (merge ce02a75) | Targeted tests: theme-init.test.ts (real file), Chromium + Pixel 7 bootstrap under the RNF-SEC-03 CSP (2026-10-22); Integrated (W1, browser smoke 222 checks, 2026-10-22) | Bootstrap done; useTheme and the radio group are UI-HOOKS-01 and UI-SCREEN-01 |
| RF-UI-14 | 🟡 | e90d084, 235cc53, 9fc0caa (merge ce02a75) | Targeted tests: contrast.py DESIGN.md and --css on tokens.css (exit 0, mutation caught); browser token background per theme (2026-10-22); Integrated (W1, contrast --css exit 0, axe 0 violations light/dark, 2026-10-22) | tokens.css, global.css and favicon done; component styling on the tokens is UI-SCREEN-01 |

## DOC — Documentation

| ID | Status | Commit(s) | Verified | Notes |
|---|---|---|---|---|
| UC-DOC-01 / RF-DOC-01, RF-DOC-02, RF-DOC-03, RF-DOC-04 | ⬜ | — | — | DOC-ADR-01, OPS-STACK-01 (`docs-api`), DOC-README-01; RF-DOC-02 done (RUN-M1-3) |
| RF-DOC-02 | ✅ | 8460cea (merge 0f22334) | Targeted tests: check_adrs.py PASS 0 failures, run_mutations.py 25/25, out-of-scope grep 0 matches (2026-10-22); Integrated (W1: check_adrs.py PASS and 25/25 on the merged tree, every ADR link resolves, 2026-10-22) | docs/adr/README.md index + ADRs 0001–0008; planned paths cited as plain text (Findings of DOC-ADR-01 (b)) |

## Non-functional

| ID | Status | Commit(s) | Verified | Notes |
|---|---|---|---|---|
| RNF-SEC-01 | 🟡 | 5e3ecb5, 509bc52 (merge eb327ca) | Targeted tests: body 4096/4097 and oversize rows, operand 128/129, 34/35 digits, exponent range; Integrated (W1, T2, 2026-10-22) | Header limit in OBS-RUNTIME-01, edge limit in OPS-EDGE-01 |
| RNF-SEC-02 | 🟡 | 509bc52 (merge eb327ca) | Targeted tests: hostile unknown field name, map-key type mismatch, NotFound fixed detail; security review | Operation-name and metric-label parts in API-ROUTES-01 / OBS-METRICS-01 |
| RNF-SEC-03 | 🟡 | 9fc0caa (merge ce02a75) | Targeted tests: check-dist.sh, browser check with the policy header, zero CSP violations (2026-10-22); Integrated (W1: check-dist.sh 0 failures, browser smoke 222 checks, 2026-10-22) | App side done (no inline script/style, external theme bootstrap); headers by OPS-IMAGE-01/OPS-EDGE-01, E2E by OPS-E2E-01 |
| RNF-SEC-04 | ⬜ | — | — | OPS-IMAGE-01, OPS-EDGE-01, OPS-STACK-01 |
| RNF-SEC-05, RNF-SEC-06 | ⬜ | — | — | OPS-CI-02 |
| RNF-PERF-01 | 🟡 | 29aecc2 (merge eb327ca) | Benchmark: BenchmarkCalculate six cases 2.1–302 µs/op (evidence/bench.txt); re-measured at integration 1.4–620 µs/op (W1, heavy lease, 2026-10-22) | Worst-case fractional powers 13.2 ms: «Findings of CALC-OPS-01» (c), «Findings of W1» (c); README numbers in DOC-README-01; OPS-STACK-01 target |
| RNF-QUAL-01 | 🟡 | 9fc0caa, fbb1984 (merge ce02a75) | Measured: frontend coverage 100/100/100/100 against thresholds 90/90/90/85 (2026-10-22) | Frontend gate in Vitest; backend gate and make coverage are OPS-STACK-01 (backend packages so far: calc 97.5 %, httpx 96.6 %) |
| RNF-QUAL-02 | 🟡 | 5e3ecb5, 9fc0caa (merges eb327ca, ce02a75) | Targeted tests: t0.sh backend stage (golangci-lint fmt + run, go vet); pnpm lint/typecheck/format:check zero warnings; jsx-a11y fixture under ESLint 10 (2026-10-22); Integrated (W1, T2, 2026-10-22) | Go and frontend static checks, Redocly and actionlint done; hadolint with the Dockerfiles of OPS-IMAGE-01 and OPS-EDGE-01 |
| RNF-A11Y-01 | ⬜ | — | — | UI-SCREEN-01, OPS-E2E-01 |
| RNF-REL-01 | 🟡 | 5e3ecb5, 29aecc2 (merge eb327ca) | FuzzParse 20 s, FuzzCalculate 30 s clean (worker and integrator, 2026-10-22) | Engine part; hook, lifecycle and contract parts in later tasks |
| RNF-OPS-01 | ⬜ | — | — | OPS-STACK-01 |
| RNF-OPS-02 | 🟡 | 02a52d4 | Measured: t0 4.0 s over the run, t3 --job contract 6.6 s (2026-10-22); t0 19.7 s over RUN-M1-2, T2 31.7 s over W1 (2026-10-22) | Tiers 0–1 for sessions in place; Go and frontend stage durations measured (context/test-environment.md) |
