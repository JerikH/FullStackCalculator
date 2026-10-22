package observability

import (
	"context"
	"io"
	"log/slog"

	"github.com/JerikH/FullStackCalculator/backend/internal/platform/httpx"
)

// NewLogger returns a slog logger writing JSON (or text) at level. Every
// *Context call automatically carries the request's correlation id.
func NewLogger(w io.Writer, level slog.Level, format string) *slog.Logger {
	opts := &slog.HandlerOptions{Level: level}
	var h slog.Handler = slog.NewJSONHandler(w, opts)
	if format == "text" {
		h = slog.NewTextHandler(w, opts)
	}
	return slog.New(contextHandler{h})
}

type contextHandler struct{ slog.Handler }

func (h contextHandler) Handle(ctx context.Context, rec slog.Record) error {
	if id := httpx.RequestID(ctx); id != "" {
		rec.AddAttrs(slog.String("request_id", id))
	}
	return h.Handler.Handle(ctx, rec)
}

func (h contextHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	return contextHandler{h.Handler.WithAttrs(attrs)}
}

func (h contextHandler) WithGroup(name string) slog.Handler {
	return contextHandler{h.Handler.WithGroup(name)}
}
