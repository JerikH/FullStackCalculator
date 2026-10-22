//go:build embedui

package web

import (
	"embed"
	"io/fs"
	"net/http"
)

// Enabled reports whether the SPA is compiled into this binary.
const Enabled = true

//go:embed all:dist
var dist embed.FS

// Handler serves the embedded SPA. The router filters methods to GET and HEAD.
func Handler() http.Handler {
	sub, err := fs.Sub(dist, "dist")
	if err != nil {
		panic(err) // Unreachable: "dist" is a constant, valid path.
	}
	return newHandler(sub)
}
