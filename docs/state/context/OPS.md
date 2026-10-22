# Permanent context — OPS (Repository, environments and delivery)

Created 2026-10-22 by the bootstrap. Read at the start of any task of this epic.

## What this epic covers
RF-OPS-01…RF-OPS-14; UC-OPS-01…UC-OPS-03. Hygiene files, per-agent environment, local tiers, images, compose, Makefile, E2E, CI and Dependabot. The application code belongs to CALC/API/OBS/UI.

## Architecture as built
- (nothing yet) — planned: `scripts/ci/` (env and tiers), `.github/workflows/ci.yml.disabled`, `.github/dependabot.yml`, `deploy/nginx/`, `frontend/Dockerfile`, `backend/Dockerfile`, root `Dockerfile`, `compose.yaml`, `Makefile`, `tools/versions.env`, `scripts/bootstrap.sh`, `scripts/coverage.sh`, `scripts/smoke-aio.sh`.

## Invariants every task inherits
- Every Docker build uses the repository root as context (RF-OPS-01).
- GitHub workflows stay `*.yml.disabled`; every change to `scripts/ci/` or a service updates the disabled workflow in the same commit and passes actionlint (RF-OPS-11, U3).
- Containers: non-root, read-only root, `cap_drop: ALL`, `no-new-privileges`; the admin port is never published (RNF-SEC-04).
- The tier scripts are the single source of truth for local and CI commands; no logic duplicated in YAML (RF-OPS-03).

## Decisions
- U1 — toolchain locations; U3 — Dependabot active, workflows disabled; G1 — remote, push and enabling are the owner's.

## Where to look
- Open debt: `findings/by-owner/OPS.md`
- Topics: `findings/by-topic/deployment-infra.md`, `findings/by-topic/ci-supply-chain.md`, `findings/by-topic/edge-proxy.md`
