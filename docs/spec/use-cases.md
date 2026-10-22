# Use cases — FullStackCalculator

**Version:** 1.0 · **Date:** 2026-10-22 · **Requirements:** `docs/spec/srs.md`

## 0. Notation and conventions

### 0.1 Actors
Visitor, API client, Operator, Reviewer, Developer, Automation (as defined in `srs.md`, Actors), plus `System` (the Go service, the edge or the web app acting on its own).

### 0.2 Format of each use case
Primary actor; secondary actors; relation; references (RFs); precondition; postcondition (success); a numbered Actor/System flow; extensions `E<n> (step k): condition → behavior`; acceptance — the observable checks that make it ✅.

### 0.3 Relations between use cases
- **«includes»**: the base case always executes the included case.
- **«extends»**: the extending case adds behavior under a condition; the base case is complete without it.
- A case with no declared relation is autonomous.

### 0.4 Detail level by milestone
Every case is complete: M0, M1 and M2 cases carry their full flow, extensions and acceptance. A case marked `Status: outline` would be completed at the transition to its milestone.

---

## 1. Module OPS — Repository, environments and delivery

### UC-OPS-01 — Work in an isolated per-agent environment (withdrawn)

This use case described the per-agent environment (`scripts/ci/env.sh`) and the local tiers `t0.sh` to `t2.sh` of the development workflow. They are no longer part of the tree and remain in the git history. The CI entry point `scripts/ci/t3.sh` stays (RF-OPS-03).

### UC-OPS-02 — Run the split stack
**Primary actor:** Reviewer
**Secondary actors:** Visitor (uses the app in a browser), Operator (reads the probes and the container state), System (Docker Compose, the edge, the service)
**Relation:** none
**References:** RF-OPS-04, RF-OPS-05, RF-OPS-06, RF-OPS-08, RF-OBS-03, RF-OBS-04, RF-OBS-05, RNF-SEC-01, RNF-SEC-03, RNF-SEC-04
**Precondition:** Docker and Docker Compose are installed, the repository is checked out, the host port `WEB_PORT` (default 8080) is free, and the base images can be pulled on the first build.
**Postcondition (success):** the calculator is served at `http://localhost:8080` by the edge in front of the service, both containers are healthy, only the web port is published, and after `make down` no container or network of the project remains.

| # | Actor | System |
|---|---|---|
| 1 | Runs `docker compose up --build --wait` (or `make up`). | |
| 2 | | Builds `calculator-api:local` and `calculator-web:local`, starts `api`, waits until it is healthy, then starts `web` (`depends_on: api: service_healthy`); returns 0 when both report healthy. |
| 3 | Opens `http://localhost:8080` in a browser. | |
| 4 | | The edge serves `index.html` and `/theme-init.js` with `no-cache`, hashed `/assets/*` as `public, max-age=31536000, immutable`, and every response carries the browser policy of RNF-SEC-03 once per header and one `X-Request-ID`. |
| 5 | Calculates `0.1 + 0.2 =` in the app. | |
| 6 | | The browser posts `/api/v1/operations/add` to the same origin; the edge proxies it to `api:8081` unchanged; the display shows `0.3`. |
| 7 | Requests `GET /healthz` and `GET /readyz` through the edge and runs `docker compose ps`. | |
| 8 | | `/healthz` answers 200 `ok` with version and commit, `/readyz` 200 `ready`; `ps` shows `api` and `web` healthy with only `web` publishing `8080`; the admin port `9091` is published nowhere. |
| 9 | Stops the `api` container alone (`docker stop` of its ID; `web` stays up). | |
| 10 | | `api` flips readiness to 503 `draining` for `CALC_SHUTDOWN_DRAIN` (2 s), then shuts down inside the stop grace period (at least 20 s: drain plus the 15 s shutdown timeout plus margin) and exits 0. |
| 11 | Starts `api` again and runs `make down` (or `docker compose down`). | |
| 12 | | `api` is healthy again, `web` serves through it, and `down` removes the containers and the network. |

**Extensions:**
- E1 (step 1): the host port is busy → Compose fails to bind it; `WEB_PORT=<free port>` (documented in `.env.example`) serves the app on that port with no other change.
- E2 (step 2): `api` never becomes healthy → `--wait` exits non-zero naming the service and `web` is not started.
- E3 (after step 10): the `api` container is stopped or unreachable → `/api/*`, `/healthz` and `/readyz` answer the edge's 503 `SERVICE_UNAVAILABLE` problem (valid against the contract's `Problem`, `X-Request-ID` equal in header and body) while `/` and `/nginx-health` still answer 200.
- E4 (step 6): the `api` container is recreated and gets a new address → `web` restarts through `depends_on: api: restart: true` and `/api/v1/operations` through the edge answers 200 again without manual action.
- E5 (step 6): one client address exceeds 20 requests per second (burst 40) or holds more than 20 concurrent connections on `/api/` → the edge answers the 429 `RATE_LIMITED` problem; static files and the probes keep answering.
- E6 (step 6): a body above 1 MiB → the edge's 413 `PAYLOAD_TOO_LARGE` problem; a body between 4 KiB and 1 MiB reaches the service, whose own 413 passes through unchanged; a probe request with a body above 16 KiB is refused with the 413 problem.
- E7 (step 6): a request carries a valid `X-Request-ID` (up to 128 characters of `A-Za-z0-9._-`) → the same ID is in the response header, any problem body and the service's access-log line; an invalid ID (space, `<script>`, 129 characters) is replaced by a generated one before it reaches the service.
- E8 (step 10): `/readyz` is requested through the edge during the 2 s drain → the service's draining Health JSON 503 passes through unchanged (not an edge problem) and its access-log line is at `info`; afterwards the edge answers the 503 `SERVICE_UNAVAILABLE` problem (E3) and the exit code of the `api` container is 0.

**Acceptance:** `docker compose up --build --wait` returns 0 with both services healthy; `docker compose config` shows only `web` publishing a port, and for both services `read_only: true`, `cap_drop: [ALL]`, `no-new-privileges`, for `web` a size-capped tmpfs `/tmp` and a tmpfs `/etc/nginx/conf.d`, and for `api` `CALC_SHUTDOWN_DRAIN=2s` with a stop grace period of at least 20 s; steps 3–12 and E3–E8 are asserted against the running stack in a real browser and with HTTP calls (OPS-E2E-01), E4 by recreating `api` in the running stack; E1 by starting a second project on another `WEB_PORT`; E2 by the `depends_on` condition in `docker compose config` (the failing bring-up is left to CI); the API image's layer sum is under 20 MB (the reading the owner fixes) and it passes the hardened image smoke (OPS-IMAGE-01, CI `images` job).

### UC-OPS-03 — Run the all-in-one container
**Primary actor:** Reviewer
**Secondary actors:** Visitor (uses the app in a browser), System (Docker, the Go binary with the embedded app)
**Relation:** none
**References:** RF-OPS-07, RF-OPS-08, RF-OBS-04, RF-API-08, RNF-SEC-03, RNF-SEC-04
**Precondition:** Docker is installed, the repository is checked out and host port 8080 is free (the split stack of UC-OPS-02 is not running on it).
**Postcondition (success):** one container serves the same app, API, browser policy and cache headers on `http://localhost:8080`; after it is stopped the hardened run (`make run-aio`) leaves no container behind.

| # | Actor | System |
|---|---|---|
| 1 | Runs `make image-aio` (or `docker build -t calculator:local .`). | |
| 2 | | Builds the frontend in a build stage, copies its `dist/` into `backend/internal/web/dist/`, fails the build if `index.html` or `theme-init.js` is missing there, compiles the service with `-tags embedui` and the `VERSION`/`COMMIT` build arguments, and produces a distroless nonroot image with `CALC_HTTP_ADDR=:8080`. |
| 3 | Runs `docker run -p 8080:8080 calculator:local`, or `make run-aio` for the hardened run (`--read-only`, `--cap-drop ALL`, `--security-opt no-new-privileges`). | |
| 4 | | The service starts, logs its startup line, and the container becomes healthy through `["/calculator","healthcheck"]`. |
| 5 | Opens `http://localhost:8080` and calculates `0.1 + 0.2 =`. | |
| 6 | | `/` is `index.html` with the browser policy of RNF-SEC-03 once per header and `no-cache`; hashed `/assets/*` is immutable; the POST to `/api/v1/operations/add` answers 200 `0.3` and the display shows it. |
| 7 | Stops the container (`docker stop`). | |
| 8 | | The service drains and exits 0; a container started with `--rm` (as `make run-aio` does) is removed. |

**Extensions:**
- E1 (step 3): host port 8080 is busy → `docker run` fails to bind; `-p <free port>:8080` serves the app on that port.
- E2 (step 6): a missing app file, a directory (`/assets/`) or a dotfile → the 404 `NOT_FOUND` problem; never a listing, a redirect or an HTML fallback; any other method on an unknown path → 405 with `Allow: GET, HEAD`.
- E3 (step 6): `HEAD`, `Range` or `If-None-Match` on an app file → 200 without body, 206 or 304 with the strong `ETag` and the same cache policy.
- E4 (step 6): API responses and probes carry the API header set of RF-API-08 (`no-store`, `nosniff`, `default-src 'none'`) and not the browser policy; problem bodies are identical to the API-only image's.
- E5 (step 6): the all-in-one container does not compress the bundle (compression is the edge's job); this is a documented trade-off, not a defect.
- E6 (step 3): the hardened run → the container starts and is healthy with nothing writable.
- E7 (step 2): the build stage's `dist/` lacks `index.html` or `theme-init.js` → `docker build` fails instead of producing an image that answers NOT_FOUND on every app path.

**Acceptance:** `make image-aio` produces `calculator:local`; `make smoke-aio` (curl, `scripts/smoke-aio.sh`) starts the hardened container and asserts: healthy, HTML with each of the five RNF-SEC-03 headers once and equal to the edge's, `no-cache` on the root files, immutable hashed assets with the right MIME type, a valid POST (`0.1 + 0.2` → `0.3`) and a problem response, E2, E3 and E4; the image size is recorded as layers, compressed content and `docker images` listing; E7 is checked once with a deliberately empty `dist/`.

---

## 2. Module API — HTTP API and contract

### UC-API-01 — Discover the operations and the contract
**Primary actor:** API client
**Secondary actors:** none
**Relation:** none
**References:** RF-API-01, RF-API-02, RF-API-07, RF-API-08, RF-CALC-01
**Precondition:** the service is running and ready.
**Postcondition (success):** the client holds the catalog in display order and the OpenAPI document; nothing changes on the server.

| # | Actor | System |
|---|---|---|
| 1 | Sends `GET /api/v1/operations`. | |
| 2 | | Returns 200 `OperationCatalog` with the seven operations in catalog order, `X-Request-ID`, `Cache-Control: no-store`, `nosniff` and the API security headers. |
| 3 | Sends `GET /api/v1/openapi.yaml`. | |
| 4 | | Returns 200 `application/yaml`, byte-identical to `backend/api/openapi.yaml`, with `Cache-Control: no-store`. |

**Extensions:**
- E1 (steps 1, 3): wrong method (e.g. `POST /api/v1/operations`) → 405 `METHOD_NOT_ALLOWED` with `Allow: GET` and detail `POST is not allowed; use GET`.
- E2 (steps 1, 3): unknown path under `/api/` → 404 `NOT_FOUND`, detail `no route matches the request method and path`, problem+json.
- E3 (steps 1, 3): inbound `X-Request-ID` valid → echoed unchanged; invalid (space, `<script>`, > 128 chars) → replaced by a generated ID.

**Acceptance:** the catalog equals the contract's `OperationName` enum in the same order (contract test); every response validates against the contract; the served YAML equals the embedded file and carries `no-store` (regression test); E1–E3 asserted by transport tests.

### UC-API-02 — Apply an operation through the API
**Primary actor:** API client
**Secondary actors:** Operator (logs and metrics record the request)
**Relation:** none
**References:** RF-API-03, RF-API-04, RF-API-05, RF-API-06, RF-API-07, RF-API-08, RF-API-11, RF-API-12, RF-CALC-02…RF-CALC-10, RNF-SEC-01, RNF-SEC-02
**Precondition:** the service is running and ready.
**Postcondition (success):** the client receives the canonical result and the exactness flag; one access-log line and one `calculator_operations_total{operation,outcome="ok"}` increment exist for the request.

| # | Actor | System |
|---|---|---|
| 1 | Sends `POST /api/v1/operations/divide`, `Content-Type: application/json`, body `{"operands":["1","3"]}`. | |
| 2 | | Checks the operation is in the catalog before reading the body. |
| 3 | | Checks the media type, reads at most 4096 bytes, decodes exactly one object with no unknown fields. |
| 4 | | Validates `operands` (presence, type, arity, each operand), collecting every invalid operand. |
| 5 | | Computes with 34 digits, half-even, and formats the result canonically. |
| 6 | | Returns 200 `{"operation":"divide","operands":["1","3"],"result":"0.3333333333333333333333333333333333","inexact":true}` with `X-Request-ID`, `no-store`, `nosniff`. |

**Extensions:**
- E1 (step 2): operation not in the catalog (`modulo`) → 404 `UNKNOWN_OPERATION`, detail `operation "modulo" is not supported; see GET /api/v1/operations`, body never read.
- E2 (step 1): wrong method on the path → 405 `METHOD_NOT_ALLOWED`, `Allow: POST`.
- E3 (step 3): media type not `application/json` (or missing) → 415 `UNSUPPORTED_MEDIA_TYPE`; `application/json; charset=utf-8` is accepted.
- E4 (step 3): body over 4096 bytes → 413 `PAYLOAD_TOO_LARGE`, `request body must not exceed 4096 bytes`.
- E5 (step 3): empty body, invalid JSON, a top-level array, an unknown field or trailing data → 400 `MALFORMED_REQUEST` with the specific detail; a repeated `operands` key is decoded with the last occurrence.
- E6 (step 4): `operands` missing/null → 400 `VALIDATION_FAILED`, `errors:[{field:"operands",reason:"is required"}]`; numbers instead of strings → reason `must be an array of decimal strings, e.g. ["2", "3"]`.
- E7 (step 4): wrong count (`sqrt` with 2) → 400 `VALIDATION_FAILED`, detail `sqrt takes exactly 1 operand, got 2`.
- E8 (step 4): invalid operands (`["abc","1e99999"]`) → 400 `VALIDATION_FAILED`, detail `one or more operands are invalid`, one entry per operand (`operands[0]` syntax, `operands[1]` range); raw values are not reflected.
- E9 (step 5): divisor zero, including 0÷0 → 422 `DIVISION_BY_ZERO`; zero to a negative power → 422 `DIVISION_BY_ZERO` (`zero cannot be raised to a negative power`).
- E10 (step 5): `sqrt` of a negative number or negative base with non-integer exponent → 422 `UNDEFINED_RESULT` with the matching detail.
- E11 (step 5): result beyond the exponent range (`2 ^ 1e30`, `1e6144 × 10`) → 422 `OVERFLOW`.
- E12 (step 5): result exactly representable (`0.1 + 0.2`, `√16`, `0^0`) → `inexact:false` with `0.3`, `4`, `1`; underflow to zero → `"0"` with `inexact:true`.
- E13 (steps 2–6): a panic → 500 `INTERNAL_ERROR`, detail `an unexpected error occurred`, logged with `request_id` and stack.
- E14 (step 5): the request context is already cancelled when the calculation starts (client gone) → the calculation returns the cancellation error and is counted with outcome `canceled`.

**Acceptance:** the transport table covers E1–E14 with exact status, code, detail, `errors[]` and headers; every response validates against the contract; the domain table covers every operation × edge case of RF-CALC-05…09; fuzzing finds no unclassified error; benchmarks stay under 1 ms/op.

---

## 3. Module OBS — Service runtime and observability

### UC-OBS-01 — Run, observe and drain the service
**Primary actor:** Operator
**Secondary actors:** System (process signals), any Prometheus-compatible scraper
**Relation:** none
**References:** RF-OBS-01…RF-OBS-09
**Precondition:** the binary or the API image is available.
**Postcondition (success):** the service served traffic, exposed its probes, logs and metrics, and shut down without dropping in-flight requests.

| # | Actor | System |
|---|---|---|
| 1 | Starts the service with `CALC_*` variables (or none). | |
| 2 | | Validates the configuration, binds the public and admin listeners, logs startup. |
| 3 | Probes `GET /healthz` and `GET /readyz`; runs `calculator healthcheck`. | |
| 4 | | Returns `ok` with version and commit, `ready`; the subcommand exits 0. |
| 5 | Scrapes `GET :9091/metrics` after some requests. | |
| 6 | | Returns the five metric families with bounded labels and the access log has one line per request with `request_id`. |
| 7 | Sends SIGTERM. | |
| 8 | | Readiness answers 503 `draining`; after `CALC_SHUTDOWN_DRAIN` both listeners shut down within `CALC_SHUTDOWN_TIMEOUT`; exit 0. |

**Extensions:**
- E1 (step 2): one or more invalid variables (e.g. `CALC_LOG_LEVEL=loud`, `CALC_SHUTDOWN_TIMEOUT=0s`) → every problem reported in one message on stderr, exit non-zero.
- E2 (step 2): a listener cannot bind (port in use) → error logged, exit non-zero without waiting.
- E3 (step 2): `CALC_ADMIN_ADDR=""` → no admin listener.
- E4 (step 5): `CALC_PPROF=true` → `/debug/pprof/` served on the admin listener; otherwise 404; never on the public listener.
- E5 (step 3): the service is down → `calculator healthcheck` exits 1 within ~2 s.
- E6 (step 6): a request with an unknown method or operation name → labelled `OTHER` / `unknown`, no new series per input.
- E7 (step 6): a 5xx response → its access-log line is at `error` level.

**Acceptance:** lifecycle tests start the app on `:0`, assert health/ready, drain → 503 then shutdown, healthcheck exit codes and the aggregated configuration error; metrics tests compare exposition text; logger tests assert `request_id` and the access-log fields.

---

## 4. Module UI — Calculator web app

### UC-UI-01 — Calculate with the keypad, keyboard or touch
**Primary actor:** Visitor
**Secondary actors:** System (Go service through the API)
**Relation:** «includes» UC-UI-02 (entering an operand)
**References:** RF-UI-01, RF-UI-02, RF-UI-04, RF-UI-05, RF-UI-06, RF-UI-07, RF-UI-08, RF-UI-09, RF-UI-12, RF-UI-13, RNF-A11Y-01
**Precondition:** the app is loaded; display `0`; no request pending.
**Postcondition (success):** the display shows the server's result (with `≈` when inexact) and one history entry exists for each successful request.

| # | Actor | System |
|---|---|---|
| 1 | Enters `12` (UC-UI-02) and presses `×` (button, `*` key or tap). | |
| 2 | | Stores `12` as the left operand; the secondary line shows `12 ×`; the next digit replaces the entry. |
| 3 | Enters `3` and presses `=` (or Enter). | |
| 4 | | Sends `POST /api/v1/operations/multiply` with `["12","3"]`; dims the value; shows a spinner if the response takes more than 150 ms. |
| 5 | | On success shows `36`, clears the pending expression, prepends `12 × 3 = 36` to history and persists it. |
| 6 | Presses `√` with `16` entered. | |
| 7 | | Sends `sqrt ["16"]`, shows `4` and keeps any pending binary operator. |

**Extensions:**
- E1 (step 3): a second binary operator after typing (`2 + 3 ×`) → issues `add ["2","3"]`, shows `5` and keeps `×` pending (`… 4 =` → 20).
- E2 (step 1): an operator pressed right after another (`2 + ×`) → replaces the pending operator, no request.
- E3 (step 3): `=` with a pending operator and no new entry (`5 + =`) → issues `add ["5","5"]`.
- E4 (step 3): `=` with no pending operator → nothing happens.
- E5 (step 4): any key other than AC while busy → ignored; AC → aborts the request, resets the display, keeps history; a late response of the aborted request (even with a reused request number) never changes the display or history.
- E6 (step 5): the server answers a problem → the exact message of RF-UI-08 replaces the value in a `role="alert"` region with `Ref: <requestId>`; no history entry; digit, decimal or history recall start fresh; C/AC clear the error.
- E7 (step 4): network failure / timeout after 8 s / unexpected response → `Calculator service is unreachable` / `Calculator service timed out` / `Something went wrong`.
- E8 (step 5): inexact result (`1 ÷ 3`) → full 34-digit value with `≈` and the explanation `Rounded to 34 significant digits`.
- E9 (step 1): keyboard focus is on a keypad button and Enter/Space is pressed → native activation fires that button once and does not also evaluate `=`; a mouse click never moves focus, so a following Enter evaluates.
- E10 (any): Ctrl/Meta/Alt held, IME composition, or focus in an editable element → the key is not handled.

**Acceptance:** for each of the seven operations, the browser sends the exact operand strings and shows the server's result; E1–E10 pass in component tests with an injected fake API, and the main flow plus E5/E6/E8 pass in a real browser against the real Go service; axe has zero violations in initial and error states in both themes; at 320 px there is no horizontal scroll and every key is ≥ 48 px; no arithmetic primitive appears in the frontend code.

### UC-UI-02 — Edit and clear the entry
**Primary actor:** Visitor
**Secondary actors:** none
**Relation:** included by UC-UI-01
**References:** RF-UI-03, RF-UI-04
**Precondition:** no request pending.
**Postcondition (success):** the entry text is what the editing rules produce; no request was sent.

| # | Actor | System |
|---|---|---|
| 1 | Types digits, `.`, `±`, ⌫. | |
| 2 | | Updates the entry text with the string rules (leading zero replaced, one decimal point, sign toggle, backspace to `0`). |
| 3 | Presses C. | |
| 4 | | Resets only the entry to `0`; a pending operator and left operand stay (`9 + 12 C 3 =` → `add ["9","3"]`). |
| 5 | Presses AC. | |
| 6 | | Resets everything except history. |

**Extensions:**
- E1 (step 2): the entry already has 34 digit characters → further digits are ignored.
- E2 (step 2): the entry is a fresh result → a digit replaces it, `.` gives `0.`, ⌫ does nothing, ± toggles the sign (scientific results included) and keeps `≈`.
- E3 (step 2): ± on `0` → no change; ⌫ on `-5` → `0`.
- E4 (step 2): `12.` becomes an operand → sent as `"12"`.

**Acceptance:** the entry-editing table and every reducer transition and guard have named unit tests with frozen state; C vs AC and the digit cap pass in the real browser.

### UC-UI-03 — Reuse a result from history
**Primary actor:** Visitor
**Secondary actors:** none
**Relation:** «extends» UC-UI-01 (after at least one success)
**References:** RF-UI-10
**Precondition:** at least one successful calculation in this browser.
**Postcondition (success):** the recalled value is the entry in fresh mode; history is unchanged and persisted.

| # | Actor | System |
|---|---|---|
| 1 | Opens History (open by default at ≥ 768 px). | |
| 2 | | Lists entries newest first (`12 × 3 = 36`, `√16 = 4`, `50% = 0.5`), at most 20. |
| 3 | Selects `12 × 3 = 36, use result` (the row showing `12 × 3 = 36`). | |
| 4 | | Sets the entry to the raw result `36`, fresh, `≈` cleared; a pending operator stays (`9 + [36] =` → `add ["9","36"]`). |

**Extensions:**
- E1 (step 2): no entries → `No calculations yet`.
- E2 (step 2): a 21st success → the oldest entry is dropped.
- E3 (step 1): stored history is corrupt, oversized or of another version → empty history, the app works.
- E4 (any): storage is blocked or full → history works in memory; calculations are unaffected.
- E5 (step 3): Clear history → the list and the stored value are emptied; the current calculation is untouched; focus stays on a control that still exists.
- E6 (step 3): recall while in error → the error clears and the recalled value is shown; while busy → ignored.
- E7 (step 2): page reload → the same entries are shown.

**Acceptance:** codec tests cover every malformed input; hook tests cover blocked storage; the real browser shows history persisted across reload, recalled as a right operand, capped at 20 and cleared.

### UC-UI-04 — Choose the colour theme
**Primary actor:** Visitor
**Secondary actors:** System (operating-system colour preference)
**Relation:** none
**References:** RF-UI-11, RF-UI-13, RF-UI-14
**Precondition:** the app is loaded.
**Postcondition (success):** the chosen theme applies now and on the next load, before first paint.

| # | Actor | System |
|---|---|---|
| 1 | Selects `Dark` in the `Theme` radio group. | |
| 2 | | Sets `data-theme="dark"` on `<html>` and stores `dark`. |
| 3 | Reloads the page. | |
| 4 | | `/theme-init.js` applies `dark` before the app renders; no flash; no CSP violation. |
| 5 | Selects `System`. | |
| 6 | | Removes the attribute; the OS preference governs. |

**Extensions:**
- E1 (step 4): stored value unknown or storage throws → system theme.
- E2 (step 1): `Light` while the OS prefers dark → light tokens apply.
- E3 (step 1): arrow keys inside the radio group → native selection; calculator shortcuts do not intercept.

**Acceptance:** `theme-init.js` itself is executed in tests for every stored value; the browser shows persistence across reload and explicit light under a dark OS preference; text contrast ≥ 4.5:1 in both themes.

---

## 5. Module DOC — Documentation

### UC-DOC-01 — Evaluate the project from the README
**Primary actor:** Reviewer
**Secondary actors:** Developer (follows the quick start), API client (copies the curl examples)
**Relation:** none
**References:** RF-DOC-01, RF-DOC-02, RF-DOC-03, RF-DOC-04
**Precondition:** the repository is available (a clone or a hosted page of its files); Docker or the Go and Node toolchains are available for the routes the reviewer tries.
**Postcondition (success):** the reviewer knows what the project is, has run it by at least one route, has called the API with the documented curl commands, and has found the design reasons, the measured quality numbers and the trade-offs — using only files of the repository.

| # | Actor | System |
|---|---|---|
| 1 | Opens `README.md`. | |
| 2 | | Shows the overview with a desktop and a mobile screenshot of the real app, then the features, in the order fixed by RF-DOC-01. |
| 3 | Follows the Quick start: the split stack, the all-in-one container or local development. | |
| 4 | | Each route works as UC-OPS-02, UC-OPS-03 or `make dev-backend` plus `make dev-frontend` describe; every command named exists. |
| 5 | Copies the curl examples of API usage (all seven operations and the main errors). | |
| 6 | | The responses equal the documented bodies; the problem catalog lists every code with its status and title. |
| 7 | Reads Architecture (both topology diagrams), the Design decisions table (the eight ADRs), Observability and CI/CD. | |
| 8 | Opens `docs/verification.md`. | |
| 9 | | Shows dated evidence: source revision, toolchain, commands, coverage totals, benchmark numbers and the local composed-stack run, matching the figures in the README. |
| 10 | Runs `make docs-api` as `docs/api/README.md` explains and opens the generated `docs/api/index.html`. | |
| 11 | | Redocly renders the contract; the file is git-ignored. |
| 12 | Reads Trade-offs & future work. | |

**Extensions:**
- E1 (step 3): a prerequisite is missing (Docker, Go, Node, pnpm) → the Quick start lists the prerequisites and `make bootstrap` installs the pinned tools and stops naming what is missing.
- E2 (step 5): an error example (division by zero 422, validation 400, unknown operation 404) → the documented status and Problem body, including the `requestId` that equals `X-Request-ID`.
- E3 (step 9): code changed after the measured revision → `docs/verification.md` states the revision each figure was measured at and the README repeats only figures that equal it.
- E4 (step 10): `docs/api/index.html` does not exist yet → the README links `docs/api/README.md`, not the generated file.
- E5 (any): a link points to a path that is not a committed file → defect; no link may point to an untracked or generated file or to something the repository does not build.
- E6 (step 12): the edge rate limit and connection limit key on the address nginx sees → the trade-offs say that behind Docker's userland proxy all local clients share one budget; the all-in-one image sends the bundle uncompressed.

**Acceptance:** a link checker over `README.md`, `docs/api/README.md` and `docs/verification.md` resolves every relative link to a committed file; the README sections appear in the order of RF-DOC-01; every command in the README is checked against the repository (Make targets exist, ports and defaults equal `compose.yaml` and `.env.example`, the configuration table equals the variables the service and the edge read); the curl examples run against a running service and their outputs equal the documented ones; the problem catalog equals the contract's `ProblemCode` enum; the Design decisions table equals the ADR index; the numbers equal `docs/verification.md`; the two screenshots are PNG files taken from the running app (checked by dimensions and by being produced by the recorded command).
