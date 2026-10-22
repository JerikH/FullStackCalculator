package httpx

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func newTestLogger(buf *bytes.Buffer) *slog.Logger {
	return slog.New(requestAware{slog.NewJSONHandler(buf, &slog.HandlerOptions{Level: slog.LevelDebug})})
}

// requestAware adds request_id from the context, like the service's logger.
type requestAware struct{ slog.Handler }

func (h requestAware) Handle(ctx context.Context, r slog.Record) error {
	if id := RequestID(ctx); id != "" {
		r.AddAttrs(slog.String("request_id", id))
	}
	return h.Handler.Handle(ctx, r)
}

func (h requestAware) WithAttrs(attrs []slog.Attr) slog.Handler {
	return requestAware{h.Handler.WithAttrs(attrs)}
}

func (h requestAware) WithGroup(name string) slog.Handler {
	return requestAware{h.Handler.WithGroup(name)}
}

func logLines(t *testing.T, buf *bytes.Buffer) []map[string]any {
	t.Helper()
	var lines []map[string]any
	for raw := range strings.SplitSeq(strings.TrimSpace(buf.String()), "\n") {
		if raw == "" {
			continue
		}
		var line map[string]any
		if err := json.Unmarshal([]byte(raw), &line); err != nil {
			t.Fatalf("bad log line %q: %v", raw, err)
		}
		lines = append(lines, line)
	}
	return lines
}

func TestChainOrder(t *testing.T) {
	t.Parallel()
	var order []string
	mw := func(name string) Middleware {
		return func(next http.Handler) http.Handler {
			return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				order = append(order, name)
				next.ServeHTTP(w, r)
			})
		}
	}
	Chain(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { order = append(order, "h") }), mw("a"), mw("b")).
		ServeHTTP(httptest.NewRecorder(), httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/", nil))
	if strings.Join(order, ",") != "a,b,h" {
		t.Fatalf("order = %v", order)
	}
}

func TestRecoverTurnsPanicIntoProblemAndLogs(t *testing.T) {
	t.Parallel()
	var buf bytes.Buffer
	logger := newTestLogger(&buf)
	h := Chain(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { panic("boom") }),
		RequestContext, AccessLog(logger), Recover(logger))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/x", nil))
	if rec.Code != 500 || rec.Header().Get("Content-Type") != "application/problem+json" || !strings.Contains(rec.Body.String(), `"INTERNAL_ERROR"`) {
		t.Fatalf("got %d %s", rec.Code, rec.Body.String())
	}
	if strings.Contains(rec.Body.String(), "boom") || strings.Contains(rec.Body.String(), "goroutine") {
		t.Fatal("panic value or stack leaked to the client")
	}
	if !strings.Contains(rec.Body.String(), `"detail":"an unexpected error occurred"`) {
		t.Fatalf("body = %s", rec.Body.String())
	}

	var panicLine, accessLine map[string]any
	for _, l := range logLines(t, &buf) {
		switch l["msg"] {
		case "panic recovered":
			panicLine = l
		case "http request":
			accessLine = l
		}
	}
	if panicLine == nil || accessLine == nil {
		t.Fatalf("logs = %s", buf.String())
	}
	if stack, _ := panicLine["stack"].(string); stack == "" {
		t.Error("panic line has no stack")
	}
	if panicLine["level"] != "ERROR" || panicLine["panic"] != "boom" {
		t.Errorf("panic line = %v", panicLine)
	}
	if id := rec.Header().Get(HeaderRequestID); id == "" || panicLine["request_id"] != id {
		t.Errorf("panic request_id = %v, header %q", panicLine["request_id"], id)
	}
	if accessLine["status"] != float64(500) || accessLine["level"] != "ERROR" {
		t.Errorf("access line = %v", accessLine)
	}
}

// serveExpectingAbort runs h and requires it to unwind with http.ErrAbortHandler.
func serveExpectingAbort(t *testing.T, h http.Handler, w http.ResponseWriter, r *http.Request) {
	t.Helper()
	defer func() {
		if v := recover(); v != http.ErrAbortHandler { //nolint:errorlint // sentinel identity is the contract
			t.Fatalf("recovered %v, want http.ErrAbortHandler", v)
		}
	}()
	h.ServeHTTP(w, r)
}

func TestRecoverAfterStatusWrittenAbortsAndLogsAs500(t *testing.T) {
	t.Parallel()
	var buf bytes.Buffer
	logger := newTestLogger(&buf)
	h := Chain(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		panic("late")
	}), RequestContext, AccessLog(logger), Recover(logger))
	rec := httptest.NewRecorder()
	serveExpectingAbort(t, h, rec, httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/x", nil))
	if rec.Code != 200 {
		t.Fatalf("client status = %d", rec.Code)
	}
	if rec.Body.Len() != 0 {
		t.Fatalf("body appended after a written status: %q", rec.Body.String())
	}
	var access map[string]any
	for _, l := range logLines(t, &buf) {
		if l["msg"] == "http request" {
			access = l
		}
	}
	if access == nil || access["status"] != float64(500) {
		t.Fatalf("access line = %v", access)
	}
}

func TestRecoverWithoutRequestContextAfterCommitAborts(t *testing.T) {
	t.Parallel()
	rec := httptest.NewRecorder()
	h := Recover(slog.New(slog.DiscardHandler))(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("prefix"))
		panic("late")
	}))
	serveExpectingAbort(t, h, rec, httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/", nil))
	if rec.Code != http.StatusOK || rec.Body.String() != "prefix" {
		t.Fatalf("got %d %q", rec.Code, rec.Body.String())
	}
}

func TestRecoverWithoutRequestContextAfterInformationalWritesProblem(t *testing.T) {
	t.Parallel()
	rec := httptest.NewRecorder()
	Recover(slog.New(slog.DiscardHandler))(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusEarlyHints)
		panic("early")
	})).ServeHTTP(rec, httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/", nil))
	if !strings.Contains(rec.Body.String(), `"INTERNAL_ERROR"`) {
		t.Fatalf("body = %q", rec.Body.String())
	}
}

func TestRecoverWithoutRequestContextStillWritesProblem(t *testing.T) {
	t.Parallel()
	rec := httptest.NewRecorder()
	Recover(slog.New(slog.DiscardHandler))(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { panic("x") })).
		ServeHTTP(rec, httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/", nil))
	if rec.Code != 500 {
		t.Fatalf("status = %d", rec.Code)
	}
}

func TestRecoverRepanicsErrAbortHandler(t *testing.T) {
	t.Parallel()
	defer func() {
		if recover() != http.ErrAbortHandler { //nolint:errorlint // sentinel identity is the contract
			t.Fatal("expected ErrAbortHandler to propagate")
		}
	}()
	Recover(slog.New(slog.DiscardHandler))(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { panic(http.ErrAbortHandler) })).
		ServeHTTP(httptest.NewRecorder(), httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/", nil))
}

func TestAccessLogStillLogsWhenRequestUnwindsWithErrAbortHandler(t *testing.T) {
	t.Parallel()
	var buf bytes.Buffer
	logger := newTestLogger(&buf)
	h := Chain(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { panic(http.ErrAbortHandler) }),
		RequestContext, AccessLog(logger), Recover(logger))
	func() {
		defer func() {
			if recover() != http.ErrAbortHandler { //nolint:errorlint // sentinel identity is the contract
				t.Error("expected ErrAbortHandler to propagate")
			}
		}()
		h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/abort", nil))
	}()
	lines := logLines(t, &buf)
	if len(lines) != 1 || lines[0]["msg"] != "http request" || lines[0]["path"] != "/abort" {
		t.Fatalf("lines = %v", lines)
	}
}

func TestAccessLogFields(t *testing.T) {
	t.Parallel()
	var buf bytes.Buffer
	h := Chain(Route("/p", http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte("hello"))
	})), RequestContext, AccessLog(newTestLogger(&buf)))
	req := httptest.NewRequestWithContext(context.Background(), http.MethodPost, "/p?q=1", nil)
	req.RemoteAddr = "203.0.113.9:4242"
	req.Header.Set("User-Agent", "probe/1.0")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	lines := logLines(t, &buf)
	if len(lines) != 1 {
		t.Fatalf("lines = %v", lines)
	}
	line := lines[0]
	want := map[string]any{
		"msg": "http request", "level": "INFO", "method": "POST", "route": "/p", "path": "/p",
		"status": float64(201), "bytes": float64(5), "remote_addr": "203.0.113.9:4242",
		"user_agent": "probe/1.0", "request_id": rec.Header().Get(HeaderRequestID),
	}
	for k, w := range want {
		if line[k] != w {
			t.Errorf("%s = %v, want %v", k, line[k], w)
		}
	}
	if d, ok := line["duration_ms"].(float64); !ok || d < 0 {
		t.Errorf("duration_ms = %v", line["duration_ms"])
	}
}

func TestAccessLogDefaultsWithoutHandlerOutput(t *testing.T) {
	t.Parallel()
	var buf bytes.Buffer
	Chain(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}), RequestContext, AccessLog(newTestLogger(&buf))).
		ServeHTTP(httptest.NewRecorder(), httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/", nil))
	line := logLines(t, &buf)[0]
	if line["status"] != float64(200) || line["route"] != "unmatched" || line["bytes"] != float64(0) {
		t.Fatalf("line = %v", line)
	}
}

func TestAccessLogWithoutRequestContext(t *testing.T) {
	t.Parallel()
	var buf bytes.Buffer
	AccessLog(newTestLogger(&buf))(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {})).
		ServeHTTP(httptest.NewRecorder(), httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/", nil))
	line := logLines(t, &buf)[0]
	if line["status"] != float64(200) || line["route"] != "unmatched" {
		t.Fatalf("line = %v", line)
	}
}

func TestAccessLogLogsServerErrorsAtErrorLevel(t *testing.T) {
	t.Parallel()
	var buf bytes.Buffer
	Chain(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusServiceUnavailable) }),
		RequestContext, AccessLog(newTestLogger(&buf))).
		ServeHTTP(httptest.NewRecorder(), httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/", nil))
	line := logLines(t, &buf)[0]
	if line["level"] != "ERROR" || line["status"] != float64(503) {
		t.Fatalf("line = %v", line)
	}
}

func TestSecureHeaders(t *testing.T) {
	t.Parallel()
	rec := httptest.NewRecorder()
	SecureHeaders(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {})).
		ServeHTTP(rec, httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/", nil))
	want := map[string]string{
		"X-Content-Type-Options":       "nosniff",
		"Referrer-Policy":              "no-referrer",
		"Content-Security-Policy":      "default-src 'none'; frame-ancestors 'none'",
		"Cross-Origin-Resource-Policy": "same-origin",
	}
	for k, v := range want {
		if got := rec.Header().Get(k); got != v {
			t.Errorf("%s = %q, want %q", k, got, v)
		}
	}
}
