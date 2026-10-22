# Traceability matrix

Per requirement and use case: is it covered, by which commits, and with what evidence. Rows are never deleted.

**Status:** ✅ complete chain verified · 🟡 exists with a gap (in Notes) · ⬜ no evidence · 🔴 blocked. **Verified:** Live (date) · Targeted tests (list) · Integrated (wave, tier 2) · Code (file:line only).

## Summary

| | ✅ | 🟡 | ⬜ | 🔴 | Total |
|---|---|---|---|---|---|
| **UC** | 2 | 7 | 2 | 0 | 11 |
| **RF** | 15 | 39 | 9 | 0 | 63 |

## OPS — Repository, environments and delivery

| ID | Status | Commit(s) | Verified | Notes |
|---|---|---|---|---|
| UC-OPS-01 | 🟡 | 8e0ed90, d9c7685, 02a52d4 | Targeted tests: check-env.sh (85), check-tiers.sh (133), 8 mutations, real-repository tier runs (2026-10-22) | Steps 1–6 and E1–E6 proven; acceptance «a Vite dev server and a Go service of each identity side by side» waits for both servers (UI-SCREEN-01, Findings of OPS-ENV-01 (b)) |
| RF-OPS-02 | 🟡 | 8e0ed90, d9c7685 | Targeted tests: check-env.sh, listeners on all four ports of two identities (2026-10-22) | Ports, project names and PATH done; real dev servers side by side in UI-SCREEN-01 |
| RF-OPS-03 | 🟡 | 02a52d4, 75d84a1 (merge ce02a75) | Targeted tests: check-tiers.sh (133), 4 mutations, real-repository t0/t1/t2/t3 (2026-10-22); Integrated (W1, T2 31.7 s, 2026-10-22) | Tiers built on package commands; Makefile targets wired by OPS-STACK-01; frontend stage exercised and fixed by UI-SCAF-01 (75d84a1, check-tiers-frontend.sh); backend stage first real run by CALC-CORE-01 (no change needed) |
| UC-OPS-02 / RF-OPS-04, RF-OPS-05, RF-OPS-06, RF-OPS-08 | 🟡 | 21b98e3 (merge a2a6975) | Targeted tests: edge image against a stub of the service, edge-smoke.sh 520 checks, 15 mutations, browser check 54 checks (2026-10-22); Live through the edge against the real service (W2 integration, 80 checks, 2026-10-22); edge-smoke.sh 520 checks on the merged image; Integrated (W2, T2 69.4 s, 2026-10-22) | RF-OPS-04 as amended by U21 (connection limit, probe body limit) and the probe contract of U18 in OPS-STACK-01, the composed-stack proof in OPS-E2E-01; RF-OPS-05 OPS-IMAGE-01, RF-OPS-06/08 OPS-STACK-01 |
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
| UC-API-01 / RF-API-01, RF-API-02, RF-API-07, RF-API-08, RF-CALC-01 | ✅ | 6eef481, db4ab64, e9250f8 (merge 6a50ff7) | Targeted tests: TestListOperations, TestOpenAPIDocumentIsServed, TestRequestIDs, TestProblems (E1–E2), TestResponsesConformToContract; Live (2026-10-22, evidence/smoke.txt); Live through the edge against the real service (W2 integration, 80 checks, 2026-10-22); Integrated (W2, T2 69.4 s, 2026-10-22) | The edge's copy of the headers in OPS-EDGE-01 |
| UC-API-02 / RF-API-03, RF-API-04, RF-API-05, RF-API-06, RF-API-11, RF-API-12, RF-CALC-02…RF-CALC-10 | ✅ | 6eef481, db4ab64, e9250f8, 857b3fc (merge 6a50ff7) | Targeted tests: TestProblems, TestAdditionalSuccesses, TestUnknownOperationDoesNotReadBody, TestCanceledCalculation, TestCalculationPanic, TestComposedPanicIsCorrelatedAndCounted, contract tests; Live (2026-10-22, add 0.1+0.2 = 0.3, divide by zero 422); Live through the edge against the real service (W2 integration, 80 checks, 2026-10-22); Integrated (W2, T2 69.4 s, 2026-10-22) | — |
| RF-API-01 | 🟡 | 5d1969f, f2db811 | Targeted tests: Redocly lint 2.69.0, contract shape check with mutations, Go embed (2026-10-22); `go build ./api/` with the real module (W1, 2026-10-22) | Document, components, Redocly configuration and api.Spec done; serving it at GET /api/v1/openapi.yaml with no-store is API-ROUTES-01 |
| RF-API-04 | ✅ | 509bc52 (merge eb327ca), 6eef481 (merge 6a50ff7) | Targeted tests: TestProblems rows for rules 1–8, TestUnknownOperationDoesNotReadBody; mutation «decode before the catalog check» caught; Integrated (W2, T2 69.4 s, 2026-10-22) | — |
| RF-API-05 | ✅ | 509bc52 (merge eb327ca), 6eef481 (merge 6a50ff7) | Targeted tests: TestProblemForMapsEveryDomainError, TestProblems (errors[] only on VALIDATION_FAILED), TestProblemCodesMatchContract, contract tests; Integrated (W2, T2 69.4 s, 2026-10-22) (httpx.Codes() 11 ⊆ contract enum 13 = PROBLEM_CODES = model copy; edge emits only RATE_LIMITED, SERVICE_UNAVAILABLE, PAYLOAD_TOO_LARGE) | — |
| RF-API-06 | ✅ | 509bc52 (merge eb327ca), 6eef481, db4ab64 (merge 6a50ff7) | Targeted tests: TestProblems (405 rows with Allow, /api, /api/nope, non-canonical paths), TestAsteriskTargetIsAProblem, TestUnmatchedResponsesConformToProblemSchema; Integrated (W2, T2 69.4 s, 2026-10-22) | net/http's own 431/400 replies: «Findings of API-ROUTES-01» (d) |
| RF-API-07 | ✅ | 509bc52 (merge eb327ca), 6eef481 (merge 6a50ff7) | Targeted tests: TestRequestIDs (valid echoed; space, <script>, 129 chars replaced), problem requestId = header everywhere; Live (2026-10-22, X-Request-ID smoke-1 echoed and logged); Live through the edge against the real service (W2 integration, 80 checks, 2026-10-22): header = problem body = service log, 128 characters kept, 129 characters, `<script>` and a space replaced before the service; Integrated (W2, T2 69.4 s, 2026-10-22) | — |
| RF-API-08 | ✅ | 509bc52 (merge eb327ca), 6eef481, e9250f8 (merge 6a50ff7) | Targeted tests: assertSecurityHeaders on every TestProblems row and success, TestComposedHeadersAndAdminIsolation (200, problem, probes, readyz 503, non-canonical 404 through the real app); mutation «SecureHeaders dropped» caught; Live (2026-10-22); Integrated (W2, T2 69.4 s, 2026-10-22) | Behind the edge the edge owns them (OPS-EDGE-01) |
| RF-API-09 | ✅ | 6eef481 (merge 6a50ff7) | Targeted tests: TestResponsesConformToContract, TestFailureAndDrainingResponsesConformToContract, TestUnmatchedResponsesConformToProblemSchema, TestCatalogMatchesOperationNameEnum, TestProblemCodesMatchContract; Integrated (W2, T2 69.4 s, 2026-10-22) | — |
| RF-API-10 | ✅ | 9fc0caa, 75d84a1 (merge ce02a75) | Targeted tests: gen:api twice without diff, contract:types drift check in t0/t3 with two failure scenarios (2026-10-22); Integrated (W1, T2: gen:api without diff, contract:types pass, 2026-10-22) | Generated types committed; the drift check runs in the contract stage |
| RF-API-11 | ✅ | 509bc52 (merge eb327ca), 6eef481, e9250f8 (merge 6a50ff7) | Targeted tests: TestRecover*, TestCalculationPanic, TestUnexpectedErrorIsOpaqueAndLogged, TestComposedPanicIsCorrelatedAndCounted (real logger and metrics); Integrated (W2, T2 69.4 s, 2026-10-22) | — |
| RF-API-12 | ✅ | e9250f8 (merge 6a50ff7) | Targeted tests: TestComposedPanicIsCorrelatedAndCounted; mutations «Metrics and Recover swapped», «SecureHeaders dropped» caught; Integrated (W2, T2 69.4 s, 2026-10-22) | — |

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
| UC-OBS-01 / RF-OBS-01…RF-OBS-09 | 🟡 | 8c51c00, 6eef481, e9250f8, 857b3fc (merge 6a50ff7) | Targeted tests: config tests (E1), TestAppServesDrainsAndShutsDown, TestComposedHeadersAndAdminIsolation (E3/E4 admin, metrics, pprof), TestNewFailsWhenPortIsTaken/TestAdminBindFailureClosesPublicListener (E2), TestHealthcheckSilentServerTimesOut (E5), TestMiddlewareRecordsRouteMethodAndStatus (E6), TestComposedPanicIsCorrelatedAndCounted (E7); Live (2026-10-22, evidence/smoke.txt); Live through the edge against the real service (W2 integration, 80 checks, 2026-10-22) (SIGTERM → draining readyz 503 through the edge, healthz 200, exit 0); Integrated (W2, T2 69.4 s, 2026-10-22) | RF-OBS-05 amendments (U19, U20) in OBS-LOG-01; RF-OBS-03 edge problem in the contract (U18) in OPS-STACK-01; image healthcheck in OPS-IMAGE-01; compose drain in OPS-STACK-01 |
| RF-OBS-05 | 🟡 | 509bc52 (merge eb327ca), 8c51c00, e9250f8 (merge 6a50ff7) | Targeted tests: TestAccessLog*, TestLogger*, TestComposedPanicIsCorrelatedAndCounted; Live (2026-10-22, evidence/smoke.txt: JSON access lines with request_id); Integrated (W2, T2 69.4 s, 2026-10-22) | Amended by U19 (draining readiness 503 at info) and U20 (path and user_agent truncated to 256 characters): OBS-LOG-01 |
| RF-OBS-06 | ✅ | 8c51c00, e9250f8 (merge 6a50ff7) | Targeted tests: TestMiddleware*, TestDurationHistogramBuckets, TestInstrumentCalculator*, TestBuildInfoGauge, TestComposedHeadersAndAdminIsolation; Live (2026-10-22, admin /metrics on :4112); Integrated (W2, T2 69.4 s, 2026-10-22) | — |
| RF-OBS-09 | ✅ | 8c51c00 (merge 6a50ff7) | Targeted tests: TestGet, TestGetPrefersLdflagsCommit, TestRevision; Live (2026-10-22, -ldflags build: /healthz and calculator_build_info report version and commit); Integrated (W2, T2 69.4 s, 2026-10-22) | Image build args in OPS-IMAGE-01 |

## UI — Calculator web app

| ID | Status | Commit(s) | Verified | Notes |
|---|---|---|---|---|
| UC-UI-01 / RF-UI-01, RF-UI-02, RF-UI-04, RF-UI-05, RF-UI-06, RF-UI-07, RF-UI-08, RF-UI-09, RF-UI-12, RF-UI-13 | 🟡 | 24131a9, fbb1984 (merge ce02a75); b338c03 (merge 93812a9) | Targeted tests: src/shared/api (84 tests), 11 mutations (2026-10-22); src/features/calculator/model (860 tests, 100 % coverage, 18 mutations, 2026-10-22); Integrated (W1, T2, 2026-10-22); Integrated (W2, T2 69.4 s, 2026-10-22) | RF-UI-09 client and the model (RF-UI-01 table, RF-UI-04 reducer, RF-UI-05 boundaries test, RF-UI-06 formatting, RF-UI-08 copy) done; hooks, screen and the real-browser flow pending (UI-HOOKS-01, UI-SCREEN-01) |
| UC-UI-02 / RF-UI-03, RF-UI-04 | 🟡 | b338c03 (merge 93812a9) | Targeted tests: entry.test.ts, reducer.test.ts, reducer.sequences.test.ts (2026-10-22); Integrated (W2, T2 69.4 s, 2026-10-22) | Editing table and every transition with frozen state done; C vs AC and the digit cap in the real browser pending (UI-SCREEN-01) |
| UC-UI-03 / RF-UI-10 | 🟡 | b338c03 (merge 93812a9) | Targeted tests: history.test.ts (every malformed input, round trip), reducer.test.ts (cap 20, recall as right operand, error/busy recall) (2026-10-22); Integrated (W2, T2 69.4 s, 2026-10-22) | Codec and recall done; storage hooks and the history panel pending (UI-HOOKS-01, UI-SCREEN-01) |
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
| RNF-SEC-01 | 🟡 | 5e3ecb5, 509bc52 (merge eb327ca), e9250f8 (merge 6a50ff7), 21b98e3 (merge a2a6975) | Targeted tests: body/operand bounds, TestServerTimeoutsAndErrorLog (MaxHeaderBytes 16384); security review (25,000-byte headers → 431, slow headers cut at 5 s, slow body at 10 s); Live through the edge against the real service (W2 integration, 80 checks, 2026-10-22) (service 413 for 5000 bytes unchanged, edge 413 above 1 MiB); Integrated (W2, T2 69.4 s, 2026-10-22) | Header limit in OBS-RUNTIME-01; edge transport limit 1 MiB done in OPS-EDGE-01 (413 problem above it, Content-Length and chunked) |
| RNF-SEC-02 | 🟡 | 509bc52 (merge eb327ca), 8c51c00, 6eef481 (merge 6a50ff7), 21b98e3 (merge a2a6975) | Targeted tests: hostile unknown field, invalid operands not reflected, OTHER/unknown/route-pattern labels; security review (120,000 distinct inputs, no new series); Integrated (W2, T2 69.4 s, 2026-10-22) | the request path in `instance` is a listed reflected input (U17); edge-built JSON from constants and the validated request ID only (OPS-EDGE-01: smoke checks of every edge problem, invalid IDs never reflected) |
| RNF-SEC-03 | 🟡 | 9fc0caa (merge ce02a75), 21b98e3 (merge a2a6975) | Targeted tests: check-dist.sh, browser check with the policy header, zero CSP violations (2026-10-22); Integrated (W1: check-dist.sh 0 failures, browser smoke 222 checks, 2026-10-22); Live through the edge against the real service (W2 integration, 80 checks, 2026-10-22) (one value of each edge header on proxied API responses, service copies hidden) | App side done (no inline script/style, external theme bootstrap); edge headers done (OPS-EDGE-01: one value on every response class, zero CSP violations through the edge); embedded handler by OPS-IMAGE-01, E2E by OPS-E2E-01 |
| RNF-SEC-04 | 🟡 | 21b98e3 (merge a2a6975) | Targeted tests: web image run read-only, --cap-drop ALL, no-new-privileges, uid 101, healthy (2026-10-22); Integrated (W2, T2 69.4 s, 2026-10-22) | Web image done; API image OPS-IMAGE-01; compose settings OPS-STACK-01 |
| RNF-SEC-05, RNF-SEC-06 | ⬜ | — | — | OPS-CI-02 |
| RNF-PERF-01 | 🟡 | 29aecc2 (merge eb327ca), 6eef481 (merge 6a50ff7) | Benchmark alone under the heavy lease (2026-10-22, evidence/bench.txt): BenchmarkCalculate six cases 1.8–502 µs/op < 1 ms; BenchmarkCalculateWorstCase seven cases 4.7–19.5 ms/op < 50 ms; re-measured at integration alone under the heavy lease: 1.5–341 µs/op and 3.3–11.4 ms/op (W2, 2026-10-22) | make bench gate in OPS-STACK-01; README numbers in DOC-README-01 («Findings of API-ROUTES-01» (e)) |
| RNF-QUAL-01 | 🟡 | 9fc0caa, fbb1984 (merge ce02a75), e9250f8 (merge 6a50ff7), b338c03 (merge 93812a9) | Measured: frontend coverage 100/100/100/100 against thresholds 90/90/90/85 (2026-10-22); backend go test -race -coverpkg=./internal/... total 97.9 % (buildinfo 90.0, observability 100, httpapi 99.0, config 100, app 98.0) (2026-10-22); Integrated (W2: backend total 97.9 %, frontend 100 % over 957 tests with the model, 2026-10-22) | Frontend gate in Vitest; backend gate and make coverage are OPS-STACK-01 (backend packages: calc 97.5 %, httpx 96.6 %, buildinfo 90.0 %, observability 100 %, httpapi 99.0 %, config 100 %, app 98.0 %) |
| RNF-QUAL-02 | 🟡 | 5e3ecb5, 9fc0caa (merges eb327ca, ce02a75), 21b98e3 (merge a2a6975) | Targeted tests: t0.sh backend stage (golangci-lint fmt + run, go vet); pnpm lint/typecheck/format:check zero warnings; jsx-a11y fixture under ESLint 10 (2026-10-22); Integrated (W1, T2, 2026-10-22); Integrated (W2, T2 69.4 s, 2026-10-22) (hadolint frontend/Dockerfile, golangci-lint 0 issues) | Go and frontend static checks, Redocly and actionlint done; hadolint on frontend/Dockerfile clean (OPS-EDGE-01); backend Dockerfile with OPS-IMAGE-01 |
| RNF-A11Y-01 | ⬜ | — | — | UI-SCREEN-01, OPS-E2E-01 |
| RNF-REL-01 | 🟡 | 5e3ecb5, 29aecc2 (merge eb327ca), e9250f8, 857b3fc, 6eef481 (merge 6a50ff7) | Lifecycle tests (drain → 503 → shutdown, in-flight completion) and contract tests; FuzzParse/FuzzCalculate (W1); Integrated (W2, T2 69.4 s, 2026-10-22) | Hook part in UI-HOOKS-01 |
| RNF-OPS-01 | ⬜ | — | — | OPS-STACK-01 |
| RNF-OPS-02 | 🟡 | 02a52d4 | Measured: t0 4.0 s over the run, t3 --job contract 6.6 s (2026-10-22); t0 19.7 s over RUN-M1-2, T2 31.7 s over W1 (2026-10-22) | Tiers 0–1 for sessions in place; Go and frontend stage durations measured (context/test-environment.md) |
