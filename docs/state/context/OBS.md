# Permanent context — OBS (Service runtime and observability)

Created 2026-10-22 by the bootstrap. Read at the start of any task of this epic.

## What this epic covers
RF-OBS-01…RF-OBS-09, RF-API-12; UC-OBS-01. Configuration, lifecycle and drain, probes, logs, metrics, build info, healthcheck subcommand.

## Architecture as built
- (nothing yet) — planned: `backend/internal/{buildinfo,observability,config,app}/`, `backend/cmd/calculator/`.

## Invariants every task inherits
- Metric labels are bounded: route patterns, `OTHER` methods, `unknown` operations; never raw paths, operands or request IDs (RF-OBS-06, RNF-SEC-02).
- Metrics and pprof live only on the admin listener (RF-OBS-07).
- Handler chain order RequestContext → AccessLog → Metrics → Recover → SecureHeaders → router (RF-API-12).
- Readiness flips to draining before shutdown; liveness never depends on downstreams (RF-OBS-02…04).

## Decisions
- Compose sets `CALC_SHUTDOWN_DRAIN=2s`.

## Where to look
- Open debt: `findings/by-owner/OBS.md`
- Topics: `findings/by-topic/observability.md`, `findings/by-topic/reliability-errors.md`
