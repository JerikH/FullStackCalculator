package observability

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/JerikH/FullStackCalculator/backend/internal/platform/httpx"
)

func TestLoggerAddsRequestIDFromContext(t *testing.T) {
	t.Parallel()
	var buf bytes.Buffer
	logger := NewLogger(&buf, slog.LevelInfo, "json").With("component", "test")
	h := httpx.RequestContext(http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) {
		logger.InfoContext(r.Context(), "hello")
	}))
	req := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/", nil)
	req.Header.Set(httpx.HeaderRequestID, "req-1")
	h.ServeHTTP(httptest.NewRecorder(), req)

	var line map[string]any
	if err := json.Unmarshal(buf.Bytes(), &line); err != nil {
		t.Fatal(err)
	}
	if line["request_id"] != "req-1" || line["component"] != "test" {
		t.Fatalf("line = %v", line)
	}
}

func TestLoggerWithoutRequestContextOmitsRequestID(t *testing.T) {
	t.Parallel()
	var buf bytes.Buffer
	NewLogger(&buf, slog.LevelInfo, "json").InfoContext(context.Background(), "hello")
	if strings.Contains(buf.String(), "request_id") {
		t.Fatalf("unexpected request_id: %s", buf.String())
	}
}

func TestLoggerLevelAndTextFormat(t *testing.T) {
	t.Parallel()
	var buf bytes.Buffer
	logger := NewLogger(&buf, slog.LevelWarn, "text").WithGroup("g")
	logger.Info("hidden")
	logger.Warn("shown", "k", "v")
	out := buf.String()
	if strings.Contains(out, "hidden") || !strings.Contains(out, "msg=shown") || !strings.Contains(out, "g.k=v") {
		t.Fatalf("out = %q", out)
	}
}
