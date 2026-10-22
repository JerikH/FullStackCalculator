# Methodology baseline — FullStackCalculator

Epics are the module prefixes of `srs.md` and `use-cases.md`. Status: ⬜ not started · 🟡 partial (gap written in Note) · ✅ complete and verified on the real system · 🔴 blocked.

## Baseline by epic

| Epic | Status | Milestone | Note |
|---|---|---|---|
| OPS | 🟡 | M0–M2 | Done: hygiene files and licence (RUN-M0-1); per-agent environment, local test tiers, pinned tools and the disabled contract job (RUN-M0-2); web image and nginx edge (RUN-M1-6); embedded web handler and the API image (RUN-M1-7). compose stack, all-in-one image, Makefile and the browser suite (RUN-M2-1); complete CI definition and Dependabot (RUN-M2-2). Every task done; the hosted verification of the jobs waits for G1. |
| API | 🟡 | M0–M2 | Done: contract (RUN-M0-1); HTTP platform `httpx` (RUN-M1-1); routes, probes and contract tests (RUN-M1-4). Every task done; the reflected path in `instance` is accepted (U17); the probe 503 problem enters the contract in OPS-STACK-01 (U18) |
| CALC | 🟡 | M1 | All tasks done: decimal core and operations (RUN-M1-1), proven through the API by API-ROUTES-01 (UC-API-02, RUN-M1-4) |
| OBS | 🟡 | M1–M2 | Every task done: build info, request-aware logger and metrics; configuration, lifecycle, admin listener and entrypoint (RUN-M1-4); access-log levels and field bounds (RUN-M1-7). The drain in the composed stack is proven in the recorded run of OPS-E2E-01; pending (M2): the bounded `method` field (OBS-LOG-02) |
| UI | 🟡 | M0–M2 | Every task done: design baseline (RUN-M0-1); scaffold, tokens, theme bootstrap and the typed API client (RUN-M1-2); pure calculator model (RUN-M1-5); hooks and screens (RUN-M1-8). Pending (M2): amended names and the client signal fallback (UI-FIX-01), dependency pins (UI-DEPS-01), the committed E2E suite (OPS-E2E-01) |
| DOC | ✅ | M1–M2 | Done: ADR index and template (RUN-M0-1); ADRs 0001–0008 (RUN-M1-3); README, API reference notes, screenshots and the completed verification record (RUN-M2-3) |
