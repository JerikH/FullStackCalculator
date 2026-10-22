# OPS — Repository, environments and delivery

### OPS-REPO-01 — Repository hygiene files and licence [BE] — M0 [topic: deployment-infra, ci-supply-chain]

- [x] **DONE 2026-10-22 (run RUN-M0-1, commit f2b9693; 🔎 findings: «Findings of OPS-REPO-01» (a)).** Built `.gitignore` (every RF-OPS-01 pattern), `.gitattributes`, `.editorconfig`, `.dockerignore` (repository root as the build context), the MIT `LICENSE` (2026, Jerik), `docs/adr/README.md` (MADR-lite index, empty table) and `docs/adr/0000-template.md`; `README.md` keeps its title. Verified: `git check-ignore -v` on 15 paths (bin, coverage, node_modules, docs/api/index.html, .env, .env.local, embedded dist, frontend dist, three Playwright report folders, tsbuildinfo, *.test, *.out, .DS_Store) and not-ignored `.env.example`, `backend/internal/web/dist/.gitkeep`; `git status` shows no workflow-package file; LICENSE body identical to the standard MIT text. Evidence in docs/state/archive/runs/RUN-M0-1/evidence/ops-repo-checks.txt.
  **Scope:** RF-OPS-01; the ADR scaffolding of RF-DOC-02 (`docs/adr/README.md` index with the MADR-lite format note and an empty table, `docs/adr/0000-template.md`). Creates `.gitignore`, `.gitattributes`, `.editorconfig`, `.dockerignore` and an MIT `LICENSE` (2026, Jerik). `README.md` keeps its title `# FullStackCalculator` (DOC-README-01 writes it).
  **UI:** none.
  **Verification:** `git check-ignore` proves each ignore rule (`bin/x`, `coverage/x`, `frontend/node_modules/x`, `docs/api/index.html`, `.env`, not `.env.example`, not `backend/internal/web/dist/.gitkeep`); `git status` shows no workflow package file; the licence text is the standard MIT text.
  **Review level:** single.
  **Needs from the owner:** nothing.

### OPS-ENV-01 — Per-agent isolated environment [BE] — M0 [topic: testing-environment, deployment-infra]

- [ ] Open.
  **Scope:** UC-OPS-01, RF-OPS-02. `scripts/ci/env.sh` (sourced after `eval "$(.workflow/bin/wf env --export)"`) exports `WEB_PORT`, `CALC_HTTP_ADDR`, `CALC_ADMIN_ADDR`, `VITE_PORT`, `API_PROXY_TARGET`, `E2E_BASE_URL`, `COMPOSE_PROJECT_NAME` and prepends `$HOME/.local/go/bin` and the repository `bin/` to `PATH`. Main checkout (`WF_INDEX=0` or no identity): 8080 / `:8081` / `:9091` / 5173 / `http://localhost:8081` / `http://127.0.0.1:8080` / `fullstackcalculator`. Worker n: web = `WF_PORT_BASE`, API = +1, admin = +2, Vite = +3, `COMPOSE_PROJECT_NAME=fullstackcalculator-<agent>` (lowercase, compose-safe). Writes the recipe in `docs/state/context/test-environment.md`. Later tasks consume these variables: UI-SCAF-01 (Vite port and proxy), OPS-STACK-01 (compose host port, project name, `dev-*` targets), OPS-E2E-01 (`E2E_BASE_URL`).
  **UI:** none.
  **Verification:** extensions E1, E2 and E6 of UC-OPS-01: env for main and for a simulated worker index produce disjoint ports and different project names; two `python3 -m http.server` (or `nc -l`) processes bound to each agent's ports run side by side; missing Go prints the install hint and exits non-zero; `bash -n` and shellcheck-style review.
  **Review level:** single.
  **Needs from the owner:** nothing.

### OPS-CI-01 — Local test tiers and the disabled GitHub workflow [BE] — M0 [topic: testing-environment, ci-supply-chain]

- [ ] Open.
  **Scope:** RF-OPS-03, RF-OPS-11 (initial definition), RNF-OPS-02. `scripts/ci/t0.sh [--base <ref>]`: changed files vs base → backend (if `backend/go.mod`): gofumpt/goimports check via golangci-lint, `go vet`, golangci-lint and `go test -race` of the touched packages; frontend (if `frontend/package.json`): `tsc --noEmit`, ESLint and Prettier on touched files, `vitest related`; contract changed: Redocly lint; Dockerfiles: hadolint; workflows: actionlint. Stages key on `backend/go.mod` and `frontend/package.json`; contract files are linted whether or not the Go module exists. `t1.sh <go packages | test files | make targets>`: exactly the named targeted tests. `t2.sh`: lint, tests with coverage, image builds, composed stack, E2E, all-in-one smoke (the integration tier, through the Makefile once it exists). `t3.sh`: the full CI-equivalent suite (never in a session). Each prints every command and its duration, stops on the first failure (`--keep-going` collects), reports absent packages as «not present» and an empty change set as «nothing to check». Installs golangci-lint v2 (latest stable) into the ignored `bin/` (U1). `.github/workflows/ci.yml.disabled` with the `contract` job (Redocly lint of `backend/api/openapi.yaml`, actionlint), actions pinned to full SHAs, `contents: read`, `persist-credentials: false`.
  **UI:** none.
  **Verification:** `t0.sh --base HEAD~1` on the contract commit runs Redocly only and prints durations; a deliberately broken YAML makes it exit non-zero; `actionlint .github/workflows/ci.yml.disabled` clean; `bin/golangci-lint version` reports v2; measured durations recorded in `context/test-environment.md`.
  **Review level:** single.
  **Needs from the owner:** nothing.
  - Registered follow-up (from API-CONTRACT-01): run Redocly as pnpm --package=@redocly/cli@<version> dlx redocly lint (pnpm dlx with the package name fails on its two binaries). 🔎 findings: «Findings of API-CONTRACT-01» (c)

### OPS-IMAGE-01 — Embedded web handler and the API image [BE] — M1 [topic: deployment-infra, security-privacy]

- [ ] Open.
  **Scope:** RF-OPS-05; the embedded handler of RF-OPS-07 (`internal/web`, completing the `noembed.go` created by OBS-RUNTIME-01: `Handler()` nil without the `embedui` tag; with it, static files from `embed.FS`, `/assets/` `public, max-age=31536000, immutable`, everything else `no-cache`, the browser policy of RNF-SEC-03; `internal/web/dist/.gitkeep` committed); `backend/Dockerfile` (repository root as context, distroless static nonroot, `VERSION`/`COMMIT` build args into the buildinfo ldflags, healthcheck `["/calculator","healthcheck"]`, `:8081` and `:9091`); RNF-SEC-04.
  **UI:** none.
  **Verification:** `go test -race ./internal/web/` with and without `-tags embedui` (fstest-based handler tests); hadolint clean; one image build (under the `heavy` lease) and a run read-only with `--cap-drop ALL --security-opt no-new-privileges` reaching `healthy`, `/healthz` returning the injected version/commit; image size recorded (expected < 20 MB).
  **Review level:** single.
  **Needs from the owner:** nothing.

### OPS-EDGE-01 — Web image and nginx edge [BE] — M1 [topic: edge-proxy, security-privacy, rate-limit]

- [ ] Open.
  **Scope:** RF-OPS-04, RNF-SEC-03, RNF-SEC-04 (web image), RNF-SEC-02 (edge-built JSON). Files: `frontend/Dockerfile`, `deploy/nginx/default.conf.template`, `deploy/nginx/security-headers.conf` (and `deploy/nginx/proxy-api.conf` if needed). Non-root, read-only-compatible (writable only `/tmp` and `/etc/nginx/conf.d`, `NGINX_ENVSUBST_FILTER=^API_UPSTREAM$`), healthcheck on `/nginx-health`; validated `X-Request-ID` map; `limit_req` 20 r/s burst 40 on API locations only; edge problems 429/503/413 built from constants and the validated ID; `proxy_intercept_errors` only for 502/503/504 on the API proxy; probes pass through untouched.
  **UI:** none.
  **Verification:** hadolint clean; image build (under the `heavy` lease) from the scaffolded app; container run read-only with tmpfs mounts and a stub upstream: `nginx -t` passes after rendering, `/nginx-health` 200, `/` and an asset return the specified cache and security headers (single values), `/api/x` with the upstream down returns the `SERVICE_UNAVAILABLE` problem with matching `X-Request-ID`, an invalid inbound ID is replaced, a body over 1 MiB returns the `PAYLOAD_TOO_LARGE` problem.
  **Review level:** double (new trust boundary: public edge, browser policy, rate limiting).
  **Needs from the owner:** nothing.
  - Registered follow-up (from API-CONTRACT-01): edge problems (429, 503, 413) carry detail and the validated requestId and validate against the Problem schema. 🔎 findings: «Findings of API-CONTRACT-01» (b)

### OPS-STACK-01 — Compose stack, all-in-one image and developer commands [BE] — M2 [topic: deployment-infra, testing-environment]

- [ ] Open.
  **Scope:** UC-OPS-02, UC-OPS-03, RF-OPS-06, RF-OPS-07, RF-OPS-08, RF-OPS-09, RF-OPS-14, RF-DOC-03 (`docs-api` target), RNF-QUAL-01, RNF-OPS-01, RNF-PERF-01 (bench budget gate). Files: `compose.yaml` (services `api` and `web` only; web host port `${WEB_PORT:-8080}`), root `Dockerfile`, `Makefile`, `.env.example`, `tools/versions.env`, `scripts/bootstrap.sh`, `scripts/coverage.sh`. Updates `scripts/ci/t1.sh`…`t3.sh` to call the Makefile targets.
  **UI:** none.
  **Verification:** `make help`; `docker compose config --quiet`; `make coverage` gates (measured totals recorded); `make bench` budget; `make fuzz`; `make image-aio` + `make run-aio` + a POST through `:8080`; hadolint on the root Dockerfile. The composed-stack runtime proof happens in OPS-E2E-01.
  **Review level:** single.
  **Needs from the owner:** nothing.

### OPS-E2E-01 — Playwright against the composed stack [FE] — M2 [topic: live-verification, ui-accessibility, testing-environment]

- [ ] Open.
  **Scope:** RF-OPS-10, RNF-A11Y-01, RNF-SEC-03 (browser assertions). Files: `frontend/playwright.config.ts`, `frontend/e2e/*.spec.ts` and helpers, `scripts/smoke-aio.sh` (curl). The one recorded local `make up` + `make e2e` run (both projects) and `make smoke-aio`.
  **UI:** verifies every screen state of UC-UI-01…04 in the real browser.
  **Verification:** `playwright test --list` discovers both projects; the recorded local run passes; `make smoke-aio` passes; results and durations in `docs/verification.md`.
  **Review level:** single.
  **Needs from the owner:** nothing.

### OPS-CI-02 — Complete CI definition and Dependabot [BE] — M2 [topic: ci-supply-chain, security-privacy]

- [ ] Open.
  **Scope:** RF-OPS-11, RF-OPS-12, RF-OPS-13, RNF-SEC-05, RNF-SEC-06. `.github/workflows/ci.yml.disabled` with jobs `contract`, `backend`, `frontend`, `e2e`, `images`, `publish`, uploading both coverage reports (totals in the job summary), the API reference, benchmark output, Playwright reports, container logs, scan reports and images; `.github/dependabot.yml` active (U3).
  **UI:** none.
  **Verification:** actionlint clean; every Make target and script the workflow calls exists and runs locally (dry-run or targeted run); YAML parses; action SHAs resolve to the commented versions; publish needs every other job and has the only `packages: write`.
  **Review level:** double (CI permissions and publication are a trust boundary).
  **Needs from the owner:** nothing (enabling is gate G1).
