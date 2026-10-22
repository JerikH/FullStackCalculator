package config

import (
	"log/slog"
	"strings"
	"testing"
	"time"

	"github.com/google/go-cmp/cmp"
)

func env(m map[string]string) func(string) (string, bool) {
	return func(k string) (string, bool) { v, ok := m[k]; return v, ok }
}

func TestLoadDefaults(t *testing.T) {
	t.Parallel()
	got, err := Load(env(nil))
	if err != nil {
		t.Fatal(err)
	}
	want := Config{
		HTTPAddr: ":8081", AdminAddr: ":9091", LogLevel: slog.LevelInfo, LogFormat: "json",
		ShutdownTimeout: 15 * time.Second, ShutdownDrain: 0, EnablePprof: false,
	}
	if diff := cmp.Diff(want, got); diff != "" {
		t.Fatalf("(-want +got):\n%s", diff)
	}
}

func TestLoadOverrides(t *testing.T) {
	t.Parallel()
	got, err := Load(env(map[string]string{
		"CALC_HTTP_ADDR": "127.0.0.1:9000", "CALC_ADMIN_ADDR": "", "CALC_LOG_LEVEL": "debug",
		"CALC_LOG_FORMAT": "text", "CALC_SHUTDOWN_TIMEOUT": "3s", "CALC_SHUTDOWN_DRAIN": "5s", "CALC_PPROF": "true",
	}))
	if err != nil {
		t.Fatal(err)
	}
	want := Config{
		HTTPAddr: "127.0.0.1:9000", AdminAddr: "", LogLevel: slog.LevelDebug, LogFormat: "text",
		ShutdownTimeout: 3 * time.Second, ShutdownDrain: 5 * time.Second, EnablePprof: true,
	}
	if diff := cmp.Diff(want, got); diff != "" {
		t.Fatalf("(-want +got):\n%s", diff)
	}
}

func TestLoadReportsEveryInvalidVariable(t *testing.T) {
	t.Parallel()
	got, err := Load(env(map[string]string{
		"CALC_HTTP_ADDR": "nonsense", "CALC_ADMIN_ADDR": "also-bad", "CALC_LOG_LEVEL": "loud",
		"CALC_LOG_FORMAT": "xml", "CALC_SHUTDOWN_TIMEOUT": "0s", "CALC_SHUTDOWN_DRAIN": "-1s", "CALC_PPROF": "maybe",
	}))
	if err == nil {
		t.Fatal("expected error")
	}
	for _, name := range []string{"CALC_HTTP_ADDR", "CALC_ADMIN_ADDR", "CALC_LOG_LEVEL", "CALC_LOG_FORMAT", "CALC_SHUTDOWN_TIMEOUT", "CALC_SHUTDOWN_DRAIN", "CALC_PPROF"} {
		if !strings.Contains(err.Error(), name) {
			t.Errorf("error does not mention %s:\n%v", name, err)
		}
	}
	if diff := cmp.Diff(Config{}, got); diff != "" {
		t.Errorf("Config on error (-want +got):\n%s", diff)
	}
}

func TestLoadErrorFormat(t *testing.T) {
	t.Parallel()
	_, err := Load(env(map[string]string{"CALC_LOG_LEVEL": "loud", "CALC_SHUTDOWN_TIMEOUT": "0s"}))
	if err == nil {
		t.Fatal("expected error")
	}
	want := `CALC_LOG_LEVEL="loud": must be one of debug, info, warn, error` + "\n" +
		`CALC_SHUTDOWN_TIMEOUT="0s": must be a positive duration`
	if diff := cmp.Diff(want, err.Error()); diff != "" {
		t.Fatalf("(-want +got):\n%s", diff)
	}
}

func TestHTTPAddrRules(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		value string
		valid bool
	}{
		{":0", true},
		{"127.0.0.1:4111", true},
		{"[::1]:80", true},
		{":8081", true},
		{":65535", true},
		{":", false},
		{":http", false},
		{":65536", false},
		{":-1", false},
		{"nonsense", false},
		{"", false},
	} {
		t.Run(tc.value, func(t *testing.T) {
			t.Parallel()
			got, err := Load(env(map[string]string{"CALC_HTTP_ADDR": tc.value}))
			if tc.valid {
				if err != nil {
					t.Fatalf("Load() = %v; want valid", err)
				}
				if got.HTTPAddr != tc.value {
					t.Fatalf("HTTPAddr = %q; want %q", got.HTTPAddr, tc.value)
				}
				return
			}
			if err == nil || !strings.Contains(err.Error(), "CALC_HTTP_ADDR") {
				t.Fatalf("Load() = %v; want CALC_HTTP_ADDR error", err)
			}
		})
	}
}

func TestAdminAddrRules(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		name, value string
		valid       bool
	}{
		{"empty disables", "", true},
		{"valid", "127.0.0.1:9091", true},
		{"zero port", ":0", true},
		{"named port", ":http", false},
		{"too large", ":65536", false},
		{"no port", "nonsense", false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got, err := Load(env(map[string]string{"CALC_ADMIN_ADDR": tc.value}))
			if tc.valid {
				if err != nil {
					t.Fatalf("Load() = %v; want valid", err)
				}
				if got.AdminAddr != tc.value {
					t.Fatalf("AdminAddr = %q; want %q", got.AdminAddr, tc.value)
				}
				return
			}
			if err == nil || !strings.Contains(err.Error(), "CALC_ADMIN_ADDR") {
				t.Fatalf("Load() = %v; want CALC_ADMIN_ADDR error", err)
			}
		})
	}
}

func TestLogLevelRules(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		value string
		want  slog.Level
		valid bool
	}{
		{"debug", slog.LevelDebug, true},
		{"info", slog.LevelInfo, true},
		{"warn", slog.LevelWarn, true},
		{"error", slog.LevelError, true},
		{"INFO", slog.LevelInfo, true},
		{"Warn", slog.LevelWarn, true},
		{"info+2", 0, false},
		{"loud", 0, false},
		{"", 0, false},
	} {
		t.Run(tc.value, func(t *testing.T) {
			t.Parallel()
			got, err := Load(env(map[string]string{"CALC_LOG_LEVEL": tc.value}))
			if tc.valid {
				if err != nil {
					t.Fatalf("Load() = %v; want valid", err)
				}
				if got.LogLevel != tc.want {
					t.Fatalf("LogLevel = %v; want %v", got.LogLevel, tc.want)
				}
				return
			}
			if err == nil || !strings.Contains(err.Error(), "CALC_LOG_LEVEL") {
				t.Fatalf("Load() = %v; want CALC_LOG_LEVEL error", err)
			}
		})
	}
}

func TestEmptyValueIsNotUnset(t *testing.T) {
	t.Parallel()
	for _, name := range []string{"CALC_HTTP_ADDR", "CALC_LOG_FORMAT", "CALC_SHUTDOWN_TIMEOUT", "CALC_SHUTDOWN_DRAIN", "CALC_PPROF"} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			_, err := Load(env(map[string]string{name: ""}))
			if err == nil || !strings.Contains(err.Error(), name) {
				t.Fatalf("Load() = %v; want %s error", err, name)
			}
		})
	}
}

func TestShutdownDurationRules(t *testing.T) {
	t.Parallel()
	got, err := Load(env(map[string]string{"CALC_SHUTDOWN_DRAIN": "0s"}))
	if err != nil {
		t.Fatalf("drain 0s: %v", err)
	}
	if got.ShutdownDrain != 0 {
		t.Errorf("ShutdownDrain = %v; want 0", got.ShutdownDrain)
	}
	for _, tc := range []struct{ name, value string }{
		{"CALC_SHUTDOWN_TIMEOUT", "0s"},
		{"CALC_SHUTDOWN_TIMEOUT", "-1s"},
		{"CALC_SHUTDOWN_DRAIN", "-1s"},
	} {
		if _, err := Load(env(map[string]string{tc.name: tc.value})); err == nil || !strings.Contains(err.Error(), tc.name) {
			t.Errorf("%s=%q: Load() = %v; want error", tc.name, tc.value, err)
		}
	}
	if _, err := Load(env(map[string]string{"CALC_SHUTDOWN_TIMEOUT": "soon"})); err == nil {
		t.Error("unparsable duration accepted")
	}
}

func TestPprofUsesParseBool(t *testing.T) {
	t.Parallel()
	for value, want := range map[string]bool{"1": true, "t": true, "TRUE": true, "0": false, "false": false} {
		got, err := Load(env(map[string]string{"CALC_PPROF": value}))
		if err != nil || got.EnablePprof != want {
			t.Errorf("CALC_PPROF=%q: EnablePprof = %v, err = %v; want %v", value, got.EnablePprof, err, want)
		}
	}
	for _, value := range []string{"yes", "maybe", "on"} {
		if _, err := Load(env(map[string]string{"CALC_PPROF": value})); err == nil || !strings.Contains(err.Error(), "CALC_PPROF") {
			t.Errorf("CALC_PPROF=%q: Load() = %v; want error", value, err)
		}
	}
}
