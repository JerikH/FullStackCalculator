# Permanent context — OPS (Repository, environments and delivery)

Created 2026-10-22 by the bootstrap. Read at the start of any task of this epic.

## What this epic covers
RF-OPS-01…RF-OPS-14; UC-OPS-01…UC-OPS-03. Hygiene files, per-agent environment, local tiers, images, compose, Makefile, E2E, CI and Dependabot. The application code belongs to CALC/API/OBS/UI.

## Architecture as built
- Hygiene files at the root (RUN-M0-1): `.gitignore` (every RF-OPS-01 pattern), `.gitattributes`, `.editorconfig`, `.dockerignore`, `LICENSE` (MIT); ADR index and template in `docs/adr/`.
- Per-agent environment and local tiers (RUN-M0-2): `scripts/ci/env.sh` (sourced; ports, compose project and PATH from the agent identity), `scripts/ci/lib.sh` + `t0.sh`…`t3.sh` (tiers; each CI job calls `t3.sh --job <name>`), `scripts/ci/install-tools.sh` + `tools/versions.env` (golangci-lint, actionlint, hadolint, shellcheck pinned with per-platform SHA-256, installed in `bin/.tools/<tool>-<version>/` and linked as `bin/<tool>`; Redocly CLI version), `.github/workflows/ci.yml.disabled` (contract job).
- Planned: `.github/dependabot.yml`, `deploy/nginx/`, `frontend/Dockerfile`, `backend/Dockerfile`, root `Dockerfile`, `compose.yaml`, `Makefile`, `scripts/bootstrap.sh`, `scripts/coverage.sh`, `scripts/smoke-aio.sh`.

## Invariants every task inherits
- Every Docker build uses the repository root as context (RF-OPS-01); `.dockerignore` excludes `docs`, `bin`, coverage, the Playwright report folders, every `dist` except `backend/internal/web/dist/.gitkeep`, and `.env*`, so builds copy only the sources they need and produce `dist` inside their stages.
- The agent tooling of a working copy is excluded through `.git/info/exclude`; committed ignore files never name it (Findings of OPS-REPO-01 (a)).
- GitHub workflows stay `*.yml.disabled`; every change to `scripts/ci/` or a service updates the disabled workflow in the same commit and passes actionlint (RF-OPS-11, U3).
- Containers: non-root, read-only root, `cap_drop: ALL`, `no-new-privileges`; the admin port is never published (RNF-SEC-04).
- The tier scripts are the single source of truth for local and CI commands; no logic duplicated in YAML (RF-OPS-03). Every CI job calls `scripts/ci/t3.sh --job <name>`.
- Worker isolation is enforced by `env.sh` from the worktree's `.wf-agent`, never by the `wf` index alone; a worker port block starts at 1024 or above and never covers 8080, 8081, 9091 or 5173 (Findings of OPS-ENV-01 (a), (c)).
- Tier scripts call the pinned tools by their versioned path, never a copy found on `PATH`; a missing tool, a missing toolchain or any check failure is a `✘` row and a non-zero exit, never a skip; absent stages are reported «not present» only while their manifest (`backend/go.mod`, `frontend/package.json`) does not exist (Findings of OPS-CI-01 (a)).
- Redocly runs with `REDOCLY_TELEMETRY=off` (Findings of OPS-CI-01 (i)).

## Decisions
- U1 — toolchain locations; U3 — Dependabot active, workflows disabled; U6 — shellcheck in the tiers, `tools/versions.env` from M0; G1 — remote, push and enabling are the owner's.

## Where to look
- Open debt: `findings/by-owner/OPS.md`
- Topics: `findings/by-topic/deployment-infra.md`, `findings/by-topic/ci-supply-chain.md`, `findings/by-topic/edge-proxy.md`
