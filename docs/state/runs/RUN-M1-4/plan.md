# RUN-M1-4 — Plan

Spec: `spec.md` (corrected by its review log). Interfaces and rules only; the implementation sources are the plan tasks for observability, the HTTP API and the runtime, adapted as listed here. Module path `github.com/JerikH/FullStackCalculator/backend`. Tier references: T0/T1 of the test-environment recipe.

## Order and ownership

| # | Task | Member | Implementer | Owns | Depends on |
|---|---|---|---|---|---|
| 1 | buildinfo, `web/noembed.go`, worst-case benchmark | OBS-METRICS-01, OBS-RUNTIME-01, API-ROUTES-01 (U12) | controller (small, verbatim) | `backend/internal/buildinfo/**`, `backend/internal/web/noembed.go`, `backend/internal/calc/bench_test.go` | — |
| 2 | observability | OBS-METRICS-01 | Claude subagent A | `backend/internal/observability/**` | 1 |
| 3 | httpapi + contract tests | API-ROUTES-01 | Codex (background) | `backend/internal/httpapi/**` | 1 |
| 4 | config | OBS-RUNTIME-01 | Claude subagent B | `backend/internal/config/**` | — |
| 5 | app + cmd | OBS-RUNTIME-01 | Codex (resume of task 3's thread) | `backend/internal/app/**`, `backend/cmd/calculator/**` | 1–4 |

Tasks 2, 3, 4 run at the same time (disjoint files; 1 Codex + 2 subagents, the session limit). `backend/go.mod`/`go.sum` belong to the controller only (`go mod tidy` under the `deps` lease after task 5). Only the controller runs git. Commits: one per member (OBS-METRICS-01: buildinfo + observability; API-ROUTES-01: httpapi + bench; OBS-RUNTIME-01: config + app + cmd + noembed + go.mod/go.sum), each with its run-folder records.

## Task 1 — buildinfo, noembed, worst-case benchmark

```go
// package buildinfo
var Version = "dev"; var Commit = ""
type Info struct{ Version, Commit, GoVersion string }
func Get() Info                                   // {Version, commit(), runtime.Version()}
func revision(settings []debug.BuildSetting) string // first 12 chars of vcs.revision when ≥ 12 long, else "unknown"
```
Rules: `Commit` (ldflags) wins; otherwise `revision` of `debug.ReadBuildInfo()` settings; no build info → `unknown`.
Tests (T0): `Get()` reports `Version`, `runtime.Version()`, non-empty commit; ldflags commit wins; `revision` table — 40-char revision → first 12; short (< 12) → `unknown`; absent → `unknown`.

`web/noembed.go`: `//go:build !embedui`; package doc comment; `const Enabled = false`; `func Handler() http.Handler { return nil }`.

`BenchmarkCalculateWorstCase` (U12): cases `max^0.5`, `min^0.5`, `max^0.99…9`, `min^0.99…9`, `max^-0.99…9`, `1.5e-6143^-0.99…9`, `(-1)^1e6144` with max = `9.999999999999999999999999999999999e6144`, min = `1e-6143`, 0.99…9 = `0.` + 34 nines; before the loop each case calls `Calculate` once and `b.Fatalf` on an error; `b.ReportAllocs()`, `b.Loop()`. Budget < 50,000,000 ns/op each (recorded, heavy lease).

## Task 2 — observability (OBS-METRICS-01)

```go
func NewLogger(w io.Writer, level slog.Level, format string) *slog.Logger // "text" → text handler, else JSON
type Calculator interface {
    Calculate(ctx context.Context, name string, operands []string) (calc.Result, error)
    Operations() []calc.OperationInfo
}
type Metrics struct{ requests *CounterVec; duration *HistogramVec; inFlight Gauge; operations *CounterVec }
func NewMetrics(reg prometheus.Registerer, info buildinfo.Info) *Metrics // MustRegister the 5 families + Go + process collectors
func (m *Metrics) Middleware(next http.Handler) http.Handler
func (m *Metrics) InstrumentCalculator(c Calculator) Calculator
```
Rules:
- Logger: context handler adds `request_id` = `httpx.RequestID(ctx)` when non-empty; `WithAttrs`/`WithGroup` return the wrapper.
- Middleware: `inFlight.Inc()`; `defer` one function that decrements in-flight and observes counter and histogram from `httpx.Info(r.Context())` (`Route`, `StatusOrOK()`), or `unmatched`/200 without request info; method label from the seven known methods else `OTHER`. The observation must run when `next` panics (ErrAbortHandler) — it runs in the defer and must not recover.
- Decorator: known names snapshotted at construction; label `unknown` for others; `outcome = calc.Outcome(err)`; result and error returned unchanged; `Operations()` delegates.
Tests (T0, `testutil.GatherAndCompare`):
- method `OTHER` and route pattern with status 422 (two requests → two series).
- histogram has one series per (method, route) and its `le` boundaries are exactly the RF-OBS-06 buckets (exposition-text comparison of `http_request_duration_seconds_bucket`).
- chain `RequestContext → Middleware → Recover → panicking route` → `status="500"` counted; `httpx.Recover` from the merged package.
- chain where the route writes 200 headers then panics → Recover re-panics ErrAbortHandler; the test serves it and recovers the re-panic itself; `status="500"` counted and in-flight back to 0.
- without RequestContext → `route="unmatched",status="200"`.
- decorator: ok, division_by_zero, unknown name → `unknown`, `context.Canceled` → `canceled`; `Operations()` delegates; the wrapped result/error are returned unchanged.
- build info gauge exposition; the Go and process collectors are registered (`go_goroutines` gathered).
- logger: `request_id` from RequestContext + `With` attrs kept; absent without context; level filter and text format with group.

## Task 3 — httpapi (API-ROUTES-01)

```go
type Calculator interface { Calculate(...) (calc.Result, error); Operations() []calc.OperationInfo }
type Readiness struct{ draining atomic.Bool }
func (r *Readiness) Drain(); func (r *Readiness) Draining() bool
type Deps struct{ Calculator Calculator; Logger *slog.Logger; Readiness *Readiness; Build buildinfo.Info; Web http.Handler }
func NewRouter(d Deps) http.Handler
func problemFor(err error, operation string) httpx.Problem   // unexported
```
Rules (routes and order as `spec.md`):
- `NewRouter` returns an `http.HandlerFunc` that sets `Cache-Control: no-store`, then, when `r.URL.Path` is non-canonical (`c := path.Clean(p)`; if `p` ends in `/` and `c != "/"` append `/`; `c != p`), answers `httpx.NotFound(w, r)`; otherwise calls the mux. The exact pattern `/api` is registered → `httpx.NotFound` (wrapped in `httpx.Route`).
- Every pattern wrapped with `httpx.Route(pattern, …)`; GET-only and POST-only via `httpx.Methods`; `/api/` and (without Web) `/` → `httpx.NotFound`; with Web `/` → `Methods{GET, HEAD}`.
- `list`: `WriteJSON(w, r, 200, {"operations":[…]})` in `Operations()` order.
- `calculate`: catalog check (snapshot of names) → `DecodeJSON` into `struct{ Operands json.RawMessage \`json:"operands"\` }` → `decodeOperands(raw) ([]string, *httpx.FieldViolation)`: empty or `null` → `is required`; otherwise unmarshal into `[]json.RawMessage` (error → wrong type), then every element must unmarshal as a JSON string whose raw first byte is `"` (else wrong type) → `Calculate(r.Context(), name, operands)` → error: `problemFor`; 5xx: canceled/deadline → `logger.WarnContext(ctx, "calculation canceled", operation)`, else `logger.ErrorContext(ctx, "calculation failed", operation, error)`; success `WriteJSON(w, r, 200, {operation, operands, result, inexact})`.
- `problemFor`: `*calc.InvalidOperandsError` → VALIDATION_FAILED `one or more operands are invalid` + `operands[i]` violations with `op.Err.Error()`; `calc.ErrArity` → VALIDATION_FAILED, detail and single `operands` violation = `err.Error()`; `ErrUnknownOperation` → UNKNOWN_OPERATION with the `%q` detail; DIVISION_BY_ZERO / UNDEFINED_RESULT / OVERFLOW with `err.Error()`; everything else (incl. cancellation) INTERNAL_ERROR `an unexpected error occurred`.
- `serveSpec`: `Content-Type: application/yaml`, `Cache-Control: no-store`, `Content-Length`, `Write(api.Spec)`.
- Health: liveness `{"status":"ok",version,commit}` 200 always; readiness `ready` 200 or `draining` 503, all through `WriteJSON(w, r, …)`.
Tests (T0) — router table through `httpx.Chain(router, RequestContext, Recover, SecureHeaders)`:
- success divide `1/3` (body, `application/json; charset=utf-8`, `no-store`, `nosniff`, CSP, Referrer-Policy, CORP, X-Request-ID); add `0.1+0.2` → `0.3` exact; `sqrt 16` → `4` exact; `power 0 0` → `1`; underflow → `0` inexact (E12).
- list: 7 operations in catalog order, first = add/+/2/Sum of two numbers.
- problems table (status, code, detail, `errors[]` exact, `application/problem+json`, `instance` = path, `requestId` = header, `no-store`): unknown op with bad media type and bad body (rule 1 first); unknown op with a 5 KB body (body never read); 415 missing and `text/plain`; `application/json; charset=utf-8` accepted; 413; empty; invalid JSON; unknown field `x`; `OPERANDS`; trailing data; `[]` and `null` → single object; operands missing; `null`; numbers; a string; `[null]`; `["1",null]`; an object; arity add 1, sqrt 2 (`sqrt takes exactly 1 operand, got 2`); invalid operands `["abc","1e99999"]` (two violations, raw values absent from the body); divide by zero; `0 ÷ 0`; `0 ^ -1` (`zero cannot be raised to a negative power`); sqrt −4; `(-8)^0.5` undefined; overflow `2^1e30` and `1e6144 × 10`; wrong method GET on calculate (`Allow: POST`), POST on list (`Allow: GET`, `POST is not allowed; use GET`), DELETE on `/healthz`; `GET /api/v1/operations/modulo` → 405 `Allow: POST` (method before catalog); `/api/nope` 404; `/api` 404; `/` without Web 404; `/api/v1/operations/` 404 NOT_FOUND.
- repeated `operands` key → last occurrence used.
- X-Request-ID: valid inbound echoed (header and `requestId`); invalid (space, `<script>`, 129 chars) replaced.
- non-canonical paths `GET /api/v1//operations`, `GET /api/./v1/operations`, `POST /x/../api/v1/operations/add` → 404 NOT_FOUND problem (never a 307), `no-store`, `nosniff`.
- failing calculator → 500 opaque, error logged with the message; canceled request context (`httptest.NewRequestWithContext` with a cancelled context) → 500 problem, warn log `calculation canceled`, no error-level line; a panicking calculator → 500 problem through Recover, logged with `request_id`.
- openapi: 200, `application/yaml`, `no-store`, body bytes equal `api.Spec`, `Content-Length` equal its length.
- web handler at `/` (GET and HEAD), not under `/api/`, `POST /` → 405 `Allow: GET, HEAD`.
- health: ok/ready, Drain → `Draining()` true, readyz 503 `draining` with version/commit, healthz still 200; healthz/readyz carry `no-store`.
- `problemFor` maps every domain error incl. a wrapped arity error and `context.Canceled`.
- contract: every documented status the service emits validated with `ValidateHttpResponse` (request validation only for valid requests) — list 200; calculate 200 (four ops), 400 ×2 codes, 404 unknown op, 413, 415, 422 ×3, 500; openapi 200; healthz 200; readyz 200 and 503 (draining Readiness); 405 and unmatched-404 bodies validated against `#/components/schemas/Problem` with `Allow` asserted for `/api/v1/operations`, `/api/v1/operations/add`, `/api/v1/openapi.yaml`, `/healthz`, `/readyz`; catalog == `OperationName` enum (order); `httpx.Codes()` ⊆ `ProblemCode` enum and `RATE_LIMITED`, `SERVICE_UNAVAILABLE` ∉ `Codes()`. Never relax the YAML; if the validator cannot express a check, the test fails loudly rather than skipping.

## Task 4 — config (OBS-RUNTIME-01)

```go
type Config struct{ HTTPAddr, AdminAddr string; LogLevel slog.Level; LogFormat string; ShutdownTimeout, ShutdownDrain time.Duration; EnablePprof bool }
func Load(lookup func(string) (string, bool)) (Config, error)
```
Rules: defaults of RF-OBS-01; a set-but-empty variable is a value (empty admin → disabled; empty HTTP addr → invalid); address = `net.SplitHostPort` ok and port numeric 0–65535 (`strconv.ParseUint(port, 10, 16)`); level case-insensitive in debug/info/warn/error (`info+2` rejected); format exactly json/text; durations via `time.ParseDuration`; every failure `NAME="value": reason`, joined with `errors.Join`, `Config{}` returned on error.
Tests (T0): defaults; overrides; every variable invalid at once (message names all seven); port rules (`:`, `:http`, `:65536`, `nonsense` rejected; `:0`, `127.0.0.1:4111`, `[::1]:80` accepted); `INFO` accepted; `info+2` rejected; empty `CALC_HTTP_ADDR` rejected; drain `0s` accepted, timeout `0s` rejected.

## Task 5 — app and cmd (OBS-RUNTIME-01)

```go
type App struct{ cfg config.Config; logger *slog.Logger; readiness *httpapi.Readiness; api, admin *http.Server; apiLn, adminLn net.Listener }
func New(cfg config.Config, logger *slog.Logger) (*App, error)
func (a *App) Addr() net.Addr
func (a *App) AdminAddr() net.Addr // nil when disabled
func (a *App) Run(ctx context.Context) error
func Main(ctx context.Context, args []string, lookupEnv func(string) (string, bool), stdout, stderr io.Writer) int
func Probe(ctx context.Context, addr string, client *http.Client) error
// unexported seams
func compose(router http.Handler, logger *slog.Logger, m *observability.Metrics) http.Handler // the RF-API-12 chain
func adminHandler(g prometheus.Gatherer, pprofEnabled bool) http.Handler
func listen(cfg config.Config, logger *slog.Logger, readiness *httpapi.Readiness, public, admin http.Handler) (*App, error)
func probeTarget(addr string) (string, error)
const healthcheckTimeout = 2 * time.Second
```
Rules:
- `New`: `buildinfo.Get()`, new `prometheus.NewRegistry()`, `observability.NewMetrics`, `Readiness`, router with `metrics.InstrumentCalculator(calc.New())`, `web.Handler()`; `compose`; `listen` binds the public listener then (when `AdminAddr != ""`) the admin one, closing every listener already bound on failure; errors wrap the address.
- `newServer(h, logger) *http.Server` (unexported, unit-tested for the RF-OBS-04 fields).
- `compose`: `httpx.Chain(router, httpx.RequestContext, httpx.AccessLog(logger), m.Middleware, httpx.Recover(logger), httpx.SecureHeaders)`.
- `adminHandler`: `GET /metrics` → `promhttp.HandlerFor(g, HandlerOpts{EnableOpenMetrics: true})`; pprof routes only when enabled.
- Servers per RF-OBS-04 with `ErrorLog: slog.NewLogLogger(logger.Handler(), slog.LevelWarn)`.
- `Run`: start one `Serve` goroutine per server, each sending its result (nil for `http.ErrServerClosed`) on a buffered channel; log `server started` (addr, admin_addr); `select` on a non-nil serve result (→ shut down, wait for all goroutines, return `server failed: %w`) and `ctx.Done()`; then `Drain()`, `shutdown started` (drain), wait `ShutdownDrain` in a `select` that also ends on a server failure; then `shutdown`: one `context.WithTimeout(context.WithoutCancel(ctx), ShutdownTimeout)`, `Shutdown` of both servers in parallel goroutines, `errors.Join` of the results; on any error `Close()` both; wait for every `Serve` goroutine; `shutdown complete` only on success; error wraps `shutdown: %w`.
- `Main`: args `[prog]` serve, `[prog, healthcheck]` probe, `[prog, healthcheck, …]` → stderr + exit 1, any other subcommand usage exit 2; healthcheck: invalid config → stderr + exit 1; probe failure → stderr + 1; serve: invalid config → `invalid configuration:` + the joined errors on stderr, exit 2; logger `observability.NewLogger(stdout, …)`, `slog.SetDefault`; `New` error → `startup failed` exit 1; `Run` error → `server stopped with error` exit 1.
- `Probe`: GET `http://<target>/healthz` with ctx; non-200 → error; body drained and closed. `probeTarget`: wildcard hosts (`""`, `0.0.0.0`, `::`) → `127.0.0.1`; others kept (`JoinHostPort`).
- `cmd/calculator`: `ctx, stop := signal.NotifyContext(...)`; `go func(){ <-ctx.Done(); stop() }()`; `code := app.Main(...)`; `stop()`; `os.Exit(code)`.
Tests (T1, not parallel, real sockets on `127.0.0.1:0`):
- serve/drain/shutdown: calculate 0.3 with X-Request-ID and nosniff; admin `/metrics` has the five families and `calculator_operations_total{operation="add",outcome="ok"} 1`; pprof 200 when enabled; public `/metrics` and `/debug/pprof/` → 404 problem; after cancel, readyz 503 **must be observed** (drain 500 ms, poll) while healthz 200; Run returns nil; logs contain `server started`, `shutdown started`, `shutdown complete`, an `http request` line with `request_id`.
- pprof disabled → admin `/debug/pprof/` 404.
- admin disabled → `AdminAddr()` nil and Run serves only the public listener.
- bind failure on the public and on the admin address; after the admin failure the same public address can be bound again (listener closed).
- `newServer` fields: ReadHeaderTimeout 5 s, ReadTimeout 10 s, WriteTimeout 15 s, IdleTimeout 60 s, MaxHeaderBytes 16384, ErrorLog non-nil and writing through the slog handler (a line printed to it appears in the JSON logs at WARN).
- early return: a listener closed before `Run` → Run returns an error without waiting for ctx.
- in-flight: `listen` with a public handler that blocks until released; a request started before cancel completes 200 after release; Run returns nil.
- shutdown timeout: blocked handler (it also watches `r.Context()`) never released before the deadline (ShutdownTimeout 100 ms) → Run returns an error, the client request fails (connection closed by `Close()`), and Run has returned only after the serve goroutines ended.
- end-to-end chain (follow-up (f)): `compose` with a router whose route panics, real `observability.NewLogger` (JSON) and `NewMetrics` on a fresh registry → 500 INTERNAL_ERROR problem; the `panic recovered` line's `request_id` equals the response header; the `http request` line has level ERROR and status 500; `http_requests_total{method="GET",route=<pattern>,status="500"} 1`.
- composed headers: through `New` + `Run`, a 200 (calculate), a problem (415), `/healthz`, `/readyz` 503 while draining and a non-canonical-path 404 each carry `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`, `Cross-Origin-Resource-Policy: same-origin`, `Cache-Control: no-store`, `X-Request-ID`.
- Main: healthcheck 0 against a running app; 1 with an extra argument; 1 against a closed port; 1 against a silent listener (accepts, never answers) within ~2 s (use the real `healthcheckTimeout`); 1 with an invalid configuration; usage 2 for `bogus` and for extra arguments; invalid serve config → 2 with `CALC_LOG_LEVEL` named on stderr; serve until ctx cancelled → 0 and `server started` on stdout; startup failure (port taken) → 1.
- `probeTarget` table incl. `[::]:80`, `:8081`, `10.0.0.5:81`, invalid.

## Targeted checks the controller runs (T0/T1)

```
eval "$(.workflow/bin/wf env --export)"; source scripts/ci/env.sh
cd backend && go build ./... && go vet ./...
go test -race -cover ./internal/buildinfo/ ./internal/observability/ ./internal/httpapi/ ./internal/config/ ./internal/app/
../bin/golangci-lint fmt --diff ./... && ../bin/golangci-lint run ./...
# heavy lease:
go test -race -shuffle=on -covermode=atomic -coverpkg=./internal/... -coverprofile=$WF_SCRATCH/cover.out ./... && go tool cover -func=$WF_SCRATCH/cover.out | tail -1
go test ./internal/calc -run '^$' -bench 'BenchmarkCalculate' -benchmem -count=3
scripts/ci/t0.sh --base main ; scripts/ci/t1.sh backend/internal/httpapi backend/internal/app
# smoke: CALC_HTTP_ADDR=:4111 CALC_ADMIN_ADDR=:4112 go run ./cmd/calculator ; curl add 0.1 0.2 ; kill -TERM
```
Mutations (each restored with `git checkout -- <file>`): decode before the catalog check; spec served `no-cache`; non-canonical path check removed; `SecureHeaders` dropped from `compose`; metrics observation outside the defer; Metrics and Recover swapped in `compose`; `Drain()` removed from `Run`; method label without the `OTHER` bound; decorator without the `unknown` bound; healthcheck config error exit 2 instead of 1.

## What NOT to touch

`backend/api/**`, `backend/internal/platform/httpx/**`, `backend/internal/calc/**` except `bench_test.go`, `frontend/**`, `scripts/ci/**`, `.github/**`, `deploy/**`, shared records under `docs/` outside this run folder.

## Review log

(filled at step 6)
