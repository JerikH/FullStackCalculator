# Methodology baseline — FullStackCalculator

Epics are the module prefixes of `srs.md` and `use-cases.md`. Status: ⬜ not started · 🟡 partial (gap written in Note) · ✅ complete and verified on the real system · 🔴 blocked.

## Baseline by epic

| Epic | Status | Milestone | Note |
|---|---|---|---|
| OPS | 🟡 | M0–M2 | Done: hygiene files and licence (RUN-M0-1); per-agent environment, local test tiers, pinned tools and the disabled contract job (RUN-M0-2). Pending: images, compose, Makefile, E2E, complete CI, Dependabot. |
| API | 🟡 | M0–M1 | Done: contract (RUN-M0-1); HTTP platform `httpx` (RUN-M1-1). Pending: routes and contract tests in M1 |
| CALC | 🟡 | M1 | All tasks done: decimal core and operations (RUN-M1-1); its requirements stay 🟡 until API-ROUTES-01 proves them through the API |
| OBS | ⬜ | M1 | Logs, metrics, configuration, lifecycle, probes |
| UI | 🟡 | M0–M1 | Done: design baseline (RUN-M0-1); scaffold, tokens, theme bootstrap and the typed API client (RUN-M1-2). Pending: model, hooks and screens in M1 |
| DOC | 🟡 | M1–M2 | Done: ADR index and template (RUN-M0-1); ADRs 0001–0008 (RUN-M1-3). Pending: README, API reference, verification in M2 |
