# Permanent context — OBS (Service runtime and observability)

Created 2026-10-22 by the bootstrap. Read at the start of any task of this epic.

## What this epic covers
RF-OBS-01…RF-OBS-09, RF-API-12; UC-OBS-01. Configuration, lifecycle and drain, probes, logs, metrics, build info, healthcheck subcommand.

## Architecture as built
- backend/internal/buildinfo (RUN-M1-4): Version/Commit via -ldflags -X github.com/JerikH/FullStackCalculator/backend/internal/buildinfo.Version|Commit; fallback vcs.revision[:12]; else unknown.
- backend/internal/observability (RUN-M1-4): NewLogger (request_id from httpx context), NewMetrics(reg, info), Metrics.Middleware (deferred observation), Metrics.InstrumentCalculator (consumer-defined Calculator interface).
- backend/internal/config, backend/internal/app, backend/cmd/calculator (RUN-M1-4): config.Load(lookup); app.New/Run/Main/Probe; unexported seams compose (the RF-API-12 chain), listen, newServer, adminHandler and the drainHook used by lifecycle tests; backend/internal/web/noembed.go (Handler() nil without embedui).

## Invariants every task inherits
- Metric labels are bounded: route patterns, `OTHER` methods, `unknown` operations; never raw paths, operands or request IDs (RF-OBS-06, RNF-SEC-02).
- Metrics and pprof live only on the admin listener (RF-OBS-07).
- Handler chain order RequestContext → AccessLog → Metrics → Recover → SecureHeaders → router (RF-API-12).
- Readiness flips to draining before shutdown; liveness never depends on downstreams (RF-OBS-02…04).
- Run returns only after every Serve goroutine ended; past CALC_SHUTDOWN_TIMEOUT both servers are closed and Run returns an error (exit 1).
- calculator healthcheck exits 1 on every failure, including an invalid configuration.

## Decisions
- Compose sets `CALC_SHUTDOWN_DRAIN=2s`.
- U19: the draining readiness 503 is logged at `info`, the level set by the readiness handler (never by path); U20: access-log `path` and `user_agent` truncated to 256 characters, `remote_addr` kept (OBS-LOG-01).

## Where to look
- Open debt: `findings/by-owner/OBS.md`
- Topics: `findings/by-topic/observability.md`, `findings/by-topic/reliability-errors.md`
