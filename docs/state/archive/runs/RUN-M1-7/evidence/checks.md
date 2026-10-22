# Checks of RUN-M1-7 (2026-10-22)

All commands run in the worktree of RUN-M1-7 under the 10-minute limit; durations are wall-clock.

| Check | Result |
|---|---|
| `go test -race -count=1 -cover ./internal/web/ ./internal/platform/httpx/ ./internal/httpapi/ ./internal/app/` | all ok; web 100.0 %, httpx 96.8 % (was 96.6), httpapi 99.0 %, app 98.0 % |
| `go test -race -count=1 -cover -tags embedui ./internal/web/` | ok, 98.7 % (embed.go included) |
| `go vet ./...`, `go vet -tags embedui ./...` | clean |
| `golangci-lint run ./...`, `run --build-tags embedui ./internal/web/`, `fmt --diff ./...` | 0 issues, no diff |
| `go test -race -count=1 -coverpkg=./internal/... ./...` (`heavy` lease) | all ok, 20 s |
| `scripts/ci/t0.sh --base f97e19f` (shellcheck, hadolint, backend fmt/vet/lint/test, vet-embedui, lint-embedui, test-embedui) | all pass, 17.0 s (24.7 s on the first run) |
| hadolint `backend/Dockerfile` | clean, no ignores |
| API image build (`heavy`), base images pre-pulled | 53 s first build, 7 s warm rebuild after the Dockerfile review fixes (a build with `VERSION="1.0 beta"` proves the quoted `-X` values) |
| `evidence/image-smoke.sh` (hardened run) | 14 of 14 checks (`image-smoke.txt`), 9–10 s: healthy, `/healthz` with the injected version and commit, API-only (`GET /` NOT_FOUND problem), `/metrics` 404 on the API port, user 65532:65532, `ExposedPorts` only `8081/tcp`, `docker run -P` publishes only `8081/tcp`, read-only root, all capabilities dropped, no-new-privileges, healthcheck `["/calculator","healthcheck"]`, layers sum to 16.5 MB (binary 10.7 MB), compressed 5.3 MB; `docker images` shows 21.8 MB (containerd snapshot accounting) |
| Embedded binary with a hand-made `dist` (`embedded-smoke-headers.txt`) | `/`, `/index.html`, `/theme-init.js`, `/favicon.ico` `no-cache`; `/assets/x-abc.js` and its `.map` `immutable`; the five browser-policy headers once each; misses, `/assets/`, `/.gitkeep` the NOT_FOUND problem with `no-store`; `/api/v1/operations` and `/healthz` `no-store` with the API CSP; revalidation 304; `POST /` 405 `Allow: GET, HEAD`; zero `ERROR` lines; `dist` cleaned afterwards (`.gitkeep` only) |
| Live SIGTERM drain (`sigterm-live.txt`, `sigterm-service.log`) | built binary, `CALC_SHUTDOWN_DRAIN=4s`: 10 draining `/readyz` 503 access lines, all `INFO`; 0 `ERROR` lines; service exited cleanly |

## Mutations (each against its single package, `timeout 120`, restored by `cmp` against a backup)

OBS-LOG-01 (httpx, httpapi, app): level decided by route instead of the handler — caught (`TestAccessLevelOverride`; the first attempt was a silent no-op, see «Findings of OPS-IMAGE-01» (h)); truncation removed — caught; truncation by bytes (`s[:256]`) — caught; path logged from `EscapedPath()` — caught; user agent untruncated — caught; `Recover` keeps the override on a panic — caught (`TestPanicClearsAccessLevelOverride`); `Recover` clears only after the `ErrAbortHandler` re-panic — caught (`TestAbortClearsAccessLevelOverride`); readiness handler does not set the level — caught (`httpapi`, `app`).

OPS-IMAGE-01 (web): `Cache-Control` by prefix instead of status — caught; dotfile rule removed — caught; `.map` type removed — caught; `Add` instead of `Set` for the CSP — caught; CSP directive altered — caught (drift test against the edge file); miss answered by plain `http.NotFound` — caught; directories allowed — caught; ETag removed — caught; one policy header not set — caught; asset detection loosened to `Contains("assets")` — first survived, caught after `/assets-note.txt` and `/nested/assets/z.js` were added; file not closed — caught; `fs.ValidPath` guard removed — caught (the recording file system sees the name).

## Reviews

Spec (independent Claude subagent, 14 items), plan (11 items) and a code and security review of the web handler, Dockerfile and `lib.sh` change (6 minor items, none blocking): every item triaged in the «Review log» of `spec.md` and `plan.md` or applied in `c929706`.
