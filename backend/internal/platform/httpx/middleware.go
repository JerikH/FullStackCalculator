package httpx

import (
	"context"
	"log/slog"
	"net/http"
	"runtime/debug"
	"time"
)

// Middleware decorates a handler.
type Middleware func(http.Handler) http.Handler

// Chain wraps h so that mws[0] is the outermost middleware.
func Chain(h http.Handler, mws ...Middleware) http.Handler {
	for i := len(mws) - 1; i >= 0; i-- {
		h = mws[i](h)
	}
	return h
}

// AccessLog writes one structured line per request; 5xx responses log at
// error level so they surface in alerting. The line is written in a defer so
// a request that unwinds with a panic (http.ErrAbortHandler) is still logged.
func AccessLog(logger *slog.Logger) Middleware {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			defer logAccess(r.Context(), logger, r, time.Now())
			next.ServeHTTP(w, r)
		})
	}
}

func logAccess(ctx context.Context, logger *slog.Logger, r *http.Request, start time.Time) {
	info := Info(ctx)
	if info == nil {
		info = &RequestInfo{Route: "unmatched"}
	}
	status := info.StatusOrOK()
	level := slog.LevelInfo
	if status >= http.StatusInternalServerError {
		level = slog.LevelError
	}
	logger.LogAttrs(ctx, level, "http request",
		slog.String("method", r.Method),
		slog.String("route", info.Route),
		slog.String("path", r.URL.Path),
		slog.Int("status", status),
		slog.Int64("bytes", info.Bytes),
		slog.Float64("duration_ms", float64(time.Since(start).Microseconds())/1000),
		slog.String("remote_addr", r.RemoteAddr),
		slog.String("user_agent", r.UserAgent()),
	)
}

// Recover converts a panic into a 500 problem without leaking its value, and
// logs it with a stack trace. It must sit inside AccessLog so the 500 is
// logged and counted. When the response has already started, nothing more is
// written: the recorded status becomes 500 and the handler aborts with
// http.ErrAbortHandler so the client sees a broken response, not a short one.
func Recover(logger *slog.Logger) Middleware {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Outside RequestContext nothing records whether the response is
			// already committed, so track it here.
			var tracker *commitTracker
			if Info(r.Context()) == nil {
				tracker = &commitTracker{ResponseWriter: w}
				w = tracker
			}
			defer recoverPanic(logger, w, r, tracker)
			next.ServeHTTP(w, r)
		})
	}
}

// recoverPanic must be called directly by defer so recover() sees the panic.
func recoverPanic(logger *slog.Logger, w http.ResponseWriter, r *http.Request, tracker *commitTracker) {
	v := recover()
	if v == nil {
		return
	}
	if v == http.ErrAbortHandler { //nolint:errorlint // net/http documents identity comparison
		panic(v)
	}
	ctx := r.Context()
	logger.ErrorContext(ctx, "panic recovered", slog.Any("panic", v), slog.String("stack", string(debug.Stack())))
	info := Info(ctx)
	if (info != nil && info.Status != 0) || (tracker != nil && tracker.committed) {
		// The response has started: a problem can no longer be sent, and a
		// truncated body must not look complete. Record the 500 for the access
		// log and metrics, then abort the connection the way net/http intends.
		if info != nil {
			info.Status = http.StatusInternalServerError
		}
		panic(http.ErrAbortHandler)
	}
	WriteProblem(w, r, NewProblem(CodeInternal, "an unexpected error occurred"))
}

// SecureHeaders sets restrictive defaults suited to a JSON API. The embedded
// web handler overrides the CSP for HTML responses.
func SecureHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("Referrer-Policy", "no-referrer")
		h.Set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
		h.Set("Cross-Origin-Resource-Policy", "same-origin")
		next.ServeHTTP(w, r)
	})
}

// commitTracker records whether a final status or body bytes were sent.
type commitTracker struct {
	http.ResponseWriter
	committed bool
}

func (t *commitTracker) WriteHeader(code int) {
	if code >= http.StatusOK || code == http.StatusSwitchingProtocols {
		t.committed = true
	}
	t.ResponseWriter.WriteHeader(code)
}

func (t *commitTracker) Write(b []byte) (int, error) {
	t.committed = true
	return t.ResponseWriter.Write(b)
}

// Unwrap lets http.ResponseController reach the underlying writer.
func (t *commitTracker) Unwrap() http.ResponseWriter { return t.ResponseWriter }
