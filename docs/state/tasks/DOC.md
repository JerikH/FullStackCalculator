# DOC — Documentation

### DOC-ADR-01 — Architecture decision records [BE] — M1 [topic: api-contract, deployment-infra]

- [ ] Open.
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
