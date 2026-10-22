# ADR-0001: Monorepo with independently deployable services

- **Status:** Accepted
- **Date:** 2026-10-22

## Context

FullStackCalculator is a React + TypeScript web app and a Go REST service that share one API contract (RF-API-01); the [requirements](../spec/srs.md) describe them under «Purpose» as two parts of one product. Five forces shape how the code is organised.

- The two parts consume and provide the same contract, and the requirements demand that generated types and handlers never drift from it (RF-API-09, RF-API-10, RNF-REL-01).
- The web app and the API must be deployable separately, as separate images and services: the web image is an edge serving static files and proxying the API, and the API image is a stand-alone service (RF-OPS-04, RF-OPS-05, RF-OPS-06).
- The whole product must also be available as a single container started with one command (RF-OPS-07).
- A reviewer evaluates one repository: reads it, runs the stack, calls the API and inspects tests and ADRs (the Reviewer actor in the «Actors» table of the requirements).
- Developers need one entrypoint that drives both toolchains, so that generation, tests, images and the composed stack are started the same way on every machine (RF-OPS-08).

These forces pull in different directions: shared change history argues for one repository, while separate deployment argues for separate artifacts. The decision has to give both.

## Decision

We keep both services, the deployment assets and the documentation in one Git repository, and we build three independently runnable images from it.

- Layout: `backend/` holds the Go module `github.com/JerikH/FullStackCalculator/backend`, `frontend/` holds the pnpm package `calculator-web`, and `deploy/`, `scripts/` and `docs/` hold delivery files, tooling and records.
- Images: `calculator-api`, `calculator-web` and `calculator` (the all-in-one image) are all built with the repository root as the build context, so one `.dockerignore` governs every build (RF-OPS-01).
- Entrypoint: the root `Makefile` is the single entrypoint for generation, lint, tests, images, the composed stack and the end-to-end suite (RF-OPS-08).
- Contract ownership: the contract lives next to its provider in `backend/api/openapi.yaml`, and the frontend's generated types in `frontend/src/shared/api/schema.gen.ts` are committed (RF-API-10). A contract change, its handlers and the regenerated types therefore land in one commit. Details are in [ADR-0003](0003-provider-owned-openapi-contract.md).
- Topologies: the split compose stack and the all-in-one image are built from the same sources, so the two delivery paths never fork the code (RF-OPS-06, RF-OPS-07).
- Versioning: the API is versioned in the path (`/api/v1`), which gives the two images a stable seam between their release cycles.
- Automation: the CI definition has one job per area, `contract`, `backend`, `frontend`, `e2e`, `images` and `publish` (RF-OPS-11), and Dependabot entries are declared per directory (RF-OPS-13).

## Consequences

### Positive

- History stays coherent: the commit that changes a behaviour also carries the code, tests and documentation that describe it.
- A change that crosses the layers (a new field, a new error code, a new operation) is made and reviewed as one unit instead of as coordinated pull requests.
- Drift between the contract, the handlers and the generated frontend types is caught by the single CI definition and by the contract tests (RF-API-09, RF-API-10).
- A reviewer or developer has one clone and one set of commands, all reachable through the root `Makefile`.
- The per-area jobs of the CI definition point a failure at the layer that broke (contract, backend, frontend, end-to-end, images), even though the code shares a repository.
- The images stay independent at runtime: the web image never contains the API binary and the API image never contains the web build, so each can be deployed, released and replaced on its own.

### Negative

- The repository and its tooling cover two ecosystems: Go and Node toolchains, two lockfiles (`go.sum` and `pnpm-lock.yaml`) and two sets of pinned versions (RNF-OPS-01).
- The CI definition is coupled: every change would run every job unless the definition filters by path, so a documentation-only change can still pay for a full run.
- Independent deployment depends on discipline: the web image and the API image may be released at different times, so the contract must stay backward compatible within `/api/v1`.
- A contributor needs both toolchains and the pinned standalone tools installed before every command works, which raises the cost of a first contribution (RNF-OPS-01, RF-OPS-08).
- Building every image from the repository root needs a strict `.dockerignore`, otherwise unrelated files enter the build context and invalidate caches (RF-OPS-01).

## Alternatives considered

- **Separate repositories** — the contract would have to be published and versioned as a package or copied, a contract change would need coordinated pull requests across repositories, and version skew between generated types and handlers would be invisible to each repository's own CI.
- **One inseparable server-rendered application** — HTML rendered by the Go service from templates with no separate web build would ship every UI and API change as one release, the UI could not be cached and served by an edge of its own, and the React + TypeScript single-page app would be lost; the all-in-one image of [ADR-0007](0007-split-and-embedded-delivery.md) is different, because it packages the same two independently built sources into one binary while the split images remain.
