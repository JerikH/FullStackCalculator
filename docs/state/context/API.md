# Permanent context — API (HTTP API and contract)

Created 2026-10-22 by the bootstrap. Read at the start of any task of this epic.

## What this epic covers
RF-API-01…RF-API-12; UC-API-01, UC-API-02. The contract, routing, decoding, problems, headers and contract tests. Arithmetic belongs to CALC; process lifecycle to OBS.

## Architecture as built
- Contract (RUN-M0-1): `backend/api/openapi.yaml` (OpenAPI 3.1.0) embedded as `api.Spec` by `backend/api/spec.go`; `redocly.yaml` at the root. Lint: `pnpm -C frontend run lint:api` (Redocly pinned by the frontend lockfile; Findings of UI-SCAF-01 (b)); generated TypeScript types in `frontend/src/shared/api/schema.gen.ts`, drift checked by the contract stage. Before RUN-M1-2 the lint ran through `pnpm dlx` (Findings of API-CONTRACT-01 (c)).
- backend/internal/platform/httpx (RUN-M1-1): problem.go, respond.go (WriteJSON(w, r, status, v), WriteProblem), decode.go (DecodeJSON), requestinfo.go (RequestContext, RequestInfo, Route, recorder), middleware.go (Chain, AccessLog, Recover, SecureHeaders), methods.go (Methods, NotFound).
- backend/internal/httpapi (RUN-M1-4): router.go (NewRouter: no-store front, canonical-target guard, /api and /api/ NOT_FOUND, / web or NOT_FOUND), operations.go (list, calculate, decodeOperands), errors.go (problemFor), health.go (Readiness, healthz/readyz); contract tests in contract_test.go (libopenapi-validator v0.16.1; 405/unmatched bodies via schema_validation against Problem).

## Invariants every task inherits
- The contract is provider-owned and fixed in M0; a change is announced to its consumers and regenerates `frontend/src/shared/api/schema.gen.ts` in the same change (RF-API-01, RF-API-10).
- Every error from the service is problem+json with a stable code; 400 = wrong request, 422 = no representable answer (RF-API-05).
- Decoding order is normative: unknown operation before the body (RF-API-04).
- No raw input in details except the quoted operation name, the quoted unknown field name and the 405 method (RNF-SEC-02).
- Declared status sets per operation: `listOperations` 200/405/429/500/503; `calculate` 200/400/404/405/413/415/422/429/500/503; `getOpenAPIDocument` 200/405/429/500/503; `getLiveness` 200/405/500; `getReadiness` 200/405/500/503 (Findings of API-CONTRACT-01 (d)).
- Every problem carries `detail` and `requestId` (schema-required); `instance` may be omitted only by edge problems (Findings of API-CONTRACT-01 (b)).
- A wrong-method 405 cannot be validated as a response of the document (no operation for that method): contract tests validate its body against the Problem schema and assert `Allow` (Findings of API-CONTRACT-01 (a)).
- MALFORMED_REQUEST has exactly four details; a [] or null body is «request body must contain a single JSON object»; JSON keys are matched exactly (encoding/json alone is case-insensitive).
- httpx.Codes() is the 11 service codes, a strict subset of the contract enum (RATE_LIMITED, SERVICE_UNAVAILABLE are edge-only); the client's PROBLEM_CODES equals the enum (Findings of W1 (a)).
- Every response of the router carries Cache-Control: no-store; a target that is not a canonical absolute path gets the NOT_FOUND problem (never a mux redirect). The embedded web handler (OPS-IMAGE-01) overrides Cache-Control and the CSP for app files.
- calculate never reads the body of an unknown operation; operands must be an array of JSON strings (null elements are the wrong-type reason).

## Decisions
- Adopted: repeated JSON keys — last occurrence wins; quoted unknown field name allowed in the detail.

## Where to look
- Open debt: `findings/by-owner/API.md`
- Topics: `findings/by-topic/api-contract.md`, `findings/by-topic/security-privacy.md`
