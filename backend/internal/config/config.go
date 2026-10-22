// Package config loads the service configuration from environment variables.
// Every variable is validated and all problems are reported at once, so a
// misconfigured deployment fails fast with a complete diagnosis.
package config

import (
	"errors"
	"fmt"
	"log/slog"
	"net"
	"strconv"
	"strings"
	"time"
)

// Config is the validated service configuration.
type Config struct {
	HTTPAddr        string
	AdminAddr       string // empty disables the admin server
	LogLevel        slog.Level
	LogFormat       string // "json" or "text"
	ShutdownTimeout time.Duration
	ShutdownDrain   time.Duration
	EnablePprof     bool
}

// Load reads configuration through lookup (os.LookupEnv in production). A
// variable set to the empty string is a value, not an unset variable. On any
// problem it returns the zero Config and one error naming every invalid
// variable.
func Load(lookup func(string) (string, bool)) (Config, error) {
	get := func(name, def string) string {
		if v, ok := lookup(name); ok {
			return v
		}
		return def
	}
	var (
		cfg  Config
		errs []error
	)
	fail := func(name, value, reason string) { errs = append(errs, fmt.Errorf("%s=%q: %s", name, value, reason)) }

	cfg.HTTPAddr = get("CALC_HTTP_ADDR", ":8081")
	if !validAddr(cfg.HTTPAddr) {
		fail("CALC_HTTP_ADDR", cfg.HTTPAddr, "must be host:port with a numeric port")
	}
	cfg.AdminAddr = get("CALC_ADMIN_ADDR", ":9091")
	if cfg.AdminAddr != "" && !validAddr(cfg.AdminAddr) {
		fail("CALC_ADMIN_ADDR", cfg.AdminAddr, "must be host:port or empty to disable, with a numeric port")
	}
	if level := get("CALC_LOG_LEVEL", "info"); !isKnownLevel(level) || cfg.LogLevel.UnmarshalText([]byte(level)) != nil {
		fail("CALC_LOG_LEVEL", level, "must be one of debug, info, warn, error")
	}
	cfg.LogFormat = get("CALC_LOG_FORMAT", "json")
	if cfg.LogFormat != "json" && cfg.LogFormat != "text" {
		fail("CALC_LOG_FORMAT", cfg.LogFormat, "must be json or text")
	}
	cfg.ShutdownTimeout = duration(get("CALC_SHUTDOWN_TIMEOUT", "15s"), "CALC_SHUTDOWN_TIMEOUT", func(d time.Duration) bool { return d > 0 }, "must be a positive duration", fail)
	cfg.ShutdownDrain = duration(get("CALC_SHUTDOWN_DRAIN", "0s"), "CALC_SHUTDOWN_DRAIN", func(d time.Duration) bool { return d >= 0 }, "must be a non-negative duration", fail)
	pprof := get("CALC_PPROF", "false")
	enabled, err := strconv.ParseBool(pprof)
	if err != nil {
		fail("CALC_PPROF", pprof, "must be a boolean")
	}
	cfg.EnablePprof = enabled

	if len(errs) > 0 {
		return Config{}, errors.Join(errs...)
	}
	return cfg, nil
}

// validAddr reports whether s is host:port with a numeric port in 0-65535.
func validAddr(s string) bool {
	_, port, err := net.SplitHostPort(s)
	if err != nil {
		return false
	}
	_, err = strconv.ParseUint(port, 10, 16)
	return err == nil
}

func isKnownLevel(s string) bool {
	switch strings.ToLower(s) {
	case "debug", "info", "warn", "error":
		return true
	}
	return false
}

func duration(raw, name string, valid func(time.Duration) bool, reason string, fail func(string, string, string)) time.Duration {
	d, err := time.ParseDuration(raw)
	if err != nil || !valid(d) {
		fail(name, raw, reason)
	}
	return d
}
