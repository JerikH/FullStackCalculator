# DOC — Documentation

### DOC-ADR-01 — Architecture decision records [BE] — M1 [topic: api-contract, deployment-infra]

- [x] **DONE 2026-10-22 (run RUN-M1-3, commit 8460cea; 🔎 findings: «Findings of DOC-ADR-01» (a)–(e)).** Eight ADRs in docs/adr/ — 0001 monorepo with independently deployable services, 0002 decimal arithmetic and decimal strings on the wire, 0003 provider-owned OpenAPI contract, 0004 problem details and status semantics, 0005 standard-library HTTP and consumer-defined interfaces, 0006 server-authoritative arithmetic and a pure reducer, 0007 split and embedded delivery, 0008 observability and drain-aware readiness — on the existing template with status Accepted and date 2026-10-22 (U11), each with concrete context citing RF/RNF IDs, decision, positive and negative consequences and rejected alternatives with reasons; the index table of docs/adr/README.md links all eight. Facts traced to srs.md, the task entries and the contract; spec and plan each had an adversarial review, the ADRs a controller fact check plus one independent review (no P0/P1; 11 P2/P3 fixed). Verified by check_adrs.py (C1–C12: template shape, status/date, sections, consequences, alternatives, link allow-list, wording, index, requirement IDs, path traceability, length) PASS with 0 failures, 25/25 mutation checks caught, out-of-scope term grep 0 matches; evidence in docs/state/archive/runs/RUN-M1-3/evidence/.
  **Scope:** RF-DOC-02. `docs/adr/0001-monorepo-and-independent-services.md`, `0002-decimal-arithmetic-and-string-numbers.md`, `0003-provider-owned-openapi-contract.md`, `0004-problem-details-and-status-semantics.md`, `0005-stdlib-http-and-consumer-interfaces.md`, `0006-server-arithmetic-and-pure-reducer.md`, `0007-split-and-embedded-delivery.md`, `0008-observability-and-drain-aware-readiness.md`, each with status, date, concrete context, decision, positive and negative consequences and rejected alternatives with reasons; the index table in `docs/adr/README.md` links all eight. Content comes from `srs.md` and the architecture; links only to committed files (or files the roadmap creates, written as plain paths).
  **UI:** none.
  **Verification:** every ADR has the four sections; the index links resolve; a grep confirms no reference to anything outside the version 1 scope.
  **Review level:** single.
  **Needs from the owner:** nothing.

### DOC-README-01 — README, verification record, screenshots and API reference notes [BE] — M2 [topic: live-verification, deployment-infra]

- [ ] Open.
  **Scope:** UC-DOC-01; RF-DOC-01, RF-DOC-03 (`docs/api/README.md`), RF-DOC-04. README sections in the fixed order with copyable curl for all seven operations and the main errors, the complete problem catalog, configuration table (the seven `CALC_*` variables plus `VITE_API_BASE_URL`, `API_PROXY_TARGET`, `API_UPSTREAM`, `WEB_PORT`, `VERSION`, `COMMIT`, `E2E_BASE_URL`, `COMPOSE_PROJECT_NAME`), measured coverage and benchmark tables; `docs/verification.md` dated evidence; `docs/assets/calculator-desktop.png` and `calculator-mobile.png` from the real app.
  **UI:** screenshots only.
  **Verification:** every README command checked against the repository (targets exist, ports and defaults match); every link resolves to a committed file; the numbers match `docs/verification.md`.
  **Review level:** single.
  **Needs from the owner:** nothing.
  - Registered follow-up (from DOC-ADR-01): confirm every path the ADRs cite as plain text exists as written once the implementation lands, fix any renamed one, and link only committed files; the README «Design decisions» table reuses the ADR titles of docs/adr/README.md. 🔎 findings: «Findings of DOC-ADR-01» (b)
