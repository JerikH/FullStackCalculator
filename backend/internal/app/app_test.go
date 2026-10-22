package app

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/testutil"

	"github.com/JerikH/FullStackCalculator/backend/internal/buildinfo"
	"github.com/JerikH/FullStackCalculator/backend/internal/httpapi"
	"github.com/JerikH/FullStackCalculator/backend/internal/observability"
	"github.com/JerikH/FullStackCalculator/backend/internal/platform/httpx"

	"github.com/JerikH/FullStackCalculator/backend/internal/config"
)

func testConfig() config.Config {
	return config.Config{
		HTTPAddr: "127.0.0.1:0", AdminAddr: "127.0.0.1:0", LogLevel: slog.LevelInfo, LogFormat: "json",
		ShutdownTimeout: 5 * time.Second, ShutdownDrain: 200 * time.Millisecond, EnablePprof: true,
	}
}

func get(t *testing.T, url string) (int, string) {
	t.Helper()
	req, _ := http.NewRequestWithContext(t.Context(), http.MethodGet, url, nil)
	resp, err := (&http.Client{Timeout: 3 * time.Second}).Do(req)
	if err != nil {
		t.Fatalf("GET %s: %v", url, err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, string(body)
}

func TestAppServesDrainsAndShutsDown(t *testing.T) {
	var logs bytes.Buffer
	a, err := New(testConfig(), slog.New(slog.NewJSONHandler(&logs, nil)))
	if err != nil {
		t.Fatal(err)
	}
	draining, release := drainGate(t, a)
	defer release()
	running := startApp(t, a)

	base := "http://" + a.Addr().String()
	admin := "http://" + a.AdminAddr().String()
	waitReady(t, base+"/readyz")

	if code, body := get(t, base+"/api/v1/operations"); code != 200 || !strings.Contains(body, `"add"`) {
		t.Fatalf("operations = %d %s", code, body)
	}
	req, _ := http.NewRequestWithContext(t.Context(), http.MethodPost, base+"/api/v1/operations/add", strings.NewReader(`{"operands":["0.1","0.2"]}`))
	req.Header.Set("Content-Type", "application/json")
	resp, err := (&http.Client{Timeout: 3 * time.Second}).Do(req)
	if err != nil {
		t.Fatal(err)
	}
	var out map[string]any
	_ = json.NewDecoder(resp.Body).Decode(&out)
	resp.Body.Close()
	if out["result"] != "0.3" || resp.Header.Get("X-Request-ID") == "" || resp.Header.Get("X-Content-Type-Options") != "nosniff" {
		t.Fatalf("calculate = %v %v", out, resp.Header)
	}
	if code, body := get(t, admin+"/metrics"); code != 200 || !strings.Contains(body, `calculator_operations_total{operation="add",outcome="ok"} 1`) {
		t.Fatalf("metrics = %d\n%s", code, body)
	}
	if code, _ := get(t, admin+"/debug/pprof/"); code != 200 {
		t.Fatalf("pprof = %d", code)
	}

	running.cancel()
	await(t, draining, "drain hook")
	if code, body := get(t, base+"/readyz"); code != 503 || statusField(t, body) != "draining" {
		t.Fatalf("draining readiness = %d %s", code, body)
	}
	if code, _ := get(t, base+"/healthz"); code != 200 {
		t.Fatal("liveness must keep passing while draining")
	}
	release()
	if err := running.wait(t); err != nil {
		t.Fatalf("Run() = %v", err)
	}
	for _, msg := range []string{"server started", "shutdown started", "shutdown complete", `"msg":"http request"`} {
		if !strings.Contains(logs.String(), msg) {
			t.Errorf("logs missing %q", msg)
		}
	}
}

func TestAdminServerCanBeDisabled(t *testing.T) {
	cfg := testConfig()
	cfg.AdminAddr = ""
	a, err := New(cfg, slog.New(slog.DiscardHandler))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = a.apiLn.Close() })
	if a.AdminAddr() != nil {
		t.Fatal("AdminAddr() should be nil when disabled")
	}
	running := startApp(t, a)
	waitReady(t, "http://"+a.Addr().String()+"/readyz")
	running.cancel()
	if err := running.wait(t); err != nil {
		t.Fatal(err)
	}
}

func TestNewFailsWhenPortIsTaken(t *testing.T) {
	a, err := New(testConfig(), slog.New(slog.DiscardHandler))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = a.apiLn.Close(); _ = a.adminLn.Close() })
	cfg := testConfig()
	cfg.HTTPAddr = a.Addr().String()
	if _, err := New(cfg, slog.New(slog.DiscardHandler)); err == nil {
		t.Fatal("expected listen error")
	}
}

func TestMainHealthcheckAndUsage(t *testing.T) {
	a, err := New(testConfig(), slog.New(slog.DiscardHandler))
	if err != nil {
		t.Fatal(err)
	}
	startApp(t, a)
	waitReady(t, "http://"+a.Addr().String()+"/readyz")

	envFor := func(addr string) func(string) (string, bool) {
		return func(k string) (string, bool) {
			if k == "CALC_HTTP_ADDR" {
				return addr, true
			}
			return "", false
		}
	}
	var stderr bytes.Buffer
	if code := Main(t.Context(), []string{"calculator", "healthcheck"}, envFor(a.Addr().String()), io.Discard, &stderr); code != 0 {
		t.Fatalf("healthcheck exit = %d: %s", code, stderr.String())
	}
	if code := Main(t.Context(), []string{"calculator", "healthcheck"}, envFor("127.0.0.1:1"), io.Discard, &stderr); code != 1 {
		t.Fatalf("healthcheck against closed port exit = %d", code)
	}
	if code := Main(t.Context(), []string{"calculator", "bogus"}, envFor(":0"), io.Discard, &stderr); code != 2 {
		t.Fatalf("unknown subcommand exit = %d", code)
	}
	if code := Main(t.Context(), []string{"calculator"}, func(k string) (string, bool) {
		return "loud", k == "CALC_LOG_LEVEL"
	}, io.Discard, &stderr); code != 2 || !strings.Contains(stderr.String(), "CALC_LOG_LEVEL") {
		t.Fatalf("bad config exit = %d: %s", code, stderr.String())
	}
}

func TestMainRunsUntilContextCanceled(t *testing.T) {
	ctx, cancel := context.WithCancel(t.Context())
	defer cancel()
	lookup := func(k string) (string, bool) {
		switch k {
		case "CALC_HTTP_ADDR", "CALC_ADMIN_ADDR":
			return "127.0.0.1:0", true
		}
		return "", false
	}
	stdout := &startupWriter{started: make(chan struct{})}
	done := make(chan int, 1)
	go func() { done <- Main(ctx, []string{"calculator"}, lookup, stdout, io.Discard) }()
	await(t, stdout.started, "Main startup")
	cancel()
	select {
	case code := <-done:
		if code != 0 {
			t.Fatalf("exit = %d\n%s", code, stdout.String())
		}
	case <-time.After(5 * time.Second):
		t.Fatal("Main did not stop")
	}
	if !strings.Contains(stdout.String(), "server started") {
		t.Fatalf("stdout = %s", stdout.String())
	}
}

func TestProbeAddressNormalisation(t *testing.T) {
	t.Parallel()
	for in, want := range map[string]string{":8081": "127.0.0.1:8081", "0.0.0.0:80": "127.0.0.1:80", "[::]:80": "127.0.0.1:80", "10.0.0.5:81": "10.0.0.5:81", "[::1]:80": "[::1]:80"} {
		if got, err := probeTarget(in); err != nil || got != want {
			t.Errorf("probeTarget(%q) = %q, %v; want %q", in, got, err, want)
		}
	}
	if _, err := probeTarget("nonsense"); err == nil {
		t.Error("expected error for invalid address")
	}
}

func waitReady(t *testing.T, url string) {
	t.Helper()
	if code, body := get(t, url); code != 200 {
		t.Fatalf("not ready: %d %s", code, body)
	}
}

// Every lifecycle wait is bounded; cleanup also stops servers after a failed assertion.
func await(t *testing.T, ch <-chan struct{}, what string) {
	t.Helper()
	select {
	case <-ch:
	case <-time.After(5 * time.Second):
		t.Fatalf("timeout waiting for %s", what)
	}
}

type runningApp struct {
	cancel context.CancelFunc
	done   chan struct{}
	err    error
}

func startApp(t *testing.T, a *App) *runningApp {
	t.Helper()
	ctx, cancel := context.WithCancel(t.Context())
	r := &runningApp{cancel: cancel, done: make(chan struct{})}
	go func() { r.err = a.Run(ctx); close(r.done) }()
	t.Cleanup(func() {
		cancel()
		select {
		case <-r.done:
		case <-time.After(5 * time.Second):
			_ = a.api.Close()
			if a.admin != nil {
				_ = a.admin.Close()
			}
			t.Error("Run did not finish during cleanup")
		}
	})
	return r
}

func (r *runningApp) wait(t *testing.T) error {
	t.Helper()
	await(t, r.done, "Run")
	return r.err
}

func drainGate(t *testing.T, a *App) (<-chan struct{}, func()) {
	t.Helper()
	draining, release := make(chan struct{}), make(chan struct{})
	var once sync.Once
	unblock := func() { once.Do(func() { close(release) }) }
	a.drainHook = func() {
		close(draining)
		select {
		case <-release:
		case <-time.After(5 * time.Second):
			t.Error("drain hook was not released")
		}
	}
	t.Cleanup(unblock)
	return draining, unblock
}

func statusField(t *testing.T, body string) string {
	t.Helper()
	var out struct{ Status string }
	if err := json.Unmarshal([]byte(body), &out); err != nil {
		t.Fatal(err)
	}
	return out.Status
}

type startupWriter struct {
	mu      sync.Mutex
	buf     bytes.Buffer
	started chan struct{}
	once    sync.Once
}

func (w *startupWriter) Write(p []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	n, err := w.buf.Write(p)
	if bytes.Contains(p, []byte("server started")) {
		w.once.Do(func() { close(w.started) })
	}
	return n, err
}

func (w *startupWriter) String() string {
	w.mu.Lock()
	defer w.mu.Unlock()
	return w.buf.String()
}

func request(t *testing.T, method, url, ct, body string) (int, http.Header, string) {
	t.Helper()
	req, err := http.NewRequestWithContext(t.Context(), method, url, strings.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	if ct != "" {
		req.Header.Set("Content-Type", ct)
	}
	resp, err := (&http.Client{Timeout: 3 * time.Second}).Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatal(err)
	}
	return resp.StatusCode, resp.Header, string(data)
}

func assertHeaders(t *testing.T, h http.Header) {
	t.Helper()
	for name, want := range map[string]string{
		"X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
		"Content-Security-Policy":      "default-src 'none'; frame-ancestors 'none'",
		"Cross-Origin-Resource-Policy": "same-origin", "Cache-Control": "no-store",
	} {
		if got := h.Get(name); got != want {
			t.Errorf("%s = %q, want %q", name, got, want)
		}
	}
	if h.Get("X-Request-ID") == "" {
		t.Error("missing request ID")
	}
}

func TestComposedHeadersAndAdminIsolation(t *testing.T) {
	cfg := testConfig()
	cfg.EnablePprof = false
	a, err := New(cfg, slog.New(slog.DiscardHandler))
	if err != nil {
		t.Fatal(err)
	}
	draining, release := drainGate(t, a)
	running := startApp(t, a)
	defer release()
	base, admin := "http://"+a.Addr().String(), "http://"+a.AdminAddr().String()
	for _, tc := range []struct {
		method, path, ct, body string
		code                   int
	}{
		{"POST", "/api/v1/operations/add", "application/json", `{"operands":["0.1","0.2"]}`, 200},
		{"POST", "/api/v1/operations/add", "text/plain", "{}", 415},
		{"GET", "/healthz", "", "", 200},
		{"GET", "/api/v1//operations", "", "", 404},
		{"GET", "/metrics", "", "", 404},
		{"GET", "/debug/pprof/", "", "", 404},
	} {
		code, h, body := request(t, tc.method, base+tc.path, tc.ct, tc.body)
		if code != tc.code {
			t.Fatalf("%s: %d %s", tc.path, code, body)
		}
		assertHeaders(t, h)
		if tc.code >= 400 && h.Get("Content-Type") != "application/problem+json" {
			t.Fatalf("Content-Type = %q", h.Get("Content-Type"))
		}
		if tc.code == 200 && tc.method == "POST" {
			var out struct{ Result string }
			if err := json.Unmarshal([]byte(body), &out); err != nil {
				t.Fatal(err)
			}
			if out.Result != "0.3" {
				t.Fatalf("result = %q", out.Result)
			}
		}
	}
	code, body := get(t, admin+"/metrics")
	if code != 200 {
		t.Fatalf("metrics = %d %s", code, body)
	}
	for _, family := range []string{"http_requests_total", "http_request_duration_seconds", "http_requests_in_flight", "calculator_operations_total", "calculator_build_info"} {
		if !strings.Contains(body, "# TYPE "+family+" ") {
			t.Errorf("missing metric family %s", family)
		}
	}
	if !strings.Contains(body, `calculator_operations_total{operation="add",outcome="ok"} 1`) {
		t.Fatalf("operation count: %s", body)
	}
	if code, _ := get(t, admin+"/debug/pprof/"); code != 404 {
		t.Fatalf("disabled pprof = %d", code)
	}
	running.cancel()
	await(t, draining, "draining")
	code, h, body := request(t, "GET", base+"/readyz", "", "")
	if code != 503 || statusField(t, body) != "draining" {
		t.Fatalf("readyz = %d %s", code, body)
	}
	assertHeaders(t, h)
	release()
	if err := running.wait(t); err != nil {
		t.Fatal(err)
	}
	// Both listeners are closed after Run returns.
	for _, addr := range []net.Addr{a.Addr(), a.AdminAddr()} {
		conn, err := (&net.Dialer{Timeout: time.Second}).DialContext(t.Context(), "tcp", addr.String())
		if err == nil {
			_ = conn.Close()
			t.Errorf("listener %s still accepts", addr)
		}
	}
}

func bind(t *testing.T) net.Listener {
	t.Helper()
	ln, err := (&net.ListenConfig{}).Listen(t.Context(), "tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = ln.Close() })
	return ln
}

func TestAdminBindFailureClosesPublicListener(t *testing.T) {
	taken := bind(t)
	free := bind(t)
	addr := free.Addr().String()
	if err := free.Close(); err != nil {
		t.Fatal(err)
	}
	cfg := testConfig()
	cfg.HTTPAddr, cfg.AdminAddr = addr, taken.Addr().String()
	if _, err := New(cfg, slog.New(slog.DiscardHandler)); err == nil || !strings.Contains(err.Error(), "listen on "+cfg.AdminAddr) {
		t.Fatalf("New = %v", err)
	}
	rebound, err := (&net.ListenConfig{}).Listen(t.Context(), "tcp", addr)
	if err != nil {
		t.Fatalf("public listener leaked: %v", err)
	}
	_ = rebound.Close()
}

func TestRunReturnsEarlyOnServeFailure(t *testing.T) {
	cfg := testConfig()
	a, err := New(cfg, slog.New(slog.DiscardHandler))
	if err != nil {
		t.Fatal(err)
	}
	if err := a.apiLn.Close(); err != nil {
		t.Fatal(err)
	}
	// startApp supplies a live context; only the Serve error should stop Run.
	running := startApp(t, a)
	if err := running.wait(t); err == nil || !strings.Contains(err.Error(), "server failed") {
		t.Fatalf("Run = %v", err)
	}
}

func TestInflightRequestSurvivesShutdown(t *testing.T) {
	entered, release := make(chan struct{}), make(chan struct{})
	var once sync.Once
	unblock := func() { once.Do(func() { close(release) }) }
	defer unblock()
	cfg := testConfig()
	cfg.ShutdownDrain = 0
	a, err := listen(cfg, slog.New(slog.DiscardHandler), &httpapi.Readiness{}, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		close(entered)
		select {
		case <-release:
			w.WriteHeader(http.StatusOK)
		case <-time.After(5 * time.Second):
			t.Error("request was not released")
		}
	}), http.NotFoundHandler())
	if err != nil {
		t.Fatal(err)
	}
	draining, releaseDrain := drainGate(t, a)
	defer releaseDrain()
	running := startApp(t, a)
	clientDone := make(chan error, 1)
	go func() {
		req, err := http.NewRequestWithContext(t.Context(), http.MethodGet, "http://"+a.Addr().String(), nil)
		if err != nil {
			clientDone <- err
			return
		}
		resp, err := (&http.Client{Timeout: 4 * time.Second}).Do(req)
		if err == nil {
			_, _ = io.Copy(io.Discard, resp.Body)
			_ = resp.Body.Close()
			if resp.StatusCode != http.StatusOK {
				err = fmt.Errorf("status %d", resp.StatusCode)
			}
		}
		clientDone <- err
	}()
	await(t, entered, "in-flight handler")
	running.cancel()
	await(t, draining, "shutdown start")
	releaseDrain()
	unblock()
	select {
	case err := <-clientDone:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("client did not finish")
	}
	if err := running.wait(t); err != nil {
		t.Fatal(err)
	}
}

func TestShutdownTimeoutClosesInflightRequest(t *testing.T) {
	entered, exited := make(chan struct{}), make(chan struct{})
	cfg := testConfig()
	cfg.ShutdownDrain, cfg.ShutdownTimeout = 0, 100*time.Millisecond
	a, err := listen(cfg, slog.New(slog.DiscardHandler), &httpapi.Readiness{}, http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) {
		close(entered)
		select {
		case <-r.Context().Done():
		case <-time.After(5 * time.Second):
			t.Error("request context not canceled")
		}
		close(exited)
	}), http.NotFoundHandler())
	if err != nil {
		t.Fatal(err)
	}
	running := startApp(t, a)
	clientDone := make(chan error, 1)
	go func() {
		req, err := http.NewRequestWithContext(t.Context(), http.MethodGet, "http://"+a.Addr().String(), nil)
		if err != nil {
			clientDone <- err
			return
		}
		resp, err := (&http.Client{Timeout: 4 * time.Second}).Do(req)
		if resp != nil {
			_ = resp.Body.Close()
		}
		clientDone <- err
	}()
	await(t, entered, "handler")
	running.cancel()
	if err := running.wait(t); err == nil || !strings.Contains(err.Error(), "shutdown") || !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("Run = %v", err)
	}
	select {
	case err := <-clientDone:
		if err == nil {
			t.Fatal("client expected closed connection")
		}
	case <-time.After(2 * time.Second):
		t.Fatal("client did not finish")
	}
	select {
	case <-exited:
	case <-time.After(2 * time.Second):
		t.Fatal("handler did not exit")
	}
}

func TestServeFailureDuringDrain(t *testing.T) {
	cfg := testConfig()
	cfg.ShutdownDrain = time.Hour // A serve failure must interrupt this wait.
	a, err := New(cfg, slog.New(slog.DiscardHandler))
	if err != nil {
		t.Fatal(err)
	}
	draining, release := drainGate(t, a)
	defer release()
	running := startApp(t, a)
	waitReady(t, "http://"+a.Addr().String()+"/readyz")
	running.cancel()
	await(t, draining, "drain hook")
	if err := a.adminLn.Close(); err != nil {
		t.Fatal(err)
	}
	release()
	if err := running.wait(t); err == nil || !strings.Contains(err.Error(), "server failed") || !errors.Is(err, net.ErrClosed) {
		t.Fatalf("Run = %v", err)
	}
}

func TestServerTimeoutsAndErrorLog(t *testing.T) {
	var logs bytes.Buffer
	srv := newServer(http.NotFoundHandler(), observability.NewLogger(&logs, slog.LevelInfo, "json"))
	if srv.ReadHeaderTimeout != 5*time.Second || srv.ReadTimeout != 10*time.Second || srv.WriteTimeout != 15*time.Second || srv.IdleTimeout != 60*time.Second || srv.MaxHeaderBytes != 16384 || srv.ErrorLog == nil {
		t.Fatalf("server = %+v", srv)
	}
	srv.ErrorLog.Print("server diagnostic")
	var rec struct {
		Level   string
		Message string `json:"msg"`
	}
	if err := json.Unmarshal(logs.Bytes(), &rec); err != nil {
		t.Fatal(err)
	}
	if rec.Level != "WARN" || rec.Message != "server diagnostic" {
		t.Fatalf("log = %s", logs.String())
	}
}

func TestComposedPanicIsCorrelatedAndCounted(t *testing.T) {
	var logs bytes.Buffer
	reg := prometheus.NewRegistry()
	logger := observability.NewLogger(&logs, slog.LevelInfo, "json")
	metrics := observability.NewMetrics(reg, buildinfo.Info{Version: "test", Commit: "abc"})
	mux := http.NewServeMux()
	mux.Handle("/boom", httpx.Route("/boom", http.HandlerFunc(func(http.ResponseWriter, *http.Request) { panic("private failure") })))
	req := httptest.NewRequestWithContext(t.Context(), "GET", "/boom", nil)
	req.Header.Set(httpx.HeaderRequestID, "e2e-1")
	rec := httptest.NewRecorder()
	compose(mux, logger, metrics).ServeHTTP(rec, req)
	var problem httpx.Problem
	if err := json.Unmarshal(rec.Body.Bytes(), &problem); err != nil {
		t.Fatal(err)
	}
	if rec.Code != 500 || problem.Code != httpx.CodeInternal || problem.Detail != "an unexpected error occurred" || problem.RequestID != "e2e-1" || rec.Header().Get(httpx.HeaderRequestID) != "e2e-1" {
		t.Fatalf("response = %d %s", rec.Code, rec.Body.String())
	}
	var panicLog, accessLog bool
	dec := json.NewDecoder(&logs)
	for {
		var line struct {
			Message   string `json:"msg"`
			Level     string
			RequestID string `json:"request_id"`
			Status    int
			Route     string
		}
		err := dec.Decode(&line)
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			t.Fatal(err)
		}
		if line.RequestID != "e2e-1" {
			t.Fatalf("uncorrelated log: %+v", line)
		}
		if line.Message == "panic recovered" {
			panicLog = true
		}
		if line.Message == "http request" {
			accessLog = true
			if line.Level != "ERROR" || line.Status != 500 || line.Route != "/boom" {
				t.Fatalf("access log: %+v", line)
			}
		}
	}
	if !panicLog || !accessLog {
		t.Fatal("missing panic or access log")
	}
	const want = `# HELP http_requests_total HTTP requests by method, route pattern and status code.
# TYPE http_requests_total counter
http_requests_total{method="GET",route="/boom",status="500"} 1
`
	if err := testutil.GatherAndCompare(reg, strings.NewReader(want), "http_requests_total"); err != nil {
		t.Fatal(err)
	}
}

func TestMainAdditionalModes(t *testing.T) {
	for _, tc := range []struct {
		name    string
		args    []string
		env     map[string]string
		code    int
		message string
	}{
		{"healthcheck extra", []string{"calculator", "healthcheck", "extra"}, nil, 1, "healthcheck"},
		{"healthcheck invalid config", []string{"calculator", "healthcheck"}, map[string]string{"CALC_LOG_LEVEL": "loud"}, 1, "CALC_LOG_LEVEL"},
		{"multiple unknown args", []string{"calculator", "bogus", "extra"}, nil, 2, "usage:"},
		{"missing program", nil, nil, 2, "usage:"},
		{"all invalid variables", []string{"calculator"}, map[string]string{
			"CALC_HTTP_ADDR": "bad", "CALC_ADMIN_ADDR": "bad", "CALC_LOG_LEVEL": "loud",
			"CALC_LOG_FORMAT": "xml", "CALC_SHUTDOWN_TIMEOUT": "0s", "CALC_SHUTDOWN_DRAIN": "-1s", "CALC_PPROF": "maybe",
		}, 2, "invalid configuration:\n"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var stderr bytes.Buffer
			code := Main(t.Context(), tc.args, lookup(tc.env), io.Discard, &stderr)
			if code != tc.code || !strings.Contains(stderr.String(), tc.message) {
				t.Fatalf("exit %d, stderr %s", code, stderr.String())
			}
			for key := range tc.env {
				if !strings.Contains(stderr.String(), key) {
					t.Errorf("missing config error %s", key)
				}
			}
		})
	}
}

func lookup(values map[string]string) func(string) (string, bool) {
	return func(key string) (string, bool) { v, ok := values[key]; return v, ok }
}

func TestMainStartupFailure(t *testing.T) {
	taken := bind(t)
	var logs bytes.Buffer
	code := Main(t.Context(), []string{"calculator"}, lookup(map[string]string{
		"CALC_HTTP_ADDR": taken.Addr().String(), "CALC_ADMIN_ADDR": "",
	}), &logs, io.Discard)
	if code != 1 || !strings.Contains(logs.String(), "\"msg\":\"startup failed\"") || !strings.Contains(logs.String(), "\"level\":\"ERROR\"") {
		t.Fatalf("exit %d, logs %s", code, logs.String())
	}
}

func TestHealthcheckSilentServerTimesOut(t *testing.T) {
	ln := bind(t)
	accepted, done := make(chan struct{}), make(chan struct{})
	stop := make(chan struct{})
	var once sync.Once
	release := func() { once.Do(func() { close(stop) }) }
	defer release()
	go func() {
		defer close(done)
		conn, err := ln.Accept()
		if err != nil {
			return
		}
		defer conn.Close()
		close(accepted)
		select {
		case <-stop:
		case <-time.After(5 * time.Second):
		}
	}()
	defer func() { release(); _ = ln.Close(); await(t, done, "silent server") }()
	var stderr bytes.Buffer
	start := time.Now()
	code := Main(t.Context(), []string{"calculator", "healthcheck"}, lookup(map[string]string{"CALC_HTTP_ADDR": ln.Addr().String()}), io.Discard, &stderr)
	if code != 1 || time.Since(start) >= 4*time.Second {
		t.Fatalf("exit %d after %s: %s", code, time.Since(start), stderr.String())
	}
	await(t, accepted, "healthcheck connection")
	if !strings.Contains(stderr.String(), "healthcheck") {
		t.Fatalf("stderr = %s", stderr.String())
	}
}

type roundTripperFunc func(*http.Request) (*http.Response, error)

func (f roundTripperFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

type trackedBody struct {
	*strings.Reader
	closed bool
}

func (b *trackedBody) Close() error { b.closed = true; return nil }

func TestProbeDrainsBodyAndReportsFailures(t *testing.T) {
	for _, status := range []int{200, 503} {
		t.Run(http.StatusText(status), func(t *testing.T) {
			body := &trackedBody{Reader: strings.NewReader("probe response")}
			client := &http.Client{Transport: roundTripperFunc(func(r *http.Request) (*http.Response, error) {
				if r.Method != http.MethodGet || r.URL.String() != "http://127.0.0.1:80/healthz" {
					t.Errorf("request = %s %s", r.Method, r.URL)
				}
				return &http.Response{StatusCode: status, Body: body, Header: make(http.Header)}, nil
			})}
			err := Probe(t.Context(), ":80", client)
			if (err != nil) != (status != 200) {
				t.Fatalf("status %d: %v", status, err)
			}
			if !body.closed || body.Len() != 0 {
				t.Fatalf("body closed=%t, unread=%d", body.closed, body.Len())
			}
		})
	}
	transportErr := errors.New("transport failed")
	client := &http.Client{Transport: roundTripperFunc(func(*http.Request) (*http.Response, error) { return nil, transportErr })}
	if err := Probe(t.Context(), ":80", client); !errors.Is(err, transportErr) {
		t.Fatalf("Probe = %v", err)
	}
	if err := Probe(t.Context(), "nonsense", client); err == nil {
		t.Fatal("invalid address accepted")
	}
	if err := Probe(t.Context(), "bad host:80", client); err == nil {
		t.Fatal("invalid URL accepted")
	}
	if healthcheckTimeout != 2*time.Second {
		t.Fatalf("timeout = %s", healthcheckTimeout)
	}
}

// parkedListener is an in-memory listener whose Serve can be ended at a
// precise moment of the lifecycle.
type parkedListener struct {
	connections chan net.Conn
	closed      chan struct{}
	entered     chan struct{}
	closeOnce   sync.Once
	enterOnce   sync.Once
}

func newParkedListener() *parkedListener {
	return &parkedListener{connections: make(chan net.Conn, 1), closed: make(chan struct{}), entered: make(chan struct{})}
}

func (l *parkedListener) Accept() (net.Conn, error) {
	l.enterOnce.Do(func() { close(l.entered) })
	select {
	case conn := <-l.connections:
		return conn, nil
	case <-l.closed:
		return nil, net.ErrClosed
	case <-time.After(5 * time.Second):
		return nil, errors.New("listener was not closed")
	}
}
func (l *parkedListener) Close() error   { l.closeOnce.Do(func() { close(l.closed) }); return nil }
func (l *parkedListener) Addr() net.Addr { return &net.TCPAddr{IP: net.IPv4(127, 0, 0, 1)} }

func parkedApp(t *testing.T, drain time.Duration) *App {
	t.Helper()
	cfg := testConfig()
	cfg.ShutdownDrain = drain
	logger := slog.New(slog.DiscardHandler)
	return &App{
		cfg: cfg, logger: logger, readiness: &httpapi.Readiness{},
		api: newServer(http.NotFoundHandler(), logger), apiLn: newParkedListener(),
		admin: newServer(http.NotFoundHandler(), logger), adminLn: newParkedListener(),
	}
}

func TestServerClosedDuringDrainIsNotAnError(t *testing.T) {
	a := parkedApp(t, time.Millisecond)
	draining, release := drainGate(t, a)
	defer release()
	running := startApp(t, a)
	await(t, a.apiLn.(*parkedListener).entered, "public Serve")
	await(t, a.adminLn.(*parkedListener).entered, "admin Serve")
	running.cancel()
	await(t, draining, "drain hook")
	ctx, cancel := context.WithTimeout(t.Context(), time.Second)
	defer cancel()
	if err := a.admin.Shutdown(ctx); err != nil {
		t.Fatal(err)
	}
	release()
	if err := running.wait(t); err != nil {
		t.Fatal(err)
	}
}
