# Methodology baseline — FullStackCalculator

Epics are the module prefixes of `srs.md` and `use-cases.md`. Status: ⬜ not started · 🟡 partial (gap written in Note) · ✅ complete and verified on the real system · 🔴 blocked.

## Baseline by epic

| Epic | Status | Milestone | Note |
|---|---|---|---|
| OPS | 🟡 | M0–M2 | Done: hygiene files and licence (RUN-M0-1). Pending: per-agent environments, test tiers, images, compose, Makefile, E2E, CI, Dependabot. |
| API | 🟡 | M0–M1 | Done: contract (RUN-M0-1). Pending: transport, routes and contract tests in M1 |
| CALC | ⬜ | M1 | Decimal core and operations |
| OBS | ⬜ | M1 | Logs, metrics, configuration, lifecycle, probes |
| UI | 🟡 | M0–M1 | Done: design baseline (RUN-M0-1). Pending: client, model, hooks and screens in M1 |
| DOC | 🟡 | M1–M2 | Done: ADR index and template (RUN-M0-1). Pending: ADRs in M1; README, API reference, verification in M2 |
