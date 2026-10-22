//go:build !embedui

// Package web serves the built single-page app when it is compiled into the
// binary with the embedui build tag; without it the service is API-only.
package web

import "net/http"

// Enabled reports whether the SPA is compiled into this binary.
const Enabled = false

// Handler returns nil: this build serves the API only.
func Handler() http.Handler { return nil }
