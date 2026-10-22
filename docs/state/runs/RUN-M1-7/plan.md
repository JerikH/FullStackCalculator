# RUN-M1-7 — plan (OPS-IMAGE-01, OBS-LOG-01)

Interfaces and rules only; decisions D1–D5 are in `spec.md`. Tiers are those of `.workflow/testing.md` (T0 = targeted package tests/vet/lint on every change, T1 = the live and image checks before closing). Every command under `timeout 600` (U22); mutations `timeout 120`.

## Slices and owners

| Slice | Executor | Owned files (disjoint) |
|---|---|---|
| S1 — embedded handler | Codex (`codex:codex-rescue --background`, `--model gpt-6.1-sol --effort medium`), one job | `backend/internal/web/web.go`, `embed.go`, `web_test.go`, `dist/.gitkeep` (`noembed.go` read-only unless a doc comment changes) |
| S2 — access-log level and bounds | Claude subagent, `model: "sonnet"`, `effort: "high"` | `backend/internal/platform/httpx/middleware.go`, `requestinfo.go`, `middleware_test.go`, `requestinfo_test.go`; `backend/internal/httpapi/health.go`, `health_test.go`; `backend/internal/app/app_test.go` |
| S3 — image and CI scripts | controller (small, config) | `backend/Dockerfile`, `scripts/ci/lib.sh` (`ci_stage_backend` only) |

Implementers never run git and never touch `.workflow/`; the controller commits, one commit per member (S1+S3 → OPS-IMAGE-01, S2 → OBS-LOG-01, plus run-folder records).

## S1 — `internal/web`

Signatures:

- `const contentSecurityPolicy string` (the edge string of `deploy/nginx/security-headers.conf`, one literal).
- `func newHandler(fsys fs.FS) http.Handler` — builds a path→ETag map by `fs.WalkDir` (a file that cannot be opened or read has no ETag; nothing else is skipped); returns the handler of spec D1.
- unexported: `contentTypes map[string]string` (the explicit extension table of D1.5; no `mime.TypeByExtension`), `cacheWriter` (wraps the `ResponseWriter` given to `http.ServeContent`; `WriteHeader(code)` and the implicit first `Write` set `Cache-Control` by final status; `Unwrap()`), `setPolicyHeaders(h http.Header)` (five RNF-SEC-03 headers, `Set`), `hidden(name string) bool` (a path segment starting with `.`), `lookup` helper returning the regular file or "not found".
- Misses call `httpx.NotFound(w, r)` and touch no other header (D1.2).
- `embed.go` (`//go:build embedui`): `const Enabled = true`; `//go:embed all:dist` `var dist embed.FS`; `Handler()` = `newHandler(fs.Sub(dist, "dist"))`. `noembed.go` unchanged.

Rules → tests (`web_test.go`, `t.Parallel()`, `fstest.MapFS`; T0):

1. `/` and `/index.html` → 200, `text/html; charset=utf-8`, `no-cache`, ETag.
2. Content types from the table (`.js`, `.map`, `.woff2`, `.ico`, `.css`, unknown → octet-stream, case-insensitive extension); `/assets/*` 200 → `immutable`, other 200 → `no-cache`.
3. Misses (missing file, missing asset, directory with and without slash, nested directory, dotfile at root and below `/assets/`, invalid path, NUL) → 404 NOT_FOUND problem, `no-store`, never `immutable`, app CSP not set by the handler.
4. No redirects, no listing.
5. Five policy headers, single-valued, on 200, 206, 304, 412, 416 and HEAD of existing files, replacing pre-set `no-store` and API CSP; CORP left untouched.
6. Drift against `deploy/nginx/security-headers.conf` (found by walking up; absent = failure).
7. `If-None-Match` → 304 (index `no-cache`, asset `immutable`); other ETag → 200.
8. `Range` → 206 (index `no-cache`, asset `immutable`).
9. HEAD parity with GET; HEAD miss → 404 `no-store`.
9b. `If-Match` mismatch → 412 `no-cache`; invalid range → 416 `no-cache` (asset and index); `If-None-Match`+`Range` on asset → 304 `immutable`.
9c. Composed chain (`httpapi.NewRouter` with `Web`, `RequestContext`, `SecureHeaders`): `/` single-valued headers and CORP kept; asset immutable; `/api/v1/operations` untouched (`no-store`, API CSP); miss and `/assets/` → problem; `/healthz` `no-store`; `POST /` 405 `Allow: GET, HEAD`; `/%2e%2e/index.html` and `//x` → 404 problem.
10. Non-seekable files served fully.
11. Unreadable file: no panic, no ETag for it.
`embed_test.go` (`embedui`): `Enabled`, `Handler()` non-nil, `/` and `/.gitkeep` → 404 problem on the committed `dist`. `noembed_test.go` (`!embedui`): `Enabled` false, `Handler()` nil.

T0 for S1: `go test -race ./internal/web/` with and without `-tags embedui`, `go vet` both ways, golangci-lint both ways on `./internal/web/`.

## S2 — OBS-LOG-01

Signatures:

- `httpx`: `func SetAccessLevel(ctx context.Context, level slog.Level)`; `RequestInfo` gains `level slog.Level` and `levelSet bool` (unexported); `func (i *RequestInfo) accessLevel() slog.Level` (override if set, else `error` when `StatusOrOK() >= 500`, else `info`); `func truncateChars(s string, limit int) string` (unexported; limit in characters; returns `s` itself when short); `const maxLoggedChars = 256`.
- `logAccess`: `level := info.accessLevel()` (the `info == nil` fallback `&RequestInfo{Route: "unmatched"}` keeps working); `path` = `truncateChars(r.URL.Path, maxLoggedChars)`, `user_agent` = `truncateChars(r.UserAgent(), maxLoggedChars)`.
- `recoverPanic`: first thing on any panic (`http.ErrAbortHandler` included), `info.levelSet = false` when `info != nil`.
- `httpapi.healthHandler.ready`: the draining branch calls `httpx.SetAccessLevel(r.Context(), slog.LevelInfo)` before `WriteJSON`; the `ready` and `live` branches never call it.

Rules → tests; T0 each (`go test -race ./internal/platform/httpx/ ./internal/httpapi/ ./internal/app/`):

httpx (`requestinfo_test.go`, `middleware_test.go`):
1. `SetAccessLevel` with a handler that sets `info` and answers 503 → access line `INFO`, status 503 (the draining case, in `httpx` terms).
2. Same handler without `SetAccessLevel` → `ERROR` (existing test kept).
3. A handler that sets `warn` and answers 200 → `WARN` (override works in both directions; documents that the handler owns the level).
4. `SetAccessLevel(context.Background(), …)` is a no-op; `AccessLog` without `RequestContext` records no status, so the line is `INFO` 200 `unmatched` as before (the override is ignored).
5. The level never depends on the path: the same 503 handler registered at `/readyz` and at `/other` logs `ERROR` at both when it does not set a level (kills a path-matching implementation).
6. Panic after `SetAccessLevel(info)` with `Recover` inside `AccessLog` → access line `ERROR` status 500 (override cleared); panic after the response started (`WriteHeader` then panic) with the level set → `ERROR`; `http.ErrAbortHandler` after the level and a 503 → `ERROR` (`TestAbortClearsAccessLevelOverride`).
7. `truncateChars` table: shorter, exactly 256, 257 (→ 256), 300 ASCII, empty, 255 ASCII + `é` + more (→ 256 chars, valid UTF-8, ends with `é`), 256 ASCII + `é` (→ the 256 ASCII only), 4-byte rune (`😀`) at the boundary (never split), 300 invalid bytes `\xff` (→ 256 bytes, no panic), a 16 KiB string (no per-byte allocation: `testing.AllocsPerRun` = 0 for a short string).
8. Access line through `AccessLog`: 300-character path (`/` + `a`×299) → `path` has 256 characters; 300-character `User-Agent` → 256; `route` still the pattern; a 5xx line and an info line both bounded; `remote_addr` kept verbatim (`203.0.113.9:4242`), `method` verbatim.
9. A multi-byte rune across the 256 boundary in a path (percent-encoded in the request target) and in the User-Agent → `utf8.ValidString` of the logged value and 256 runes.

httpapi (`health_test.go`): 
10. With `RequestContext` + `AccessLog` around `NewRouter` and a captured logger: `/readyz` while draining → `INFO`, status 503, body and `Cache-Control: no-store` unchanged; `/readyz` ready and `/healthz` → `INFO` 200; the existing assertions on bodies stay.
11. A draining `/readyz` through `NewRouter` without `RequestContext` (no `RequestInfo`) still answers 503 with the JSON body (the nil-safe `SetAccessLevel`).

app (`app_test.go`, composed with `compose`):
12. Draining readiness through `compose(NewRouter(...))`: `Readiness.Drain()` then `GET /readyz` → one access line `INFO` status 503 `route` `/readyz`, no `ERROR` line in the buffer.
13. Recovered panic through `compose` → access line `ERROR` status 500 (the existing composed test already asserts it; kept) and `panic recovered` `ERROR`.
14. A non-draining 5xx: a mux handler answering 503 without setting a level through `compose` → `ERROR`.
15. A 300-character path and a 300-character User-Agent through `compose(NewRouter)` (the path is a 404 problem route) → 256-character `path` and `user_agent` in the line, `route` `/` or the matched pattern, response 404 unchanged.
16. Real draining over a socket stays covered by `TestAppServesDrainsAndShutsDown`; extend its log assertion if it already captures logs (check first), else the live SIGTERM check in T1 covers it.

Coverage not below httpx 96.6 %, httpapi 99.0 %, app 98.0 % (`go test -race -cover` on the three packages).

## S3 — image and CI scripts

`backend/Dockerfile` exactly as D2 (stage `build`, unnamed runtime stage, base images by tag and digest, `USER 65532:65532`, `EXPOSE 8081` only, hadolint clean without ignores; no `# syntax` directive, the project's other Dockerfile has none and the cache mounts need only BuildKit).

`scripts/ci/lib.sh` `ci_stage_backend`, after `backend:vet`, `backend:lint` and `backend:test` as today (unchanged commands), add in this order (`$module` is the already parsed module path):
- `backend:vet-embedui`: `go vet -tags embedui "${lint[@]}"`;
- only when `full` or `$module/internal/web` ∈ `selected` (the web package is touched or depends on a touched one): `backend:lint-embedui`: `golangci-lint run --build-tags embedui ./internal/web/` and `backend:test-embedui`: `go test -race -tags embedui ./internal/web/`.
Nothing else in `lib.sh` changes; `shellcheck` and `scripts/ci/t0.sh --base HEAD~N` over the diff must stay green.

## Targeted checks that prove the run (T1)

1. Packages: `timeout 600 go test -race -cover ./internal/web/ ./internal/platform/httpx/ ./internal/httpapi/ ./internal/app/`; `… -tags embedui ./internal/web/`; whole module `go vet ./...`, `go vet -tags embedui ./...`, golangci-lint with and without the tag; coverage run `go test -race -coverpkg=./internal/... ./...` under the `heavy` lease.
2. Mutations: S1 (immutable on 404; dotfile rule removed; `http.FileServerFS` listing; `Add` for CSP; CSP constant edited) and S2 (path-based level; truncation removed; byte cut; `Recover` not clearing) each against its single package.
3. Embedded binary smoke with a hand-made `dist`, on the worker's ports (`curl -i`), then `dist` cleaned.
4. API image: hadolint, one `docker build` (background, `heavy` lease), hardened run (`--read-only --cap-drop ALL --security-opt no-new-privileges`) reaching `healthy`, `/healthz` with the injected version and commit, `GET /` the NOT_FOUND problem (API-only), size, `.Config.User` `65532:65532`, `.Config.ExposedPorts` only `8081/tcp`, `docker run -P` maps only 8081, admin port reachable only inside; container named `fullstackcalculator-run-m1-7-api` removed by name through a `trap`.
5. Live SIGTERM check of the access log: built binary, `CALC_SHUTDOWN_DRAIN=4s`, at least one draining 503 line, all `INFO`, zero `ERROR` lines.
6. `scripts/ci/t0.sh --base 2c7b4c1` (spec commit) over the code diff, shellcheck included.

## Not touched

`backend/api/openapi.yaml`, `backend/internal/httpapi/router.go` (the web mount stays as is; the handler replaces its headers), `backend/internal/app/app.go`, `backend/cmd/**`, `backend/internal/config/**`, `backend/go.mod`/`go.sum`, `deploy/nginx/**`, `frontend/**`, `.dockerignore`, `scripts/ci/t3.sh`, `.github/workflows/ci.yml.disabled`, every `docs/` record outside this run folder.

## Review log
Reviewer: an independent read-only Claude subagent (Sonnet 5.5, high), after S2 was implemented and S1 dispatched; 11 items.

| # | Item | Verdict | Action |
|---|---|---|---|
| 1 | `go run` does not forward SIGTERM; the check could pass with no drain | Confirmed (probe) | Built binary; the check requires at least one INFO draining 503 line (T1 item 5, spec) |
| 2 | `embed_test.go` assumed an empty `dist` | Confirmed | Test branches on `dist/index.html`; `/.gitkeep` always 404 |
| 3 | Read failure answered with plain-text 500; 412/416 bodies are ServeContent's own text | Confirmed | Read happens before any header and fails as the INTERNAL_ERROR problem (test); 412 empty body and 416 fixed plain text kept (no client input in them, `nosniff` set) and registered as a note |
| 4 | Plan mutations incomplete; weak assertions (ETag exact value, extension table, `/assets-x`, `Last-Modified`, miss headers) | Confirmed | Mutation list restored and extended (10 handler mutations run, 1 survivor killed with `/assets-note.txt` and `/nested/assets/z.js`); ETag is asserted exactly (`TestFiles`); table test over every extension in both cases; no `Last-Modified`/`Content-Encoding` test; misses assert no ETag and no app headers |
| 5 | Edge cases missing (`%2e%2e` direct, `/sub`, case, 64 KiB path, gzip, `%2F`) | Confirmed | Added to `TestMisses` and two new tests; `If-Range`/multi-range left to `http.ServeContent` (stdlib behaviour, status-decided cache policy covers every status it emits) |
| 6 | `cacheWriter` implicit-write branch unreachable through the handler | Accepted | Covered by `TestCacheWriter` directly; `ReaderFrom`/`Flusher` hiding irrelevant (nothing streams) |
| 7 | T1 image checks incomplete | Confirmed | Added: `ExposedPorts`, `docker run -P`, `.Config.User`, `GET /` Problem, size, trap cleanup by container name |
| 8 | S2 tests weaker than their mutations; rule 16 resolvable now | Confirmed | Multibyte test asserts exact strings (the `EscapedPath` mutation now fails); `TestAppServesDrainsAndShutsDown` asserts an INFO draining line over the socket and no ERROR line |
| 9 | Spec/plan naming drift, owned-files table | Confirmed | Spec names `truncateChars`/`maxLoggedChars`; `embed_test.go`, `noembed_test.go` are inside `backend/internal/web/**` |
| 10 | `ci_stage_backend` addition | Verified correct in `--full`, path-selected and unrelated-package modes | none |
| 11 | Ownership | Nothing outside the wave's table | none |

### Code and security review (after implementation)

An independent read-only subagent reviewed `web.go`, `embed.go`, the tests, `backend/Dockerfile` and the `lib.sh` change against a seven-point checklist (paths, headers by status, resource use, build tags, Dockerfile, test quality, style): no blocker or major; path attacks (`..`, `%2e`, `%252e`, `%2F`, NUL, overlong UTF-8, dotfiles, directories, 64 KiB path) all answered the NOT_FOUND problem, no duplicate or leaked header on any status, no shared mutable state, no range amplification. Six minor items, all triaged:

| # | Item | Verdict | Action |
|---|---|---|---|
| 1 | `VERSION`/`COMMIT` unquoted in `-ldflags` (a value with a space broke the link) | Confirmed | `-X '…=${VERSION}'` quoted; rebuilt with `VERSION="1.0 beta"` and smoke-tested |
| 2 | Swallowed walk errors without a reason | Confirmed | Comment added (a file without a validator is still served) |
| 3 | The read-failure path is unobservable and unreachable for `embed.FS` | Accepted | Comment says so |
| 4 | Test gaps: file close, `ValidPath` guard, real `embed.FS` path | Confirmed | Recording file system test (never opened for invalid names, every opened file closed); test over a real `embed.FS` (`testdata/`): 200, 304, 206, policy headers, dotfile 404; both mutations now caught |
| 5 | `web.Enabled` unused outside tests | Accepted | Kept: it is the documented switch of the package and is asserted against `Handler()` |
| 6 | Dockerfile hygiene | Partly applied | `ARG`s moved below `go mod download`, OCI `version` and `revision` labels added; no `# syntax` line (the project's other Dockerfile has none), `_test.go` files stay in the copied context |
