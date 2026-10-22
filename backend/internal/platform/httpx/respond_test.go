package httpx

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestWriteProblem(t *testing.T) {
	t.Parallel()
	rec := httptest.NewRecorder()
	req := httptest.NewRequestWithContext(context.Background(), http.MethodPost, "/api/v1/operations/add", nil)
	RequestContext(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		WriteProblem(w, r, NewProblem(CodeValidationFailed, "bad", FieldViolation{Field: "operands", Reason: "is required"}))
	})).ServeHTTP(rec, req)

	if rec.Code != 400 {
		t.Fatalf("status = %d", rec.Code)
	}
	if ct := rec.Header().Get("Content-Type"); ct != "application/problem+json" {
		t.Fatalf("Content-Type = %q", ct)
	}
	if cc := rec.Header().Get("Cache-Control"); cc != "no-store" {
		t.Fatalf("Cache-Control = %q", cc)
	}
	if cl := rec.Header().Get("Content-Length"); cl == "" {
		t.Fatal("Content-Length missing")
	}
	var body map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body["instance"] != "/api/v1/operations/add" || body["requestId"] != rec.Header().Get(HeaderRequestID) || body["requestId"] == "" {
		t.Fatalf("body = %v", body)
	}
	if body["detail"] != "bad" || body["code"] != "VALIDATION_FAILED" {
		t.Fatalf("body = %v", body)
	}
	if _, ok := body["errors"]; !ok {
		t.Fatal("errors missing")
	}
}

func TestWriteProblemWithoutRequestContext(t *testing.T) {
	t.Parallel()
	rec := httptest.NewRecorder()
	WriteProblem(rec, httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/x", nil), NewProblem(CodeNotFound, ""))
	var body map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if v, ok := body["requestId"]; !ok || v != "" {
		t.Fatalf("requestId = %v (present %t)", v, ok)
	}
	if v, ok := body["detail"]; !ok || v != "" {
		t.Fatalf("detail = %v (present %t)", v, ok)
	}
	if _, ok := body["errors"]; ok {
		t.Fatal("errors must be absent without violations")
	}
}

func TestWriteJSON(t *testing.T) {
	t.Parallel()
	rec := httptest.NewRecorder()
	WriteJSON(rec, httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/", nil), http.StatusCreated, map[string]string{"a": "b"})
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d", rec.Code)
	}
	if got := rec.Header().Get("Content-Type"); got != "application/json; charset=utf-8" {
		t.Fatalf("Content-Type = %q", got)
	}
	if got := rec.Header().Get("Cache-Control"); got != "no-store" {
		t.Fatalf("Cache-Control = %q", got)
	}
	if got := rec.Header().Get("Content-Length"); got != "10" {
		t.Fatalf("Content-Length = %q", got)
	}
	if rec.Body.String() != "{\"a\":\"b\"}\n" {
		t.Fatalf("body = %q", rec.Body.String())
	}
}

func TestWriteJSONUnencodableValueYieldsInternalProblem(t *testing.T) {
	t.Parallel()
	rec := httptest.NewRecorder()
	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/some/path", nil)
	RequestContext(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		WriteJSON(w, r, http.StatusOK, map[string]any{"f": func() {}})
	})).ServeHTTP(rec, req)
	if rec.Code != 500 || rec.Header().Get("Content-Type") != "application/problem+json" {
		t.Fatalf("got %d %q", rec.Code, rec.Header().Get("Content-Type"))
	}
	var body map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body["detail"] != "an unexpected error occurred" || body["code"] != "INTERNAL_ERROR" ||
		body["instance"] != "/some/path" || body["requestId"] != rec.Header().Get(HeaderRequestID) || body["requestId"] == "" {
		t.Fatalf("body = %v", body)
	}
}
