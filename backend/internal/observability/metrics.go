package observability

import (
	"context"
	"net/http"
	"strconv"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/collectors"

	"github.com/JerikH/FullStackCalculator/backend/internal/buildinfo"
	"github.com/JerikH/FullStackCalculator/backend/internal/calc"
	"github.com/JerikH/FullStackCalculator/backend/internal/platform/httpx"
)

// Calculator is the subset of *calc.Calculator that is instrumented.
type Calculator interface {
	Calculate(ctx context.Context, name string, operands []string) (calc.Result, error)
	Operations() []calc.OperationInfo
}

// Metrics holds the service's Prometheus collectors.
type Metrics struct {
	requests   *prometheus.CounterVec
	duration   *prometheus.HistogramVec
	inFlight   prometheus.Gauge
	operations *prometheus.CounterVec
}

// knownMethods bounds the method label; anything else is reported as OTHER.
var knownMethods = map[string]bool{
	http.MethodGet: true, http.MethodHead: true, http.MethodPost: true, http.MethodPut: true,
	http.MethodPatch: true, http.MethodDelete: true, http.MethodOptions: true,
}

// NewMetrics registers the service collectors, plus Go runtime and process
// collectors, on reg.
func NewMetrics(reg prometheus.Registerer, info buildinfo.Info) *Metrics {
	m := &Metrics{
		requests: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "http_requests_total",
			Help: "HTTP requests by method, route pattern and status code.",
		}, []string{"method", "route", "status"}),
		duration: prometheus.NewHistogramVec(prometheus.HistogramOpts{
			Name:    "http_request_duration_seconds",
			Help:    "HTTP request latency by method and route pattern.",
			Buckets: []float64{.0005, .001, .0025, .005, .01, .025, .05, .1, .25, .5, 1},
		}, []string{"method", "route"}),
		inFlight: prometheus.NewGauge(prometheus.GaugeOpts{
			Name: "http_requests_in_flight",
			Help: "HTTP requests currently being served.",
		}),
		operations: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "calculator_operations_total",
			Help: "Calculator operations by name and outcome.",
		}, []string{"operation", "outcome"}),
	}
	buildInfo := prometheus.NewGauge(prometheus.GaugeOpts{
		Name:        "calculator_build_info",
		Help:        "Build metadata; the value is always 1.",
		ConstLabels: prometheus.Labels{"version": info.Version, "commit": info.Commit, "go_version": info.GoVersion},
	})
	buildInfo.Set(1)
	reg.MustRegister(m.requests, m.duration, m.inFlight, m.operations, buildInfo,
		collectors.NewGoCollector(), collectors.NewProcessCollector(collectors.ProcessCollectorOpts{}))
	return m
}

// Middleware records request count, latency and concurrency. It relies on
// httpx.RequestContext being further out in the chain. Observation happens in
// a defer so a request that unwinds with a panic (httpx.Recover re-panics
// http.ErrAbortHandler after recording status 500) is still counted.
func (m *Metrics) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		m.inFlight.Inc()
		defer m.observe(r, time.Now())
		next.ServeHTTP(w, r)
	})
}

// observe records one finished request. It is deferred directly (and never
// recovers) so panicking requests are counted too.
func (m *Metrics) observe(r *http.Request, start time.Time) {
	m.inFlight.Dec()
	route, status := "unmatched", http.StatusOK
	if info := httpx.Info(r.Context()); info != nil {
		route, status = info.Route, info.StatusOrOK()
	}
	method := r.Method
	if !knownMethods[method] {
		method = "OTHER"
	}
	m.requests.WithLabelValues(method, route, strconv.Itoa(status)).Inc()
	m.duration.WithLabelValues(method, route).Observe(time.Since(start).Seconds())
}

// InstrumentCalculator decorates c so every Calculate call is counted by
// operation and outcome.
func (m *Metrics) InstrumentCalculator(c Calculator) Calculator {
	known := make(map[string]bool)
	for _, op := range c.Operations() {
		known[op.Name] = true
	}
	return &instrumentedCalculator{next: c, counter: m.operations, known: known}
}

type instrumentedCalculator struct {
	next    Calculator
	counter *prometheus.CounterVec
	known   map[string]bool
}

func (ic *instrumentedCalculator) Calculate(ctx context.Context, name string, operands []string) (calc.Result, error) {
	res, err := ic.next.Calculate(ctx, name, operands)
	label := name
	if !ic.known[name] {
		label = "unknown" // never let client input mint new series
	}
	ic.counter.WithLabelValues(label, calc.Outcome(err)).Inc()
	return res, err
}

func (ic *instrumentedCalculator) Operations() []calc.OperationInfo { return ic.next.Operations() }
