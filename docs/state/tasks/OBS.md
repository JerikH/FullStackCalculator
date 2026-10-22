# OBS — Service runtime and observability

### OBS-METRICS-01 — Build info, request-aware logger and metrics [BE] — M1 [topic: observability, security-privacy]

- [ ] Open.
  **Scope:** RF-OBS-05 (logger with `request_id`, JSON/text), RF-OBS-06 (custom registry, the five metric families, bounded labels, metrics middleware, calculator decorator), RF-OBS-09 (`buildinfo`: ldflags with VCS fallback), RNF-SEC-02 (no input-minted series). Packages `backend/internal/buildinfo`, `backend/internal/observability`.
  **UI:** none.
  **Verification:** `go test -race -cover ./internal/buildinfo/ ./internal/observability/` ≥ 90 %; exposition-text comparisons for `http_requests_total` (method `OTHER`), `calculator_operations_total` (operation `unknown`) and `calculator_build_info`; logger tests for `request_id` presence/absence and level/format.
  **Review level:** single.
  **Needs from the owner:** nothing.
  - Registered follow-up (from API-HTTPX-01): the metrics middleware reads the status from httpx.Info(ctx).StatusOrOK() in a defer, because Recover records 500 and re-panics http.ErrAbortHandler when a panic happens after the response started. 🔎 findings: «Findings of API-HTTPX-01» (e)
  - Registered follow-up (from W1 integration): build on the httpx interface as merged — httpx.WriteJSON(w, r, status, v) takes the request, the recorded status comes from httpx.Info(ctx).StatusOrOK(), and the middleware sits between AccessLog and Recover (RF-API-12). 🔎 findings: «Findings of W1» (b)

### OBS-RUNTIME-01 — Configuration, lifecycle, admin listener and entrypoint [BE] — M1 [topic: reliability-errors, observability]

- [ ] Open.
  **Scope:** UC-OBS-01; RF-API-12, RF-OBS-01, RF-OBS-04, RF-OBS-07, RF-OBS-08, RF-OBS-02/03 (wired), RNF-REL-01 (drain). Packages `backend/internal/config` (`Load(lookup)` with `errors.Join`), `backend/internal/app` (`Main`, `New`, `Run`, `healthcheck` probe), `backend/cmd/calculator`. RF-API-12: handler chain RequestContext → AccessLog → Metrics → Recover → SecureHeaders → router, with a test that a panicking route is logged with its request ID and counted as a 500. Creates `backend/internal/web/noembed.go` (`//go:build !embedui`, package doc comment, `Handler()` returning nil) so the module compiles; OPS-IMAGE-01 owns the package afterwards.
  **UI:** none.
  **Verification:** `go test -race -cover ./internal/config/ ./internal/app/` (each ≥ 85 %) covering UC-OBS-01 E1–E5 and drain → 503 → shutdown; whole-module check `go vet ./...`, tests with `-coverpkg=./internal/...` total ≥ 90 %, golangci-lint 0 issues; manual smoke: `go run ./cmd/calculator` on the agent's port answers `add ["0.1","0.2"]` with `0.3` and shuts down cleanly on SIGTERM.
  **Review level:** double (process lifecycle and concurrency of shutdown).
  **Needs from the owner:** nothing.
  - Registered follow-up (from API-HTTPX-01): one end-to-end test of the composed chain: a panicking route returns the 500 problem, the panic log line carries the same request_id as the X-Request-ID header, and the access line and http_requests_total record 500. 🔎 findings: «Findings of API-HTTPX-01» (f)
