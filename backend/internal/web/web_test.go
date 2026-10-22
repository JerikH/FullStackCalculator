package web

import (
	"context"
	"crypto/sha256"
	"embed"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io/fs"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"regexp"
	"strings"
	"sync"
	"testing"
	"testing/fstest"

	"github.com/JerikH/FullStackCalculator/backend/internal/calc"
	"github.com/JerikH/FullStackCalculator/backend/internal/httpapi"
	"github.com/JerikH/FullStackCalculator/backend/internal/platform/httpx"
)

//go:embed all:testdata
var embeddedTestdata embed.FS

const immutable = "public, max-age=31536000, immutable"

func testFiles() fstest.MapFS {
	files := fstest.MapFS{}
	for _, name := range []string{
		"index.html", "theme-init.js", "favicon.ico", "assets/app-abc.js",
		"assets/app-abc.js.map", "assets/font.woff2", "assets/sub/x.css",
		".gitkeep", ".secret", "data.unknown", "assets/.hidden/y.js", "UPPER.JS", "assets-note.txt", "nested/assets/z.js", "sub/index.html",
	} {
		files[name] = &fstest.MapFile{Data: []byte("file contents for " + name)}
	}
	return files
}

func request(handler http.Handler, method, target string) *httptest.ResponseRecorder {
	req := httptest.NewRequestWithContext(context.Background(), method, target, nil)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, req)
	return recorder
}

func assertHeader(t *testing.T, recorder *httptest.ResponseRecorder, name, want string) {
	t.Helper()
	if got := recorder.Header().Values(name); len(got) != 1 || got[0] != want {
		t.Errorf("%s = %q, want exactly [%q]", name, got, want)
	}
}

func assertStatus(t *testing.T, recorder *httptest.ResponseRecorder, want int) {
	t.Helper()
	if recorder.Code != want {
		t.Fatalf("status = %d, want %d: %s", recorder.Code, want, recorder.Body.String())
	}
	if recorder.Header().Get("Location") != "" {
		t.Error("unexpected redirect Location")
	}
}

func assertNotFound(t *testing.T, recorder *httptest.ResponseRecorder, instance string) {
	t.Helper()
	assertStatus(t, recorder, http.StatusNotFound)
	assertHeader(t, recorder, "Content-Type", "application/problem+json")
	assertHeader(t, recorder, "Cache-Control", "no-store")
	var problem httpx.Problem
	if err := json.Unmarshal(recorder.Body.Bytes(), &problem); err != nil {
		t.Fatal(err)
	}
	if problem.Code != httpx.CodeNotFound || problem.Instance != instance {
		t.Errorf("problem = %+v, want NOT_FOUND at %q", problem, instance)
	}
}

func policyHeaders() map[string]string {
	return map[string]string{
		"Content-Security-Policy":    contentSecurityPolicy,
		"X-Content-Type-Options":     "nosniff",
		"Referrer-Policy":            "no-referrer",
		"Permissions-Policy":         "camera=(), microphone=(), geolocation=()",
		"Cross-Origin-Opener-Policy": "same-origin",
	}
}

func TestFiles(t *testing.T) {
	t.Parallel()
	files := testFiles()
	handler := newHandler(files)
	for _, tc := range []struct{ target, name, mediaType, cache string }{
		{"/", "index.html", "text/html; charset=utf-8", "no-cache"},
		{"/index.html", "index.html", "text/html; charset=utf-8", "no-cache"},
		{"/index.html?ignored=yes", "index.html", "text/html; charset=utf-8", "no-cache"},
		{"/theme-init.js", "theme-init.js", "text/javascript; charset=utf-8", "no-cache"},
		{"/assets/app-abc.js", "assets/app-abc.js", "text/javascript; charset=utf-8", immutable},
		{"/assets/app-abc.js.map", "assets/app-abc.js.map", "application/json", immutable},
		{"/assets/font.woff2", "assets/font.woff2", "font/woff2", immutable},
		{"/favicon.ico", "favicon.ico", "image/x-icon", "no-cache"},
		{"/assets/sub/x.css", "assets/sub/x.css", "text/css; charset=utf-8", immutable},
		{"/data.unknown", "data.unknown", "application/octet-stream", "no-cache"},
		{"/UPPER.JS", "UPPER.JS", "text/javascript; charset=utf-8", "no-cache"},
		// Only the /assets/ directory at the root is immutable: a similar name or a nested directory is not.
		{"/assets-note.txt", "assets-note.txt", "text/plain; charset=utf-8", "no-cache"},
		{"/nested/assets/z.js", "nested/assets/z.js", "text/javascript; charset=utf-8", "no-cache"},
	} {
		t.Run(tc.target, func(t *testing.T) {
			t.Parallel()
			recorder := request(handler, http.MethodGet, tc.target)
			assertStatus(t, recorder, http.StatusOK)
			if recorder.Body.String() != string(files[tc.name].Data) {
				t.Error("incorrect file contents")
			}
			assertHeader(t, recorder, "Content-Type", tc.mediaType)
			assertHeader(t, recorder, "Cache-Control", tc.cache)
			digest := sha256.Sum256(files[tc.name].Data)
			assertHeader(t, recorder, "ETag", "\""+hex.EncodeToString(digest[:8])+"\"")
		})
	}
}

func TestMisses(t *testing.T) {
	t.Parallel()
	handler := newHandler(testFiles())
	for _, target := range []string{
		"/missing.js", "/assets/missing-abc.js", "/assets/", "/assets", "/assets/sub/",
		"/.gitkeep", "/.secret", "/assets/.hidden/y.js", "/a/../index.html", "/bad%00.js",
		"/../index.html", "/assets/../index.html", "/sub", "/sub/", "/Index.html", "/ASSETS/app-abc.js",
		"/" + strings.Repeat("a", 64<<10),
	} {
		t.Run(target, func(t *testing.T) {
			t.Parallel()
			req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, target, nil)
			recorder := httptest.NewRecorder()
			// Misses must preserve every policy header already supplied by middleware.
			recorder.Header().Set("Content-Security-Policy", "middleware-policy")
			recorder.Header().Set("Referrer-Policy", "middleware-referrer")
			handler.ServeHTTP(recorder, req)
			assertNotFound(t, recorder, req.URL.Path)
			if recorder.Header().Get("ETag") != "" || recorder.Header().Get("Content-Encoding") != "" {
				t.Error("a miss must not carry file validators or an encoding")
			}
			assertHeader(t, recorder, "Content-Security-Policy", "middleware-policy")
			assertHeader(t, recorder, "Referrer-Policy", "middleware-referrer")
			for _, name := range []string{"Permissions-Policy", "Cross-Origin-Opener-Policy", "X-Content-Type-Options"} {
				if recorder.Header().Get(name) != "" {
					t.Errorf("unexpected app header %s", name)
				}
			}
		})
	}
}

func TestConditionalRangeAndPolicies(t *testing.T) {
	t.Parallel()
	handler := newHandler(testFiles())
	for _, target := range []string{"/index.html", "/assets/app-abc.js"} {
		t.Run(target, func(t *testing.T) {
			t.Parallel()
			initial := request(handler, http.MethodGet, target)
			etag := initial.Header().Get("ETag")
			initial.Header().Set("Cross-Origin-Resource-Policy", "same-origin")
			hitCache := "no-cache"
			if strings.HasPrefix(target, "/assets/") {
				hitCache = immutable
			}
			for _, tc := range []struct {
				name, method string
				headers      map[string]string
				status       int
				cache        string
			}{
				{"get", http.MethodGet, nil, 200, hitCache},
				{"head", http.MethodHead, nil, 200, hitCache},
				{"not-modified", http.MethodGet, map[string]string{"If-None-Match": etag}, 304, hitCache},
				{"different-tag", http.MethodGet, map[string]string{"If-None-Match": "\"other\""}, 200, hitCache},
				{"range", http.MethodGet, map[string]string{"Range": "bytes=0-3"}, 206, hitCache},
				{"precondition", http.MethodGet, map[string]string{"If-Match": "\"zzz\""}, 412, "no-cache"},
				{"invalid-range", http.MethodGet, map[string]string{"Range": "bytes=9999-"}, 416, "no-cache"},
				{"conditional-range", http.MethodGet, map[string]string{"If-None-Match": etag, "Range": "bytes=0-3"}, 304, hitCache},
			} {
				t.Run(tc.name, func(t *testing.T) {
					t.Parallel()
					req := httptest.NewRequestWithContext(context.Background(), tc.method, target, nil)
					for name, value := range tc.headers {
						req.Header.Set(name, value)
					}
					recorder := httptest.NewRecorder()
					recorder.Header().Set("Cache-Control", "no-store")
					recorder.Header().Set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
					recorder.Header().Set("Referrer-Policy", "middleware-referrer")
					recorder.Header().Set("Cross-Origin-Resource-Policy", "same-origin")
					handler.ServeHTTP(recorder, req)
					assertStatus(t, recorder, tc.status)
					assertHeader(t, recorder, "Cache-Control", tc.cache)
					for name, value := range policyHeaders() {
						assertHeader(t, recorder, name, value)
					}
					assertHeader(t, recorder, "Cross-Origin-Resource-Policy", "same-origin")
					if tc.status == 304 || tc.method == http.MethodHead {
						if recorder.Body.Len() != 0 {
							t.Error("expected empty body")
						}
					}
					if tc.status == 206 {
						if recorder.Header().Get("Content-Range") != "bytes 0-3/"+initial.Header().Get("Content-Length") {
							t.Error("incorrect Content-Range")
						}
						if recorder.Body.String() != initial.Body.String()[:4] {
							t.Error("incorrect range body")
						}
					}
					if tc.method == http.MethodHead && !reflect.DeepEqual(recorder.Header(), initial.Header()) {
						t.Errorf("HEAD headers = %v, GET headers = %v", recorder.Header(), initial.Header())
					}
				})
			}
		})
	}
	recorder := request(handler, http.MethodHead, "/assets/missing-abc.js")
	assertStatus(t, recorder, http.StatusNotFound)
	assertHeader(t, recorder, "Cache-Control", "no-store")
}

func TestEdgePolicyParity(t *testing.T) {
	t.Parallel()
	directory, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	var data []byte
	for {
		data, err = os.ReadFile(filepath.Join(directory, "deploy", "nginx", "security-headers.conf"))
		if err == nil {
			break
		}
		if !errors.Is(err, fs.ErrNotExist) {
			t.Fatal(err)
		}
		parent := filepath.Dir(directory)
		if parent == directory {
			t.Fatal("deploy/nginx/security-headers.conf not found")
		}
		directory = parent
	}
	pattern := regexp.MustCompile(`(?m)^add_header ([A-Za-z-]+) "([^"]*)" always;$`)
	edge := make(map[string]string)
	for _, match := range pattern.FindAllStringSubmatch(string(data), -1) {
		edge[match[1]] = match[2]
	}
	recorder := request(newHandler(testFiles()), http.MethodGet, "/")
	if len(edge) != 5 {
		t.Fatalf("found %d quoted edge headers, want 5", len(edge))
	}
	for name, value := range policyHeaders() {
		if edge[name] != value {
			t.Errorf("edge %s = %q, handler constant = %q", name, edge[name], value)
		}
		assertHeader(t, recorder, name, edge[name])
	}
}

func TestRouterComposition(t *testing.T) {
	t.Parallel()
	router := httpapi.NewRouter(httpapi.Deps{
		Calculator: calc.New(), Logger: slog.New(slog.DiscardHandler),
		Readiness: &httpapi.Readiness{}, Web: newHandler(testFiles()),
	})
	handler := httpx.Chain(router, httpx.RequestContext, httpx.SecureHeaders)
	for _, tc := range []struct {
		method, target string
		status         int
		cache          string
	}{
		{http.MethodGet, "/", 200, "no-cache"},
		{http.MethodGet, "/assets/app-abc.js", 200, immutable},
		{http.MethodGet, "/api/v1/operations", 200, "no-store"},
		{http.MethodGet, "/nope.js", 404, "no-store"},
		{http.MethodGet, "/healthz", 200, "no-store"},
		{http.MethodPost, "/", 405, "no-store"},
		{http.MethodGet, "/assets/", 404, "no-store"},
		{http.MethodGet, "/%2e%2e/index.html", 404, "no-store"},
		{http.MethodGet, "//x", 404, "no-store"},
	} {
		t.Run(tc.method+tc.target, func(t *testing.T) {
			t.Parallel()
			recorder := request(handler, tc.method, tc.target)
			assertStatus(t, recorder, tc.status)
			assertHeader(t, recorder, "Cache-Control", tc.cache)
			assertHeader(t, recorder, "Cross-Origin-Resource-Policy", "same-origin")
			if tc.cache != "no-store" {
				for name, value := range policyHeaders() {
					assertHeader(t, recorder, name, value)
				}
			} else {
				assertHeader(t, recorder, "Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
			}
			if tc.status == http.StatusNotFound {
				req := httptest.NewRequestWithContext(context.Background(), tc.method, tc.target, nil)
				assertNotFound(t, recorder, req.URL.Path)
			}
			if tc.status == http.StatusMethodNotAllowed {
				assertHeader(t, recorder, "Allow", "GET, HEAD")
			}
		})
	}
}

type (
	nonSeekingFS   struct{ fs.FS }
	nonSeekingFile struct{ fs.File }
)

func (f nonSeekingFS) ReadDir(name string) ([]fs.DirEntry, error) {
	return fs.ReadDir(f.FS, name)
}

func (f nonSeekingFS) Open(name string) (fs.File, error) {
	file, err := f.FS.Open(name)
	if err != nil {
		return nil, err
	}
	return nonSeekingFile{file}, nil
}

func TestNonSeekingFiles(t *testing.T) {
	t.Parallel()
	files := testFiles()
	handler := newHandler(nonSeekingFS{files})
	for _, target := range []string{"/index.html", "/assets/app-abc.js"} {
		t.Run(target, func(t *testing.T) {
			t.Parallel()
			actual := request(handler, http.MethodGet, target)
			expected := request(newHandler(files), http.MethodGet, target)
			assertStatus(t, actual, http.StatusOK)
			if actual.Body.String() != expected.Body.String() || !reflect.DeepEqual(actual.Header(), expected.Header()) {
				t.Errorf("non-seeking response differs: %v %q", actual.Header(), actual.Body.String())
			}
		})
	}
}

type (
	unreadableFS   struct{ fs.FS }
	unreadableFile struct{ fs.File }
)

func (f unreadableFS) Open(name string) (fs.File, error) {
	file, err := f.FS.Open(name)
	if err != nil {
		return nil, err
	}
	if name == "theme-init.js" {
		return unreadableFile{file}, nil
	}
	return file, nil
}

func (unreadableFile) Read(_ []byte) (int, error) { return 0, errors.New("read denied") }

func TestUnreadableFile(t *testing.T) {
	t.Parallel()
	handler := newHandler(unreadableFS{testFiles()})
	recorder := request(handler, http.MethodGet, "/theme-init.js")
	// A read failure is the service's INTERNAL_ERROR problem, with nothing of the
	// file's headers and no error text.
	assertStatus(t, recorder, http.StatusInternalServerError)
	assertHeader(t, recorder, "Content-Type", "application/problem+json")
	assertHeader(t, recorder, "Cache-Control", "no-store")
	if strings.Contains(recorder.Body.String(), "read denied") || recorder.Header().Get("ETag") != "" || recorder.Header().Get("Content-Security-Policy") != "" {
		t.Errorf("read failure leaked: %v %s", recorder.Header(), recorder.Body.String())
	}
	readable := request(handler, http.MethodGet, "/index.html")
	assertStatus(t, readable, http.StatusOK)
	if readable.Header().Get("ETag") == "" {
		t.Error("readable file lost ETag")
	}
}

func TestCacheWriter(t *testing.T) {
	t.Parallel()
	recorder := httptest.NewRecorder()
	writer := &cacheWriter{ResponseWriter: recorder, asset: true}
	if writer.Unwrap() != recorder {
		t.Fatal("Unwrap returned another writer")
	}
	if _, err := writer.Write([]byte("body")); err != nil {
		t.Fatal(err)
	}
	writer.WriteHeader(http.StatusPreconditionFailed)
	assertStatus(t, recorder, http.StatusOK)
	assertHeader(t, recorder, "Cache-Control", immutable)
}

func TestExplicitContentTypes(t *testing.T) {
	t.Parallel()
	for extension, want := range map[string]string{
		".html":        "text/html; charset=utf-8",
		".js":          "text/javascript; charset=utf-8",
		".mjs":         "text/javascript; charset=utf-8",
		".css":         "text/css; charset=utf-8",
		".txt":         "text/plain; charset=utf-8",
		".json":        "application/json",
		".map":         "application/json",
		".webmanifest": "application/manifest+json",
		".svg":         "image/svg+xml",
		".png":         "image/png",
		".jpg":         "image/jpeg",
		".jpeg":        "image/jpeg",
		".gif":         "image/gif",
		".webp":        "image/webp",
		".avif":        "image/avif",
		".ico":         "image/x-icon",
		".woff":        "font/woff",
		".woff2":       "font/woff2",
		".unknown":     "application/octet-stream",
		"":             "application/octet-stream",
	} {
		t.Run(extension, func(t *testing.T) {
			t.Parallel()
			for _, suffix := range []string{extension, strings.ToUpper(extension)} {
				name := "file" + suffix
				handler := newHandler(fstest.MapFS{name: &fstest.MapFile{Data: []byte("<html>no sniffing</html>")}})
				recorder := request(handler, http.MethodGet, "/"+name)
				assertStatus(t, recorder, http.StatusOK)
				assertHeader(t, recorder, "Content-Type", want)
			}
		})
	}
}

func TestNoCompressionAndNoModificationTime(t *testing.T) {
	t.Parallel()
	handler := newHandler(testFiles())
	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, "/assets/app-abc.js", nil)
	req.Header.Set("Accept-Encoding", "gzip, br")
	req.Header.Set("If-Modified-Since", "Mon, 02 Jan 2006 15:04:05 GMT")
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, req)
	assertStatus(t, recorder, http.StatusOK)
	if recorder.Header().Get("Content-Encoding") != "" || recorder.Header().Get("Last-Modified") != "" {
		t.Errorf("unexpected headers: %v", recorder.Header())
	}
}

func TestEncodedSlashIsAnAssetPath(t *testing.T) {
	t.Parallel()
	// %2F decodes to a path separator, as it does at the edge: the file is served
	// under the same rule as /assets/app-abc.js, never as a directory escape.
	recorder := request(newHandler(testFiles()), http.MethodGet, "/assets%2Fapp-abc.js")
	assertStatus(t, recorder, http.StatusOK)
	assertHeader(t, recorder, "Cache-Control", immutable)
}

func TestRealEmbeddedFilesSystem(t *testing.T) {
	t.Parallel()
	// embed.FS files are seekable and carry no modification time: the same
	// conditional, range and policy behavior as the in-memory file system.
	sub, err := fs.Sub(embeddedTestdata, "testdata")
	if err != nil {
		t.Fatal(err)
	}
	handler := newHandler(sub)
	for _, tc := range []struct{ target, cache string }{{"/", "no-cache"}, {"/assets/a-1.js", immutable}} {
		t.Run(tc.target, func(t *testing.T) {
			t.Parallel()
			full := request(handler, http.MethodGet, tc.target)
			assertStatus(t, full, http.StatusOK)
			assertHeader(t, full, "Cache-Control", tc.cache)
			etag := full.Header().Get("ETag")
			if etag == "" {
				t.Fatal("no ETag")
			}
			req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, tc.target, nil)
			req.Header.Set("If-None-Match", etag)
			recorder := httptest.NewRecorder()
			handler.ServeHTTP(recorder, req)
			assertStatus(t, recorder, http.StatusNotModified)
			assertHeader(t, recorder, "Cache-Control", tc.cache)
			req = httptest.NewRequestWithContext(context.Background(), http.MethodGet, tc.target, nil)
			req.Header.Set("Range", "bytes=0-3")
			recorder = httptest.NewRecorder()
			handler.ServeHTTP(recorder, req)
			assertStatus(t, recorder, http.StatusPartialContent)
			if recorder.Body.String() != full.Body.String()[:4] {
				t.Errorf("range body = %q", recorder.Body.String())
			}
			for name, value := range policyHeaders() {
				assertHeader(t, recorder, name, value)
			}
		})
	}
	// .gitkeep style files embedded with all: are still never served.
	assertNotFound(t, request(handler, http.MethodGet, "/.hidden"), "/.hidden")
}

// recordingFS records every name opened and counts open files, to prove that a
// request that cannot name a file never reaches the file system and that every
// opened file is closed.
type recordingFS struct {
	fs.FS
	mu     sync.Mutex
	opened []string
	open   int
}

type recordedFile struct {
	fs.File
	owner *recordingFS
}

func (r *recordingFS) Open(name string) (fs.File, error) {
	r.mu.Lock()
	r.opened = append(r.opened, name)
	r.mu.Unlock()
	file, err := r.FS.Open(name)
	if err != nil {
		return nil, err
	}
	r.mu.Lock()
	r.open++
	r.mu.Unlock()
	return recordedFile{File: file, owner: r}, nil
}

func (f recordedFile) Close() error {
	f.owner.mu.Lock()
	f.owner.open--
	f.owner.mu.Unlock()
	return f.File.Close()
}

func TestInvalidNamesNeverReachTheFileSystemAndFilesAreClosed(t *testing.T) {
	t.Parallel()
	files := &recordingFS{FS: testFiles()}
	handler := newHandler(files)
	files.mu.Lock()
	files.opened = nil // the construction walk opened every file once
	files.mu.Unlock()
	for _, target := range []string{"/a/../index.html", "/../index.html", "/bad%00.js", "/assets/", "/sub/", "/.secret", "/assets/.hidden/y.js"} {
		assertNotFound(t, request(handler, http.MethodGet, target), httptest.NewRequestWithContext(context.Background(), http.MethodGet, target, nil).URL.Path)
	}
	files.mu.Lock()
	opened := append([]string(nil), files.opened...)
	files.mu.Unlock()
	if len(opened) != 0 {
		t.Errorf("names that cannot be files reached the file system: %v", opened)
	}
	for _, target := range []string{"/index.html", "/assets/app-abc.js", "/assets", "/sub", "/missing.js"} {
		request(handler, http.MethodGet, target)
	}
	files.mu.Lock()
	defer files.mu.Unlock()
	if files.open != 0 {
		t.Errorf("%d files left open", files.open)
	}
}
