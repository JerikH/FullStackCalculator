package httpx

import (
	"context"
	"crypto/rand"
	"log/slog"
	"net/http"
	"regexp"
)

// HeaderRequestID carries the correlation id in both directions.
const HeaderRequestID = "X-Request-ID"

var validRequestID = regexp.MustCompile(`^[A-Za-z0-9._-]{1,128}$`)

// RequestInfo is per-request state shared by the middleware stack: the
// correlation id, the matched route pattern and what was written.
type RequestInfo struct {
	ID     string
	Route  string
	Status int
	Bytes  int64

	// level overrides the access line's level when levelSet; the zero value
	// means no override.
	level    slog.Level
	levelSet bool
}

// StatusOrOK returns the written status, or 200 when the handler wrote nothing
// (net/http then sends 200 implicitly).
func (i *RequestInfo) StatusOrOK() int {
	if i.Status == 0 {
		return http.StatusOK
	}
	return i.Status
}

// accessLevel is the level of the request's access line: the handler's
// override when it set one, else error for 5xx and info for everything else.
func (i *RequestInfo) accessLevel() slog.Level {
	if i.levelSet {
		return i.level
	}
	if i.StatusOrOK() >= http.StatusInternalServerError {
		return slog.LevelError
	}
	return slog.LevelInfo
}

// SetAccessLevel sets the level of the request's access line. The handler that
// answers owns that level; it is used for expected states that would otherwise
// match the 5xx rule. It does nothing outside RequestContext.
func SetAccessLevel(ctx context.Context, level slog.Level) {
	if info := Info(ctx); info != nil {
		info.level, info.levelSet = level, true
	}
}

type infoKey struct{}

// Info returns the request's info, or nil outside RequestContext.
func Info(ctx context.Context) *RequestInfo {
	info, _ := ctx.Value(infoKey{}).(*RequestInfo)
	return info
}

// RequestID returns the correlation id, or "" outside RequestContext.
func RequestID(ctx context.Context) string {
	if info := Info(ctx); info != nil {
		return info.ID
	}
	return ""
}

// RequestContext must be the outermost middleware: it assigns the correlation
// id and records the response status and size for everything inside it.
func RequestContext(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := r.Header.Get(HeaderRequestID)
		if !validRequestID.MatchString(id) {
			id = rand.Text()
		}
		info := &RequestInfo{ID: id, Route: "unmatched"}
		w.Header().Set(HeaderRequestID, id)
		next.ServeHTTP(&recorder{ResponseWriter: w, info: info}, r.WithContext(context.WithValue(r.Context(), infoKey{}, info)))
	})
}

// Route tags the request with the pattern it matched. Logs and metrics use the
// pattern, never the raw path, to keep label cardinality bounded.
func Route(pattern string, h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if info := Info(r.Context()); info != nil {
			info.Route = pattern
		}
		h.ServeHTTP(w, r)
	})
}

type recorder struct {
	http.ResponseWriter
	info *RequestInfo
}

// WriteHeader records the first final status. Informational 1xx statuses
// (other than 101 Switching Protocols, which net/http treats as final) are
// forwarded but not recorded.
func (rw *recorder) WriteHeader(code int) {
	informational := code >= 100 && code < 200 && code != http.StatusSwitchingProtocols
	if !informational && rw.info.Status == 0 {
		rw.info.Status = code
	}
	rw.ResponseWriter.WriteHeader(code)
}

func (rw *recorder) Write(b []byte) (int, error) {
	if rw.info.Status == 0 {
		rw.info.Status = http.StatusOK
	}
	n, err := rw.ResponseWriter.Write(b)
	rw.info.Bytes += int64(n)
	return n, err
}

// Unwrap lets http.ResponseController reach the underlying writer.
func (rw *recorder) Unwrap() http.ResponseWriter { return rw.ResponseWriter }
