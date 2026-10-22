package httpapi

import (
	"net/http"
	"testing"

	"github.com/JerikH/FullStackCalculator/backend/internal/buildinfo"
	"github.com/JerikH/FullStackCalculator/backend/internal/calc"
)

func TestHealthAndReadiness(t *testing.T) {
	t.Parallel()
	readiness := &Readiness{}
	h := NewRouter(Deps{Calculator: calc.New(), Logger: discardLogger(), Readiness: readiness, Build: buildinfo.Info{Version: "1.0.0", Commit: "abc"}})

	live := do(t, h, http.MethodGet, "/healthz", "", "")
	if live.header.Get("Cache-Control") != "no-store" || live.status != 200 || live.body["status"] != "ok" || live.body["version"] != "1.0.0" || live.body["commit"] != "abc" {
		t.Fatalf("healthz = %d %s", live.status, live.raw)
	}
	if r := do(t, h, http.MethodGet, "/readyz", "", ""); r.header.Get("Cache-Control") != "no-store" || r.status != 200 || r.body["status"] != "ready" {
		t.Fatalf("readyz = %d %s", r.status, r.raw)
	}
	readiness.Drain()
	if !readiness.Draining() {
		t.Fatal("Draining() = false after Drain()")
	}
	if r := do(t, h, http.MethodGet, "/readyz", "", ""); r.header.Get("Cache-Control") != "no-store" || r.status != 503 || r.body["status"] != "draining" || r.body["version"] != "1.0.0" || r.body["commit"] != "abc" {
		t.Fatalf("readyz while draining = %d %s", r.status, r.raw)
	}
	if r := do(t, h, http.MethodGet, "/healthz", "", ""); r.status != 200 {
		t.Fatal("liveness must not depend on readiness")
	}
}
