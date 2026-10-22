package httpx

import (
	"fmt"
	"maps"
	"net/http"
	"slices"
	"strings"
)

// Methods dispatches by HTTP method. Routes are registered without a method so
// that a wrong method yields a problem+json 405 (the stdlib mux answers with
// plain text) while keeping a correct Allow header. HEAD is a method like any
// other: it is served only where registered.
type Methods map[string]http.Handler

func (m Methods) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if h, ok := m[r.Method]; ok {
		h.ServeHTTP(w, r)
		return
	}
	allow := strings.Join(slices.Sorted(maps.Keys(m)), ", ")
	w.Header().Set("Allow", allow)
	// r.Method is the only reflected token; net/http bounds it to the HTTP
	// token grammar and it is JSON-encoded.
	WriteProblem(w, r, NewProblem(CodeMethodNotAllowed, fmt.Sprintf("%s is not allowed; use %s", r.Method, allow)))
}

// NotFound answers unmatched routes with a problem. The detail is fixed so no
// request input is reflected.
func NotFound(w http.ResponseWriter, r *http.Request) {
	WriteProblem(w, r, NewProblem(CodeNotFound, "no route matches the request method and path"))
}
