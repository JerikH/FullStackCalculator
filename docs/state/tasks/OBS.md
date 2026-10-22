# OBS — Service runtime and observability

### OBS-METRICS-01 — Build info, request-aware logger and metrics [BE] — M1 [topic: observability, security-privacy]

- [ ] Open.
  **Scope:** RF-OBS-05 (logger with `request_id`, JSON/text), RF-OBS-06 (custom registry, the five metric families, bounded labels, metrics middleware, calculator decorator), RF-OBS-09 (`buildinfo`: ldflags with VCS fallback), RNF-SEC-02 (no input-minted series). Packages `backend/internal/buildinfo`, `backend/internal/observability`.
  **UI:** none.
  **Verification:** `go test -race -cover ./internal/buildinfo/ ./internal/observability/` ≥ 90 %; exposition-text comparisons for `http_requests_total` (method `OTHER`), `calculator_operations_total` (operation `unknown`) and `calculator_build_info`; logger tests for `request_id` presence/absence and level/format.
  **Review level:** single.
  **Needs from the owner:** nothing.

### OBS-RUNTIME-01 — Configuration, lifecycle, admin listener and entrypoint [BE] — M1 [topic: reliability-errors, observability]

- [ ] Open.
  **Scope:** UC-OBS-01; RF-API-12, RF-OBS-01, RF-OBS-04, RF-OBS-07, RF-OBS-08, RF-OBS-02/03 (wired), RNF-REL-01 (drain). Packages `backend/internal/config` (`Load(lookup)` with `errors.Join`), `backend/internal/app` (`Main`, `New`, `Run`, `healthcheck` probe), `backend/cmd/calculator`. RF-API-12: handler chain RequestContext → AccessLog → Metrics → Recover → SecureHeaders → router, with a test that a panicking route is logged with its request ID and counted as a 500. Creates `backend/internal/web/noembed.go` (`//go:build !embedui`, package doc comment, `Handler()` returning nil) so the module compiles; OPS-IMAGE-01 owns the package afterwards.
  **UI:** none.
  **Verification:** `go test -race -cover ./internal/config/ ./internal/app/` (each ≥ 85 %) covering UC-OBS-01 E1–E5 and drain → 503 → shutdown; whole-module check `go vet ./...`, tests with `-coverpkg=./internal/...` total ≥ 90 %, golangci-lint 0 issues; manual smoke: `go run ./cmd/calculator` on the agent's port answers `add ["0.1","0.2"]` with `0.3` and shuts down cleanly on SIGTERM.
  **Review level:** double (process lifecycle and concurrency of shutdown).
  **Needs from the owner:** nothing.
