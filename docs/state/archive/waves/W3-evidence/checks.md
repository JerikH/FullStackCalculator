# Wave W3 integration — checks and durations (2026-10-22)

Integration branch `integrate/W3` from main at a532d3f; merges in plan order: RUN-M1-7 (e345dfd), RUN-M1-8 (69228cb). Every command ran under `timeout 600` (U22); the longest single command took 90 s.

| Check | Command | Result | Duration |
|---|---|---|---|
| T0 after RUN-M1-7 | `scripts/ci/t0.sh --base a532d3f` | pass (shell, dockerfiles, backend with the `embedui` pass) | 90 s |
| RUN-M1-7 targeted: tests and coverage | `go test -race -count=1 -cover ./internal/web/ ./internal/platform/httpx/ ./internal/httpapi/ ./internal/app/` | web 100.0 %, httpx 96.8 %, httpapi 99.0 %, app 98.0 % | 22 s |
| RUN-M1-7 targeted: embedui | `go test -race -count=1 -tags embedui ./internal/web/` | pass | 2 s |
| RUN-M1-7 targeted: vet and lint | `go vet ./... && go vet -tags embedui ./...`; `golangci-lint run ./...` and `--build-tags embedui ./internal/web/` | 0 issues | 1 s + 4 s |
| Frozen install (lease deps) | `pnpm -C frontend install --frozen-lockfile` | lockfile up to date | 3 s |
| T0 after RUN-M1-8 (whole wave diff) | `scripts/ci/t0.sh --base a532d3f` | pass (backend, frontend typecheck, lint, format, test) | 74 s |
| RUN-M1-8 targeted: hooks, screen, theme, app | `pnpm -C frontend exec vitest run src/features/calculator src/shared src/app` | pass | 33 s |
| RUN-M1-8 targeted: frontend gates | `pnpm -C frontend typecheck`, `lint`, `format:check`, `build` | pass | 5 s, 14 s, 3 s, 5 s |
| RUN-M1-8 targeted: design records | `contrast.py DESIGN.md --css tokens.css`; `check_design_records.py` | 0 failing pairs; 26 checks, 0 failures | < 1 s each |
| T2 | `scripts/ci/t2.sh --base a532d3f` (lease heavy) | pass: `t2.txt` | 78 s |
| Backend coverage, whole module | `go test -race -count=1 -coverpkg=./internal/... ./...` (lease heavy) | pass, 98.1 % of statements | 23 s |
| Frontend coverage, whole package | `pnpm -C frontend test:coverage` (lease heavy) | 33 files, 1,309 tests; 99.76 % statements, 100 % branches, 99.1 % functions, 100 % lines (thresholds 90/90/90/85) | 64 s |
| `impeccable detect` | files: `frontend/src/features/calculator/ui`, `shared/theme`, `app`, `shared/styles`, `index.html`; page: the web image behind the real service (Chromium 1248) | exit 0, nothing printed | < 1 s; 5 s |
| Embedded app: build | `pnpm -C frontend build`, copy `frontend/dist/` into `backend/internal/web/dist/`, `go build -tags embedui ./cmd/calculator` | 17.4 MB binary | 18 s |
| Embedded app: headers and caching | `embedded-headers.sh http://127.0.0.1:8081 <repo>` (service on the main ports 8081/9091) | 86 of 86: `embedded-headers-output.txt` | 3 s |
| Embedded app: browser | Playwright (RUN-M1-8 `policy.spec.ts`, Chromium desktop) against `http://127.0.0.1:8081`: System light, System dark, Light under a dark OS, Dark; theme attribute present when `<body>` appears, body background, CSP header, axe zero violations (initial and error), `0.1+0.2=` → 0.3, `1/0=` → error with Ref, zero CSP violations, clean console | 4 passed | 34 s |
| Embedded app: service log | `embed-service.log` of that run | 39 lines, 0 `ERROR` | — |
| Cleanup of the embedded copy | `find backend/internal/web/dist -mindepth 1 ! -name .gitkeep -delete`; server stopped by PID | `git status` clean; ports free | — |
| Merged API image | `docker build -f backend/Dockerfile -t calculator-api:w3-integration --build-arg VERSION=w3-integration --build-arg COMMIT=69228cb .` (lease heavy) | built | 10 s (warm) |
| Merged web (edge) image | `docker build -f frontend/Dockerfile -t calculator-web:w3-edge .` | built | 2 s (warm) |
| Hardened run | `image-smoke.sh calculator-api:w3-integration w3-integration 69228cb 4190` | 14 of 14 ok: `image-smoke-output.txt` | 10 s |
| Edge in front of the real service, host binary | `edge-real-service.sh calculator-web:w3-edge <merged binary> <scratch>` | 80 of 80, exit 0; `/readyz` 200 INFO ×2, draining 503 INFO ×2, zero `ERROR` lines | 12 s |
| Edge in front of the API image (hardened) | `edge-real-service-image.sh calculator-web:w3-edge calculator-api:w3-integration <scratch>` | 80 of 80, exit 0; same log levels, zero `ERROR` lines | 13 s |
| Recovered panic and draining 503 through the composed app | `go test -race -count=1 -v -run 'TestComposed\|Panic' ./internal/app/ ./internal/platform/httpx/` | `TestComposedPanicIsCorrelatedAndCounted` (ERROR, 500), `TestComposedDrainingReadinessIsLoggedAtInfo`, `TestComposedServerErrorStaysAtErrorLevel`, `TestPanicClearsAccessLevelOverride`: pass | 3 s |
| Shell and workflow lint | `shellcheck -x scripts/ci/*.sh docs/state/archive/waves/W3-evidence/*.sh`; `actionlint .github/workflows/ci.yml.disabled` | clean | 3 s |

The panic is not reachable over a socket in the real service (no route panics), so "a recovered panic still at ERROR" is proven through the composed handler chain (`compose`) in `TestComposedPanicIsCorrelatedAndCounted`, not in the edge script.
