# RUN-M1-7 — spec (OPS-IMAGE-01, OBS-LOG-01)

Wave W3, worker index 1. Backend only. Scope: RF-OPS-05, the embedded handler of RF-OPS-07, RNF-SEC-03 (embedded copy), RNF-SEC-04 (API image) for OPS-IMAGE-01; RF-OBS-05 as amended by U19 and U20 for OBS-LOG-01. No contract, route, status, header or body of the service changes.

## What exists

- `backend/internal/web/noembed.go` (`//go:build !embedui`): `const Enabled = false`, `Handler()` returns nil. No `embed.go`, no `web.go`, no tests, no `dist/.gitkeep` (`.gitignore` already allows it).
- `httpapi.NewRouter(Deps)` mounts `Deps.Web` at `/` for GET and HEAD (`httpx.Methods`), after `/api`, `/api/`, `/healthz`, `/readyz`, `/api/v1/*`; it sets `Cache-Control: no-store` on every response before routing and answers non-canonical targets itself with the NOT_FOUND problem. `httpx.SecureHeaders` (outside the router) already set `nosniff`, `Referrer-Policy: no-referrer`, the API CSP `default-src 'none'; frame-ancestors 'none'` and `Cross-Origin-Resource-Policy: same-origin` before the handler runs. `app.New` passes `web.Handler()`.
- `httpx.AccessLog` → `logAccess`: level `error` for status ≥ 500 else `info`; fields `method`, `route`, `path` (`r.URL.Path`), `status`, `bytes`, `duration_ms`, `remote_addr`, `user_agent` untransformed. `httpx.RequestInfo{ID, Route, Status, Bytes}` is per-request state shared through the context (`httpx.Info(ctx)`, nil outside `RequestContext`). Graph: `logAccess` is reached only through `AccessLog` (`compose` in `app.go`) and its tests.
- `httpapi.healthHandler.ready` answers the draining 503 through `httpx.WriteJSON`.
- `deploy/nginx/security-headers.conf` is the edge copy of RNF-SEC-03; `deploy/nginx/default.conf.template` is the cache/404 behaviour the embedded handler mirrors (static files `no-cache`, `/assets/` immutable on hits only, missing file → 404, no HTML fallback, no directory listing).
- No `backend/Dockerfile`. `.dockerignore` already excludes `**/dist` except `backend/internal/web/dist/.gitkeep`, `docs`, `bin`, `.env*`. `scripts/ci/lib.sh` `ci_stage_dockerfiles` already runs hadolint over every `Dockerfile`; `ci_stage_backend` has no `embedui` pass.

## OPS-IMAGE-01 — what is missing and the decisions

### D1 — handler contract (`backend/internal/web`)

`newHandler(fsys fs.FS) http.Handler` (unexported, tested with `fstest.MapFS` and a non-seekable wrapper) and `Handler()` (with `embedui`: `fs.Sub(dist, "dist")`; without: nil, `noembed.go` unchanged except for the shared `Enabled` doc). Base shape: constant CSP string, `newHandler`, `embed.go`, `noembed.go`; the handler differs from the obvious `http.FileServerFS` serving in each of these points, each forced by a requirement or by a defect of that function:

1. **No directory listing, no redirects, no `index.html` redirect.** `http.FileServerFS` lists a directory without an `index.html` (`/assets/` would enumerate the bundle), redirects `/index.html` → `/` and `/dir` → `/dir/`. The edge answers none of these. The handler maps the request path itself: `/` → `index.html`; any other path → `strings.TrimPrefix(path, "/")`, which must satisfy `fs.ValidPath`; a directory, a missing file, an invalid path, or **any path segment starting with `.`** (so the committed `dist/.gitkeep`, or a stray dotfile, is never served) → 404. `/index.html` is served as a file (200, as nginx does).
2. **Misses are the service's NOT_FOUND problem.** Every 404 of item 1 is answered by `httpx.NotFound` (RF-API-05: every error response of the service, unmatched routes included, is a Problem), with the headers the router and `SecureHeaders` already set (`Cache-Control: no-store`, the API CSP); the handler adds nothing to a miss. A miss is never `immutable` (RF-OPS-04: a missing hashed file must not be cached for a year) and never cached at all. The edge answers a miss with nginx's own page; the embedded topology answers with the contract's Problem, which is the stricter reading of RF-API-05 and needs no new decision. Review item 2.
3. **Cache-Control by final status.** For an existing file the header is decided where the status is known: a small `ResponseWriter` wrapper around the one handed to `http.ServeContent` sets it in `WriteHeader(code)` (and on an implicit first `Write`): `public, max-age=31536000, immutable` only under `/assets/` with 200, 206 or 304; `no-cache` for everything else (`index.html`, `/theme-init.js`, root files, and any other status ServeContent emits: 412 on `If-Match`, 416 on a bad range). Verified: Go's `serveError` strips `Cache-Control` on 416 while a 412 keeps what was set before, so a prefix rule would send `immutable` with a 412 (review item 3). `.map` files under `/assets/` are immutable (U14).
4. **Headers set by the handler, all five of RNF-SEC-03** (`Content-Security-Policy` exactly the edge string, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, `Cross-Origin-Opener-Policy: same-origin`), with `Set` (never `Add`), so they replace the router's `no-store` and the API CSP and every header has one value whether or not `SecureHeaders` ran before. `Cross-Origin-Resource-Policy: same-origin` from `SecureHeaders` is left in place (RF-API-08 names only the CSP as replaced; same-origin is the stricter and harmless value for same-origin app files). The CSP constant is compared by test with `deploy/nginx/security-headers.conf` (parsed from `deploy/nginx/security-headers.conf`) so the two cannot drift. The drift test finds the file by walking up from its working directory (three levels above `backend/internal/web`) and fails if it is not found (review item 1). The five headers are set on existing files only; API responses of the all-in-one image carry the API header set (RF-API-08), so header assertions for RNF-SEC-03 target app files.
5. **Content-Type from a fully explicit table.** Not `mime.TypeByExtension`: it layers the host's `/etc/mime.types` over Go's builtin table, so results differ between a dev host and distroless, and the builtin table lacks `.map`, `.woff`, `.woff2`, `.webmanifest` and maps `.ico` to `image/vnd.microsoft.icon` (review item 4). Table (lowercase extension): `.html`, `.js`/`.mjs`, `.css`, `.txt` with `; charset=utf-8`; `.json`/`.map` `application/json`; `.webmanifest`; `.svg`; `.png`; `.jpg`/`.jpeg`; `.gif`; `.webp`; `.avif`; `.ico` `image/x-icon`; `.woff`; `.woff2`; anything else `application/octet-stream`. The handler sets the type itself so `http.ServeContent` never sniffs (with `nosniff` a sniffed type would be authoritative).
6. **Validators and ranges.** Each file gets a strong `ETag` (`"` + first 16 hex characters of its SHA-256 + `"`) computed once in `newHandler` from `fs.WalkDir`; `If-None-Match` therefore yields 304 for the `no-cache` files, as at the edge. Serving uses `http.ServeContent` (zero modtime: no `Last-Modified`), which provides `Range`, HEAD and conditional handling; a file that is not an `io.ReadSeeker` is read into memory first.
7. **Methods.** The router lets only GET and HEAD through; `newHandler` does not re-implement method handling and a doc comment says so.
8. **No compression.** The embedded handler does not gzip (the edge does). Registered as a note for the delivery docs; no scope change.
9. **A binary built with `embedui` and no built app** still starts: `/` answers the NOT_FOUND problem (`index.html` missing); `embed.go` keeps `//go:embed all:dist` (without `all:` a `dist` with only `.gitkeep` does not compile). It is not made a startup failure because `go vet`/`go test -tags embedui ./...` run with only `.gitkeep` in `dist`; the root `Dockerfile` of OPS-STACK-01 must assert `dist/index.html` exists before `go build -tags embedui` (as `frontend/Dockerfile` asserts its output). Registered as a finding targeted at OPS-STACK-01.

Files: `backend/internal/web/web.go`, `embed.go`, `noembed.go`, `web_test.go`, `dist/.gitkeep`.

### D2 — `backend/Dockerfile`

Repository root as context (`docker build -f backend/Dockerfile .`), two stages:

- Build: `golang:1.27.3-alpine3.24` by tag **and digest** (`sha256:b8c9b82a…`), `--platform=$BUILDPLATFORM`, `ARG TARGETOS TARGETARCH VERSION=dev COMMIT=unknown`, `ENV GOTOOLCHAIN=local` (the image's Go is the one `go.mod` names; no network toolchain download), `COPY backend/go.mod backend/go.sum ./` then `go mod download` in its own cached layer, `COPY backend/ ./`, `CGO_ENABLED=0 go build -trimpath -ldflags="-s -w -X github.com/JerikH/FullStackCalculator/backend/internal/buildinfo.Version=${VERSION} -X …Commit=${COMMIT}" -o /out/calculator ./cmd/calculator`. No `embedui` tag: the API image is API-only.
- Runtime: `gcr.io/distroless/static-debian13:nonroot` by tag and digest, `COPY --from=build /out/calculator /calculator`, `USER 65532:65532` (numeric, hadolint DL3066; the uid of distroless `nonroot`), `EXPOSE 8081` only, `HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 CMD ["/calculator","healthcheck"]`, `ENTRYPOINT ["/calculator"]`, OCI labels. No `CALC_*` environment is baked in: the service defaults (`:8081`, `:9091`) are the image's contract (RF-OPS-05) and the all-in-one image (OPS-STACK-01) sets `CALC_HTTP_ADDR=:8080` itself. The service listens on `:9091` too (RF-OPS-05) but the image does not `EXPOSE` it: `docker run -P` publishes every exposed port, and the admin port is never published (RNF-SEC-04; «Findings of OBS-RUNTIME-01» (e)); a comment in the Dockerfile says so (review item 10).
- No `GO_VERSION` build argument: the base is pinned by digest, and a moving argument would defeat the pin.

Files: `backend/Dockerfile`; `.dockerignore` needs no change (verified: it excludes only what the build does not copy; `backend/` copied whole contains `internal/web/dist/.gitkeep` only).

### D3 — CI scripts (`scripts/ci/lib.sh`, `ci_stage_backend` and `ci_stage_dockerfiles` only)

- `ci_stage_backend`: add the `embedui` pass the wave plan names: `go vet -tags embedui <lint packages>`, and, when the web package is among the selected packages (or in `--full`), `golangci-lint run --build-tags embedui ./internal/web/` and `go test -race -tags embedui ./internal/web/`. The tests of other packages are not repeated with the tag (with an empty `dist` the router's `/` route is the web handler, which would change what their NOT_FOUND tests see by design).
- `ci_stage_dockerfiles`: no change expected (`backend/Dockerfile` already matches `ci_is_dockerfile`); only checked.
- `scripts/ci/t3.sh` `images` job and `.github/workflows/ci.yml.disabled`: the `images` job does not exist in the workflow yet (only `contract` job today; the six jobs come in OPS-CI-02). Left unchanged and recorded in closure (OPS-CI-02 adds `docker build -f backend/Dockerfile`).

### Verification (OPS-IMAGE-01)

- `go test -race ./internal/web/` with and without `-tags embedui`; `go vet` and `go vet -tags embedui ./...`; golangci-lint (with and without the tag on `./internal/web/`).
- hadolint clean on `backend/Dockerfile`.
- One image build under the `heavy` lease with `VERSION`/`COMMIT` args, duration recorded; size recorded (< 20 MB).
- Hardened run: `--read-only --cap-drop ALL --security-opt no-new-privileges`, reaches `healthy`, `/healthz` returns the injected version and commit, `/api/v1/operations` works, admin port not published; `docker inspect` shows `User` nonroot; container removed by name.
- Embedded binary check (no frontend build): `go build -tags embedui` with a hand-made `dist/` (`index.html`, `theme-init.js`, `assets/x-abc.js`, `assets/x-abc.js.map`) run on the worker's ports, `curl -i` for cache and policy headers on `/`, `/assets/…`, 404, `/api/v1/operations` (still `no-store` + API CSP), `/healthz`; the hand-made `dist` is deleted afterwards (ignored by git anyway).
- Mutations: `Cache-Control` decided by prefix instead of status (412/416); `mime.TypeByExtension` instead of the table; misses answered by plain `http.NotFound`; immutable for every `/assets/` response including 404; no `.` segment rule; directory listing allowed (use `http.FileServerFS`); `Add` instead of `Set` for the CSP; CSP constant altered by one directive.

## OBS-LOG-01 — what is missing and the decisions

### D4 — access-log level set by the handler (U19)

- `httpx.RequestInfo` gets an unexported `level` + `levelSet` and two small exported members: `func SetAccessLevel(ctx context.Context, level slog.Level)` (no-op outside `RequestContext`, i.e. when `Info(ctx)` is nil) and an unexported accessor used by `logAccess`. The zero value of `RequestInfo` still means «no override». `logAccess` picks: handler-set level when set; else `error` for status ≥ 500; else `info`. It never reads the path.
- `healthHandler.ready` calls `httpx.SetAccessLevel(r.Context(), slog.LevelInfo)` immediately before writing the draining 503, nowhere else. A 503 from anything else stays `error`.
- `Recover`: on any panic, `http.ErrAbortHandler` included, it clears any level a handler had set before anything else, so a handler that set `info` and then panicked or aborted is still logged at `error` (review item 6). (Defensive; the readiness handler cannot panic after setting it, but the override must never mask a panic.)
- Why not match `/readyz` in `AccessLog`: U19 and RF-OBS-05 — the level is set by the handler that answers, never by the path (a path match would also catch a `/readyz` 503 from any other cause).

### D5 — field bounds (U20)

- `path` and `user_agent` are truncated to their first 256 characters (runes). Implementation: `truncateChars(s string, limit int) string` (with `maxLoggedChars = 256`) in `middleware.go`: returns `s` unchanged when `utf8.RuneCountInString`-style counting (a loop that stops at the 257th rune, never counting the whole 16 KiB) shows it fits; otherwise `s[:i]` where `i` is the byte offset of the 257th rune. A cut therefore always falls on a rune boundary; invalid bytes count as one character each (what `range` yields), so a path made of invalid UTF-8 is still bounded to 256 characters. The bound is on characters, not on output bytes: the raw field is at most 1024 bytes (4-byte runes) and JSON escaping of control or invalid bytes can inflate the encoded value to about 6 bytes per character (review item 8).
- `remote_addr`, `method`, `route`, `status`, `bytes`, `duration_ms` unchanged (owner decision U20: `remote_addr` kept; `method` is bounded by the HTTP token grammar but not in length — registered as a finding, not changed here: «every other field unchanged»).
- No ellipsis or marker is appended: the field is exactly the first 256 characters.

Files: `backend/internal/platform/httpx/middleware.go`, `requestinfo.go`, `middleware_test.go`, `requestinfo_test.go`; `backend/internal/httpapi/health.go`, `health_test.go`; `backend/internal/app/app_test.go`.

### Verification (OBS-LOG-01)

- `go test -race -cover ./internal/platform/httpx/ ./internal/httpapi/ ./internal/app/` with coverage not below httpx 96.6 %, httpapi 99.0 %, app 98.0 %.
- Tests: see plan (rule by rule). Composed-app tests in `app_test.go`: draining `/readyz` 503 → access line at `INFO`; a recovered panic 500 → `ERROR` (the existing `TestComposedPanicIsCorrelatedAndCounted` extended or a sibling); a non-draining 5xx → `ERROR`; 300-character path and User-Agent through the composed app → 256 characters.
- Mutations (one package each, `timeout 120`, restored with `git checkout --`): level rule by path (`r.URL.Path == "/readyz"` instead of the handler's level), truncation removed, truncation by bytes (`s[:256]`) instead of runes, `Recover` not clearing the override.
- Live: a built binary (`go build -o <scratch>/calc ./cmd/calculator`; `go run` does not forward SIGTERM to the service) on the worker's ports with `CALC_SHUTDOWN_DRAIN=4s`, poll `/readyz` while sending SIGTERM to its PID: at least one draining 503 access line, all of them `INFO`, no `ERROR` line in the whole log (`timeout 60`).

## Interactions with the other member and the integrator

- RUN-M1-8: no HTTP response changes (log lines only); no contract message needed. Its built `frontend/dist` layout (`index.html`, `theme-init.js`, `assets/*` with maps) is what D1 serves.
- Integrator: after both merges, embeds the built app (see the wave plan risk list). The header set of D1 item 4 and `deploy/nginx/security-headers.conf` are compared by a test, not only by eye.

## Review log
Reviewer: an independent read-only Claude subagent (Sonnet 5.5, high); 14 items, triaged against the code and a Go probe.

| # | Item | Verdict | Action |
|---|---|---|---|
| 1 | Drift test path had four `..` | Confirmed (three levels from `backend/internal/web`) | Walk up from the working directory; fails if absent |
| 2 | Plain-text 404 contradicts RF-API-05 once the web handler is the catch-all | Confirmed | Misses answered by `httpx.NotFound` (D1.2); `POST /nope` becoming 405 with `Allow: GET, HEAD` is the router's existing behaviour with a mounted handler: finding (note) |
| 3 | `immutable` leaks on 412; 416 strips it | Confirmed (Go probe) | Decide `Cache-Control` at `WriteHeader` by status; tests 412/416/304 |
| 4 | `mime.TypeByExtension` depends on the host | Confirmed | Fully explicit table |
| 5 | Edge parity claim too strong (directory 403 vs 404 at nginx, `%2e%2e`, `//`) | Accepted, benign (all fail safe) | Claim reworded: differences are benign; not asserted as identical |
| 6 | `ErrAbortHandler` re-panics before the override is cleared | Confirmed | Clear first; test `TestAbortClearsAccessLevelOverride`, mutation caught |
| 7 | An exported setter can lower any 5xx | Rejected: the only 500 path is `WriteJSON`'s marshal fallback for a struct of three strings (`respond.go`, documented unreachable); the handler owning its level is the owner's rule (U19) | Recorded as note |
| 8 | Byte-bound claim ignores JSON escaping | Confirmed | Reworded to characters |
| 9 | `USER` name vs numeric | Confirmed | Numeric in spec and Dockerfile |
| 10 | `EXPOSE 9091` and `docker run -P` vs RNF-SEC-04 | Accepted | `EXPOSE 8081` only, comment; RF-OPS-05 «listen on» is met by the service |
| 11 | `embedui` build with an empty `dist` starts silently | Accepted as designed (D1.9) | Finding targeted at OPS-STACK-01 (assert `dist/index.html` before `go build -tags embedui`); `all:dist` stated |
| 12 | `newHandler` error handling unspecified | Confirmed | Stated in D1.9 and in the Codex dispatch |
| 13 | `lib.sh` `$module` only set in non-full mode | Correct, short-circuited by `full` | Comment added |
| 14 | No composed-chain test; mutations missing | Confirmed | Composed test with the real router and `SecureHeaders` in `web_test.go`; mutations added |
