package httpx

import (
	"encoding/json"
	"net/http"
	"strconv"
)

const (
	contentTypeJSON    = "application/json; charset=utf-8"
	contentTypeProblem = "application/problem+json"
)

// WriteJSON writes v as a JSON response with the given status. A value that
// cannot be encoded is a programming error and yields an INTERNAL_ERROR
// problem for r instead.
func WriteJSON(w http.ResponseWriter, r *http.Request, status int, v any) {
	if err := writeBody(w, status, contentTypeJSON, v); err != nil {
		WriteProblem(w, r, NewProblem(CodeInternal, "an unexpected error occurred"))
	}
}

// WriteProblem writes p, filling in the request path and correlation id.
func WriteProblem(w http.ResponseWriter, r *http.Request, p Problem) {
	p.Instance = r.URL.Path
	p.RequestID = RequestID(r.Context())
	if err := writeBody(w, p.Status, contentTypeProblem, p); err != nil {
		// Unreachable for a Problem (plain strings and ints); a bare 500 beats
		// an empty 200 should that ever change.
		http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
	}
}

// writeBody marshals before touching the response, so an encoding failure
// leaves it untouched and the caller can still send a well-formed error.
func writeBody(w http.ResponseWriter, status int, contentType string, v any) error {
	body, err := json.Marshal(v)
	if err != nil {
		return err
	}
	body = append(body, '\n')
	h := w.Header()
	h.Set("Content-Type", contentType)
	h.Set("Cache-Control", "no-store")
	h.Set("Content-Length", strconv.Itoa(len(body)))
	w.WriteHeader(status)
	_, _ = w.Write(body) // a failed write means the client went away; nothing left to do
	return nil
}
