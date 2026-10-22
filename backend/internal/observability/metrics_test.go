package observability

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"testing"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/testutil"

	"github.com/JerikH/FullStackCalculator/backend/internal/buildinfo"
	"github.com/JerikH/FullStackCalculator/backend/internal/calc"
	"github.com/JerikH/FullStackCalculator/backend/internal/platform/httpx"
)

func newRequest(t *testing.T, method, target string) *http.Request {
	t.Helper()
	return httptest.NewRequestWithContext(t.Context(), method, target, nil)
}

func newMetrics(t *testing.T) (*Metrics, *prometheus.Registry) {
	t.Helper()
	reg := prometheus.NewRegistry()
	return NewMetrics(reg, buildinfo.Info{Version: "1.2.3", Commit: "abc", GoVersion: "go1.25"}), reg
}

func TestMiddlewareRecordsRouteMethodAndStatus(t *testing.T) {
	t.Parallel()
	m, reg := newMetrics(t)
	h := httpx.Chain(httpx.Route("/api/v1/operations/{operation}", http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusUnprocessableEntity)
	})), httpx.RequestContext, m.Middleware)
	h.ServeHTTP(httptest.NewRecorder(), newRequest(t, http.MethodPost, "/api/v1/operations/divide"))
	h.ServeHTTP(httptest.NewRecorder(), newRequest(t, "BREW", "/api/v1/operations/divide"))

	want := `
# HELP http_requests_total HTTP requests by method, route pattern and status code.
# TYPE http_requests_total counter
http_requests_total{method="OTHER",route="/api/v1/operations/{operation}",status="422"} 1
http_requests_total{method="POST",route="/api/v1/operations/{operation}",status="422"} 1
`
	if err := testutil.GatherAndCompare(reg, strings.NewReader(want), "http_requests_total"); err != nil {
		t.Fatal(err)
	}
	if n := testutil.CollectAndCount(m.duration); n != 2 {
		t.Fatalf("duration series = %d", n)
	}
}

func TestMiddlewareCountsRecoveredPanicAs500(t *testing.T) {
	t.Parallel()
	m, reg := newMetrics(t)
	h := httpx.Chain(httpx.Route("/boom", http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		panic("boom")
	})), httpx.RequestContext, m.Middleware, httpx.Recover(slog.New(slog.DiscardHandler)))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, newRequest(t, http.MethodGet, "/boom"))

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want 500", rec.Code)
	}
	want := `
# HELP http_requests_total HTTP requests by method, route pattern and status code.
# TYPE http_requests_total counter
http_requests_total{method="GET",route="/boom",status="500"} 1
`
	if err := testutil.GatherAndCompare(reg, strings.NewReader(want), "http_requests_total"); err != nil {
		t.Fatal(err)
	}
}

func TestMiddlewareCountsAbortedResponseAs500(t *testing.T) {
	t.Parallel()
	m, reg := newMetrics(t)
	h := httpx.Chain(httpx.Route("/partial", http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("x"))
		panic("after the response started")
	})), httpx.RequestContext, m.Middleware, httpx.Recover(slog.New(slog.DiscardHandler)))

	func() {
		defer func() {
			if v := recover(); v != http.ErrAbortHandler { //nolint:errorlint // sentinel identity is the contract
				t.Errorf("recovered %v, want http.ErrAbortHandler", v)
			}
		}()
		h.ServeHTTP(httptest.NewRecorder(), newRequest(t, http.MethodGet, "/partial"))
	}()

	want := `
# HELP http_requests_total HTTP requests by method, route pattern and status code.
# TYPE http_requests_total counter
http_requests_total{method="GET",route="/partial",status="500"} 1
`
	if err := testutil.GatherAndCompare(reg, strings.NewReader(want), "http_requests_total"); err != nil {
		t.Fatal(err)
	}
	if got := testutil.ToFloat64(m.inFlight); got != 0 {
		t.Fatalf("in flight = %v, want 0", got)
	}
}

func TestMiddlewareWithoutRequestContextUsesUnmatchedRoute(t *testing.T) {
	t.Parallel()
	m, reg := newMetrics(t)
	h := m.Middleware(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
	h.ServeHTTP(httptest.NewRecorder(), newRequest(t, http.MethodGet, "/anything/at/all"))

	want := `
# HELP http_requests_total HTTP requests by method, route pattern and status code.
# TYPE http_requests_total counter
http_requests_total{method="GET",route="unmatched",status="200"} 1
`
	if err := testutil.GatherAndCompare(reg, strings.NewReader(want), "http_requests_total"); err != nil {
		t.Fatal(err)
	}
}

func TestMiddlewareTracksInFlight(t *testing.T) {
	t.Parallel()
	m, _ := newMetrics(t)
	var during float64
	h := m.Middleware(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		during = testutil.ToFloat64(m.inFlight)
	}))
	h.ServeHTTP(httptest.NewRecorder(), newRequest(t, http.MethodGet, "/"))
	if during != 1 || testutil.ToFloat64(m.inFlight) != 0 {
		t.Fatalf("in flight during = %v, after = %v", during, testutil.ToFloat64(m.inFlight))
	}
}

func TestDurationHistogramBuckets(t *testing.T) {
	t.Parallel()
	m, reg := newMetrics(t)
	h := httpx.Chain(httpx.Route("/x", http.HandlerFunc(func(http.ResponseWriter, *http.Request) {})),
		httpx.RequestContext, m.Middleware)
	h.ServeHTTP(httptest.NewRecorder(), newRequest(t, http.MethodGet, "/x"))

	families, err := reg.Gather()
	if err != nil {
		t.Fatal(err)
	}
	want := []float64{.0005, .001, .0025, .005, .01, .025, .05, .1, .25, .5, 1}
	for _, fam := range families {
		if fam.GetName() != "http_request_duration_seconds" {
			continue
		}
		if len(fam.GetMetric()) != 1 {
			t.Fatalf("series = %d, want 1", len(fam.GetMetric()))
		}
		var got []float64
		for _, b := range fam.GetMetric()[0].GetHistogram().GetBucket() {
			got = append(got, b.GetUpperBound())
		}
		if !slices.Equal(got, want) {
			t.Fatalf("buckets = %v, want %v", got, want)
		}
		return
	}
	t.Fatal("http_request_duration_seconds not found")
}

type stubCalculator struct {
	res calc.Result
	err error
}

func (s stubCalculator) Calculate(context.Context, string, []string) (calc.Result, error) {
	return s.res, s.err
}

func (stubCalculator) Operations() []calc.OperationInfo {
	return []calc.OperationInfo{{Name: "add"}}
}

func TestInstrumentCalculatorCountsOutcomes(t *testing.T) {
	t.Parallel()
	m, reg := newMetrics(t)
	ok := m.InstrumentCalculator(stubCalculator{res: calc.Result{Value: "1"}})
	bad := m.InstrumentCalculator(stubCalculator{err: calc.ErrDivisionByZero})
	_, _ = ok.Calculate(context.Background(), "add", nil)
	_, _ = bad.Calculate(context.Background(), "add", nil)
	_, _ = bad.Calculate(context.Background(), "nonsense-op", nil)
	if len(ok.Operations()) != 1 {
		t.Fatal("Operations must delegate")
	}

	want := `
# HELP calculator_operations_total Calculator operations by name and outcome.
# TYPE calculator_operations_total counter
calculator_operations_total{operation="add",outcome="division_by_zero"} 1
calculator_operations_total{operation="add",outcome="ok"} 1
calculator_operations_total{operation="unknown",outcome="division_by_zero"} 1
`
	if err := testutil.GatherAndCompare(reg, strings.NewReader(want), "calculator_operations_total"); err != nil {
		t.Fatal(err)
	}
}

func TestInstrumentCalculatorCountsCanceledAndReturnsResultUnchanged(t *testing.T) {
	t.Parallel()
	m, reg := newMetrics(t)
	wantErr := fmt.Errorf("evaluating: %w", context.Canceled)
	wantRes := calc.Result{Value: "7", Inexact: true}
	c := m.InstrumentCalculator(stubCalculator{res: wantRes, err: wantErr})

	res, err := c.Calculate(context.Background(), "add", []string{"3", "4"})
	if res != wantRes || err != wantErr { //nolint:errorlint // asserting the very same error value is returned
		t.Fatalf("got (%+v, %v), want (%+v, %v)", res, err, wantRes, wantErr)
	}
	want := `
# HELP calculator_operations_total Calculator operations by name and outcome.
# TYPE calculator_operations_total counter
calculator_operations_total{operation="add",outcome="canceled"} 1
`
	if err := testutil.GatherAndCompare(reg, strings.NewReader(want), "calculator_operations_total"); err != nil {
		t.Fatal(err)
	}
}

func TestBuildInfoGauge(t *testing.T) {
	t.Parallel()
	_, reg := newMetrics(t)
	want := `
# HELP calculator_build_info Build metadata; the value is always 1.
# TYPE calculator_build_info gauge
calculator_build_info{commit="abc",go_version="go1.25",version="1.2.3"} 1
`
	if err := testutil.GatherAndCompare(reg, strings.NewReader(want), "calculator_build_info"); err != nil {
		t.Fatal(err)
	}
}

func TestGoCollectorRegistered(t *testing.T) {
	t.Parallel()
	_, reg := newMetrics(t)
	families, err := reg.Gather()
	if err != nil {
		t.Fatal(err)
	}
	for _, fam := range families {
		if fam.GetName() == "go_goroutines" {
			return
		}
	}
	t.Fatal("go_goroutines not found: Go collector is not registered")
}
