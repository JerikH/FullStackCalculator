# Closure of RUN-M1-7 — 2026-10-22

Written by the agent that executed the run; applied to the shared state by the closer (solo session or integrator), exactly as written. Every item names its target file.

## Commits
| Member | Commit(s) on wf/RUN-M1-7 | Summary |
|---|---|---|
| OBS-LOG-01 | 5f3a088 | Draining readiness 503 logged at `info` through the request info; `path` and `user_agent` cut to 256 characters; `Recover` clears a handler's level on any panic or abort |
| OPS-IMAGE-01 | c929706 | `internal/web` handler (`newHandler`, `embed.go`, `noembed.go`, `dist/.gitkeep`), `backend/Dockerfile`, the `embedui` pass in `ci_stage_backend` |
| records | f97e19f (spec and plan), the final `docs(state)` commit of this branch | spec, plan with their review logs, findings, closure, evidence |

## Per member

### OBS-LOG-01
- **current.md:** check `OBS-LOG-01`; 🔎 findings: «Findings of OBS-LOG-01» (a), (b), (c).
- **tasks/OBS.md — DONE paragraph** (replaces «Open.»):
  `- [x] **DONE 2026-10-22 (run RUN-M1-7, commit 5f3a088; 🔎 findings: «Findings of OBS-LOG-01» (a)–(c)).** The readiness handler sets the level of its own draining 503 through the request info (`httpx.SetAccessLevel`, a no-op outside `RequestContext`) and `AccessLog` uses it instead of the 5xx rule without ever reading the path; every other 5xx stays `error`, and `Recover` clears a level set before a panic or an `http.ErrAbortHandler` so the failure is still `error`. `path` and `user_agent` are truncated to their first 256 characters (runes, never inside a UTF-8 sequence, no marker); `remote_addr`, `method` and every other field are unchanged. Verified: `go test -race -cover` httpx 96.8 % (was 96.6), httpapi 99.0 %, app 98.0 %; tests per rule through `httpx`, the router and the composed `compose` chain (draining 503 `INFO` with no `ERROR` line, recovered panic and non-draining 503 `ERROR`, 300-character path and User-Agent → 256, a multi-byte character across the boundary kept whole); 8 mutations caught (level by route, truncation removed, byte cut, `EscapedPath`, user agent untruncated, `Recover` not clearing, clearing after the abort re-panic, handler not setting the level); live: a built binary with `CALC_SHUTDOWN_DRAIN=4s` and SIGTERM logged ten draining `/readyz` 503 lines, all `INFO`, and no `ERROR` line in the run. Evidence in docs/state/archive/runs/RUN-M1-7/evidence/ (`sigterm-live.txt`, `checks.md`).`
- **traceability.md row(s):** `| RF-OBS-05 | ✅ | 5f3a088 (merge <integration commit>) | Targeted tests: TestAccessLevelOverride, TestPanicClearsAccessLevelOverride, TestAbortClearsAccessLevelOverride, TestTruncateChars, TestAccessLog*, TestReadinessAccessLogLevels, TestComposedDrainingReadinessIsLoggedAtInfo, TestAppServesDrainsAndShutsDown; Live (2026-10-22, SIGTERM drain with a built binary: 10 INFO draining lines, 0 ERROR) | Amended by U19 and U20, both built; `method` is still unbounded («Findings of OBS-LOG-01» (b), OBS-backlog) |` (replaces the existing RF-OBS-05 row; UC-OBS-01 row: add this evidence)
- **context/OBS.md additions:** under «Architecture as built»: `httpx.RequestInfo` carries an optional access level (`SetAccessLevel`); the handler that answers owns the level of its access line, never the path; `Recover` clears it on any panic; `path` and `user_agent` are bounded to 256 characters in `logAccess` (`truncateChars`).
- **context/test-environment.md additions:** a drain check must signal a built binary, not `go run` (it does not forward SIGTERM) and must require at least one draining line, otherwise «no ERROR line» holds trivially («Findings of OPS-IMAGE-01» (g)).
- **methodology.md:** none.
- **Spec changes:** none (RF-OBS-05 was amended at U19, U20 on 2026-10-22).

### OPS-IMAGE-01
- **current.md:** check `OPS-IMAGE-01`; 🔎 findings: «Findings of OPS-IMAGE-01» (a)–(h).
- **tasks/OPS.md — DONE paragraph** (replaces «Open.»):
  `- [x] **DONE 2026-10-22 (run RUN-M1-7, commits c929706; 🔎 findings: «Findings of OPS-IMAGE-01» (a)–(h)).** Built the embedded web handler (backend/internal/web: newHandler over an fs.FS, embed.go with //go:embed all:dist under the embedui tag, noembed.go returning nil, dist/.gitkeep): `/` is index.html; a directory, a missing file, a dotfile or an invalid path is the NOT_FOUND problem (RF-API-05) with no listing, redirect or HTML fallback; for existing files the five RNF-SEC-03 headers replace the router's no-store and the API CSP (one value each, a test compares them with deploy/nginx/security-headers.conf), Cache-Control is decided by the final status (immutable only for 200/206/304 under /assets/, no-cache otherwise, 412 and 416 included), content types come from an explicit table, each file has a strong ETag, ServeContent gives HEAD, Range and 304. Built backend/Dockerfile (golang 1.27.3 alpine 3.24 and distroless static debian13 nonroot by tag and digest, GOTOOLCHAIN=local, -trimpath, VERSION/COMMIT into the buildinfo ldflags quoted, API-only, USER 65532:65532, EXPOSE 8081 only, healthcheck ["/calculator","healthcheck"]) and the embedui pass of ci_stage_backend (vet, lint and test of internal/web under the tag). Verified: go test -race -cover internal/web 100.0 % (98.7 % with -tags embedui), 12 mutations caught, vet, golangci-lint and hadolint clean, t0.sh 17 s; image build 53 s cold and 7 s warm; hardened run (read-only, --cap-drop ALL, no-new-privileges) 14 of 14 checks: healthy, /healthz with the injected version and commit (also a version with a space), API-only, only 8081/tcp exposed and published by docker run -P, layers 16.5 MB (compressed 5.3 MB; docker images shows 21.8 MB under the containerd store); an embedui binary with a hand-made dist checked with curl on every response class and zero ERROR lines. Spec, plan and an independent code review. Evidence in docs/state/archive/runs/RUN-M1-7/evidence/.`
- **traceability.md row(s):**
  - `| RF-OPS-05 | ✅ | c929706 (merge <integration commit>) | Targeted tests: image-smoke.sh 14 of 14 on the built image (2026-10-22): hardened run healthy, injected version and commit, :8081 served, healthcheck, user 65532:65532, only 8081/tcp exposed, layers 16.5 MB | The CI image build is OPS-CI-02 («Findings of OPS-IMAGE-01» (f)) |`
  - `| UC-OPS-03 / RF-OPS-07 | 🟡 | c929706 (merge <integration commit>) | Targeted tests: web_test.go (100 %), embedded binary with a hand-made dist checked with curl (2026-10-22) | Handler done; the root Dockerfile, `-tags embedui` image and `smoke-aio.sh` are OPS-STACK-01 and OPS-E2E-01 («Findings of OPS-IMAGE-01» (c), (d)) |` (replaces the ⬜ row)
  - RNF-SEC-03 row: append «embedded handler done (OPS-IMAGE-01: the five headers, drift test against the edge file); E2E by OPS-E2E-01» and drop «embedded handler by OPS-IMAGE-01».
  - RNF-SEC-04 row: append «API image done (OPS-IMAGE-01: read-only, cap-drop ALL, no-new-privileges, uid 65532, healthy, only 8081 exposed and published by -P)».
  - RF-API-05 row: append «the embedded handler answers a missing app file with the NOT_FOUND problem (OPS-IMAGE-01)».
- **context/OPS.md additions:** «Architecture as built»: `backend/internal/web` (RUN-M1-7): `newHandler(fs.FS)` + `embed.go`/`noembed.go`, rules as built in «Findings of OPS-IMAGE-01» (a); `backend/Dockerfile` (rules as built in (b)); `scripts/ci/lib.sh` `ci_stage_backend` runs `go vet -tags embedui` and, when `internal/web` is selected, lint and tests of that package with the tag. Remove «`backend/Dockerfile`» from the planned list. Invariants: the five RNF-SEC-03 headers are asserted equal to `deploy/nginx/security-headers.conf` by `web_test.go` — a change to one file changes the other; the API image never `EXPOSE`s `:9091`.
- **context/test-environment.md additions:** image check recipe: `source scripts/ci/env.sh` first (`wf env --export` does not set `COMPOSE_PROJECT_NAME`), `timeout 600 docker build -f backend/Dockerfile -t calculator-api:$COMPOSE_PROJECT_NAME --build-arg VERSION=… --build-arg COMMIT=… .` under `heavy` (base images pulled once: 53 s, warm 7 s), then `docs/state/archive/runs/RUN-M1-7/evidence/image-smoke.sh <image> <version> <commit> <port>` (9–10 s; container removed by name); mutation helpers must assert the pattern was found («Findings of OPS-IMAGE-01» (h)).
- **methodology.md:** none (OPS epic closes with its M2 tasks).
- **Spec changes:** none.

## Registered follow-ups for other tasks
- `tasks/OPS.md` → entry `OPS-STACK-01`: `- Registered follow-up (from OPS-IMAGE-01): the root Dockerfile asserts dist/index.html and dist/theme-init.js exist after copying the built app into backend/internal/web/dist/ and before go build -tags embedui, and never removes dist/.gitkeep from the checkout. 🔎 findings: «Findings of OPS-IMAGE-01» (c)`
- `tasks/OPS.md` → entry `OPS-CI-02`: `- Registered follow-up (from OPS-IMAGE-01): the images job builds backend/Dockerfile from the repository root with VERSION and COMMIT build args and runs image-smoke.sh (hardened run, injected version and commit, API-only, only 8081/tcp exposed, user 65532:65532, layers under 20 MB). 🔎 findings: «Findings of OPS-IMAGE-01» (f)`
- `tasks/OPS.md` → entry `OPS-E2E-01`: `- Registered follow-up (from OPS-IMAGE-01): in the all-in-one image a missing app file is the NOT_FOUND problem, any other method on an unknown path is 405 with Allow: GET, HEAD, and API responses carry the API header set without Permissions-Policy and COOP; smoke-aio.sh and the header assertions expect exactly this. 🔎 findings: «Findings of OPS-IMAGE-01» (d)`
- `tasks/DOC.md` → entry `DOC-README-01`: `- Registered follow-up (from OPS-IMAGE-01): the README trade-offs mention that the all-in-one image serves the bundle uncompressed (the edge gzips) and publishes the image size as layers 16.5 MB (compressed 5.3 MB). 🔎 findings: «Findings of OPS-IMAGE-01» (b), (e)`
- Findings of OBS-LOG-01 (b) is open debt on `OBS-backlog` (unbounded `method` field); ask the owner at the next milestone transition.

## Needs from other tasks (blockers discovered)
none

## Targeted checks (the integrator re-runs these after merging)
```
cd backend
timeout 600 go test -race -count=1 -cover ./internal/web/ ./internal/platform/httpx/ ./internal/httpapi/ ./internal/app/
timeout 600 go test -race -count=1 -tags embedui ./internal/web/
go vet ./... && go vet -tags embedui ./...
../bin/golangci-lint run ./... && ../bin/golangci-lint run --build-tags embedui ./internal/web/
timeout 600 scripts/ci/t0.sh --base <pre-merge main>
# image (heavy lease): source scripts/ci/env.sh; timeout 600 docker build -f backend/Dockerfile -t calculator-api:$COMPOSE_PROJECT_NAME --build-arg VERSION=<v> --build-arg COMMIT=<sha> . ;
# timeout 240 docs/state/archive/runs/RUN-M1-7/evidence/image-smoke.sh calculator-api:$COMPOSE_PROJECT_NAME <v> <sha> $WEB_PORT
# embedded app after RUN-M1-8 merges (wave plan «Risks for the integrator»): pnpm -C frontend build, copy frontend/dist/ into backend/internal/web/dist/, go build -tags embedui ./cmd/calculator, run on the main ports, curl -i / and /assets/*, then delete the copied files (keep .gitkeep)
```

## Tests and CI changes
- New suites: `backend/internal/web` (`web_test.go`, `embed_test.go` under `embedui`, `noembed_test.go`, `testdata/` for a real `embed.FS`); new tests in `httpx`, `httpapi` and `app`.
- `scripts/ci/lib.sh` `ci_stage_backend`: `backend:vet-embedui`, and `backend:lint-embedui` and `backend:test-embedui` when `internal/web` is selected or in `--full`. `ci_stage_dockerfiles` unchanged (hadolint already covers `backend/Dockerfile`).
- `.github/workflows/ci.yml.disabled` and `scripts/ci/t3.sh` unchanged: the workflow has only the `contract` job today; the API image build joins the `images` job in OPS-CI-02 (registered above).

## Notes for the integrator
- Contracts: no HTTP status, header or body of the API changed (log lines only for OBS-LOG-01); the embedded handler's output is the contract «Embedded web handler» of the wave plan. No message to RUN-M1-8 was needed.
- `scripts/ci/lib.sh` is also touched by RUN-M1-8 (`ci_stage_frontend`): the two edits are in disjoint functions (this run changed only the last lines of `ci_stage_backend`); `wf conflicts --wave W3` reports the file as planned overlap.
- The embedded handler serves whatever `frontend/dist` holds: root files `no-cache`, `/assets/*` immutable; a root-level file RUN-M1-8 adds to `frontend/public/` is served `no-cache` with no change here. A dotfile in `dist` is never served.
- The Codex job (S1, `gpt-6.1-sol`, medium) wrote `web.go`, `embed.go` and the first tests; the controller reviewed and extended them (100 % coverage, mutation checks, status-decided cache policy and misses as problems came from the reviews, not from the dispatch). OBS-LOG-01 was implemented by a Claude Sonnet 5.5 subagent and reviewed and extended by the controller.
- `docker images` shows 21.8 MB for the API image under the containerd store; layers sum to 16.5 MB and the compressed content is 5.3 MB. RF-OPS-05's «under 20 MB» is met by the layer sum; if the owner reads the `docker images` figure, say so at integration.
- One evidence image (`calculator-api:fullstackcalculator-run-m1-7`) remains in the local Docker store; remove it with `docker rmi calculator-api:fullstackcalculator-run-m1-7` when the wave is cleaned up.
