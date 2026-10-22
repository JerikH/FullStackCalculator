package httpx

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// statusRecorder is an inner writer that remembers every status it receives.
type statusRecorder struct {
	*httptest.ResponseRecorder
	statuses []int
}

func (s *statusRecorder) WriteHeader(code int) {
	s.statuses = append(s.statuses, code)
	if code >= 200 {
		s.ResponseRecorder.WriteHeader(code)
	}
}

func TestRequestContextPropagatesValidInboundID(t *testing.T) {
	t.Parallel()
	valid := []string{"abc-123_X.y", "a", strings.Repeat("a", 128)}
	for _, id := range valid {
		var seen string
		h := RequestContext(http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) { seen = RequestID(r.Context()) }))
		req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/", nil)
		req.Header.Set(HeaderRequestID, id)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		if seen != id || rec.Header().Get(HeaderRequestID) != id {
			t.Fatalf("inbound %q: seen %q header %q", id, seen, rec.Header().Get(HeaderRequestID))
		}
	}
}

func TestRequestContextReplacesInvalidInboundID(t *testing.T) {
	t.Parallel()
	invalid := []string{"", "has space", "<script>", "<x>abc", "abc<x>", "a\nb", strings.Repeat("a", 129), string(make([]byte, 129))}
	for _, bad := range invalid {
		req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/", nil)
		req.Header.Set(HeaderRequestID, bad)
		rec := httptest.NewRecorder()
		RequestContext(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {})).ServeHTTP(rec, req)
		got := rec.Header().Get(HeaderRequestID)
		if got == "" || got == bad || !validRequestID.MatchString(got) {
			t.Fatalf("inbound %q produced %q", bad, got)
		}
	}
}

func TestRequestContextGeneratesDistinctIDs(t *testing.T) {
	t.Parallel()
	seen := map[string]bool{}
	for range 5 {
		rec := httptest.NewRecorder()
		RequestContext(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {})).ServeHTTP(rec, httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/", nil))
		id := rec.Header().Get(HeaderRequestID)
		if !validRequestID.MatchString(id) || seen[id] {
			t.Fatalf("id %q invalid or repeated", id)
		}
		seen[id] = true
	}
}

func TestRouteAndStatusAreRecorded(t *testing.T) {
	t.Parallel()
	var info *RequestInfo
	h := RequestContext(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		info = Info(r.Context())
		Route("/things/{id}", http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(http.StatusTeapot)
			_, _ = w.Write([]byte("abc"))
		})).ServeHTTP(w, r)
	}))
	h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/things/1", nil))
	if info.Route != "/things/{id}" || info.Status != http.StatusTeapot || info.Bytes != 3 {
		t.Fatalf("info = %+v", *info)
	}
}

func TestRouteDefaultsToUnmatched(t *testing.T) {
	t.Parallel()
	var info *RequestInfo
	RequestContext(http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) { info = Info(r.Context()) })).
		ServeHTTP(httptest.NewRecorder(), httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/", nil))
	if info.Route != "unmatched" || info.ID == "" {
		t.Fatalf("info = %+v", *info)
	}
}

func TestRouteWithoutRequestContextStillServes(t *testing.T) {
	t.Parallel()
	rec := httptest.NewRecorder()
	Route("/x", http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) })).
		ServeHTTP(rec, httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/x", nil))
	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d", rec.Code)
	}
}

func TestStatusOrOKDefaultsWhenNothingWritten(t *testing.T) {
	t.Parallel()
	if got := (&RequestInfo{}).StatusOrOK(); got != http.StatusOK {
		t.Fatalf("got %d", got)
	}
	if got := (&RequestInfo{Status: 404}).StatusOrOK(); got != 404 {
		t.Fatalf("got %d", got)
	}
	if Info(t.Context()) != nil || RequestID(t.Context()) != "" {
		t.Fatal("absent context must yield nil info and empty id")
	}
}

func TestRecorderImplicitOKOnFirstWrite(t *testing.T) {
	t.Parallel()
	var info *RequestInfo
	RequestContext(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		info = Info(r.Context())
		_, _ = w.Write([]byte("ab"))
		_, _ = w.Write([]byte("cde"))
	})).ServeHTTP(httptest.NewRecorder(), httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/", nil))
	if info.Status != http.StatusOK || info.Bytes != 5 {
		t.Fatalf("info = %+v", *info)
	}
}

func TestRecorderKeepsFirstStatus(t *testing.T) {
	t.Parallel()
	var info *RequestInfo
	RequestContext(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		info = Info(r.Context())
		w.WriteHeader(http.StatusAccepted)
		w.WriteHeader(http.StatusTeapot)
	})).ServeHTTP(httptest.NewRecorder(), httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/", nil))
	if info.Status != http.StatusAccepted {
		t.Fatalf("info = %+v", *info)
	}
}

func TestRecorderDoesNotRecordInformationalStatuses(t *testing.T) {
	t.Parallel()
	inner := &statusRecorder{ResponseRecorder: httptest.NewRecorder()}
	var info *RequestInfo
	RequestContext(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		info = Info(r.Context())
		w.WriteHeader(http.StatusEarlyHints)
		if info.Status != 0 {
			t.Errorf("1xx recorded as final status %d", info.Status)
		}
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte("abc"))
	})).ServeHTTP(inner, httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/", nil))
	if len(inner.statuses) != 2 || inner.statuses[0] != http.StatusEarlyHints || inner.statuses[1] != http.StatusCreated {
		t.Fatalf("inner statuses = %v", inner.statuses)
	}
	if info.Status != http.StatusCreated || info.Bytes != 3 {
		t.Fatalf("info = %+v", *info)
	}
}

func TestRecorderUnwrapReturnsInnerWriter(t *testing.T) {
	t.Parallel()
	inner := httptest.NewRecorder()
	var got http.ResponseWriter
	RequestContext(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		u, ok := w.(interface{ Unwrap() http.ResponseWriter })
		if !ok {
			t.Error("recorder has no Unwrap")
			return
		}
		got = u.Unwrap()
	})).ServeHTTP(inner, httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/", nil))
	if got != http.ResponseWriter(inner) {
		t.Fatalf("Unwrap returned %T", got)
	}
}
