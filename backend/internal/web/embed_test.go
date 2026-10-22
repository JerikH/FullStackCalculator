//go:build embedui

package web

import (
	"io/fs"
	"net/http"
	"testing"
)

func TestEmbeddedPlaceholder(t *testing.T) {
	t.Parallel()
	if !Enabled {
		t.Fatal("Enabled = false with embedui")
	}
	handler := Handler()
	if handler == nil {
		t.Fatal("Handler must be non-nil with embedui")
	}
	// A dotfile is never served, whatever dist holds.
	assertNotFound(t, request(handler, http.MethodGet, "/.gitkeep"), "/.gitkeep")
	// dist holds only .gitkeep in a checkout and the built app once it is copied
	// in: the root answers accordingly, never an HTML fallback.
	if _, err := fs.Stat(dist, "dist/index.html"); err != nil {
		assertNotFound(t, request(handler, http.MethodGet, "/"), "/")
		return
	}
	assertStatus(t, request(handler, http.MethodGet, "/"), http.StatusOK)
	assertNotFound(t, request(handler, http.MethodGet, "/no-such-route"), "/no-such-route")
}
