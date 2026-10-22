# Permanent context — API (HTTP API and contract)

Created 2026-10-22 by the bootstrap. Read at the start of any task of this epic.

## What this epic covers
RF-API-01…RF-API-12; UC-API-01, UC-API-02. The contract, routing, decoding, problems, headers and contract tests. Arithmetic belongs to CALC; process lifecycle to OBS.

## Architecture as built
- (nothing yet) — planned: `backend/api/openapi.yaml` + `spec.go`, `redocly.yaml`, `backend/internal/platform/httpx/`, `backend/internal/httpapi/`.

## Invariants every task inherits
- The contract is provider-owned and fixed in M0; a change is announced to its consumers and regenerates `frontend/src/shared/api/schema.gen.ts` in the same change (RF-API-01, RF-API-10).
- Every error from the service is problem+json with a stable code; 400 = wrong request, 422 = no representable answer (RF-API-05).
- Decoding order is normative: unknown operation before the body (RF-API-04).
- No raw input in details except the quoted operation name, the quoted unknown field name and the 405 method (RNF-SEC-02).

## Decisions
- Adopted: repeated JSON keys — last occurrence wins; quoted unknown field name allowed in the detail.

## Where to look
- Open debt: `findings/by-owner/API.md`
- Topics: `findings/by-topic/api-contract.md`, `findings/by-topic/security-privacy.md`
