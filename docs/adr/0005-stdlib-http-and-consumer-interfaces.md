# ADR-0005: Standard-library HTTP and consumer-defined interfaces

- **Status:** Accepted
- **Date:** 2026-10-22

## Context

The service described in [the requirements](../spec/srs.md) is small: five public endpoints (RF-API-01, RF-API-02, RF-API-03, RF-OBS-02, RF-OBS-03) and a private admin listener for metrics and optional profiling. Its HTTP behaviour is strict rather than large, and most of the strictness is about error shapes and ordering.

- Requests are decoded in a fixed order (operation lookup before the body is read, then media type, size, JSON shape and operand checks), and each step has its own status and detail text (RF-API-04).
- Every error response must be `application/problem+json`, including the router's own 404 and 405 answers (RF-API-06).
- The handler chain has a fixed order, outermost first: RequestContext, AccessLog, Metrics, Recover, SecureHeaders, router, so that a panic is logged with its request ID and counted as a 500 (RF-API-12).
- The calculation domain must be testable and fuzzable without an HTTP server (RF-OPS-14), and the repository lint rules apply to every package (RNF-QUAL-02).

The decision is how to structure the Go code so that these rules are owned in one place each, and which HTTP stack to build on.

The service has no database and no runtime integrations, so the layers that usually justify a larger structure (persistence, external clients) do not exist here. The boundaries worth keeping are the ones that change for different reasons.

## Decision

The service uses `net/http` with the standard `ServeMux` and its method and wildcard patterns (for example `{operation}`), with no web framework. Packages follow a one-way dependency rule, and interfaces are declared by the package that consumes them.

- `backend/cmd/calculator` calls `backend/internal/app`, the composition root that also owns the process lifecycle. It wires `backend/internal/httpapi`, which holds routes, handlers, the mapping from domain errors to problems, and the health handlers. `httpapi` depends on `backend/internal/calc`, the pure domain.
- `backend/internal/calc` imports no internal package and knows nothing about HTTP or JSON.
- `backend/internal/platform/httpx` is generic HTTP plumbing with no calculator vocabulary except the API-wide problem catalog: problem+json responses, strict JSON decoding, request context and request ID, middleware, and a `Methods` dispatcher that answers a wrong method with a 405 problem carrying `Allow` (RF-API-06).
- The remaining packages are `backend/internal/observability`, `backend/internal/config` (environment variables only, RF-OBS-01), `backend/internal/buildinfo` and `backend/internal/web`.
- `backend/internal/httpapi` declares the small `Calculator` interface it needs, and the domain calculator satisfies it implicitly. The decorator in `backend/internal/observability` that counts operations wraps the domain behind that same small interface, so the domain never knows it is measured.
- The middleware chain is composed in the order of RF-API-12. Routes are tagged with their matched pattern, so the `route` log field and the metric labels are patterns, never raw paths (RF-OBS-05, RF-OBS-06).

The dependency rule runs in one direction only: the domain depends on nothing internal, transport depends on the domain, and the composition root depends on everything. Nothing below the composition root imports the layer above it.

## Consequences

### Positive
- There is no framework dependency to track: besides the decimal library and the metrics client, only the standard library sits on the request path.
- The problem shape for 404, 405, 413 and 415 is fully controlled, because no framework default has to be overridden.
- The domain is unit-tested and fuzzed without servers (RF-OPS-14), and its dependency direction is easy to check by reading imports.
- Decorators such as the operation counter slot in without the domain knowing about them.
- Small consumer-owned interfaces make test doubles trivial to write.

### Negative
- Plumbing that a framework would supply is written and tested in this repository: middleware chaining, 405 handling, strict decoding, response helpers and panic recovery.
- The `Methods` dispatcher exists only because the standard mux answers a wrong method with a plain-text 405 instead of a problem, so every route it wraps must declare its allowed methods there, and its `Allow` list must be kept in step with the routes.
- Newcomers do not get framework conventions and must learn the package rules from this record and the code.
- Each consumer interface duplicates a method signature, so a signature change touches the domain and every consumer.

## Alternatives considered
- **A web framework** — an extra dependency with its own context and error conventions, whose default 404, 405 and validation responses would have to be overridden to emit problem+json anyway, while the standard mux already supports method and wildcard patterns.
- **Provider-owned broad interfaces** — an interface exported by `backend/internal/calc` with every method forces consumers to depend on methods they do not use and makes fakes larger, and Go interfaces are satisfied implicitly, so the consumer can own them.
- **Layers without meaningful boundaries** — controller, service and repository layers for a service without a database add ceremony without isolating anything, so only the boundaries with distinct reasons to change are kept: domain, transport, plumbing and runtime.
