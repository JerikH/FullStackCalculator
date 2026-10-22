// Command calculator runs the calculator HTTP service.
//
// Usage:
//
//	calculator              serve (configured through CALC_* environment variables)
//	calculator healthcheck  probe a running instance; exit 0 when healthy
package main

import (
	"context"
	"os"
	"os/signal"
	"syscall"

	"github.com/JerikH/FullStackCalculator/backend/internal/app"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	go func() {
		<-ctx.Done()
		stop()
	}()
	code := app.Main(ctx, os.Args, os.LookupEnv, os.Stdout, os.Stderr)
	stop()
	os.Exit(code)
}
