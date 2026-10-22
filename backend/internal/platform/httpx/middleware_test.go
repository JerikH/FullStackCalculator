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
	"unicode/utf8"
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

// serveAccess serves req through RequestContext and AccessLog and returns the
// single access line.
func serveAccess(t *testing.T, h http.Handler, req *http.Request) map[string]any {
	t.Helper()
	var buf bytes.Buffer
	Chain(h, RequestContext, AccessLog(newTestLogger(&buf))).ServeHTTP(httptest.NewRecorder(), req)
	lines := logLines(t, &buf)
	if len(lines) != 1 || lines[0]["msg"] != "http request" {
		t.Fatalf("lines = %v", lines)
	}
	return lines[0]
}

func answer(status int, level *slog.Level) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if level != nil {
			SetAccessLevel(r.Context(), *level)
		}
		w.WriteHeader(status)
	})
}

func TestAccessLevelOverride(t *testing.T) {
	t.Parallel()
	info, warn := slog.LevelInfo, slog.LevelWarn
	for _, tc := range []struct {
		name   string
		status int
		level  *slog.Level
		want   string
	}{
		{"handler lowers a 503 to info", http.StatusServiceUnavailable, &info, "INFO"},
		{"a 503 without override stays error", http.StatusServiceUnavailable, nil, "ERROR"},
		{"handler raises a 200 to warn", http.StatusOK, &warn, "WARN"},
		{"a 200 without override is info", http.StatusOK, nil, "INFO"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			line := serveAccess(t, answer(tc.status, tc.level), httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/", nil))
			if line["level"] != tc.want || line["status"] != float64(tc.status) {
				t.Fatalf("line = %v", line)
			}
		})
	}
}

func TestSetAccessLevelWithoutRequestContext(t *testing.T) {
	t.Parallel()
	SetAccessLevel(context.Background(), slog.LevelInfo) // must not panic
	// Without RequestContext nothing records the status, so the fallback info
	// reports 200 and the line stays at info; the override is simply ignored.
	var buf bytes.Buffer
	AccessLog(newTestLogger(&buf))(answer(http.StatusServiceUnavailable, nil)).
		ServeHTTP(httptest.NewRecorder(), httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/", nil))
	if line := logLines(t, &buf)[0]; line["level"] != "INFO" || line["status"] != float64(200) || line["route"] != "unmatched" {
		t.Fatalf("line = %v", line)
	}
}

func TestAccessLevelNeverDependsOnPath(t *testing.T) {
	t.Parallel()
	for _, path := range []string{"/readyz", "/other"} {
		t.Run(path, func(t *testing.T) {
			t.Parallel()
			line := serveAccess(t, answer(http.StatusServiceUnavailable, nil), httptest.NewRequestWithContext(t.Context(), http.MethodGet, path, nil))
			if line["level"] != "ERROR" || line["path"] != path {
				t.Fatalf("line = %v", line)
			}
		})
	}
}

func TestPanicClearsAccessLevelOverride(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		name       string
		started    bool
		wantStatus float64
	}{
		{"problem written", false, 500},
		{"response already started", true, 500},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			var buf bytes.Buffer
			logger := newTestLogger(&buf)
			h := Chain(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if tc.started {
					w.WriteHeader(http.StatusOK)
				}
				SetAccessLevel(r.Context(), slog.LevelInfo)
				panic("after override")
			}), RequestContext, AccessLog(logger), Recover(logger))
			req := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/x", nil)
			if tc.started {
				serveExpectingAbort(t, h, httptest.NewRecorder(), req)
			} else {
				h.ServeHTTP(httptest.NewRecorder(), req)
			}
			var access map[string]any
			for _, l := range logLines(t, &buf) {
				if l["msg"] == "http request" {
					access = l
				}
			}
			if access == nil || access["level"] != "ERROR" || access["status"] != tc.wantStatus {
				t.Fatalf("access line = %v", access)
			}
		})
	}
}

func TestTruncateChars(t *testing.T) {
	t.Parallel()
	ascii := func(n int) string { return strings.Repeat("a", n) }
	for _, tc := range []struct {
		name string
		in   string
		want string
	}{
		{"empty", "", ""},
		{"shorter", "abc", "abc"},
		{"exactly the limit", ascii(256), ascii(256)},
		{"one over", ascii(257), ascii(256)},
		{"far over", ascii(300), ascii(256)},
		{"multibyte inside the limit", ascii(255) + "é" + ascii(40), ascii(255) + "é"},
		{"multibyte just past the limit", ascii(256) + "é", ascii(256)},
		{"four-byte rune straddling byte 256", ascii(254) + "😀" + ascii(10), ascii(254) + "😀" + "a"},
		{"invalid bytes count one each", strings.Repeat("\xff", 300), strings.Repeat("\xff", 256)},
		{"16 KiB", ascii(16 << 10), ascii(256)},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got := truncateChars(tc.in, 256)
			if got != tc.want {
				t.Fatalf("got %d bytes, want %d bytes", len(got), len(tc.want))
			}
			if utf8.RuneCountInString(got) > 256 {
				t.Fatalf("%d characters", utf8.RuneCountInString(got))
			}
			if utf8.ValidString(tc.in) && !utf8.ValidString(got) {
				t.Fatal("cut inside a UTF-8 sequence")
			}
		})
	}
}

func TestTruncateCharsHonoursTheLimit(t *testing.T) {
	t.Parallel()
	for limit, want := range map[int]string{0: "", 1: "h", 2: "hé", 3: "hé😀", 5: "hé😀ll", 6: "hé😀llo", 9: "hé😀llo"} {
		if got := truncateChars("hé😀llo", limit); got != want {
			t.Errorf("truncateChars(limit=%d) = %q, want %q", limit, got, want)
		}
	}
}

// Not parallel: testing.AllocsPerRun panics inside a parallel test.
func TestTruncateCharsDoesNotAllocateWhenShort(t *testing.T) {
	short := "/api/v1/operations"
	var sink string
	if n := testing.AllocsPerRun(100, func() { sink = truncateChars(short, 256) }); n != 0 {
		t.Fatalf("allocs = %v", n)
	}
	if sink != short {
		t.Fatalf("sink = %q", sink)
	}
}

func TestAccessLogBoundsMethod(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		name   string
		method string
		want   string
		status int
		level  string
	}{
		{"300 characters", strings.Repeat("A", 300), strings.Repeat("A", 256), http.StatusMethodNotAllowed, "INFO"},
		{"GET", http.MethodGet, http.MethodGet, http.StatusOK, "INFO"},
		{"256 characters", strings.Repeat("B", 256), strings.Repeat("B", 256), http.StatusNoContent, "INFO"},
		{"257 characters", strings.Repeat("C", 256) + "D", strings.Repeat("C", 256), http.StatusInternalServerError, "ERROR"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			req := httptest.NewRequestWithContext(t.Context(), tc.method, "/", nil)
			line := serveAccess(t, Route("/", answer(tc.status, nil)), req)
			if got := line["method"]; got != tc.want {
				t.Errorf("method = %q, want %q", got, tc.want)
			}
			if line["status"] != float64(tc.status) || line["route"] != "/" || line["level"] != tc.level {
				t.Errorf("line = %v", line)
			}
		})
	}
}

func TestAccessLogBoundsPathAndUserAgent(t *testing.T) {
	t.Parallel()
	longPath := "/" + strings.Repeat("a", 299)
	for _, tc := range []struct {
		name   string
		status int
		level  string
	}{
		{"info line", http.StatusOK, "INFO"},
		{"error line", http.StatusInternalServerError, "ERROR"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			req := httptest.NewRequestWithContext(t.Context(), http.MethodPost, longPath, nil)
			req.RemoteAddr = "203.0.113.9:4242"
			req.Header.Set("User-Agent", strings.Repeat("u", 300))
			line := serveAccess(t, Route("/", answer(tc.status, nil)), req)
			if got := line["path"].(string); got != longPath[:256] {
				t.Errorf("path has %d characters", utf8.RuneCountInString(got))
			}
			if got := line["user_agent"].(string); got != strings.Repeat("u", 256) {
				t.Errorf("user_agent has %d characters", utf8.RuneCountInString(got))
			}
			if line["remote_addr"] != "203.0.113.9:4242" || line["method"] != http.MethodPost || line["route"] != "/" || line["level"] != tc.level || line["status"] != float64(tc.status) {
				t.Errorf("line = %v", line)
			}
		})
	}
}

func TestAccessLogNeverSplitsMultibyteCharacters(t *testing.T) {
	t.Parallel()
	// The 256th character is the two-byte "é"; more text follows it. The path is
	// logged decoded (r.URL.Path), the user agent as received.
	want := strings.Repeat("a", 255) + "é"
	req := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/"+strings.Repeat("a", 254)+"%C3%A9bbbb", nil)
	req.Header.Set("User-Agent", strings.Repeat("a", 255)+"é"+strings.Repeat("b", 40))
	line := serveAccess(t, answer(http.StatusOK, nil), req)
	if got := line["path"]; got != "/"+strings.Repeat("a", 254)+"é" {
		t.Errorf("path = %q", got)
	}
	if got := line["user_agent"]; got != want {
		t.Errorf("user_agent = %q", got)
	}
}

func TestAbortClearsAccessLevelOverride(t *testing.T) {
	t.Parallel()
	var buf bytes.Buffer
	logger := newTestLogger(&buf)
	h := Chain(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		SetAccessLevel(r.Context(), slog.LevelInfo)
		w.WriteHeader(http.StatusServiceUnavailable)
		panic(http.ErrAbortHandler)
	}), RequestContext, AccessLog(logger), Recover(logger))
	serveExpectingAbort(t, h, httptest.NewRecorder(), httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/x", nil))
	lines := logLines(t, &buf)
	if len(lines) != 1 || lines[0]["level"] != "ERROR" || lines[0]["status"] != float64(503) {
		t.Fatalf("lines = %v", lines)
	}
}
