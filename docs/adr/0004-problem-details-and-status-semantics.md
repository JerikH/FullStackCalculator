# ADR-0004: Problem details and status semantics

- **Status:** Accepted
- **Date:** 2026-10-22

## Context

Three kinds of client must react to errors programmatically: the web app, curl users and the edge in front of the service. The [requirements](../spec/srs.md) add several constraints on how errors look.

- The UI shows fixed copy per error code and never displays server text (RF-UI-08), so the code must be stable and machine-readable.
- Errors must never leak internals or reflect raw client input (RF-API-11, RNF-SEC-02).
- Support must be able to correlate a user report with a log line (RF-API-07).
- A client must be able to tell a request that has to be fixed from an operation that has no answer, for example a malformed body versus a division by zero.

## Decision

Every error response uses one RFC 9457 body, and the HTTP status says who has to change something.

- Shape: every error response of the service, on API routes and on unmatched routes, is `application/problem+json` with the fields `type`, `title`, `status`, `detail`, `instance`, `code` and `requestId`, plus `errors` for validation failures only. `type` is `urn:calculator:problem:<kebab-code>`, `instance` is the request path, and each `errors[]` entry holds a field and a reason (RF-API-05).
- Correlation: `requestId` equals the `X-Request-ID` response header (RF-API-07).
- Codes: thirteen stable codes, each with a fixed status and title (RF-API-05):

| Code | Status | Title |
|---|---|---|
| `MALFORMED_REQUEST` | 400 | Malformed request |
| `VALIDATION_FAILED` | 400 | Validation failed |
| `NOT_FOUND` | 404 | Not found |
| `UNKNOWN_OPERATION` | 404 | Unknown operation |
| `METHOD_NOT_ALLOWED` | 405 | Method not allowed |
| `PAYLOAD_TOO_LARGE` | 413 | Payload too large |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | Unsupported media type |
| `DIVISION_BY_ZERO` | 422 | Division by zero |
| `UNDEFINED_RESULT` | 422 | Undefined result |
| `OVERFLOW` | 422 | Result out of range |
| `RATE_LIMITED` | 429 | Too many requests |
| `SERVICE_UNAVAILABLE` | 503 | Service unavailable |
| `INTERNAL_ERROR` | 500 | Internal server error |

- Status semantics: 400 means the request is wrong (`MALFORMED_REQUEST`, `VALIDATION_FAILED`), and 422 means it is well formed but the mathematics has no representable answer (`DIVISION_BY_ZERO`, `UNDEFINED_RESULT`, `OVERFLOW`), as produced by the arithmetic of [ADR-0002](0002-decimal-arithmetic-and-string-numbers.md).
- Routing errors: `UNKNOWN_OPERATION` (404) is decided before the request body is read, `NOT_FOUND` (404) covers unmatched routes, and 405 carries an `Allow` header (RF-API-06). 413 and 415 follow from the decoding order (RF-API-04).
- Internal errors: 500 `INTERNAL_ERROR` is opaque, with the detail `an unexpected error occurred`, and the cause is logged with its `request_id` and stack (RF-API-11).
- Edge: 429 `RATE_LIMITED` and 503 `SERVICE_UNAVAILABLE` are emitted only by the edge, which also emits 413 above its 1 MiB transport limit, with the same fields except that `instance` may be omitted (RF-API-05, RF-OPS-04).
- Mapping: domain sentinel errors, whose texts are the reasons shown to API clients (RF-CALC-03 to RF-CALC-09), are mapped to problems in one place in the HTTP layer, and the problem catalog belongs to the shared HTTP plumbing described in [ADR-0005](0005-stdlib-http-and-consumer-interfaces.md).
- Exceptions: the draining readiness 503 is Health JSON (RF-OBS-03), not a Problem. The only client input reflected in a response is the `%q`-quoted operation name, the quoted unknown field name and the 405 method (RNF-SEC-02).

## Consequences

### Positive

- There is one shape for every failure, and the machine-readable `code` is independent of the wording of `title` and `detail`.
- The UI maps codes to its own copy and never displays server `detail` or `title` (RF-UI-08), and `Ref: <requestId>` ties what is on screen to a log line.
- The 400/422 split tells a client whether to fix the request or accept that the operation has no answer.
- Validation reports every bad operand at once, each under its own `operands[i]` field.

### Negative

- The code list exists in four places: the contract's `ProblemCode` enum, the service's list (tests assert it is a subset of the enum, RF-API-09), the frontend's list, which derives from the contract and its generated types (RF-API-10), and the edge configuration for 413, 429 and 503, so a new code can touch all four.
- Exact detail strings are normative and asserted by tests, so changing copy is a contract change.
- 422 is less familiar to some clients than a generic 400.
- The edge must build the same JSON shape in its configuration, which duplicates the field list outside the Go code.
- A 405 from the router cannot be validated as a documented response, as explained in [ADR-0003](0003-provider-owned-openapi-contract.md).

## Alternatives considered

- **Ad hoc error strings** — clients would have to parse prose, any rewording would break them, and there would be no request correlation between a report and a log line.
- **HTTP 200 carrying a failure in the body** — it breaks HTTP semantics, caches, proxies, access-log status and metrics by status, and every client would have to inspect every body to find out whether a call worked.
- **One generic 400 for every failure** — the client could not tell a malformed request from a division by zero, and the per-code UI copy of RF-UI-08 depends on exactly that distinction.
