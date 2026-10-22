// Package buildinfo exposes the binary's version metadata, injected at link
// time with -ldflags "-X" and falling back to the VCS stamp Go embeds.
package buildinfo

import (
	"runtime"
	"runtime/debug"
)

// Set at build time: -X github.com/JerikH/FullStackCalculator/backend/internal/buildinfo.Version=...
var (
	Version = "dev"
	Commit  = ""
)

// Info is the build metadata reported by health endpoints and metrics.
type Info struct {
	Version   string
	Commit    string
	GoVersion string
}

// Get returns the build metadata of the running binary.
func Get() Info {
	return Info{Version: Version, Commit: commit(), GoVersion: runtime.Version()}
}

func commit() string {
	if Commit != "" {
		return Commit
	}
	if bi, ok := debug.ReadBuildInfo(); ok {
		return revision(bi.Settings)
	}
	return "unknown"
}

// revision returns the abbreviated VCS revision Go stamped into the binary,
// or "unknown" when there is none.
func revision(settings []debug.BuildSetting) string {
	for _, s := range settings {
		if s.Key == "vcs.revision" && len(s.Value) >= 12 {
			return s.Value[:12]
		}
	}
	return "unknown"
}
