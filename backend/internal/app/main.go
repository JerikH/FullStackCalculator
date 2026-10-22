package app

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"net/http"

	"github.com/JerikH/FullStackCalculator/backend/internal/config"
	"github.com/JerikH/FullStackCalculator/backend/internal/observability"
)

// Exit codes.
const (
	exitOK     = 0
	exitFailed = 1
	exitUsage  = 2
)

// Main is the testable program entrypoint. With "healthcheck" as the first
// argument it probes a running instance instead of serving; distroless images
// have no curl, so the binary is its own container healthcheck.
func Main(ctx context.Context, args []string, lookupEnv func(string) (string, bool), stdout, stderr io.Writer) int {
	if len(args) == 0 {
		fmt.Fprintln(stderr, "usage: calculator [healthcheck]")
		return exitUsage
	}
	healthcheck := len(args) > 1 && args[1] == "healthcheck"
	if healthcheck && len(args) != 2 {
		fmt.Fprintf(stderr, "usage: %s healthcheck\n", args[0])
		return exitFailed
	}
	if len(args) > 1 && !healthcheck {
		fmt.Fprintf(stderr, "usage: %s [healthcheck]\n", args[0])
		return exitUsage
	}
	cfg, err := config.Load(lookupEnv)
	if err != nil {
		fmt.Fprintf(stderr, "invalid configuration:\n%v\n", err)
		if healthcheck {
			return exitFailed
		}
		return exitUsage
	}
	if healthcheck {
		if err := Probe(ctx, cfg.HTTPAddr, &http.Client{Timeout: healthcheckTimeout}); err != nil {
			fmt.Fprintln(stderr, err)
			return exitFailed
		}
		return exitOK
	}

	logger := observability.NewLogger(stdout, cfg.LogLevel, cfg.LogFormat)
	slog.SetDefault(logger)
	a, err := New(cfg, logger)
	if err != nil {
		logger.Error("startup failed", slog.Any("error", err))
		return exitFailed
	}
	if err := a.Run(ctx); err != nil {
		logger.Error("server stopped with error", slog.Any("error", err))
		return exitFailed
	}
	return exitOK
}
