# API — HTTP API and contract

### API-CONTRACT-01 — OpenAPI 3.1 contract [BE] — M0 [topic: api-contract]

- [x] **DONE 2026-10-22 (run RUN-M0-1, commits 5d1969f, f2db811; 🔎 findings: «Findings of API-CONTRACT-01» (a)–(d)).** Built `backend/api/openapi.yaml` (OpenAPI 3.1.0: five operations, the ten component schemas, 13 problem codes, Decimal pattern and 128-character limit, problem responses; every operation declares the statuses its requirements assign, including 405/500 on the GET-only system operations and the edge 429/503 on `/api/*`; `Problem` requires `type, title, status, detail, code, requestId`), `backend/api/spec.go` (`api.Spec` via `go:embed`) and `redocly.yaml`. Verified: Redocly CLI 2.69.0 lint valid with two localhost-server warnings, a mutation proves `operation-4xx-response` is enforced; a contract shape check (72 assertions: schemas, enums, types, status sets and their responses) passes and fails on six mutations; `spec.go` compiles and embeds the 12,597-byte document in a scratch module with the real module path (Go 1.27.3). Evidence in docs/state/archive/runs/RUN-M0-1/evidence/ (redocly-lint.txt, check_contract.txt, go-embed.txt).
  **Scope:** RF-API-01 (document, components, Redocly configuration; embedding file `backend/api/spec.go` exporting `Spec`). The document lists every endpoint, schema and response of RF-API-02…08 and RF-OBS-02/03, the 13 `ProblemCode` values and the `Decimal` pattern/length. `redocly.yaml` at the repository root: `extends: recommended`, `operation-4xx-response`, `no-unused-components`, `info-license-strict` as errors, `security-defined: off`. It is the contract both tracks consume from M1 on; a change after M0 is a contract change announced to its consumers.
  **UI:** none.
  **Verification:** `pnpm dlx @redocly/cli@latest lint backend/api/openapi.yaml` reports no errors (localhost server warnings noted in the commit body); the enum and schema names match RF-API-01.
  **Review level:** single.
  **Needs from the owner:** nothing.

### API-HTTPX-01 — HTTP platform: problems, decoding, request context, middleware [BE] — M1 [topic: api-contract, security-privacy, observability]

- [ ] Open.
  **Scope:** RF-API-05 (problem catalog: codes, status, titles, type URN, `Codes()`), RF-API-06 (`Methods` dispatcher with `Allow`, `NotFound`), RF-API-07 (request ID validation/generation, `RequestInfo`, route tagging), RF-API-11 (`Recover`), RF-API-04 rules 2–4 (`DecodeJSON`: media type, 4096-byte limit, strict single object), RF-API-08 (`SecureHeaders`, `no-store` on every JSON/problem response), the access-log middleware of RF-OBS-05, RNF-SEC-01, RNF-SEC-02. Package `backend/internal/platform/httpx`.
  **UI:** none.
  **Verification:** `go test -race -cover ./internal/platform/httpx/` ≥ 90 %; the decoding table (plus a repeated `operands` key decoded with the last occurrence, and a hostile unknown field name that appears only quoted in the detail), panic recovery without leaking the panic value, `ErrAbortHandler` re-panic, chain order and access-log fields each have a test; mutation check: drop the request-ID validation regex anchor and watch the invalid-ID test fail.
  **Review level:** double (request handling boundary: input bounds and error reflection).
  **Needs from the owner:** nothing.

### API-ROUTES-01 — Routes, handlers and contract tests [BE] — M1 [topic: api-contract, numeric-precision]

- [ ] Open.
  **Scope:** UC-API-01, UC-API-02; RF-API-02, RF-API-03, RF-API-04 (full order, including rule 1 before the body and rules 5–8), RF-API-05 (domain-error → problem mapping), RF-API-08, RF-API-09, the probe handlers of RF-OBS-02/03 (`Readiness` with `Drain()`), and `GET /api/v1/openapi.yaml` served with `Cache-Control: no-store` plus a regression test. Package `backend/internal/httpapi`; consumer-defined `Calculator` interface.
  **UI:** none.
  **Verification:** `go test -race -cover ./internal/httpapi/` ≥ 90 %; the router table covers UC-API-02 E1–E13 with exact status, code, detail, `errors[]` and headers; every response validates against the embedded contract; catalog ↔ `OperationName` order and codes ⊆ `ProblemCode` tests; mutation check: swap decoding rules 1 and 2 and watch the unknown-operation-before-media-type test fail.
  **Review level:** double (public API surface and contract conformance).
  **Needs from the owner:** nothing.
  - Registered follow-up (from API-CONTRACT-01): validate every 405 body against the Problem schema and assert Allow, including /healthz, /readyz and /api/v1/openapi.yaml (response validation looks operations up by method). 🔎 findings: «Findings of API-CONTRACT-01» (a)
