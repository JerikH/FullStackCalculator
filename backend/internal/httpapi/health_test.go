package httpapi

import (
	"bytes"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/JerikH/FullStackCalculator/backend/internal/buildinfo"
	"github.com/JerikH/FullStackCalculator/backend/internal/calc"
	"github.com/JerikH/FullStackCalculator/backend/internal/platform/httpx"
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

// accessLines serves one GET through RequestContext and AccessLog around h and
// returns the access lines it wrote, plus the response.
func accessLines(t *testing.T, h http.Handler, path string) ([]map[string]any, *httptest.ResponseRecorder) {
	t.Helper()
	var buf bytes.Buffer
	logged := httpx.Chain(h, httpx.RequestContext, httpx.AccessLog(slog.New(slog.NewJSONHandler(&buf, nil))))
	rec := httptest.NewRecorder()
	logged.ServeHTTP(rec, httptest.NewRequestWithContext(t.Context(), http.MethodGet, path, nil))
	var lines []map[string]any
	for raw := range strings.SplitSeq(strings.TrimSpace(buf.String()), "\n") {
		var line map[string]any
		if err := json.Unmarshal([]byte(raw), &line); err != nil {
			t.Fatalf("bad log line %q: %v", raw, err)
		}
		lines = append(lines, line)
	}
	return lines, rec
}

func TestReadinessAccessLogLevels(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		name     string
		draining bool
		path     string
		status   int
		body     string
	}{
		{"draining readiness is info", true, "/readyz", http.StatusServiceUnavailable, "draining"},
		{"ready readiness is info", false, "/readyz", http.StatusOK, "ready"},
		{"liveness is info", false, "/healthz", http.StatusOK, "ok"},
		{"liveness while draining is info", true, "/healthz", http.StatusOK, "ok"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			readiness := &Readiness{}
			if tc.draining {
				readiness.Drain()
			}
			h := NewRouter(Deps{Calculator: calc.New(), Logger: discardLogger(), Readiness: readiness})
			lines, rec := accessLines(t, h, tc.path)
			if len(lines) != 1 {
				t.Fatalf("lines = %v", lines)
			}
			if line := lines[0]; line["level"] != "INFO" || line["status"] != float64(tc.status) || line["route"] != tc.path || line["path"] != tc.path {
				t.Fatalf("line = %v", line)
			}
			var body map[string]any
			if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
				t.Fatal(err)
			}
			if rec.Code != tc.status || body["status"] != tc.body || rec.Header().Get("Cache-Control") != "no-store" {
				t.Fatalf("response = %d %v %v", rec.Code, body, rec.Header())
			}
		})
	}
}

func TestDrainingReadinessWithoutRequestContextStillAnswers(t *testing.T) {
	t.Parallel()
	readiness := &Readiness{}
	readiness.Drain()
	h := NewRouter(Deps{Calculator: calc.New(), Logger: discardLogger(), Readiness: readiness, Build: buildinfo.Info{Version: "1.0.0", Commit: "abc"}})
	r := do(t, h, http.MethodGet, "/readyz", "", "")
	if r.status != http.StatusServiceUnavailable || r.body["status"] != "draining" || r.body["version"] != "1.0.0" || r.body["commit"] != "abc" {
		t.Fatalf("readyz while draining = %d %s", r.status, r.raw)
	}
}
