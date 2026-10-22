package app

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"net/http/pprof"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"

	"github.com/JerikH/FullStackCalculator/backend/internal/buildinfo"
	"github.com/JerikH/FullStackCalculator/backend/internal/calc"
	"github.com/JerikH/FullStackCalculator/backend/internal/config"
	"github.com/JerikH/FullStackCalculator/backend/internal/httpapi"
	"github.com/JerikH/FullStackCalculator/backend/internal/observability"
	"github.com/JerikH/FullStackCalculator/backend/internal/platform/httpx"
	"github.com/JerikH/FullStackCalculator/backend/internal/web"
)

// App is a configured, listening service ready to Run.
type App struct {
	cfg       config.Config
	logger    *slog.Logger
	readiness *httpapi.Readiness
	api       *http.Server
	apiLn     net.Listener
	admin     *http.Server
	adminLn   net.Listener
	drainHook func()
}

// New wires the service and binds its listeners, so bind errors surface before
// Run and ":0" addresses are resolvable through Addr.
func New(cfg config.Config, logger *slog.Logger) (*App, error) {
	info := buildinfo.Get()
	reg := prometheus.NewRegistry()
	metrics := observability.NewMetrics(reg, info)
	readiness := &httpapi.Readiness{}

	router := httpapi.NewRouter(httpapi.Deps{
		Calculator: metrics.InstrumentCalculator(calc.New()),
		Logger:     logger,
		Readiness:  readiness,
		Build:      info,
		Web:        web.Handler(),
	})
	return listen(cfg, logger, readiness, compose(router, logger, metrics), adminHandler(reg, cfg.EnablePprof))
}

func compose(router http.Handler, logger *slog.Logger, m *observability.Metrics) http.Handler {
	return httpx.Chain(router,
		httpx.RequestContext,
		httpx.AccessLog(logger),
		m.Middleware,
		httpx.Recover(logger),
		httpx.SecureHeaders,
	)
}

func listen(cfg config.Config, logger *slog.Logger, readiness *httpapi.Readiness, public, admin http.Handler) (*App, error) {
	apiLn, err := net.Listen("tcp", cfg.HTTPAddr) //nolint:noctx // Listeners bind before Run; the fixed construction API has no caller context.
	if err != nil {
		return nil, fmt.Errorf("listen on %s: %w", cfg.HTTPAddr, err)
	}
	a := &App{cfg: cfg, logger: logger, readiness: readiness, api: newServer(public, logger), apiLn: apiLn}

	if cfg.AdminAddr != "" {
		adminLn, err := net.Listen("tcp", cfg.AdminAddr) //nolint:noctx // The fixed listener construction API has no caller context.
		if err != nil {
			_ = apiLn.Close()
			return nil, fmt.Errorf("listen on %s: %w", cfg.AdminAddr, err)
		}
		a.admin, a.adminLn = newServer(admin, logger), adminLn
	}
	return a, nil
}

func newServer(h http.Handler, logger *slog.Logger) *http.Server {
	return &http.Server{
		Handler:           h,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
		MaxHeaderBytes:    16 << 10,
		ErrorLog:          slog.NewLogLogger(logger.Handler(), slog.LevelWarn),
	}
}

func adminHandler(g prometheus.Gatherer, pprofEnabled bool) http.Handler {
	mux := http.NewServeMux()
	mux.Handle("GET /metrics", promhttp.HandlerFor(g, promhttp.HandlerOpts{EnableOpenMetrics: true}))
	if pprofEnabled {
		mux.HandleFunc("/debug/pprof/", pprof.Index)
		mux.HandleFunc("/debug/pprof/cmdline", pprof.Cmdline)
		mux.HandleFunc("/debug/pprof/profile", pprof.Profile)
		mux.HandleFunc("/debug/pprof/symbol", pprof.Symbol)
		mux.HandleFunc("/debug/pprof/trace", pprof.Trace)
	}
	return mux
}

// Addr is the bound address of the public listener.
func (a *App) Addr() net.Addr { return a.apiLn.Addr() }

// AdminAddr is the bound admin address, or nil when disabled.
func (a *App) AdminAddr() net.Addr {
	if a.adminLn == nil {
		return nil
	}
	return a.adminLn.Addr()
}

// Run serves until ctx is canceled, then drains and shuts down gracefully. It
// returns early with an error if a server fails.
func (a *App) Run(ctx context.Context) error {
	servers := []*http.Server{a.api}
	listeners := []net.Listener{a.apiLn}
	if a.admin != nil {
		servers = append(servers, a.admin)
		listeners = append(listeners, a.adminLn)
	}
	results := make(chan error, len(servers))
	for i, srv := range servers {
		go func() {
			err := srv.Serve(listeners[i])
			if errors.Is(err, http.ErrServerClosed) {
				err = nil
			}
			results <- err
		}()
	}
	attrs := []any{slog.String("addr", a.Addr().String())}
	if a.admin != nil {
		attrs = append(attrs, slog.String("admin_addr", a.AdminAddr().String()))
	}
	a.logger.Info("server started", attrs...)

	received := 0
	var serveErrs []error
	canceled := false
	for received < len(servers) && !canceled && len(serveErrs) == 0 {
		select {
		case err := <-results:
			received++
			if err != nil {
				serveErrs = append(serveErrs, err)
			}
		case <-ctx.Done():
			canceled = true
		}
	}
	if canceled {
		a.readiness.Drain()
		a.logger.Info("shutdown started", slog.Duration("drain", a.cfg.ShutdownDrain))
		if a.drainHook != nil {
			a.drainHook()
		}
		if a.cfg.ShutdownDrain > 0 {
			timer := time.NewTimer(a.cfg.ShutdownDrain)
		drain:
			for {
				select {
				case <-timer.C:
					break drain
				case err := <-results:
					received++
					if err != nil {
						serveErrs = append(serveErrs, err)
						break drain
					}
				}
			}
			timer.Stop()
		}
	}

	shutdownCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), a.cfg.ShutdownTimeout)
	defer cancel()
	shutdownResults := make(chan error, len(servers))
	for _, srv := range servers {
		go func() { shutdownResults <- srv.Shutdown(shutdownCtx) }()
	}
	var shutdownErr error
	for range servers {
		shutdownErr = errors.Join(shutdownErr, <-shutdownResults)
	}
	if shutdownErr != nil {
		for _, srv := range servers {
			_ = srv.Close()
		}
	}
	for received < len(servers) {
		err := <-results
		received++
		if err != nil {
			serveErrs = append(serveErrs, err)
		}
	}
	if len(serveErrs) > 0 {
		return fmt.Errorf("server failed: %w", errors.Join(append(serveErrs, shutdownErr)...))
	}
	if shutdownErr != nil {
		return fmt.Errorf("shutdown: %w", shutdownErr)
	}
	a.logger.Info("shutdown complete")
	return nil
}
