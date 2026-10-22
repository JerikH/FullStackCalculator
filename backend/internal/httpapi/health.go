package httpapi

import (
	"log/slog"
	"net/http"
	"sync/atomic"

	"github.com/JerikH/FullStackCalculator/backend/internal/buildinfo"
	"github.com/JerikH/FullStackCalculator/backend/internal/platform/httpx"
)

// Readiness flips to draining at shutdown so load balancers stop routing new
// traffic before connections are closed.
type Readiness struct{ draining atomic.Bool }

// Drain marks the instance as no longer ready.
func (r *Readiness) Drain() { r.draining.Store(true) }

// Draining reports whether Drain was called.
func (r *Readiness) Draining() bool { return r.draining.Load() }

type healthHandler struct {
	readiness *Readiness
	build     buildinfo.Info
}

type healthResponse struct {
	Status  string `json:"status"`
	Version string `json:"version"`
	Commit  string `json:"commit"`
}

func (h *healthHandler) live(w http.ResponseWriter, r *http.Request) {
	httpx.WriteJSON(w, r, http.StatusOK, healthResponse{Status: "ok", Version: h.build.Version, Commit: h.build.Commit})
}

func (h *healthHandler) ready(w http.ResponseWriter, r *http.Request) {
	if h.readiness.Draining() {
		// Draining is an expected state, not a server fault: keep it out of the
		// error-level alerting that the 5xx rule feeds.
		httpx.SetAccessLevel(r.Context(), slog.LevelInfo)
		httpx.WriteJSON(w, r, http.StatusServiceUnavailable, healthResponse{Status: "draining", Version: h.build.Version, Commit: h.build.Commit})
		return
	}
	httpx.WriteJSON(w, r, http.StatusOK, healthResponse{Status: "ready", Version: h.build.Version, Commit: h.build.Commit})
}
