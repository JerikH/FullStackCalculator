# Methodology baseline — FullStackCalculator

Epics are the module prefixes of `srs.md` and `use-cases.md`. Status: ⬜ not started · 🟡 partial (gap written in Note) · ✅ complete and verified on the real system · 🔴 blocked.

## Baseline by epic

| Epic | Status | Milestone | Note |
|---|---|---|---|
| OPS | 🟡 | M0–M2 | Done: hygiene files and licence (RUN-M0-1); per-agent environment, local test tiers, pinned tools and the disabled contract job (RUN-M0-2); web image and nginx edge (RUN-M1-6). Pending: images, compose, Makefile, E2E, complete CI, Dependabot. |
| API | 🟡 | M0–M1 | Done: contract (RUN-M0-1); HTTP platform `httpx` (RUN-M1-1); routes, probes and contract tests (RUN-M1-4). Every task done; the reflected path in `instance` is accepted (U17); the probe 503 problem enters the contract in OPS-STACK-01 (U18) |
| CALC | 🟡 | M1 | All tasks done: decimal core and operations (RUN-M1-1), proven through the API by API-ROUTES-01 (UC-API-02, RUN-M1-4); the published benchmark numbers wait for DOC-README-01 |
| OBS | 🟡 | M1 | Done: build info, request-aware logger and metrics; configuration, lifecycle, admin listener and entrypoint (RUN-M1-4). Pending: access-log levels and field bounds OBS-LOG-01 (U19, U20); image healthcheck and compose drain proven in OPS-IMAGE-01 and OPS-STACK-01 |
| UI | 🟡 | M0–M1 | Done: design baseline (RUN-M0-1); scaffold, tokens, theme bootstrap and the typed API client (RUN-M1-2); pure calculator model (RUN-M1-5). Pending: hooks and screens in M1 |
| DOC | 🟡 | M1–M2 | Done: ADR index and template (RUN-M0-1); ADRs 0001–0008 (RUN-M1-3). Pending: README, API reference, verification in M2 |
