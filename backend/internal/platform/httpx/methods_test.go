package httpx

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
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
