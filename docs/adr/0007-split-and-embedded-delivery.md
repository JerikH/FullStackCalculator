# ADR-0007: Split and embedded delivery

- **Status:** Accepted
- **Date:** 2026-10-22

## Context

The [requirements](../spec/srs.md) ask for two things that pull in different directions. The web app and the API must be deployable and released independently, as separate images and services (RF-OPS-04, RF-OPS-05, RF-OPS-06), and the whole product must also run from one container with one command (RF-OPS-07).

- Every topology is same-origin, so CORS is out of scope (see «Scope» in the requirements).
- The browser security policy (RNF-SEC-03), caching and rate limiting each need exactly one owner, otherwise headers are duplicated or contradictory.
- Containers are hardened: non-root, read-only root filesystem, all capabilities dropped, `no-new-privileges`, and the admin port never published (RNF-SEC-04).

The decision is how to package one codebase into those two shapes without duplicating behaviour more than necessary.

## Decision

Two topologies are built from one codebase: a split stack of two services, and an all-in-one image.

**Split** (`compose.yaml`, services `api` and `web`, RF-OPS-06):
- `calculator-web` is nginx-unprivileged on alpine, listening on port 8080 as a non-root user. It serves the built app: `index.html`, `/theme-init.js` and static files with `no-cache`, and hashed `/assets/*` with `public, max-age=31536000, immutable`.
- It proxies `/api/*`, `/healthz` and `/readyz` unchanged to `API_UPSTREAM` (default `api:8081`), answers `/nginx-health` itself, and never routes metrics or pprof.
- It owns the browser policy with one value per header and the upstream copies hidden, gzips text types, rate-limits API locations at 20 r/s with burst 40 per client address, propagates a validated `X-Request-ID`, and emits the edge problems 429, 503 and 413 (RF-OPS-04).
- `calculator-api` is distroless static nonroot, listens on `:8081` and `:9091`, and uses `["/calculator","healthcheck"]` as its healthcheck (RF-OPS-05).
- Only `web` is published (`8080:8080`), healthchecks gate startup, and both services run with `read_only`, `cap_drop: [ALL]` and `no-new-privileges`.

**Embedded** (root `Dockerfile`, image `calculator`, RF-OPS-07):
- One Go binary built with `-tags embedui` embeds the built app through `backend/internal/web`, listens on `:8080` (`CALC_HTTP_ADDR=:8080`) and serves the same app, API, browser policy and cache headers from one port.
- Without the build tag the binary serves the API only.

Header ownership is explicit: the service sets its own headers when it is reached directly, and behind the edge the edge owns them (RF-API-08).

## Consequences

### Positive
- The split topology shows the production shape: independent images, edge concerns (rate limit, compression, caching, browser policy) outside the application, and the admin port never published.
- The embedded image gives a one-command demo (`docker run -p 8080:8080 calculator:local`) that also runs read-only with all capabilities dropped.
- Same-origin everywhere means there is no CORS surface to configure or audit.
- The same frontend build and the same API code run in both topologies, so behaviour is not forked.

### Negative
- Two delivery paths must be built, tested and documented: the composed-stack end-to-end suite (RF-OPS-10) and `scripts/smoke-aio.sh` for the all-in-one image.
- The browser policy and cache rules exist twice, in the nginx configuration and in the Go web handler, and both copies must be asserted by tests.
- The embedded handler is specified for the app, the API, the browser policy and cache headers only, so the all-in-one image has no edge rate limiting or edge problems.
- An all-in-one deployment that needs a rate limit must put an edge in front of it, because the limit lives in the edge; the limit itself is per edge instance, because distributed rate limiting is a design exclusion in the requirements.
- The build-tag split means the embed path must be exercised explicitly, since a default build never compiles it in.

## Alternatives considered
- **Only split** — there would be no single-container delivery, so trying the product would require Compose and two images.
- **Only embedded** — web and API could not be deployed or released independently, and rate limiting, compression and edge problems would move into the Go service.
- **Multiple supervised processes in one container** — nginx plus the Go binary under a process supervisor needs an init system, mixes two processes' signals, logs and health in one container, enlarges the image, and loses one process per container.
