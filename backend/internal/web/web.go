// Package web serves the single-page app from an embedded file system in the
// all-in-one image (build tag embedui). Without the tag, Handler returns nil
// and the service is API-only.
package web

import (
	"bytes"
	"crypto/sha256"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"path"
	"strings"
	"time"

	"github.com/JerikH/FullStackCalculator/backend/internal/platform/httpx"
)

// contentSecurityPolicy must stay identical to deploy/nginx/security-headers.conf.
const contentSecurityPolicy = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; " +
	"connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'none'"

// newHandler serves regular files without redirects, directory listings or an
// SPA fallback. The router is responsible for allowing only GET and HEAD.
func newHandler(fsys fs.FS) http.Handler {
	// A file that cannot be read or walked has no validator but is still served:
	// the walk's errors are deliberately not fatal.
	etags := make(map[string]string)
	_ = fs.WalkDir(fsys, ".", func(name string, entry fs.DirEntry, walkErr error) error {
		if walkErr == nil && entry.Type().IsRegular() {
			data, err := fs.ReadFile(fsys, name)
			if err == nil {
				digest := sha256.Sum256(data)
				etags[name] = fmt.Sprintf("\"%x\"", digest[:8])
			}
		}
		return nil
	})
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		name := strings.TrimPrefix(r.URL.Path, "/")
		if r.URL.Path == "/" {
			name = "index.html"
		}
		if !fs.ValidPath(name) || strings.ContainsRune(name, 0) || hiddenPath(name) {
			httpx.NotFound(w, r)
			return
		}
		file, err := fsys.Open(name)
		if err != nil {
			httpx.NotFound(w, r)
			return
		}
		defer func() { _ = file.Close() }()
		info, err := file.Stat()
		if err != nil || !info.Mode().IsRegular() {
			httpx.NotFound(w, r)
			return
		}

		content, ok := file.(io.ReadSeeker)
		if !ok {
			data, readErr := io.ReadAll(file)
			if readErr != nil { // unreachable for embed.FS, whose files are seekable
				httpx.WriteProblem(w, r, httpx.NewProblem(httpx.CodeInternal, "an unexpected error occurred"))
				return
			}
			content = bytes.NewReader(data)
		}

		w.Header().Set("Content-Security-Policy", contentSecurityPolicy)
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
		w.Header().Set("Cross-Origin-Opener-Policy", "same-origin")
		w.Header().Set("Content-Type", contentType(name))
		if etag := etags[name]; etag != "" {
			w.Header().Set("ETag", etag)
		}
		writer := &cacheWriter{ResponseWriter: w, asset: strings.HasPrefix(r.URL.Path, "/assets/")}
		http.ServeContent(writer, r, name, time.Time{}, content)
	})
}

func hiddenPath(name string) bool {
	for segment := range strings.SplitSeq(name, "/") {
		if strings.HasPrefix(segment, ".") {
			return true
		}
	}
	return false
}

func contentType(name string) string {
	switch strings.ToLower(path.Ext(name)) {
	case ".html":
		return "text/html; charset=utf-8"
	case ".js", ".mjs":
		return "text/javascript; charset=utf-8"
	case ".css":
		return "text/css; charset=utf-8"
	case ".txt":
		return "text/plain; charset=utf-8"
	case ".json", ".map":
		return "application/json"
	case ".webmanifest":
		return "application/manifest+json"
	case ".svg":
		return "image/svg+xml"
	case ".png":
		return "image/png"
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".gif":
		return "image/gif"
	case ".webp":
		return "image/webp"
	case ".avif":
		return "image/avif"
	case ".ico":
		return "image/x-icon"
	case ".woff":
		return "font/woff"
	case ".woff2":
		return "font/woff2"
	default:
		return "application/octet-stream"
	}
}

type cacheWriter struct {
	http.ResponseWriter
	asset       bool
	wroteHeader bool
}

func (w *cacheWriter) WriteHeader(code int) {
	if w.wroteHeader {
		return
	}
	w.wroteHeader = true
	policy := "no-cache"
	if w.asset && (code == http.StatusOK || code == http.StatusPartialContent || code == http.StatusNotModified) {
		policy = "public, max-age=31536000, immutable"
	}
	w.Header().Set("Cache-Control", policy)
	w.ResponseWriter.WriteHeader(code)
}

func (w *cacheWriter) Write(data []byte) (int, error) {
	if !w.wroteHeader {
		w.WriteHeader(http.StatusOK)
	}
	return w.ResponseWriter.Write(data)
}

func (w *cacheWriter) Unwrap() http.ResponseWriter { return w.ResponseWriter }
