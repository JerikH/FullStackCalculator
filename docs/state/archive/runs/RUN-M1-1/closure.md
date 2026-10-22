# Closure of RUN-M1-1 — 2026-10-22

Written by the agent that executed the run (worker of wave W1, branch `wf/RUN-M1-1`); applied to the shared state by the integrator, exactly as written. Every item names its target file.

## Commits
| Member | Commit(s) on wf/RUN-M1-1 | Summary |
|---|---|---|
| CALC-CORE-01 | 5e3ecb5 | Go module, lint configuration, `calc.Parse` / `calc.Format`, `FuzzParse` |
| CALC-OPS-01 | 29aecc2 | Operation catalog, `Calculator`, error classification, `Outcome`, `FuzzCalculate`, `BenchmarkCalculate` |
| API-HTTPX-01 | 509bc52 | `backend/internal/platform/httpx`: problems, strict decoding, request context, middleware |
| (records) | afb2ad9, d8781b5, 39db9ec, and the closing `docs(state): RUN-M1-1 closure` commit | spec, plan with review logs, closure, findings, evidence |

## Per member

### CALC-CORE-01
- **current.md:** check `CALC-CORE-01`; add 🔎 findings: «Findings of CALC-CORE-01» (a)–(c).
- **tasks/CALC.md — DONE paragraph** (replaces «Open.»):
  `- [x] **DONE 2026-10-22 (run RUN-M1-1, commit 5e3ecb5; 🔎 findings: «Findings of CALC-CORE-01» (a)–(c)).** Built `backend/go.mod` (module github.com/JerikH/FullStackCalculator/backend, go 1.27.3, apd/v3 v3.2.3, go-cmp v0.7.0), `backend/.golangci.yml` (golangci-lint v2, gofumpt + goimports with the module prefix) and `backend/internal/calc` `Parse`/`Format` with the four operand sentinels (RF-CALC-03 reasons verbatim): length in characters, syntax, zero recognised from the text, significant digits counted from the text before apd parses the exponent, adjusted-exponent range; the reduced value is returned. Verified: `go test -race ./internal/calc/` (valid, invalid, rule-order and format tables incl. 128/129 characters, 34/35 digits, both range ends, `0e9999999999`, non-ASCII), `FuzzParse` 20 s clean (652,238 execs), golangci-lint fmt/run 0 issues, `go vet ./...`, `go build ./api/` (embedded contract compiles), first real `scripts/ci/t0.sh --base main` backend stage green in 4.7 s and its incremental path (one package) in 5.0 s; 3 mutation checks by the controller (zero normalisation, text digit count, reduced return) caught, plus the implementer's plain-notation-bound mutation. Evidence in docs/state/archive/runs/RUN-M1-1/evidence/ (coverage.txt, fuzz.txt, mutations.txt, t0.txt, t0-incremental.txt).`
- **traceability.md rows (CALC):**
  - `| RF-CALC-02 | 🟡 | 5e3ecb5, 29aecc2 | Targeted tests: TestCalculatorContext, TestCalculateResults (underflow/flush rows), TestCalculatePowerQuadrants | Engine verified; through the HTTP API in API-ROUTES-01 |`
  - `| RF-CALC-03 | 🟡 | 5e3ecb5, 29aecc2 | Targeted tests: TestParseAcceptsValidNumbers, TestParseRejectsInvalidNumbers, TestOperandErrorTexts, TestCalculateCollectsEveryInvalidOperand; FuzzParse 20 s | Engine verified; `errors[]` mapping in API-ROUTES-01 |`
  - `| RF-CALC-04 | 🟡 | 5e3ecb5 | Targeted tests: TestFormat; FuzzParse 20 s | Engine verified; response bodies in API-ROUTES-01 |`
  - `| RNF-QUAL-02 | 🟡 | 5e3ecb5 | t0.sh backend stage (golangci-lint fmt + run, go vet) | Backend part only; frontend checks in UI-SCAF-01 |`
- **context/CALC.md additions** (section «Architecture as built», replacing the «(nothing yet)» line): `- backend/internal/calc (RUN-M1-1): decimal.go (Parse, Format, operand sentinels), errors.go (math/arity sentinels, OperandError, InvalidOperandsError, classify, Outcome), operations.go (catalog, pre-checks, power classification, exactness checks), calculator.go (New, Operations, Has, Calculate, flush below the range), fuzz and benchmark tests.` And under «Invariants every task inherits»: `- Parse returns the reduced value; validation order is decided from the operand text, never by apd's parser (it fails on int32 exponents first).`
- **context/test-environment.md additions:** in «Tier commands» add a row `| Backend T0 | scripts/ci/t0.sh --base main (backend stage: golangci-lint fmt --diff, go vet, golangci-lint run, go test -race; ./... when go.mod/go.sum/.golangci.yml change) | 4.7 s full (RUN-M1-1), 5.0 s one package |`; under «Known traps» add `- go mod tidy in backend/ downloads github.com/lib/pq (a test dependency of apd) into the module cache; it is not a module requirement (Findings of CALC-CORE-01 (c)).` and `- Fuzzing, benchmarks and coverage runs take the heavy lease: go test ./internal/calc -run '^$' -fuzz FuzzParse -fuzztime 20s; … -fuzz FuzzCalculate -fuzztime 30s; … -bench . -benchmem.`
- **methodology.md:** none (CALC closes with CALC-OPS-01 below).
- **Spec changes:** none.

### CALC-OPS-01
- **current.md:** check `CALC-OPS-01`; add 🔎 findings: «Findings of CALC-OPS-01» (a)–(e).
- **tasks/CALC.md — DONE paragraph** (replaces «Open.»):
  `- [x] **DONE 2026-10-22 (run RUN-M1-1, commit 29aecc2; 🔎 findings: «Findings of CALC-OPS-01» (a)–(e)).** Built the seven-operation catalog (defensive copy), `New`/`Has`/`Calculate`/`Outcome`, `OperandError`/`InvalidOperandsError`, pre-checks (zero divisor, 0^0 = 1, 1^y = 1, zero to a negative power, negative non-zero base with a non-integer exponent, negative square root), power failures classified from the operands (overflow vs underflow to 0), exactness of fractional powers (p/q, q and |p| ≤ 64, integer coefficient/exponent comparison) and square roots, flush of results below adjusted exponent −6143 to 0 (inexact), `FuzzCalculate`, `BenchmarkCalculate`. Verified: `go test -race -cover ./internal/calc/` 97.5 %; result and error tables of RF-CALC-05…09 exactly (no expectation edited to match apd); concurrency test under -race; `FuzzCalculate` 30 s clean (919,314 execs); every BenchmarkCalculate case < 1,000,000 ns/op (2.1–302 µs); 9 mutation checks on this member caught, including the 0^0 pre-check. Worst-case fractional powers measured at 13.2 ms (backlog finding). Evidence in docs/state/archive/runs/RUN-M1-1/evidence/ (coverage.txt, fuzz.txt, bench.txt, power-worst-case.txt, mutations.txt).`
- **traceability.md rows (CALC):**
  - `| RF-CALC-01 | 🟡 | 29aecc2 | Targeted tests: TestOperationsCatalog | Catalog verified; GET /api/v1/operations and the contract enum test in API-ROUTES-01 |`
  - `| RF-CALC-05 | 🟡 | 29aecc2 | Targeted tests: TestCalculateResults, TestCalculateErrors | Engine verified; HTTP 422 mapping in API-ROUTES-01 |`
  - `| RF-CALC-06 | 🟡 | 29aecc2 | Targeted tests: TestCalculateResults, TestCalculateErrors, TestCalculatePowerQuadrants, TestCalculateFractionalPowerValue, TestIsExactFractionalPower | Engine verified |`
  - `| RF-CALC-07 | 🟡 | 29aecc2 | Targeted tests: TestCalculateResults, TestCalculateErrors, TestIsExactSquareRoot | Engine verified |`
  - `| RF-CALC-08 | 🟡 | 29aecc2 | Targeted tests: TestCalculateResults | Engine verified |`
  - `| RF-CALC-09 | 🟡 | 29aecc2 | Targeted tests: TestCalculateErrors (arity), TestCalculateFractionalPowerValue (inexact), TestCalculateRejectsNonFiniteResults; FuzzCalculate 30 s | Engine verified; residual exactness bound in «Findings of CALC-OPS-01» (d) |`
  - `| RF-CALC-10 | 🟡 | 29aecc2 | Targeted tests: TestCalculateHonoursCanceledContext, TestCalculateContextAndValidationOrder, TestOutcome | Engine verified; metric labels in OBS-METRICS-01 |`
  - `| RNF-PERF-01 | 🟡 | 29aecc2 | Benchmark: BenchmarkCalculate six cases 2.1–302 µs/op (evidence/bench.txt) | Worst-case fractional powers 13.2 ms: «Findings of CALC-OPS-01» (c); README numbers in DOC-README-01 |`
  - `| RNF-REL-01 | 🟡 | 5e3ecb5, 29aecc2 | FuzzParse 20 s, FuzzCalculate 30 s clean | Engine part; hook, lifecycle and contract parts in later tasks |`
- **context/CALC.md additions** («Invariants every task inherits»): `- Every result is a valid operand: results below adjusted exponent −6143 flush to 0 (inexact), above the range are OVERFLOW.` and `- apd's flags are not trusted where measured wrong: Pow failures are classified from the operands; inexact is recomputed for exact fractional powers (bounded) and 1^y.` («Decisions»): `- Worst-case fractional powers cost up to about 13 ms (Findings of CALC-OPS-01 (c), owner decision pending in CALC-backlog).`
- **context/test-environment.md additions:** none beyond CALC-CORE-01's.
- **methodology.md:** CALC epic: all tasks done (engine); its requirements stay 🟡 until API-ROUTES-01 proves them through the API.
- **Spec changes:** none.

### API-HTTPX-01
- **current.md:** check `API-HTTPX-01`; add 🔎 findings: «Findings of API-HTTPX-01» (a)–(g).
- **tasks/API.md — DONE paragraph** (replaces «Open.»):
  `- [x] **DONE 2026-10-22 (run RUN-M1-1, commit 509bc52; 🔎 findings: «Findings of API-HTTPX-01» (a)–(g)).** Built `backend/internal/platform/httpx`: the 11-code problem catalog (`Codes()` ⊂ contract `ProblemCode`; `detail` and `requestId` always serialised), `WriteJSON(w, r, status, v)`/`WriteProblem` (no-store, Content-Length, complete fallback problem), `DecodeJSON` (415 → whole body under 4096 bytes → 413 → the four MALFORMED details; null/non-object rejected; exact top-level keys; nested unknown fields rejected; repeated keys last wins; no client input in type-mismatch details), `RequestContext`/`RequestInfo`/`Route` (validated or generated X-Request-ID, recorder without 1xx), `Chain`, `AccessLog` (deferred, RF-OBS-05 fields, error level for 5xx), `Recover` (500 problem, panic value only in the log, ErrAbortHandler re-panic, started responses aborted and recorded as 500), `SecureHeaders`, `Methods` (405 + Allow), `NotFound`. Verified: `go test -race -cover ./internal/platform/httpx/` 96.6 %; the decoding table incl. the repeated `operands` key and a hostile unknown field name quoted only with %q; panic recovery without leaking the value; ErrAbortHandler re-panic; chain order; access-log fields; two independent reviews (Codex diff review; security and edge-case review with stress programs and a 40 s decode fuzz) triaged with fixes; 7 mutation checks on this member caught (plus the implementer's `{` first-byte and `DisallowUnknownFields` mutations), including the request-ID regex anchor. Evidence in docs/state/archive/runs/RUN-M1-1/evidence/ (coverage.txt, mutations.txt, t0-incremental.txt).`
- **traceability.md rows (API, OBS, NFR):**
  - `| RF-API-04 | 🟡 | 509bc52 | Targeted tests: TestDecodeJSON (rules 2–4), TestDecodeJSONRepeatedKeyKeepsLastOccurrence, TestDecodeJSONTopLevelKeysFollowStructTags | Rules 2–4 in httpx; rules 1 and 5–8 and the order through the route in API-ROUTES-01 |`
  - `| RF-API-05 | 🟡 | 509bc52 | Targeted tests: TestProblemCatalog, TestCodesIsSortedAndComplete, TestWriteProblem, problem JSON tests | Catalog verified; domain-error mapping and contract validation in API-ROUTES-01 |`
  - `| RF-API-06 | 🟡 | 509bc52 | Targeted tests: TestMethodsDispatches, TestMethodsRejectsWithSortedAllow, TestNotFound | Dispatcher verified; router wiring in API-ROUTES-01 |`
  - `| RF-API-07 | 🟡 | 509bc52 | Targeted tests: TestRequestContext* (valid/invalid/128/129 ids), TestWriteProblem (requestId = header) | Middleware verified; on every route in API-ROUTES-01 / OBS-RUNTIME-01 |`
  - `| RF-API-08 | 🟡 | 509bc52 | Targeted tests: TestSecureHeaders, TestWriteJSON/TestWriteProblem (no-store) | Headers verified; on the composed handler in OBS-RUNTIME-01 |`
  - `| RF-API-11 | 🟡 | 509bc52 | Targeted tests: TestRecover* | Recovery verified with a test logger; end-to-end in OBS-RUNTIME-01 («Findings of API-HTTPX-01» (f)) |`
  - `| RF-OBS-05 | 🟡 | 509bc52 | Targeted tests: TestAccessLog* | Access-log line verified; request-aware logger in OBS-METRICS-01 |`
  - `| RNF-SEC-01 | 🟡 | 5e3ecb5, 509bc52 | Targeted tests: body 4096/4097 and oversize rows, operand 128/129, 34/35 digits, exponent range | Header limit in OBS-RUNTIME-01, edge limit in OPS-EDGE-01 |`
  - `| RNF-SEC-02 | 🟡 | 509bc52 | Targeted tests: hostile unknown field name, map-key type mismatch, NotFound fixed detail; security review | Operation-name and metric-label parts in API-ROUTES-01 / OBS-METRICS-01 |`
- **context/API.md additions** («Architecture as built»): `- backend/internal/platform/httpx (RUN-M1-1): problem.go, respond.go (WriteJSON(w, r, status, v), WriteProblem), decode.go (DecodeJSON), requestinfo.go (RequestContext, RequestInfo, Route, recorder), middleware.go (Chain, AccessLog, Recover, SecureHeaders), methods.go (Methods, NotFound).` («Invariants every task inherits»): `- MALFORMED_REQUEST has exactly four details; a [] or null body is «request body must contain a single JSON object»; JSON keys are matched exactly (encoding/json alone is case-insensitive).` and `- httpx.Codes() is the 11 service codes, a strict subset of the contract enum (RATE_LIMITED, SERVICE_UNAVAILABLE are edge-only).`
- **context/test-environment.md additions:** under «Known traps»: `- encoding/json matches keys case-insensitively, decodes null into a struct without error and puts input map keys in UnmarshalTypeError.Field; a streaming decoder over MaxBytesReader reports syntax errors before the size limit (Findings of API-HTTPX-01 (b)).`
- **methodology.md:** none (the API epic stays open).
- **Spec changes:** none.

### Findings of other tasks resolved by this run
- **findings/OPS.md** «Findings of OPS-CI-01» (d): replace `[target: CALC-CORE-01]` with `[resolved: CALC-CORE-01]` (the backend stage ran for real on this change, full and incremental; no defect, `scripts/ci/lib.sh` unchanged).
- **tasks/CALC.md** entry CALC-CORE-01: its «Registered follow-up (from OPS-CI-01)» line is done (gofumpt and goimports enabled; `t0.sh` run, evidence/t0.txt).

## Registered follow-ups for other tasks
- `tasks/API.md` → entry `API-ROUTES-01`: `- Registered follow-up (from API-HTTPX-01): handlers call httpx.WriteJSON(w, r, status, v) (the request is a parameter); a [] or null body yields MALFORMED «request body must contain a single JSON object»; the request struct's operands key is matched exactly (OPERANDS is an unknown field); the problem catalog is httpx.Codes() (11 codes ⊂ the contract enum). 🔎 findings: «Findings of API-HTTPX-01» (d)`
- `tasks/OBS.md` → entry `OBS-METRICS-01`: `- Registered follow-up (from API-HTTPX-01): the metrics middleware reads the status from httpx.Info(ctx).StatusOrOK() in a defer, because Recover records 500 and re-panics http.ErrAbortHandler when a panic happens after the response started. 🔎 findings: «Findings of API-HTTPX-01» (e)`
- `tasks/OBS.md` → entry `OBS-RUNTIME-01`: `- Registered follow-up (from API-HTTPX-01): one end-to-end test of the composed chain: a panicking route returns the 500 problem, the panic log line carries the same request_id as the X-Request-ID header, and the access line and http_requests_total record 500. 🔎 findings: «Findings of API-HTTPX-01» (f)`

## Needs from other tasks (blockers discovered)
- none.

## Targeted checks (the integrator re-runs these after merging)
```
eval "$(.workflow/bin/wf env --export)" && source scripts/ci/env.sh
cd backend && go build ./... && go vet ./...      # includes ./api (embedded contract)
../bin/golangci-lint fmt --diff ./... && ../bin/golangci-lint run ./...
go test -race -count=1 ./internal/calc/ ./internal/platform/httpx/
# heavy lease:
go test -race -count=1 -cover ./internal/calc/ ./internal/platform/httpx/   # ≥ 95 % / ≥ 90 %
go test ./internal/calc -run '^$' -fuzz FuzzParse -fuzztime 20s
go test ./internal/calc -run '^$' -fuzz FuzzCalculate -fuzztime 30s
go test ./internal/calc -run '^$' -bench . -benchmem                       # every case < 1,000,000 ns/op
cd .. && scripts/ci/t0.sh --base <pre-merge main>
```

## Tests and CI changes
- New Go test suites `backend/internal/calc` and `backend/internal/platform/httpx`; they run in the existing backend stage of `scripts/ci/t0.sh`/`t2.sh`/`t3.sh --job backend`, which needed no change (U8: `ci_stage_backend` untouched). `.github/workflows/*.yml.disabled` unchanged (the backend job comes with OPS-CI-02).

## Notes for the integrator
- Problem codes: `httpx.Codes()` returns 11 codes; the contract enum and the client's `PROBLEM_CODES` have 13. The correct check is `Codes()` ⊆ contract enum (RF-API-09) — `RATE_LIMITED` and `SERVICE_UNAVAILABLE` are edge-only — not equality («Findings of API-HTTPX-01» (c)).
- `scripts/ci/lib.sh` is unchanged on this branch, so the planned overlap with RUN-M1-2 produces no conflict.
- `backend/go.mod` is new: after merging, `go build ./api/` and `go vet ./...` compile the embedded contract.
- No contract change; `backend/api/openapi.yaml` untouched. The sentinel texts equal the SRS strings, so no message to RUN-M1-2 was needed.
- One backlog item needs an owner decision: «Findings of CALC-OPS-01» (c) (worst-case fractional power cost vs the «no per-request timeout» rationale).
