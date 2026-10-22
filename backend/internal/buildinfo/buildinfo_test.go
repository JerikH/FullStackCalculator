package buildinfo

import (
	"runtime"
	"runtime/debug"
	"testing"
)

func TestGet(t *testing.T) {
	info := Get()
	if info.Version != Version || info.GoVersion != runtime.Version() || info.Commit == "" {
		t.Fatalf("Get() = %+v", info)
	}
}

func TestGetPrefersLdflagsCommit(t *testing.T) {
	old := Commit
	t.Cleanup(func() { Commit = old })
	Commit = "abc123"
	if got := Get().Commit; got != "abc123" {
		t.Fatalf("Commit = %q", got)
	}
}

func TestRevision(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name     string
		settings []debug.BuildSetting
		want     string
	}{
		{"full revision is abbreviated", []debug.BuildSetting{
			{Key: "vcs", Value: "git"},
			{Key: "vcs.revision", Value: "0123456789abcdef0123456789abcdef01234567"},
		}, "0123456789ab"},
		{"short revision is ignored", []debug.BuildSetting{{Key: "vcs.revision", Value: "0123"}}, "unknown"},
		{"no revision", []debug.BuildSetting{{Key: "GOOS", Value: "linux"}}, "unknown"},
		{"no settings", nil, "unknown"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			if got := revision(tt.settings); got != tt.want {
				t.Fatalf("revision() = %q, want %q", got, tt.want)
			}
		})
	}
}
