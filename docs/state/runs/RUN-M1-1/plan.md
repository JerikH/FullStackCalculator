# RUN-M1-1 — Plan

Implements `spec.md` (corrected by its review log). Interfaces, rules and tests; no complete function bodies. Tiers per `testing.md`: T0 = touched-package lint/vet/tests, T1 = fuzz, benchmark, coverage and mutation checks of this run.

## Order and ownership

| # | Task | Member | Owner (implementer) | Files | Depends on |
|---|---|---|---|---|---|
| 1 | Module and lint configuration | CALC-CORE-01 | controller (done directly: mechanical) | `backend/go.mod`, `backend/go.sum`, `backend/.golangci.yml` | — |
| 2 | `Parse`, `Format`, operand sentinels, `FuzzParse` | CALC-CORE-01 | Codex (one job) | `backend/internal/calc/{doc.go,decimal.go,decimal_test.go,fuzz_test.go}` | 1 |
| 3 | Catalog, `Calculator`, errors, `Outcome`, `FuzzCalculate`, `BenchmarkCalculate` | CALC-OPS-01 | Codex (same thread, after 2) | `backend/internal/calc/{errors.go,operations.go,calculator.go,calculator_test.go,errors_test.go,bench_test.go}`, `fuzz_test.go` (append) | 2 |
| 4 | httpx package | API-HTTPX-01 | Claude subagent (Sonnet 5.5, effort high), in parallel with 2–3 | `backend/internal/platform/httpx/*.go` | 1 |
| 5 | Review, T0/T1, mutation checks, evidence, commits | all | controller | run folder `evidence/`; commits | 2–4 |

Disjoint files: tasks 2–3 own `internal/calc/**` only; task 4 owns `internal/platform/httpx/**` only. Neither implementer runs `go get`, `go mod tidy`, git, fuzzing longer than 5 s, benchmarks or coverage runs; the controller runs those (the `heavy` and `deps` leases are the controller's). `go.mod`/`go.sum` are the controller's: after task 3 the controller runs `go mod tidy` under the `deps` lease (go-cmp and apd become direct requirements).

Commits (sequential, explicit paths, no attribution trailers):
1. `feat(calc): add the Go module, lint configuration and decimal parsing and formatting` — CALC-CORE-01 (task 1 + 2 files, the run folder records at that point).
2. `feat(calc): add the operation catalog and arbitrary-precision calculator` — CALC-OPS-01 (task 3 files, `go.mod`/`go.sum` after tidy, benchmark output in the body).
3. `feat(httpx): add problem details, strict JSON decoding, request context and middleware` — API-HTTPX-01.
4. `docs(state): RUN-M1-1 closure` — closure, findings, evidence.
(`docs(state): RUN-M1-1 spec and plan` is committed before dispatch.)

## Task 1 — module and lint (CALC-CORE-01)

- `go.mod`: `module github.com/JerikH/FullStackCalculator/backend`, `go 1.27.3`, no `toolchain`; `github.com/cockroachdb/apd/v3 v3.2.3`, `github.com/google/go-cmp v0.7.0` (latest at `go get` time).
- `.golangci.yml`: as in the spec; `golangci-lint config verify` passes on 2.15.0 (checked).

## Task 2 — decimal core (CALC-CORE-01)

```go
package calc
const ( Precision = 34; MaxExponent = 6144; MinExponent = -6143; MaxOperandLength = 128 )
var ErrOperandTooLong, ErrInvalidNumber, ErrTooManyDigits, ErrOutOfRange error // texts = RF-CALC-03 reasons
func Parse(s string) (*apd.Decimal, error)
func Format(d *apd.Decimal) string
var numberSyntax *regexp.Regexp             // ^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?$
func adjustedExponent(d *apd.Decimal) int64 // exponent + digits − 1
```

Rules:
- P1 length `utf8.RuneCountInString(s) > 128` → `ErrOperandTooLong` (checked first; characters, not bytes).
- P2 regex mismatch → `ErrInvalidNumber` (keeps apd's `NaN`/`Infinity`/`+1`/whitespace out).
- P3 zero: if every digit of the coefficient part (before `e`/`E`, ignoring `-` and `.`) is `0`, return a zero with exponent 0 and the input's sign — without calling apd on the exponent, so an int32-overflowing exponent of a zero is accepted.
- P4 `apd.NewFromString` error on a syntactically valid non-zero → `ErrOutOfRange` (exponent parse overflow).
- P5 reduce; `NumDigits() > 34` → `ErrTooManyDigits` (checked before the range).
- P6 adjusted exponent outside [−6143, 6144] → `ErrOutOfRange`.
- P7 return the parsed (unreduced) value.
- F1 `Format`: zero → `"0"`; reduce; coefficient digits via `Coeff.Text(10)`; adjusted exponent `adj`; `adj < -6 || adj > 20` → `d[.ddd]e±N`; `exp >= 0` → digits + zeros; `adj >= 0` → digits with the point inside; else `0.` + `-adj-1` zeros + digits; leading `-` for negative non-zero.

Tests (T0 unless noted):
- `TestParseAcceptsValidNumbers`: the plan table plus `0e9999999999`, `-0e9999999999`, `0.000e-99999999999`, `1e-6143` (lower bound), `9.999999999999999999999999999999999e6144`, a 128-character valid operand (e.g. `"0." + 125 zeros + "1"` → check it is in range: adjusted −126 ✓), each `Cmp`-equal to the apd parse of the same text where apd can parse it, else equal to zero.
- `TestParseRejectsInvalidNumbers`: the plan table plus `"1e+"`, `"-"`, `"--1"`, `"1.5.5"`, `"١"` (non-ASCII digit), `"1e6145"`, `"1e-6144"`, `"-1e-6144"`, 129-character non-number → `ErrOperandTooLong` (P1 before P2), 35 significant digits with `e9999` → `ErrTooManyDigits` (P5 before P6), `"1" + 34 zeros` (35 digits but reduces to 1 → valid, in the valid table), `"1e9999999999"`, `"-1e-9999999999"` → `ErrOutOfRange`.
- `TestOperandErrorTexts`: each sentinel's `.Error()` equals the RF-CALC-03 string byte for byte (U+2026 in the range message).
- `TestFormat`: the plan table plus `1e-6` → `0.000001`, `-1e21` → `-1e+21`, `1.23e-7` → `1.23e-7`, `99999999999999999999` (adj 19) and `1.5e20` (adj 20) plain, `1e-6143` → `1e-6143`, `-0.000` → `0`, `123e18` → `123000000000000000000` (adj 20).
- `FuzzParse` (T1, 20 s, heavy lease): round trip and wire syntax; seeds of the plan plus `0e9999999999`.
- Mutations (T1): plain upper bound 20 → 21 (the `1e21` row fails); remove P3 (the `0e9999999999` row fails).

## Task 3 — calculator (CALC-OPS-01)

```go
type OperationInfo struct { Name, Symbol, Description string; Arity int }
type Result struct { Value string; Inexact bool }
type Calculator struct { /* ops map[string]operation; catalog []OperationInfo; context apd.Context */ }
func New() *Calculator
func (c *Calculator) Operations() []OperationInfo
func (c *Calculator) Has(name string) bool
func (c *Calculator) Calculate(ctx context.Context, name string, operands []string) (Result, error)
func Outcome(err error) string
var ErrUnknownOperation, ErrArity, ErrDivisionByZero, ErrUndefined, ErrOverflow error
type OperandError struct { Index int; Err error }           // Error() "operand <i>: <reason>", Unwrap() error
type InvalidOperandsError struct { Operands []OperandError } // Error() "invalid operands: …; …", Unwrap() []error
// unexported: detailedError{kind, detail} (Error = detail, Unwrap = kind), arityError, classify, operation, applyFunc,
// builtinOperations, binary, divide, power, sqrt, percentage, isInteger, isExactSquareRoot, parseOperands
```

Rules (C1…C12 are what the tests pin):
- C1 catalog order, names, symbols (U+2212 `−`, U+00D7 `×`, U+00F7 `÷`, U+221A `√`), arities, descriptions (RF-CALC-01); `Operations()` = `slices.Clone`.
- C2 context: precision 34, half-even, exponents [−6143, 6144], the seven traps (RF-CALC-02); a per-call copy of the context value.
- C3 `ctx.Err()` first (RF-CALC-10), then unknown name, then arity, then operands.
- C4 arity message `<op> takes exactly <n> operand(s), got <m>`, singular for arity 1 (RF-CALC-09).
- C5 every invalid operand collected with its index (RF-CALC-03).
- C6 divide: zero divisor (incl. `0÷0`, `-0`) → `ErrDivisionByZero` with its default text (RF-CALC-05).
- C7 power: `0^0 = 1` (incl. `-0^0`, `0^-0`), zero base (incl. `-0`) with a negative exponent → DIVISION_BY_ZERO detail, negative **non-zero** base with a non-integer exponent → UNDEFINED detail (`-0^0.5 = 0`); `isInteger` reduces first (`2.0` is an integer); result out of range → `ErrOverflow` (RF-CALC-06).
- C8 sqrt: negative non-zero → UNDEFINED detail; `√(−0) = 0`; exact roots `inexact: false` by squaring in a 70-digit context (RF-CALC-07).
- C9 percentage = ÷ 100 (RF-CALC-08).
- C10 classify: pre-check errors pass through; apd conditions mapped as in the spec; else a wrapped `calc: unexpected arithmetic condition` error (Outcome `internal`).
- C11 non-finite → `ErrOverflow`; `inexact` = `cond.Inexact()` (RF-CALC-09); underflow → 0, inexact (RF-CALC-02).
- C12 `Outcome` labels (RF-CALC-10).
- C13 power out of range by quadrant (spec): `Pow` failing with an overflow/underflow condition → overflow when |base| > 1 and exponent > 0 or |base| < 1 and exponent < 0, else 0 with Underflow|Inexact|Rounded|Subnormal and no error.
- C14 exact fractional powers: non-integer exponent + Inexact → p/q reduced, q ≤ 64 and |p| ≤ 64 → exact check `r^q = base^p` (`r^q·base^|p| = 1` for p < 0) in a context of precision q·digits(r) + |p|·digits(base) + 2 and apd's widest exponent range; any error → not verified; verified → clear Inexact and Rounded.
- C15 flush: a finite non-zero result whose adjusted exponent is < −6143 becomes `0` with `inexact: true` (after C13/C14, before formatting).

Extra tests for C13–C14: the four quadrants with exponents ±1e30 and bases 2, 0.1, −2, −0.1; `power 10 -6144` → `0` inexact (C15); `divide 1e-6143 10` → `0` inexact; `percentage 1e-6143` → `0` inexact; `multiply 1.234567e-6143 1e-30` → `0` inexact; `power -0 0.5` → `0`; `power -0 -1` → DIVISION_BY_ZERO; `9^1.5` → `27` exact; `100^0.5` → `10` exact; a direct `isExactSquareRoot` test (true for 4/2, false for 2/1.414…); a fractional-power table pinning value and inexact: `4^0.5` → `2` exact, `16^0.25` → `2` exact, `1^0.5` → `1` exact, `0.25^0.5` → `0.5` exact, `9^-0.5` inexact, `8^0.3333333333333333333333333333333333` inexact, `1.5^2.5` inexact.

Tests (T0 unless noted):
- `TestOperationsCatalog`: exact catalog via `cmp.Diff`, defensive copy, `Has`.
- `TestCalculateResults`: the plan table plus `subtract 0 0` → `0`, `divide -0 5` → `0`, `power 2.0 3` → `8`, `power -2 2.0` → `4`, `power 10 -7` → `1e-7`,  `add 9.999999999999999999999999999999999e6144 0` → unchanged, `multiply 1e-6000 1e-6000` → `0` inexact, `sqrt 1e-6142`→ `1e-3071` exact.
- `TestCalculateFractionalPowerValue`: `power 4 0.5` value `2`.
- `TestCalculateErrors`: the plan table plus `divide 0 -0` (DIVISION_BY_ZERO), `power -0 -1` (zero base negative power), `power -8 1.5`, `sqrt -0.0001`, `add 9.999999999999999999999999999999999e6144 9.999999999999999999999999999999999e6144` → overflow, `divide 1e6144 1e-6143` → overflow, `percentage` with 2 operands → `percentage takes exactly 1 operand, got 2`, `divide` with 3 operands → `divide takes exactly 2 operands, got 3`, `add` with 0 operands → `add takes exactly 2 operands, got 0`; each asserts `errors.Is` to the sentinel and the exact `.Error()` text.
- `TestCalculateCollectsEveryInvalidOperand` (plan) and order: arity is checked before operand validity (`add ["abc"]` → arity error).
- `TestCalculateHonoursCanceledContext` (plan) plus deadline exceeded; a cancelled context with an unknown operation still returns the context error (C3 order).
- `TestCalculateIsSafeForConcurrentUse`: one `Calculator`, 8 goroutines × mixed operations, results equal to the serial ones (under `-race`).
- `TestOutcome`, `TestInvalidOperandsErrorMessage` (plan).
- `FuzzCalculate` (T1, 30 s, heavy lease), `BenchmarkCalculate` six cases (T1, heavy lease, `-benchtime` default, output to `evidence/bench.txt`).
- Coverage (T1, heavy lease): `go test -race -cover ./internal/calc/` ≥ 95 %.
- Mutations (T1): remove the `0^0` pre-check; return `c.catalog` without clone; make `isExactSquareRoot` always return true (`sqrt 2` row fails); remove the C15 flush (`percentage 1e-6143` row fails); swap arity and operand-validation order.

## Task 4 — httpx (API-HTTPX-01)

Signatures as in the spec's «Interface produced». Unexported: `problemTypes map[Code]problemType`, `contentTypeJSON`, `contentTypeProblem`, `writeBody`, `decodeProblem`, `isJSON`, `ptr`, `validRequestID`, `infoKey`, `recorder` (`WriteHeader`, `Write`, `Unwrap`).

Rules (H1…H14):
- H1 the 11 codes, status, title (RF-API-05); `Codes()` sorted; unknown code → internal.
- H2 `type` = `urn:calculator:problem:` + lowercase kebab of the code.
- H3 `Problem` JSON names `type,title,status,detail,instance,code,requestId,errors`; `detail` and `requestId` never omitted; `instance`, `errors` omitempty.
- H4 `WriteProblem`: `instance = r.URL.Path`, `requestId = RequestID(ctx)`, `application/problem+json`.
- H5 `WriteJSON(w, r, status, v)` / `writeBody`: marshal first; `Content-Type`, `Cache-Control: no-store`, `Content-Length`; trailing newline; a `WriteJSON` encoding failure → `WriteProblem(w, r, NewProblem(CodeInternal, "an unexpected error occurred"))` (complete problem with `instance` and `requestId`; no hand-written JSON).
- H6 `DecodeJSON` order: media type (415) → `io.ReadAll(http.MaxBytesReader(w, r.Body, MaxBodyBytes))` (`*http.MaxBytesError` → 413; another read error → `not valid JSON`) → decoder over the bytes: first value into `json.RawMessage` (`io.EOF` → empty; anything else → `not valid JSON`) → second `Decode` must be `io.EOF` (else `single JSON object`) → first byte of the raw value must be `{` (else `single JSON object`) → exact top-level keys when `dst` is a pointer to a struct: walk the raw object with `Decoder.Token`, skipping each value (`json.RawMessage` decode), and require every key to be byte-equal to a JSON name of the struct's exported fields (tag name before `,`; untagged → the Go field name; `-` → skipped; embedded structs are not used and need no support) — else `unknown field %q` → strict decode of the raw value into `dst` with `DisallowUnknownFields` (unknown field → `strings.TrimPrefix(err.Error(), "json: ")` when the text starts with `json: unknown field `; `*json.UnmarshalTypeError` → `single JSON object`; anything else → `not valid JSON`).
- H7 exactly the four MALFORMED details, 413 detail `request body must not exceed 4096 bytes`, 415 detail `Content-Type must be application/json`.
- H8 request ID regex `^[A-Za-z0-9._-]{1,128}$`; replacement `rand.Text()`; header set before `next`.
- H9 `RequestInfo.Route` default `unmatched`; `Route` sets the pattern; recorder keeps the first final status (1xx passed through, not recorded), implicit 200 on first `Write`, sums bytes; `Unwrap`.
- H10 `Chain`: `mws[0]` outermost.
- H11 `AccessLog`: logs in a `defer` (also when `http.ErrAbortHandler` unwinds through it); fields of RF-OBS-05, `LogAttrs(r.Context(), …)`, error level for ≥ 500, `duration_ms` as float milliseconds.
- H12 `Recover`: 500 problem, no panic value in the body, `ErrorContext(r.Context(), "panic recovered", panic, stack)`; `http.ErrAbortHandler` re-panicked; nothing more written when a status was already written, but `info.Status` is set to 500 (the access line and metrics count the panic as 500).
- H13 `SecureHeaders`: the four headers before `next`.
- H14 `Methods`: dispatch; else `Allow` sorted `", "`-joined and 405 detail `<METHOD> is not allowed; use <allow>`; `NotFound` fixed 404 detail.

Tests (T0 unless noted): every bullet of the spec's API-HTTPX-01 verification, in `problem_test.go` (H1–H3), `respond_test.go` (H4–H5), `decode_test.go` (H6–H7; the target struct of the table has a `Name string` field, a `M map[string]int` field and an `Operands json.RawMessage` field so the repeated-key and map-key rows are real), `requestinfo_test.go` (H8–H9), `middleware_test.go` (H10–H13; the panic test uses a test `slog.Handler` that adds `request_id` from `RequestID(ctx)` and asserts the logged id equals the response header), `methods_test.go` (H14). Coverage ≥ 90 % (T1, heavy lease). Mutations (T1): drop the `^` anchor of the request-ID regex (the invalid-ID table includes `<x>abc` and `has space`, whose valid suffix then matches, so the test fails); remove the `{` check (the `null` row fails); remove `DisallowUnknownFields` (the unknown-field rows fail).

## Targeted checks the controller runs (T0/T1)

```
cd backend
go build ./... && go vet ./...
../bin/golangci-lint fmt --diff ./... && ../bin/golangci-lint run ./...
go test -race ./internal/calc/ ./internal/platform/httpx/
# heavy lease:
go test -race -cover ./internal/calc/ ./internal/platform/httpx/
go test ./internal/calc -run '^$' -fuzz FuzzParse -fuzztime 20s
go test ./internal/calc -run '^$' -fuzz FuzzCalculate -fuzztime 30s
go test ./internal/calc -run '^$' -bench . -benchmem
cd .. && scripts/ci/t0.sh --base main
```

## What NOT to touch

`backend/api/**`, `redocly.yaml`, `frontend/**`, `tools/versions.env`, `.github/**`, every `docs/` file outside `docs/state/runs/RUN-M1-1/`, `scripts/ci/**` except the body of `ci_stage_backend` (U8, only on a defect found by `t0.sh`).

## Review log
(filled at step 6)
