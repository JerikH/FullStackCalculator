# ADR-0003: Provider-owned OpenAPI contract

- **Status:** Accepted
- **Date:** 2026-10-22

## Context

The Go service is the single provider of the HTTP API and has two consumers: the web app and direct API clients such as curl (the Visitor and API client rows of the «Actors» table in the [requirements](../spec/srs.md)). The requirements demand that the service's responses and the frontend's types never drift from each other (RNF-REL-01). Without a shared, machine-checkable description, each side would encode its own idea of the shapes, and a mismatch would surface only at runtime in a browser. The contract also has to be reviewable as a document before the code that implements it exists.

Three needs follow from this.

- Consumers must be able to read the shape of every request, response and error without reading Go code.
- The status sets, the problem+json responses and the examples need deliberate writing, because they define the behaviour that clients depend on (see [ADR-0004](0004-problem-details-and-status-semantics.md)).
- Both sides must fail a check when they diverge, not merely when someone notices.

## Decision

The contract is an OpenAPI 3.1 document owned by the Go service and kept next to it, and both sides are checked against it mechanically.

- Document: [`backend/api/openapi.yaml`](../../backend/api/openapi.yaml), with the components `Decimal`, `OperationName`, `CalculationRequest`, `CalculationResult`, `OperationInfo`, `OperationCatalog`, `ProblemCode`, `Problem`, `FieldViolation` and `Health` (RF-API-01).
- Lint: Redocly, configured in [`redocly.yaml`](../../redocly.yaml) with the `recommended` ruleset plus `operation-4xx-response`, `no-unused-components` and `info-license-strict` as errors.
- Publication: [`backend/api/spec.go`](../../backend/api/spec.go) embeds the document in the binary as `api.Spec`, and the service serves it at `GET /api/v1/openapi.yaml` as `application/yaml` with `Cache-Control: no-store`, so the published document is the exact one the binary embeds (RF-API-01).
- Backend drift gates: Go contract tests validate every handler response against the embedded document with `pb33f/libopenapi-validator`, assert that the operation catalog equals the `OperationName` enum in the same order, and assert that the service's problem codes are a subset of `ProblemCode` (RF-API-09).
- Frontend drift gate: TypeScript types are generated with `openapi-typescript` into `frontend/src/shared/api/schema.gen.ts` and committed, and regenerating them must produce no diff (RF-API-10). The CI definition's `contract` job regenerates them and fails on any drift (RF-OPS-11).
- Runtime: the client is `openapi-fetch`, typed from the generated schema, and at runtime a non-2xx body is accepted as a problem only if it passes the `isProblem` guard (RF-UI-09).
- Operation list: the catalog returned by `GET /api/v1/operations` is the list of values of the `OperationName` enum, in the same order (RF-API-02, RF-API-09).
- Workflow: a contract change regenerates the types in the same change, as set out in [ADR-0001](0001-monorepo-and-independent-services.md).

## Consequences

### Positive

- There is one reviewable source of truth, written and reviewed before the code that implements it.
- The frontend gets compile-time checking of requests and responses, and the backend gets runtime validation of real handler output in its tests.
- Direct API clients and the web app read the same document, so the behaviour that curl users see is the behaviour the UI is typed against.
- Adding an operation is one catalog entry plus one enum value, and the contract test fails if the two diverge.
- The published document is byte-for-byte what the running binary embeds, so documentation cannot describe a different version than the one deployed.

### Negative

- The YAML document and the Go handlers are two representations kept in step by tests rather than by construction, so a mismatch is found when the tests run, not when the code compiles.
- There is tooling to maintain (Redocly, `openapi-typescript` and the validator) and generated code that lives in the repository.
- A 405 produced for a wrong method has no operation in the document to validate against, so contract tests check its body against the `Problem` schema and assert the `Allow` header separately.
- Changing the contract is a deliberate act with several visible effects (document, handlers, tests, regenerated types), which is slower than editing one side in isolation.
- Runtime guards are still needed in the client because types are erased at runtime; the `isProblem` guard exists for that reason.

## Alternatives considered

- **Handwritten, duplicated types** — the TypeScript and Go types would drift silently, and nothing would fail when a field is renamed on one side only.
- **Code-first contract generated from Go** — the contract would become a side effect of refactors and consumers could not review the shape before implementation, and the document would only describe what the generator understands, while the problem+json responses, status sets and examples are exactly the parts that need deliberate writing.
- **GraphQL** — a single POST endpoint returning 200 with errors in the body conflicts with the HTTP status semantics of [ADR-0004](0004-problem-details-and-status-semantics.md), a schema runtime and client for a handful of endpoints is disproportionate, and HTTP caching and per-route metrics become harder.
