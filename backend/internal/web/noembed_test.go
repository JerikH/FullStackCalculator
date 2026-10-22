//go:build !embedui

package web

import "testing"

func TestDisabledHandler(t *testing.T) {
	t.Parallel()
	if Enabled {
		t.Fatal("Enabled = true without embedui")
	}
	if Handler() != nil {
		t.Fatal("Handler must be nil without embedui")
	}
}
