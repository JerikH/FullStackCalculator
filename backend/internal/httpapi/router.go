package httpapi

import (
	"context"
	"log/slog"
	"net/http"
	"path"
	"strconv"
	"strings"

	"github.com/JerikH/FullStackCalculator/backend/api"
	"github.com/JerikH/FullStackCalculator/backend/internal/buildinfo"
	"github.com/JerikH/FullStackCalculator/backend/internal/calc"
	"github.com/JerikH/FullStackCalculator/backend/internal/platform/httpx"
)

// Calculator is what the transport needs from the domain.
type Calculator interface {
	Calculate(ctx context.Context, name string, operands []string) (calc.Result, error)
	Operations() []calc.OperationInfo
}

// Deps are the router's collaborators.
type Deps struct {
	Calculator Calculator
	Logger     *slog.Logger
	Readiness  *Readiness
	Build      buildinfo.Info
	Web        http.Handler // nil when the SPA is not embedded
}

// NewRouter returns the service's routes. Cross-cutting middleware is applied
// by the caller so that tests can compose exactly what they need.
func NewRouter(d Deps) http.Handler {
	mux := http.NewServeMux()
	handle := func(pattern string, h http.Handler) { mux.Handle(pattern, httpx.Route(pattern, h)) }

	ops := newOperationsHandler(d.Calculator, d.Logger)
	health := &healthHandler{readiness: d.Readiness, build: d.Build}

	handle("/api/v1/operations", httpx.Methods{http.MethodGet: http.HandlerFunc(ops.list)})
	handle("/api/v1/operations/{operation}", httpx.Methods{http.MethodPost: http.HandlerFunc(ops.calculate)})
	handle("/api/v1/openapi.yaml", httpx.Methods{http.MethodGet: http.HandlerFunc(serveSpec)})
	handle("/healthz", httpx.Methods{http.MethodGet: http.HandlerFunc(health.live)})
	handle("/readyz", httpx.Methods{http.MethodGet: http.HandlerFunc(health.ready)})
	handle("/api", http.HandlerFunc(httpx.NotFound))
	handle("/api/", http.HandlerFunc(httpx.NotFound))
	if d.Web != nil {
		handle("/", httpx.Methods{http.MethodGet: d.Web, http.MethodHead: d.Web})
	} else {
		handle("/", http.HandlerFunc(httpx.NotFound))
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		if r.RequestURI == "*" || !canonical(r.URL.EscapedPath()) {
			httpx.NotFound(w, r)
			return
		}
		mux.ServeHTTP(w, r)
	})
}

// canonical reports whether p is an absolute path without empty, "." or ".."
// segments. The mux would answer any other path itself (a redirect, or an
// empty 400 for "*"), outside the problem vocabulary.
func canonical(p string) bool {
	if p == "" || p[0] != '/' {
		return false
	}
	c := path.Clean(p)
	if strings.HasSuffix(p, "/") && c != "/" {
		c += "/"
	}
	return c == p
}

func serveSpec(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/yaml")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Length", strconv.Itoa(len(api.Spec)))
	_, _ = w.Write(api.Spec)
}
