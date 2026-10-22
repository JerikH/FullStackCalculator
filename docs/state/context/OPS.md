# Permanent context — OPS (Repository, environments and delivery)

Created 2026-10-22 by the bootstrap. Read at the start of any task of this epic.

## What this epic covers
RF-OPS-01…RF-OPS-14; UC-OPS-01…UC-OPS-03. Hygiene files, per-agent environment, local tiers, images, compose, Makefile, E2E, CI and Dependabot. The application code belongs to CALC/API/OBS/UI.

## Architecture as built
- Hygiene files at the root (RUN-M0-1): `.gitignore` (every RF-OPS-01 pattern), `.gitattributes`, `.editorconfig`, `.dockerignore`, `LICENSE` (MIT); ADR index and template in `docs/adr/`.
- Per-agent environment and local tiers (RUN-M0-2): `scripts/ci/env.sh` (sourced; ports, compose project and PATH from the agent identity), `scripts/ci/lib.sh` + `t0.sh`…`t3.sh` (tiers; each CI job calls `t3.sh --job <name>`), `scripts/ci/install-tools.sh` + `tools/versions.env` (golangci-lint, actionlint, hadolint, shellcheck pinned with per-platform SHA-256, installed in `bin/.tools/<tool>-<version>/` and linked as `bin/<tool>`; Redocly CLI version), `.github/workflows/ci.yml.disabled` (contract job).
- Web image and nginx edge (RUN-M1-6): frontend/Dockerfile (build stage Node 24.22.1 alpine3.24 since UI-DEPS-01, runtime nginx-unprivileged 1.30.6 alpine as uid 101 on :8080, docroot /usr/share/nginx/calculator, template /etc/nginx/templates/default.conf.template, snippets /etc/nginx/snippets/), deploy/nginx/default.conf.template (outer server :8080 and inner API hop 127.0.0.1:8079), security-headers.conf (edge-owned headers added and upstream copies hidden), proxy-api.conf (settings of every hop to the service). Rules as built: «Findings of OPS-EDGE-01» (a).
- Embedded web handler and API image (RUN-M1-7): `backend/internal/web` — `newHandler(fs.FS)` + `embed.go`/`noembed.go`, rules as built in «Findings of OPS-IMAGE-01» (a); `backend/Dockerfile` (rules as built in (b)); `scripts/ci/lib.sh` `ci_stage_backend` runs `go vet -tags embedui` and, when `internal/web` is selected, lint and tests of that package with the tag.
- Planned (M2): root `Dockerfile`, `compose.yaml`, `Makefile`, `.env.example`, `scripts/bootstrap.sh`, `scripts/coverage.sh` (OPS-STACK-01); `frontend/playwright.config.ts`, `frontend/e2e/`, `scripts/smoke-aio.sh`, `docs/verification.md` first version (OPS-E2E-01); the complete `.github/workflows/ci.yml.disabled`, `.github/dependabot.yml`, `scripts/ci/image-smoke.sh` (OPS-CI-02).

## Invariants every task inherits
- Every Docker build uses the repository root as context (RF-OPS-01); `.dockerignore` excludes `docs`, `bin`, coverage, the Playwright report folders, every `dist` except `backend/internal/web/dist/.gitkeep`, and `.env*`, so builds copy only the sources they need and produce `dist` inside their stages.
- The agent tooling of a working copy is excluded through `.git/info/exclude`; committed ignore files never name it (Findings of OPS-REPO-01 (a)).
- GitHub workflows stay `*.yml.disabled`; every change to `scripts/ci/` or a service updates the disabled workflow in the same commit and passes actionlint (RF-OPS-11, U3).
- Containers: non-root, read-only root, `cap_drop: ALL`, `no-new-privileges`; the admin port is never published (RNF-SEC-04).
- The tier scripts are the single source of truth for local and CI commands; no logic duplicated in YAML (RF-OPS-03). Every CI job calls `scripts/ci/t3.sh --job <name>`.
- Worker isolation is enforced by `env.sh` from the worktree's `.wf-agent`, never by the `wf` index alone; a worker port block starts at 1024 or above and never covers 8080, 8081, 9091 or 5173 (Findings of OPS-ENV-01 (a), (c)).
- Tier scripts call the pinned tools by their versioned path, never a copy found on `PATH`; a missing tool, a missing toolchain or any check failure is a `✘` row and a non-zero exit, never a skip; absent stages are reported «not present» only while their manifest (`backend/go.mod`, `frontend/package.json`) does not exist (Findings of OPS-CI-01 (a)).
- Redocly runs with `REDOCLY_TELEMETRY=off` (Findings of OPS-CI-01 (i)).
- The edge forwards the path nginx routed, never the raw request target; API problems, the service's 413 included, pass through: only the inner hop intercepts, and only 502/503/504 (Findings of OPS-EDGE-01 (a)).
- The five RNF-SEC-03 headers are asserted equal to `deploy/nginx/security-headers.conf` by `web_test.go` — a change to one file changes the other; the API image never `EXPOSE`s `:9091` (Findings of OPS-IMAGE-01 (a), (b)).
- A plain tmpfs over an image directory is root-owned with that directory's mode: an image that renders into a tmpfs mount makes the directory writable for its user (Findings of OPS-EDGE-01 (e)).

- The composed stack comes up once per delivery, in the recorded run of OPS-E2E-01, cut into pieces (images, `make up`, one `make e2e` per project, the disruptive specs last, `make down`); the default T2 never runs `make up` or `make e2e`, and `t2.sh` reports a problem while a Makefile exists and no integration targets are wired (OPS-STACK-01 wires them as stages selected by `--stage`; U27 amended RF-OPS-03's tier 2).
- Every M2 task names its local commands as pieces under `timeout 600` with the lease each takes and what is left to CI (U22); the full list of pieces and measured durations is in `test-environment.md`.
- The Trivy gate, the hosted run of the six jobs and the clean-clone build wait for gate G1.

## Decisions
- U1 — toolchain locations; U3 — Dependabot active, workflows disabled; U6 — shellcheck in the tiers, `tools/versions.env` from M0; G1 — remote, push and enabling are the owner's.
- U18 — the edge's 503 problem on the probes enters the contract (OPS-STACK-01); U21 — per-address connection limit of 20 on `/api/`, 16 KiB probe body limit, web `/tmp` capped at 64 MiB (OPS-STACK-01); U22 — 10-minute limit on every local command.

## Where to look
- Open debt: `findings/by-owner/OPS.md`
- Topics: `findings/by-topic/deployment-infra.md`, `findings/by-topic/ci-supply-chain.md`, `findings/by-topic/edge-proxy.md`
