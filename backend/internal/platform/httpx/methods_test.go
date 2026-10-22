package httpx

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestMethodsDispatches(t *testing.T) {
	t.Parallel()
	ok := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) })
	m := Methods{http.MethodPost: ok, http.MethodGet: ok}
	rec := httptest.NewRecorder()
	m.ServeHTTP(rec, httptest.NewRequestWithContext(context.Background(), http.MethodPost, "/", nil))
	if rec.Code != http.StatusNoContent {
		t.Fatalf("POST status = %d", rec.Code)
	}
}

func TestMethodsRejectsWithSortedAllow(t *testing.T) {
	t.Parallel()
	ok := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) })
	m := Methods{http.MethodPut: ok, http.MethodPost: ok, http.MethodGet: ok}

	rec := httptest.NewRecorder()
	req := httptest.NewRequestWithContext(context.Background(), http.MethodDelete, "/things/1", nil)
	RequestContext(m).ServeHTTP(rec, req)
	if rec.Code != 405 || rec.Header().Get("Allow") != "GET, POST, PUT" {
		t.Fatalf("got %d %q", rec.Code, rec.Header().Get("Allow"))
	}
	if ct := rec.Header().Get("Content-Type"); ct != "application/problem+json" {
		t.Fatalf("Content-Type = %q", ct)
	}
	var body map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body["code"] != "METHOD_NOT_ALLOWED" || body["detail"] != "DELETE is not allowed; use GET, POST, PUT" ||
		body["instance"] != "/things/1" || body["requestId"] != rec.Header().Get(HeaderRequestID) || body["requestId"] == "" {
		t.Fatalf("body = %v", body)
	}
}

func TestMethodsBoundsReflectedMethod(t *testing.T) {
	t.Parallel()
	ok := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) })
	m := Methods{http.MethodGet: ok}
	for _, tc := range []struct {
		name   string
		method string
		want   string
	}{
		{"short method unchanged", "PURGE", "PURGE"},
		{"256 characters unchanged", strings.Repeat("A", 256), strings.Repeat("A", 256)},
		{"300 characters cut to 256", strings.Repeat("A", 300), strings.Repeat("A", 256)},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			rec := httptest.NewRecorder()
			req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/", nil)
			req.Method = tc.method
			RequestContext(m).ServeHTTP(rec, req)
			var p struct {
				Detail string `json:"detail"`
			}
			if err := json.Unmarshal(rec.Body.Bytes(), &p); err != nil {
				t.Fatalf("body is not JSON: %v", err)
			}
			if want := tc.want + " is not allowed; use GET"; rec.Code != 405 || p.Detail != want {
				t.Fatalf("status %d, detail %q, want 405 and %q", rec.Code, p.Detail, want)
			}
		})
	}
}

func TestNotFound(t *testing.T) {
	t.Parallel()
	rec := httptest.NewRecorder()
	RequestContext(http.HandlerFunc(NotFound)).ServeHTTP(rec, httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/nope?x=<evil>", nil))
	var body map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if rec.Code != 404 || body["code"] != "NOT_FOUND" || body["detail"] != "no route matches the request method and path" || body["instance"] != "/nope" {
		t.Fatalf("got %d %v", rec.Code, body)
	}
}
