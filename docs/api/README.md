# API reference

The contract of the Calculator API is the OpenAPI 3.1 document [`backend/api/openapi.yaml`](../../backend/api/openapi.yaml). The service embeds it and serves it at `GET /api/v1/openapi.yaml`; this folder explains how to render it as a browsable reference.

## Generate the reference page

```bash
make docs-api
```

The target runs Redocly's `build-docs` on the contract and writes a single self-contained page to `docs/api/index.html`, then checks that Git ignores the file. Open it in a browser:

```bash
xdg-open docs/api/index.html    # Linux; use `open` on macOS
```

The page is generated, so it is not committed: `.gitignore` lists `/docs/api/index.html`, and a clean clone has no such file until you run the target. Generation takes a few seconds.

### Prerequisites

- Node 24 and pnpm 10 (the Node version is the one `frontend/Dockerfile` builds with; pnpm comes from the `packageManager` field of `frontend/package.json` through corepack).
- The frontend dependencies, which include the pinned Redocly CLI: run `make bootstrap` once (it installs everything the project needs), or only `pnpm -C frontend install --frozen-lockfile`.

Redocly sends anonymous usage statistics unless told not to. The `docs:api` and `lint:api` scripts set `REDOCLY_TELEMETRY=off` and `REDOCLY_SUPPRESS_UPDATE_NOTICE=true`, so no data leaves the machine.

## Read the contract without generating anything

- From a running service (any topology): `curl -sS http://localhost:8080/api/v1/openapi.yaml`. The response is `application/yaml` with `Cache-Control: no-store`, and it is the same document that was compiled into the binary.
- From the file in the repository: [`backend/api/openapi.yaml`](../../backend/api/openapi.yaml).

## What the contract defines

| Part | Content |
|---|---|
| Operations | `GET /api/v1/operations` (the catalog of seven operations in display order) and `POST /api/v1/operations/{operation}` with `{"operands":[…]}` |
| System | `GET /api/v1/openapi.yaml`, `GET /healthz` (liveness), `GET /readyz` (readiness, 503 while draining) |
| Numbers | Every operand and result is a decimal **string** in JSON-number syntax (at most 128 characters, 34 significant digits); `inexact: true` reports a rounded result |
| Errors | RFC 9457 problem details (`application/problem+json`) with a stable `code` from the `ProblemCode` enum, the `requestId` that equals the `X-Request-ID` header, and `errors[]` for validation failures; 400 means the request is invalid, 422 means the mathematics has no representable answer |
| Edge-only problems | `RATE_LIMITED` (429) and `SERVICE_UNAVAILABLE` (503) are emitted by the nginx edge of the split topology, never by the service alone |

The [README](../../README.md#api-usage) has copyable `curl` examples for every operation and the main errors, and the full problem catalog.

## Keep the contract healthy

| Command | What it does |
|---|---|
| `make lint` | Includes the Redocly lint of the contract with the rules of [`redocly.yaml`](../../redocly.yaml) (`recommended` plus `operation-4xx-response`, `no-unused-components` and `info-license-strict` as errors, `security-defined` off because the API is public) |
| `make gen` | Regenerates `frontend/src/shared/api/schema.gen.ts` from the contract; the file is committed and regenerating it must produce no diff |
| `go test ./internal/httpapi/` (from `backend/`) | Contract tests: every handler response is validated against the embedded document, the catalog equals the `OperationName` enum, and the codes the service emits are a subset of `ProblemCode` |

The contract belongs to the provider: change `backend/api/openapi.yaml` first, then regenerate the types, then the code.
