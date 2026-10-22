# ADR-0008: Observability and drain-aware readiness

- **Status:** Accepted
- **Date:** 2026-10-22

## Context

The [requirements](../spec/srs.md) expect an operator to run the service without reading its code. That means correlating an edge or UI error with a service log line (RF-API-07, and the `Ref` shown by RF-UI-08), seeing rates, latency and outcomes (RF-OBS-06), and restarting or rolling the service without dropping in-flight requests (RF-OBS-03, RF-OBS-04).

Three constraints shape the design.
- Metrics and profiling must not be public (RF-OBS-07, RNF-SEC-04).
- Labels and logged routes must never carry client input (RNF-SEC-02, RF-OBS-05).
- The API image is distroless and has no curl, so even a healthcheck needs a binary of its own (RF-OBS-08).

## Decision

The service logs with `log/slog`, exposes bounded metrics on a private listener, and separates liveness from drain-aware readiness.

**Logs and request IDs.**
- Logs are JSON by default and plain text when configured (`CALC_LOG_LEVEL`, `CALC_LOG_FORMAT`, RF-OBS-01). Every context-aware line carries `request_id`.
- Each request produces one access-log line at `info` (`error` for 5xx) with `method`, `route` (the matched pattern, never the raw path), `path`, `status`, `bytes`, `duration_ms`, `remote_addr` and `user_agent` (RF-OBS-05).
- An inbound `X-Request-ID` matching `^[A-Za-z0-9._-]{1,128}$` is propagated, otherwise one is generated with `crypto/rand.Text()`. Every response carries it and a problem's `requestId` equals it (RF-API-07). The edge propagates a validated value (RF-OPS-04).

**Metrics and profiling.**
- Metrics are served in Prometheus text format from a custom registry on the private admin listener (`CALC_ADMIN_ADDR`, default `:9091`, empty disables it): `http_requests_total{method,route,status}`, `http_request_duration_seconds{method,route}` (buckets .0005 to 1), `http_requests_in_flight`, `calculator_operations_total{operation,outcome}`, `calculator_build_info{version,commit,go_version}`, plus Go and process collectors (RF-OBS-06).
- Labels are bounded: unknown methods become `OTHER`, unknown operations become `unknown`, routes are patterns, and outcomes come from the fixed set of RF-CALC-10. Who scrapes the listener is the operator's choice.
- `pprof` exists only when `CALC_PPROF=true` and only on the admin listener (RF-OBS-07). Version and commit come from ldflags with a VCS fallback (RF-OBS-09).

**Probes and lifecycle.**
- `/healthz` liveness never depends on downstreams (RF-OBS-02). `/readyz` answers 200 when ready and 503 when draining (RF-OBS-03). The draining 503 is Health JSON (`{"status":"draining",…}`), not a Problem (RF-API-05), and the edge passes it through unchanged (RF-OPS-04).
- On SIGINT or SIGTERM readiness flips to draining, the service waits `CALC_SHUTDOWN_DRAIN` (default `0s`; the compose stack sets `2s`, RF-OPS-06), then shuts both listeners down within `CALC_SHUTDOWN_TIMEOUT` (default `15s`).
- Server timeouts are ReadHeader 5 s, Read 10 s, Write 15 s, Idle 60 s and MaxHeaderBytes 16 KiB (RF-OBS-04).
- `calculator healthcheck` probes `/healthz` with a 2 s timeout because distroless images have no curl (RF-OBS-08).

## Consequences

### Positive
- A single ID follows a request from the edge to the service log and back to the browser, where it is shown as `Ref`.
- Whoever scrapes the admin listener gets rates, latency, in-flight requests and operation outcomes without code changes.
- Bounded label sets keep the metrics cheap and free of client data.
- A proxy or load balancer that polls `/readyz` stops routing to a draining instance before shutdown, and in-flight requests finish during the drain.
- Liveness does not depend on readiness, so a draining instance is not reported dead and restarted.

### Negative
- Observability has a maintenance cost: metric names, labels and buckets are an interface that tests must pin and changes must keep compatible.
- A second listener must be configured and kept unpublished.
- Drain lengthens every shutdown by `CALC_SHUTDOWN_DRAIN`, and the container stop grace period must cover drain plus shutdown (RF-OPS-06).
- Logs, not traces, are the correlation tool, so correlation across more services would need more than a request ID.

## Alternatives considered
- **Public metrics on the main listener** — it exposes internals to any visitor, mixes operational and product routes, and the edge would need exclusion rules, whereas the admin listener is never routed or published.
- **Raw-path labels** — arbitrary URLs and client input in label values give unbounded cardinality and violate RNF-SEC-02.
- **Liveness tied to readiness** — a draining or briefly unready instance would be killed and restarted, cutting the in-flight requests the drain exists to protect.
- **Distributed tracing without a current need** — there is one service with no downstreams and the request ID already correlates edge and service logs, so an SDK and a collector would add dependencies and configuration for no new information.
