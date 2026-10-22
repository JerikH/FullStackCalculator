# CALC — Calculation engine

### CALC-CORE-01 — Go module, lint configuration, decimal parsing and formatting [BE] — M1 [topic: numeric-precision, testing-environment]

- [ ] Open.
  **Scope:** RF-CALC-02 (constants), RF-CALC-03, RF-CALC-04, RNF-QUAL-02 (backend lint configuration). Creates `backend/go.mod` (module `github.com/JerikH/FullStackCalculator/backend`, `go` directive = installed release, no `toolchain` line), `backend/.golangci.yml` (golangci-lint v2, gofumpt + goimports with the module as local prefix), package `backend/internal/calc` (`Parse`, `Format`, operand sentinel errors whose text is the API reason), `FuzzParse`. After it, `go build ./api/` compiles the embedded contract.
  **UI:** none.
  **Verification:** `go test -race ./internal/calc/` (valid/invalid/format tables); `go test ./internal/calc -run '^$' -fuzz FuzzParse -fuzztime 20s` finds nothing (crashers kept as regression corpus); `bin/golangci-lint run ./...` 0 issues; `go vet ./...`.
  **Review level:** single.
  **Needs from the owner:** nothing.
  - Registered follow-up (from OPS-CI-01): backend/.golangci.yml enables the gofumpt and goimports formatters; run scripts/ci/t0.sh on the change (first real backend stage, ./... because go.mod is new). 🔎 findings: «Findings of OPS-CI-01» (d)

### CALC-OPS-01 — Operation catalog and calculator [BE] — M1 [topic: numeric-precision, performance-scale]

- [ ] Open.
  **Scope:** RF-CALC-01, RF-CALC-05, RF-CALC-06, RF-CALC-07, RF-CALC-08, RF-CALC-09, RF-CALC-10, RF-CALC-02 (context and trap classification), RNF-PERF-01, RNF-REL-01 (fuzzing). `New`, `Operations` (defensive copy), `Has`, `Calculate`, `Outcome`, error types (`OperandError`, `InvalidOperandsError`), `FuzzCalculate`, `BenchmarkCalculate` (the six named cases).
  **UI:** none.
  **Verification:** `go test -race -cover ./internal/calc/` ≥ 95 %; the result and error tables match RF-CALC-05…09 exactly (expectations never edited to match the library); `FuzzCalculate` 30 s clean; every benchmark case < 1,000,000 ns/op (output recorded in the run evidence); mutation check: remove the `0^0` pre-check and watch its test fail.
  **Review level:** single.
  **Needs from the owner:** nothing.
