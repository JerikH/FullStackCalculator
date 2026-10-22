# Permanent context — API (HTTP API and contract)

Created 2026-10-22 by the bootstrap. Read at the start of any task of this epic.

## What this epic covers
RF-API-01…RF-API-12; UC-API-01, UC-API-02. The contract, routing, decoding, problems, headers and contract tests. Arithmetic belongs to CALC; process lifecycle to OBS.

## Architecture as built
- Contract (RUN-M0-1): `backend/api/openapi.yaml` (OpenAPI 3.1.0) embedded as `api.Spec` by `backend/api/spec.go`; `redocly.yaml` at the root. Lint: `pnpm --package=@redocly/cli@<version> dlx redocly lint backend/api/openapi.yaml` (Findings of API-CONTRACT-01 (c)).
- Planned: `backend/internal/platform/httpx/`, `backend/internal/httpapi/`.

## Invariants every task inherits
- The contract is provider-owned and fixed in M0; a change is announced to its consumers and regenerates `frontend/src/shared/api/schema.gen.ts` in the same change (RF-API-01, RF-API-10).
- Every error from the service is problem+json with a stable code; 400 = wrong request, 422 = no representable answer (RF-API-05).
- Decoding order is normative: unknown operation before the body (RF-API-04).
- No raw input in details except the quoted operation name, the quoted unknown field name and the 405 method (RNF-SEC-02).
- Declared status sets per operation: `listOperations` 200/405/429/500/503; `calculate` 200/400/404/405/413/415/422/429/500/503; `getOpenAPIDocument` 200/405/429/500/503; `getLiveness` 200/405/500; `getReadiness` 200/405/500/503 (Findings of API-CONTRACT-01 (d)).
- Every problem carries `detail` and `requestId` (schema-required); `instance` may be omitted only by edge problems (Findings of API-CONTRACT-01 (b)).
- A wrong-method 405 cannot be validated as a response of the document (no operation for that method): contract tests validate its body against the Problem schema and assert `Allow` (Findings of API-CONTRACT-01 (a)).

## Decisions
- Adopted: repeated JSON keys — last occurrence wins; quoted unknown field name allowed in the detail.

## Where to look
- Open debt: `findings/by-owner/API.md`
- Topics: `findings/by-topic/api-contract.md`, `findings/by-topic/security-privacy.md`
