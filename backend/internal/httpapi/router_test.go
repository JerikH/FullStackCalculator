package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"testing"

	"github.com/JerikH/FullStackCalculator/backend/api"

	"github.com/google/go-cmp/cmp"

	"github.com/JerikH/FullStackCalculator/backend/internal/buildinfo"
	"github.com/JerikH/FullStackCalculator/backend/internal/calc"
	"github.com/JerikH/FullStackCalculator/backend/internal/platform/httpx"
)

func newTestServer(t *testing.T, c Calculator, web http.Handler) (http.Handler, *bytes.Buffer) {
	t.Helper()
	var logs bytes.Buffer
	logger := slog.New(requestIDHandler{slog.NewJSONHandler(&logs, nil)})
	router := NewRouter(Deps{
		Calculator: c,
		Logger:     logger,
		Readiness:  &Readiness{},
		Build:      buildinfo.Info{Version: "1.0.0", Commit: "abc"},
		Web:        web,
	})
	return httpx.Chain(router, httpx.RequestContext, httpx.Recover(logger), httpx.SecureHeaders), &logs
}

type response struct {
	status int
	header http.Header
	body   map[string]any
	raw    string
}

func do(t *testing.T, h http.Handler, method, path, contentType, body string) response {
	t.Helper()
	req := httptest.NewRequestWithContext(t.Context(), method, path, strings.NewReader(body))
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	raw, _ := io.ReadAll(rec.Body)
	var parsed map[string]any
	_ = json.Unmarshal(raw, &parsed)
	return response{status: rec.Code, header: rec.Header(), body: parsed, raw: string(raw)}
}

func TestCalculateSuccess(t *testing.T) {
	t.Parallel()
	h, _ := newTestServer(t, calc.New(), nil)
	r := do(t, h, http.MethodPost, "/api/v1/operations/divide", "application/json", `{"operands":["1","3"]}`)
	if r.status != 200 || r.header.Get("Content-Type") != "application/json; charset=utf-8" || r.header.Get("Cache-Control") != "no-store" {
		t.Fatalf("status %d headers %v", r.status, r.header)
	}
	want := map[string]any{
		"operation": "divide",
		"operands":  []any{"1", "3"},
		"result":    "0.3333333333333333333333333333333333",
		"inexact":   true,
	}
	if diff := cmp.Diff(want, r.body); diff != "" {
		t.Fatalf("body mismatch (-want +got):\n%s", diff)
	}
	if r.header.Get(httpx.HeaderRequestID) == "" {
		t.Fatal("missing X-Request-ID")
	}
}

func TestListOperations(t *testing.T) {
	t.Parallel()
	h, _ := newTestServer(t, calc.New(), nil)
	r := do(t, h, http.MethodGet, "/api/v1/operations", "", "")
	ops, _ := r.body["operations"].([]any)
	if r.status != 200 || len(ops) != 7 {
		t.Fatalf("status %d body %s", r.status, r.raw)
	}
	first, _ := ops[0].(map[string]any)
	if diff := cmp.Diff(map[string]any{"name": "add", "symbol": "+", "arity": float64(2), "description": "Sum of two numbers"}, first); diff != "" {
		t.Fatal(diff)
	}
	catalog := calc.New().Operations()
	want := make([]any, len(catalog))
	for i, op := range catalog {
		want[i] = map[string]any{"name": op.Name, "symbol": op.Symbol, "arity": float64(op.Arity), "description": op.Description}
	}
	if diff := cmp.Diff(want, ops); diff != "" {
		t.Fatalf("catalog order (-want +got):\n%s", diff)
	}
}

func TestProblems(t *testing.T) {
	t.Parallel()
	const js = "application/json"
	tests := []struct {
		name, method, path, ct, body string
		status                       int
		code, detail                 string
		violations                   []any
	}{
		{"unknown operation wins over bad body", "POST", "/api/v1/operations/modulo", "text/plain", "{", 404, "UNKNOWN_OPERATION", `operation "modulo" is not supported; see GET /api/v1/operations`, nil},
		{"media type", "POST", "/api/v1/operations/add", "text/plain", `{}`, 415, "UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json", nil},
		{"too large", "POST", "/api/v1/operations/add", js, `{"operands":["` + strings.Repeat("1", 5000) + `"]}`, 413, "PAYLOAD_TOO_LARGE", "request body must not exceed 4096 bytes", nil},
		{"empty", "POST", "/api/v1/operations/add", js, ``, 400, "MALFORMED_REQUEST", "request body must not be empty", nil},
		{"invalid json", "POST", "/api/v1/operations/add", js, `{`, 400, "MALFORMED_REQUEST", "request body is not valid JSON", nil},
		{"unknown field", "POST", "/api/v1/operations/add", js, `{"operands":["1","2"],"x":1}`, 400, "MALFORMED_REQUEST", `unknown field "x"`, nil},
		{"trailing data", "POST", "/api/v1/operations/add", js, `{"operands":["1","2"]} {}`, 400, "MALFORMED_REQUEST", "request body must contain a single JSON object", nil},
		{"not an object", "POST", "/api/v1/operations/add", js, `[]`, 400, "MALFORMED_REQUEST", "request body must contain a single JSON object", nil},
		{
			"operands missing", "POST", "/api/v1/operations/add", js, `{}`, 400, "VALIDATION_FAILED", "one or more fields are invalid",
			[]any{map[string]any{"field": "operands", "reason": "is required"}},
		},
		{
			"operands null", "POST", "/api/v1/operations/add", js, `{"operands":null}`, 400, "VALIDATION_FAILED", "one or more fields are invalid",
			[]any{map[string]any{"field": "operands", "reason": "is required"}},
		},
		{
			"operands as numbers", "POST", "/api/v1/operations/add", js, `{"operands":[1,2]}`, 400, "VALIDATION_FAILED", "one or more fields are invalid",
			[]any{map[string]any{"field": "operands", "reason": `must be an array of decimal strings, e.g. ["2", "3"]`}},
		},
		{
			"arity", "POST", "/api/v1/operations/add", js, `{"operands":["1"]}`, 400, "VALIDATION_FAILED", "add takes exactly 2 operands, got 1",
			[]any{map[string]any{"field": "operands", "reason": "add takes exactly 2 operands, got 1"}},
		},
		{
			"invalid operands", "POST", "/api/v1/operations/add", js, `{"operands":["abc","1e99999"]}`, 400, "VALIDATION_FAILED", "one or more operands are invalid",
			[]any{
				map[string]any{"field": "operands[0]", "reason": `must be a decimal number in JSON number syntax, e.g. "-12.5" or "1e-3"`},
				map[string]any{"field": "operands[1]", "reason": "magnitude is outside the supported range (1e-6143 … 1e6144)"},
			},
		},
		{"division by zero", "POST", "/api/v1/operations/divide", js, `{"operands":["1","0"]}`, 422, "DIVISION_BY_ZERO", "the divisor must not be zero", nil},
		{"sqrt negative", "POST", "/api/v1/operations/sqrt", js, `{"operands":["-4"]}`, 422, "UNDEFINED_RESULT", "square root of a negative number is not a real number", nil},
		{"overflow", "POST", "/api/v1/operations/power", js, `{"operands":["10","6145"]}`, 422, "OVERFLOW", "the result is outside the supported range (1e-6143 … 1e6144)", nil},
		{"wrong method", "GET", "/api/v1/operations/add", "", "", 405, "METHOD_NOT_ALLOWED", "GET is not allowed; use POST", nil},
		{"unknown api route", "GET", "/api/nope", "", "", 404, "NOT_FOUND", "no route matches the request method and path", nil},
		{"root without web", "GET", "/", "", "", 404, "NOT_FOUND", "no route matches the request method and path", nil},
		{"operands string", "POST", "/api/v1/operations/add", "application/json", "{\"operands\":\"12\"}", 400, "VALIDATION_FAILED", "one or more fields are invalid", []any{map[string]any{"field": "operands", "reason": "must be an array of decimal strings, e.g. [\"2\", \"3\"]"}}},
		{"operands object", "POST", "/api/v1/operations/add", "application/json", "{\"operands\":{}}", 400, "VALIDATION_FAILED", "one or more fields are invalid", []any{map[string]any{"field": "operands", "reason": "must be an array of decimal strings, e.g. [\"2\", \"3\"]"}}},
		{"operands null element", "POST", "/api/v1/operations/add", "application/json", "{\"operands\":[null]}", 400, "VALIDATION_FAILED", "one or more fields are invalid", []any{map[string]any{"field": "operands", "reason": "must be an array of decimal strings, e.g. [\"2\", \"3\"]"}}},
		{"operands mixed null", "POST", "/api/v1/operations/add", "application/json", "{\"operands\":[\"1\",null]}", 400, "VALIDATION_FAILED", "one or more fields are invalid", []any{map[string]any{"field": "operands", "reason": "must be an array of decimal strings, e.g. [\"2\", \"3\"]"}}},
		{"no media type", "POST", "/api/v1/operations/add", "", "{}", 415, "UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json", nil},
		{"uppercase field", "POST", "/api/v1/operations/add", "application/json", "{\"OPERANDS\":[\"1\",\"2\"]}", 400, "MALFORMED_REQUEST", "unknown field \"OPERANDS\"", nil},
		{"null body", "POST", "/api/v1/operations/add", "application/json", "null", 400, "MALFORMED_REQUEST", "request body must contain a single JSON object", nil},
		{"sqrt arity", "POST", "/api/v1/operations/sqrt", "application/json", "{\"operands\":[\"1\",\"2\"]}", 400, "VALIDATION_FAILED", "sqrt takes exactly 1 operand, got 2", []any{map[string]any{"field": "operands", "reason": "sqrt takes exactly 1 operand, got 2"}}},
		{"zero over zero", "POST", "/api/v1/operations/divide", "application/json", "{\"operands\": [\"0\", \"0\"]}", 422, "UNDEFINED_RESULT", "zero divided by zero is undefined", nil},
		{"zero negative power", "POST", "/api/v1/operations/power", "application/json", "{\"operands\": [\"0\", \"-1\"]}", 422, "DIVISION_BY_ZERO", "zero cannot be raised to a negative power", nil},
		{"negative fractional power", "POST", "/api/v1/operations/power", "application/json", "{\"operands\": [\"-8\", \"0.5\"]}", 422, "UNDEFINED_RESULT", "a negative number raised to a non-integer power is not a real number", nil},
		{"huge power", "POST", "/api/v1/operations/power", "application/json", "{\"operands\": [\"2\", \"1e30\"]}", 422, "OVERFLOW", "the result is outside the supported range (1e-6143 … 1e6144)", nil},
		{"multiply overflow", "POST", "/api/v1/operations/multiply", "application/json", "{\"operands\": [\"1e6144\", \"10\"]}", 422, "OVERFLOW", "the result is outside the supported range (1e-6143 … 1e6144)", nil},
		{"GET/api/v1/operations/modulo", "GET", "/api/v1/operations/modulo", "", "", 405, "METHOD_NOT_ALLOWED", "GET is not allowed; use POST", nil},
		{"POST/api/v1/operations", "POST", "/api/v1/operations", "", "", 405, "METHOD_NOT_ALLOWED", "POST is not allowed; use GET", nil},
		{"DELETE/healthz", "DELETE", "/healthz", "", "", 405, "METHOD_NOT_ALLOWED", "DELETE is not allowed; use GET", nil},
		{"GET/api/v1/operations/a%2Fb", "GET", "/api/v1/operations/a%2Fb", "", "", 405, "METHOD_NOT_ALLOWED", "GET is not allowed; use POST", nil},
		{"/api", "GET", "/api", "application/json", "{\"operands\":[\"1\",\"2\"]}", 404, "NOT_FOUND", "no route matches the request method and path", nil},
		{"/api/v1/operations/", "GET", "/api/v1/operations/", "application/json", "{\"operands\":[\"1\",\"2\"]}", 404, "NOT_FOUND", "no route matches the request method and path", nil},
		{"/api/v1//operations", "GET", "/api/v1//operations", "application/json", "{\"operands\":[\"1\",\"2\"]}", 404, "NOT_FOUND", "no route matches the request method and path", nil},
		{"/api/./v1/operations", "GET", "/api/./v1/operations", "application/json", "{\"operands\":[\"1\",\"2\"]}", 404, "NOT_FOUND", "no route matches the request method and path", nil},
		{"/x/../api/v1/operations/add", "POST", "/x/../api/v1/operations/add", "application/json", "{\"operands\":[\"1\",\"2\"]}", 404, "NOT_FOUND", "no route matches the request method and path", nil},
		{"escaped %2e", "POST", "/api/v1/operations/%2e", "application/json", "{\"operands\":[\"1\",\"2\"]}", 404, "UNKNOWN_OPERATION", "operation \".\" is not supported; see GET /api/v1/operations", nil},
		{"escaped a%2Fb", "POST", "/api/v1/operations/a%2Fb", "application/json", "{\"operands\":[\"1\",\"2\"]}", 404, "UNKNOWN_OPERATION", "operation \"a/b\" is not supported; see GET /api/v1/operations", nil},
	}
	h, _ := newTestServer(t, calc.New(), nil)
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			r := do(t, h, tt.method, tt.path, tt.ct, tt.body)
			if r.status != tt.status || r.body["code"] != tt.code || r.body["detail"] != tt.detail {
				t.Fatalf("got %d %v %q, want %d %s %q\n%s", r.status, r.body["code"], r.body["detail"], tt.status, tt.code, tt.detail, r.raw)
			}
			if r.header.Get("Content-Type") != "application/problem+json" || r.header.Get("Cache-Control") != "no-store" {
				t.Fatalf("Content-Type = %q", r.header.Get("Content-Type"))
			}
			if diff := cmp.Diff(tt.violations, r.body["errors"]); tt.violations != nil && diff != "" {
				t.Fatalf("errors mismatch (-want +got):\n%s", diff)
			}
			if _, ok := r.body["errors"]; tt.violations == nil && ok {
				t.Fatalf("errors present on %s: %s", tt.code, r.raw)
			}
			assertSecurityHeaders(t, r.header)
			if tt.status == 405 {
				allow := "POST"
				if tt.path == "/api/v1/operations" || tt.path == "/healthz" {
					allow = "GET"
				}
				if r.header.Get("Allow") != allow {
					t.Fatalf("Allow = %q, want %q", r.header.Get("Allow"), allow)
				}
			}
			if tt.name == "invalid operands" && (strings.Contains(r.raw, "abc") || strings.Contains(r.raw, "1e99999")) {
				t.Fatalf("raw operands leaked: %s", r.raw)
			}

			if r.body["requestId"] != r.header.Get(httpx.HeaderRequestID) || r.body["instance"] != decodedPath(t, tt.path) {
				t.Fatalf("requestId/instance wrong: %s", r.raw)
			}
		})
	}
}

func TestWrongMethodSetsAllow(t *testing.T) {
	t.Parallel()
	h, _ := newTestServer(t, calc.New(), nil)
	if got := do(t, h, http.MethodPut, "/api/v1/operations", "", "").header.Get("Allow"); got != "GET" {
		t.Fatalf("Allow = %q", got)
	}
}

type failingCalculator struct{ *calc.Calculator }

func (failingCalculator) Calculate(context.Context, string, []string) (calc.Result, error) {
	return calc.Result{}, errors.New("database on fire")
}

func TestUnexpectedErrorIsOpaqueAndLogged(t *testing.T) {
	t.Parallel()
	h, logs := newTestServer(t, failingCalculator{calc.New()}, nil)
	r := do(t, h, http.MethodPost, "/api/v1/operations/add", "application/json", `{"operands":["1","2"]}`)
	if r.status != 500 || r.body["detail"] != "an unexpected error occurred" || strings.Contains(r.raw, "fire") {
		t.Fatalf("got %d %s", r.status, r.raw)
	}
	if !strings.Contains(logs.String(), "database on fire") || !strings.Contains(logs.String(), `"level":"ERROR"`) {
		t.Fatal("internal error not logged")
	}
}

func TestOpenAPIDocumentIsServed(t *testing.T) {
	t.Parallel()
	h, _ := newTestServer(t, calc.New(), nil)
	r := do(t, h, http.MethodGet, "/api/v1/openapi.yaml", "", "")
	if r.status != 200 || r.header.Get("Content-Type") != "application/yaml" || r.header.Get("Cache-Control") != "no-store" || r.header.Get("Content-Length") != strconv.Itoa(len(api.Spec)) || !bytes.Equal([]byte(r.raw), api.Spec) {
		t.Fatalf("got %d %q", r.status, r.header.Get("Content-Type"))
	}
}

func TestWebHandlerIsMountedAtRootButNotUnderAPI(t *testing.T) {
	t.Parallel()
	web := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte("spa")) })
	h, _ := newTestServer(t, calc.New(), web)
	if r := do(t, h, http.MethodGet, "/", "", ""); r.raw != "spa" || r.header.Get("Cache-Control") != "no-store" {
		t.Fatalf("root = %q, Cache-Control %q", r.raw, r.header.Get("Cache-Control"))
	}
	if r := do(t, h, http.MethodHead, "/", "", ""); r.status != 200 || r.raw != "spa" {
		t.Fatalf("HEAD / = %d %q", r.status, r.raw)
	}
	if r := do(t, h, http.MethodGet, "/api/nope", "", ""); r.status != 404 || r.body["code"] != "NOT_FOUND" {
		t.Fatalf("api fallthrough = %d %s", r.status, r.raw)
	}
	if r := do(t, h, http.MethodPost, "/", "", ""); r.status != 405 || r.header.Get("Allow") != "GET, HEAD" {
		t.Fatalf("POST / = %d", r.status)
	}
}

func discardLogger() *slog.Logger { return slog.New(slog.DiscardHandler) }

func decodedPath(t *testing.T, path string) string {
	t.Helper()
	u, err := url.Parse(path)
	if err != nil {
		t.Fatal(err)
	}
	return u.Path
}

type requestIDHandler struct{ slog.Handler }

func (h requestIDHandler) Handle(ctx context.Context, record slog.Record) error {
	record.AddAttrs(slog.String("request_id", httpx.RequestID(ctx)))
	return h.Handler.Handle(ctx, record)
}

func (h requestIDHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	return requestIDHandler{h.Handler.WithAttrs(attrs)}
}

func (h requestIDHandler) WithGroup(name string) slog.Handler {
	return requestIDHandler{h.Handler.WithGroup(name)}
}

func assertSecurityHeaders(t *testing.T, h http.Header) {
	t.Helper()
	for key, want := range map[string]string{
		"X-Content-Type-Options":       "nosniff",
		"Referrer-Policy":              "no-referrer",
		"Content-Security-Policy":      "default-src 'none'; frame-ancestors 'none'",
		"Cross-Origin-Resource-Policy": "same-origin",
	} {
		if got := h.Get(key); got != want {
			t.Errorf("%s = %q, want %q", key, got, want)
		}
	}
}

func TestAdditionalSuccesses(t *testing.T) {
	t.Parallel()
	h, _ := newTestServer(t, calc.New(), nil)
	tests := []struct {
		op, body, result string
		operands         []string
		inexact          bool
	}{
		{"add", `{"operands":["0.1","0.2"]}`, "0.3", []string{"0.1", "0.2"}, false},
		{"sqrt", `{"operands":["16"]}`, "4", []string{"16"}, false},
		{"power", `{"operands":["0","0"]}`, "1", []string{"0", "0"}, false},
		{"divide", `{"operands":["1e-6143","10"]}`, "0", []string{"1e-6143", "10"}, true},
		{"add", `{"operands":["9","9"],"operands":["1","2"]}`, "3", []string{"1", "2"}, false},
	}
	for _, tt := range tests {
		t.Run(tt.op+tt.body, func(t *testing.T) {
			t.Parallel()
			r := do(t, h, "POST", "/api/v1/operations/"+tt.op, "application/json; charset=utf-8", tt.body)
			want, err := json.Marshal(calculateResponse{Operation: tt.op, Operands: tt.operands, Result: tt.result, Inexact: tt.inexact})
			if err != nil {
				t.Fatal(err)
			}
			if r.status != 200 || r.raw != string(want)+"\n" {
				t.Fatalf("got %d %s, want %s", r.status, r.raw, want)
			}
			assertSecurityHeaders(t, r.header)
		})
	}
}

type spyReader struct{ reads int }

func (s *spyReader) Read([]byte) (int, error) { s.reads++; return 0, io.EOF }

func TestUnknownOperationDoesNotReadBody(t *testing.T) {
	t.Parallel()
	h, _ := newTestServer(t, calc.New(), nil)
	body := &spyReader{}
	req := httptest.NewRequestWithContext(t.Context(), "POST", "/api/v1/operations/modulo", body)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != 404 || body.reads != 0 {
		t.Fatalf("status %d, reads %d", rec.Code, body.reads)
	}
}

func TestRequestIDs(t *testing.T) {
	t.Parallel()
	h, _ := newTestServer(t, calc.New(), nil)
	pattern := regexp.MustCompile(`^[A-Za-z0-9._-]{1,128}$`)
	for _, inbound := range []string{"abc-123.X_y", "has space", "<script>", strings.Repeat("x", 129)} {
		t.Run(inbound, func(t *testing.T) {
			t.Parallel()
			req := httptest.NewRequestWithContext(t.Context(), "GET", "/api/nope", nil)
			req.Header.Set(httpx.HeaderRequestID, inbound)
			rec := httptest.NewRecorder()
			h.ServeHTTP(rec, req)
			id := rec.Header().Get(httpx.HeaderRequestID)
			var problem httpx.Problem
			if err := json.Unmarshal(rec.Body.Bytes(), &problem); err != nil {
				t.Fatal(err)
			}
			if rec.Code != 404 || problem.RequestID != id || !pattern.MatchString(id) {
				t.Fatalf("invalid response %d %s", rec.Code, rec.Body.String())
			}
			if inbound == "abc-123.X_y" {
				if id != inbound {
					t.Fatalf("valid ID replaced: %s", id)
				}
			} else if id == inbound {
				t.Fatalf("invalid ID echoed: %s", id)
			}
		})
	}
}

func TestCanceledCalculation(t *testing.T) {
	t.Parallel()
	h, logs := newTestServer(t, calc.New(), nil)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	req := httptest.NewRequestWithContext(ctx, "POST", "/api/v1/operations/add", strings.NewReader(`{"operands":["1","2"]}`))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	var problem httpx.Problem
	if err := json.Unmarshal(rec.Body.Bytes(), &problem); err != nil {
		t.Fatal(err)
	}
	if rec.Code != 500 || problem.Code != httpx.CodeInternal || problem.Detail != "an unexpected error occurred" {
		t.Fatalf("got %d %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(logs.String(), `"level":"WARN"`) || !strings.Contains(logs.String(), `"msg":"calculation canceled"`) || strings.Contains(logs.String(), `"level":"ERROR"`) {
		t.Fatalf("logs: %s", logs.String())
	}
}

type panickingCalculator struct{ *calc.Calculator }

func (panickingCalculator) Calculate(context.Context, string, []string) (calc.Result, error) {
	panic("private panic")
}

func TestCalculationPanic(t *testing.T) {
	t.Parallel()
	h, logs := newTestServer(t, panickingCalculator{calc.New()}, nil)
	r := do(t, h, "POST", "/api/v1/operations/add", "application/json", `{"operands":["1","2"]}`)
	if r.status != 500 || r.body["code"] != "INTERNAL_ERROR" || r.body["detail"] != "an unexpected error occurred" || strings.Contains(r.raw, "private panic") {
		t.Fatalf("got %d %s", r.status, r.raw)
	}
	var record struct {
		Level     string `json:"level"`
		Message   string `json:"msg"`
		RequestID string `json:"request_id"`
	}
	if err := json.Unmarshal(logs.Bytes(), &record); err != nil {
		t.Fatal(err)
	}
	if record.Level != "ERROR" || record.Message != "panic recovered" || record.RequestID != r.header.Get(httpx.HeaderRequestID) || record.RequestID == "" {
		t.Fatalf("log: %s", logs.String())
	}
}

func TestAsteriskTargetIsAProblem(t *testing.T) {
	t.Parallel()
	h, _ := newTestServer(t, calc.New(), nil)
	for _, method := range []string{http.MethodGet, http.MethodPost} {
		req := httptest.NewRequestWithContext(t.Context(), method, "*", nil)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		var problem httpx.Problem
		if err := json.Unmarshal(rec.Body.Bytes(), &problem); err != nil {
			t.Fatalf("%s *: %d %q", method, rec.Code, rec.Body.String())
		}
		if rec.Code != http.StatusNotFound || problem.Code != httpx.CodeNotFound || rec.Header().Get("Content-Type") != "application/problem+json" {
			t.Fatalf("%s *: %d %s", method, rec.Code, rec.Body.String())
		}
	}
}

func TestEmptyPathIsAProblem(t *testing.T) {
	t.Parallel()
	h, _ := newTestServer(t, calc.New(), nil)
	req := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "http://example.com", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	var problem httpx.Problem
	if err := json.Unmarshal(rec.Body.Bytes(), &problem); err != nil || rec.Code != http.StatusNotFound || problem.Code != httpx.CodeNotFound {
		t.Fatalf("empty path: %d %s", rec.Code, rec.Body.String())
	}
}
