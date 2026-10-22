# RUN-M2-1 — Plan

Interfaces, rules, tests per rule, targeted checks and owned files. No function bodies. The spec of this folder is the source of the decisions; this plan orders the work and fixes the shapes the slices must share. Dispatch limits: at most 1 Codex job (`--model gpt-6.1-sol --effort medium`) plus 2 Claude subagents (Sonnet 5.5, high) at the same time; every slice has disjoint owned files; only the controller runs git and Docker.

## Slice order and owners

| # | Slice | Owner | Owned files | Depends on |
|---|---|---|---|---|
| A | Contract U18 | controller | `backend/api/openapi.yaml`, `frontend/src/shared/api/schema.gen.ts` | — |
| B | Edge U21 + extended smoke and mutations | Codex J1 | `deploy/nginx/default.conf.template`, `docs/state/runs/RUN-M2-1/evidence/edge/` (copies of `edge-smoke.sh`, `mutations.sh`, `stub-upstream.mjs`, `problem-check.py`, extended) | — |
| C | Gates and tools: `scripts/coverage.sh`, `scripts/bootstrap.sh`, `GOVULNCHECK_VERSION`, installer | Sonnet S1 | `scripts/coverage.sh`, `scripts/bootstrap.sh`, `tools/versions.env`, `scripts/ci/install-tools.sh`, `scripts/ci/testdata/` is NOT created (fixtures live in `docs/state/runs/RUN-M2-1/evidence/gates/`) | — |
| D | Stack files: `compose.yaml`, root `Dockerfile`, `Makefile`, `.env.example` | Codex J2 (after J1) | those four | C's CLI shape (fixed below), B merged |
| E | Playwright config + helpers (`fixture.ts`, `api.ts`, `compose.ts`) | controller | `frontend/playwright.config.ts`, `frontend/e2e/helpers/*` | — |
| F | Specs: operations, chaining, errors, editing, history | Sonnet S2 | those five `frontend/e2e/*.spec.ts` | E |
| G | Specs: theme, keyboard, accessibility, layout | Sonnet S3 | those four | E |
| H | Specs: headers, edge, stack-disruptive + `scripts/smoke-aio.sh` | Codex J3 (after J2) | those three + the script | E, D |
| I | Tier scripts: `lib.sh`, `t1.sh`, `t2.sh` | Sonnet S4 | the three scripts | D (target names fixed by the spec) |
| J | Records: `docs/verification.md`, context files, findings, closure | controller | docs | the run |

Review (step 8, double on OPS-STACK-01): reader 1 on slice B (nginx change and its mutation checks); reader 2 on slices D and I (compose, root Dockerfile, Makefile, tier wiring). Slices C, E–H single-reviewed by the controller with the checks below. Mutation checks listed per slice.

## Shapes shared between slices

- `scripts/coverage.sh` CLI: `coverage.sh backend` (runs and gates), `coverage.sh gate <profile>`, `coverage.sh bench <file>`; exit 0 pass, 1 gate failure, 2 usage; messages on stderr; `summary.txt` format `covered N`, `total N`, `percent X.XX`, one per line.
- Make variables used by other files: `WEB_PORT`, `COMPOSE_PROJECT_NAME`, `IMAGE_TAG`, `E2E_BASE_URL`, `E2E_ARGS`, `AIO_IMAGE`, `AIO_NAME`, `VERSION`, `COMMIT`. `scripts/smoke-aio.sh <image> <port> <name>`.
- Environment seen by Playwright: `E2E_BASE_URL`, `COMPOSE_PROJECT_NAME`, `IMAGE_TAG`, `E2E_STACK` (`1` only for the disruptive file).
- `fixture.ts` exports `test`, `expect`, `Calc`, `OPERATIONS_PATH`, `nextCalculation(page)`, `pace(page, ms)`; `test` has fixtures `calc` (`goto`, `key`, `press`, `enter`, `result`, `resultText`, `expression`, `alert`, `historySummary`, `historyRows`, `openHistory`), `requests` (`RecordedCall[]`: `operation`, `operands`, `status`, `requestId`, `responseRequestId`), `problems` (automatic: console errors, page errors, CSP violations, asserted empty in teardown) and option `allowConsole: RegExp[]` (`test.use`). `api.ts` exports `post(request, operation, body, headers?)`, `expectProblem(response, status, code)`, `headerValues(response, name)`, `EDGE_POLICY_HEADERS`, `EDGE_CSP`. `compose.ts` exports `requireStack`, `containerId(service)`, `inspect(service)`, `waitHealthy(service, ms)`, `stopApi`, `beginStopApi` (`{ id, exited }`), `startApi` (`up -d --no-build --no-recreate api`), `recreateApi`, `apiLogs(since)`; reading (`inspect`, `containerId`, `apiLogs`) works in every run, mutating functions need `E2E_STACK=1`; `E2E_COMPOSE_OVERRIDE` adds a second `-f` file (the mutation checks).
- Stage names of `t2.sh --stage`: `lint test coverage-backend coverage-frontend fuzz bench image-api image-web image-aio up e2e down smoke-aio docs-api`.

## Slice A — contract (controller)

Edit the two operations; run `make gen` is not available yet, so `pnpm -C frontend run gen:api` twice (second run no diff); `pnpm -C frontend run lint:api`; `pnpm -C frontend run typecheck`; `go test -race -count=1 ./api/ ./internal/httpapi/` (about 25 s). Test per rule: the existing contract test validates every service response against the amended document (must stay green and unchanged); the generated file changes only at the two operations' `responses` (diff read). Mutation: none (declarative).

## Slice B — edge (Codex J1)

The spec's «Edge (U21)» section, verbatim. Rules and tests (all in the evidence copies, run by the controller):
- R-LC1 `limit_conn` on `/api/` only: 20 held connections + the 21st → 429 problem, valid (the existing `problem-check.py` against the Problem schema), `X-Request-ID` equal in header and body, security headers once each; `/`, `/nginx-health`, `/healthz` answer meanwhile; after the sockets close, a request answers 200.
- R-LC2 probes: body of 16384 bytes accepted; 16385 bytes → 413 problem (with `Content-Length` and chunked); `/readyz` too.
- Mutations (new): `MLC` delete the `limit_conn` line → R-LC1 fails; `MPB` probe limit `16k`→`1m` → R-LC2 fails. Re-run existing: M5 (rate limit on probes) and the existing probe-body mutation (M10/M12 family only where they touch the changed locations). Every mutation helper asserts the pattern was found and `cmp`s afterwards (Findings of OPS-IMAGE-01 (h)).
- The copied `edge-smoke.sh` uses Node `24.22.1-alpine3.24@sha256:06d7adf3e0ef61a13f1d28682726366f97a15aa1888c934d3ecec86c33918b53` for the stub, finds its own files next to it, writes nothing outside `$T` and the containers it names.
- Does NOT touch: any other location, `proxy-api.conf`, `security-headers.conf`, the Dockerfile.

## Slice C — gates and tools (S1)

- `coverage.sh gate`: tests (as fixtures in `docs/state/runs/RUN-M2-1/evidence/gates/`): profile at exactly 90.00 % passes; 89.99 % (e.g. 8999/10000) fails; one block duplicated in two binaries with counts 0 and 5 counts once and covered; a different mode (`set`, `count`) fails; empty file, missing file, malformed line (non-numeric count) fail; unequal package sizes weighted by statements, not averaged; `percent` printed with two decimals, truncated not rounded up (89.996 → `89.99`).
- `coverage.sh bench`: sample sets (the value of a case is the median of its samples; a lone bad sample only warns): all cases under budget pass; a case whose median is 1,000,000 ns/op fails (999,999 passes); a worst case at 50,000,000 fails; two bad samples of three fail; a missing case fails; a non-numeric ns/op fails; names with `^`, `…`, `(`, `-` and the `-4` GOMAXPROCS suffix parse.
- `install-tools.sh govulncheck`: installs once, second call prints «already installed», `bin/govulncheck` is a relative link, `-version` reports the pin; a wrong pin version fails before linking; `GOFLAGS=-mod=mod` is set only for this call.
- `bootstrap.sh`: shellcheck clean; refuses (exit 1, names `pnpm`) when `pnpm` is not on `PATH`; idempotent; prints each step.
- Does NOT touch: the other install branches, `lib.sh`.

## Slice D — stack files (Codex J2)

The spec's compose, root Dockerfile and Makefile sections. Rules → checks:
- compose: `docker compose config --quiet`; the JSON assertion (spec table) — only `web` publishes `${WEB_PORT:-8080}:8080`; no admin port; no `container_name`; `read_only`, `cap_drop`, `no-new-privileges` both; web tmpfs `/tmp` `size=64m` and `/etc/nginx/conf.d`; api `CALC_SHUTDOWN_DRAIN=2s`; no `NGINX_ENVSUBST_FILTER` in compose (the image sets it); `stop_grace_period` api ≥ 20 s; `depends_on.api` `service_healthy` + `restart: true`; a `WEB_PORT=18081` override renders `18081:8080`.
- root `Dockerfile`: hadolint clean; stage names `web-build`, `go-build`, `runtime`; each builds alone with `--target`; E7 (scratch copy that copies an empty directory instead of the build stage's dist) fails on the assertion step at `--target go-build`; `.gitkeep` still present in the stage's `dist/`; `docker run` hardened: healthy, `0.1 + 0.2` → `0.3`.
- Makefile: `make help` lists exactly the 21 targets and nothing else; `t1.sh make:<each>` finds each; the make database of `make -pRrq` contains no other target that is not a file target (internal helper names would show up); recipes carry no `+`; targets with `$(MAKE)` are only `coverage` (documented).
- Does NOT touch: `scripts/`, `frontend/`, `backend/`, `deploy/`.

## Slice E — Playwright config and helpers (controller)

Spec section «OPS-E2E-01». Checks: `playwright test --list` lists both projects and (after F–H) every group; `tsc` over `frontend/e2e` (a `tsconfig` include or a dedicated `frontend/e2e/tsconfig.json` extending `tsconfig.node.json`-style settings, whichever lets `pnpm -C frontend run typecheck` cover it without changing `frontend/package.json`); ESLint and Prettier clean on the new files; the fixture fails a deliberately broken test (console.error) — proven once against Vite-free `about:blank` page evaluation in the R0 piece.

## Slices F, G, H — specs

Each spec file: starts from the archived ad hoc specs where one exists; uses only `fixture.ts`/`api.ts`/`compose.ts`; roles/labels, no `waitForTimeout`; paced API loops; names of U28/U34. Test list per file (one bullet = one test at least):
- `operations`: seven operations through the keypad on the real POST: `0.1 + 0.2` → `0.3`; `5 − 7.5` → `−2.5` (body `-2.5`); `−3 × 4` → `−12`; `10 ÷ 4` → `2.5`; `1 ÷ 3` inexact marker; `2 xʸ 10` → `1,024`; `16 √` → `4`, `2 √` inexact; `50 %` → `0.5`; direct HTTP (labelled): exponent syntax, invalid operand, overflow, `0⁰`, negative fractional power, wrong method 405 with `Allow`, unknown route problem JSON.
- `chaining`: `2 + 3 × 4 =` → 20 (two requests); `5 + =` → add `['5','5']` → 10; `2 + × 3 =` → one multiply → 6.
- `errors`: divide by zero and sqrt of a negative: message and `Ref` equals the response `X-Request-ID`; recovery by typing; 400/413/415 direct.
- `editing`: C vs AC, sign toggle, duplicate decimal suppressed, 34-digit cap, backspace.
- `history`: survives reload, newest first, cap 20 (paced), recall as right operand through the row name `<expression>, use result`, clear and reload stays empty, corrupt storage ignored; mobile: focus moved off the summary before recall.
- `theme`: System, Light, Dark, Light chosen under a dark OS, persistence across reload, switch back to System, bootstrap before React with the app module blocked (`page.route` abort of the entry script), zero CSP violations.
- `keyboard`: typing, Enter/Space on a focused key, pointer click then Enter, Escape/Backspace/Delete, modifier guards, editable-element and `<summary>` guards, radios.
- `accessibility`: axe (tags wcag2a wcag2aa wcag21a wcag21aa wcag22aa best-practice; the rule `label-content-name-mismatch` is tagged wcag21a and each test asserts its id is in `passes` or `incomplete`) on initial, history-open and error states in both themes, both projects: zero violations; names `AC, all clear`, `xʸ, power`.
- `layout`: widths 320, 393, 768, 1280: `scrollWidth <= clientWidth`; keys ≥ 48 px; visible focus ring; contrast ≥ 4.5:1 (computed from `getComputedStyle` in the page, no arithmetic in the application); reduced motion removes transitions.
- `headers`: HTML, assets, API and error responses carry the five headers once, CSP exact; `Cache-Control` per class; multiplicity read from raw header lists (`response.headersArray()`).
- `edge`, `stack-disruptive`: spec section «OPS-E2E-01».
Mutation checks (R4, controller, `heavy` lease without `--wait` for each web recreate): MH1 a mutated `security-headers.conf` without `Referrer-Policy` mounted over the web container → `headers` fails; MH2 a mutated `default.conf.template` without `limit_conn` → the held-connection test of `stack-disruptive` fails; MH3 a scratch compose override with `depends_on.api.restart: false` (passed to Playwright as `E2E_COMPOSE_OVERRIDE`, so the test's own `recreateApi()` uses it) → the recreate test fails; MH4 a mutated `security-headers.conf` without the `X-Request-ID` line → `errors` fails on `Ref`. Each mutation ends with a restore step (recreate web without the override) and one green re-run of the same spec file. None mutates the working tree: the nginx files are mounted from mutated copies in the run's scratch directory over the `web` container through a scratch compose override file (`docker compose -f compose.yaml -f <override> up -d web`), `restart: true` is turned off by the same override, and the override is removed afterwards; `cmp` proves the repository files unchanged.
Does NOT touch: `frontend/src/**`, `frontend/package.json`, anything the other slices own.

## Slice I — tier scripts (S4)

The spec's «Tier scripts» section. Tests: a throwaway scenario script in `docs/state/runs/RUN-M2-1/evidence/tiers/` stubbing `make` and `docker` on `PATH` with shims that log the call: `t2.sh --stage lint --stage up` calls `timeout 600 make lint` then `make up` in the order given; `--stage nope` exits 2 and runs nothing; no `--stage` runs the affected checks and the Makefile check and never calls `make up`, `make e2e`, `docker compose`; a Makefile missing one RF-OPS-08 target fails the default T2 naming it; `--stage image-web` runs `docker compose build web`; a stage that exceeds `timeout` is a `✘` row (shim sleeps with a lowered limit through an override variable `CI_STAGE_TIMEOUT`, default 600). `t1.sh make:up` accepted, `make:nope` exit 1. `--stage up` ends with `down` (also after a failed `up`) unless `--keep-stack`; `--stage up --stage down` runs `down` once.
Does NOT touch: `t0.sh`, `t3.sh`, `env.sh`, the stages' selection logic.

## Targeted checks of the run (the pieces; every one `timeout 600`)

Static (no lease): `make help`; `docker compose config --quiet` + python3 JSON assertions; hadolint (root Dockerfile); shellcheck (new scripts, `smoke-aio.sh`, evidence scripts); `scripts/ci/t0.sh --base d54b0f0`; `pnpm -C frontend exec playwright test --list`; typecheck/lint/format of `frontend/e2e`.
Contract: see slice A. Edge (heavy for the build only): `docker build -f frontend/Dockerfile -t calculator-web:$COMPOSE_PROJECT_NAME .`, the extended smoke (~2 min), the two new mutations (~3 min each) and the existing ones touching the changed locations. Coverage, fuzz, bench (heavy, each alone): `make coverage-backend`, `make coverage-frontend`, gate mutations, `make fuzz`, `make bench`, the bench gate against doctored output. Images (heavy, one each): pulls, `docker compose build api`, `… build web`, `make image-aio`, sizes recorded. All-in-one: `make run-aio` + curl, E7. Tiers: `t1.sh make:help make:docs-api`, `t2.sh --base d54b0f0`. Developer: `make lint`, `make test`, `make docs-api` + `git check-ignore -v docs/api/index.html`, `make clean` with `git status` before/after, `make bootstrap` twice and without `pnpm`, `make dev-backend`/`make dev-frontend` in the background with recorded PIDs.
Recorded run: R0–R7 of the task entry in the order of the spec. R1 images are built through `t2.sh --stage image-api` / `--stage image-web` (same exported variables as `make up`, so R2 finds them cached); `heavy` is taken without `--wait` for R1, R2 (it builds if anything changed), each R4 web recreate and R6. Extra checks: after `make down` no container and no network of the project remains (UC-OPS-02 postcondition); `make run-aio` (`--rm`) leaves no container after `docker stop` and the exit code was 0 (UC-OPS-03 step 8); `.env.example` has no uncommented line and `docker compose config` still renders with it copied to `.env` in a scratch directory; the IMAGE_TAG rule is checked in three cases (`COMPOSE_PROJECT_NAME` unset → `local`, `fullstackcalculator` → `local`, `fullstackcalculator-w2` → that name) with `make --eval 'p: ; @echo $(IMAGE_TAG)' p`; `E2E_BASE_URL` follows `WEB_PORT` (`make WEB_PORT=18081 --eval 'p: ; @echo $(E2E_BASE_URL)' p`).

## Review log

**Step 6 — independent read-only review of the plan (Claude subagent, 2026-10-22); triage.** 19 findings, no P0/P1; 11 P2, 8 P3.

| # | Verdict | Action |
|---|---|---|
| 1 `requireStack` blocked reads | accepted | only mutating functions require `E2E_STACK=1` (done) |
| 2 `startApi` without `--no-recreate` | accepted | done in `compose.ts` |
| 3 MH3 override unreachable | accepted | `E2E_COMPOSE_OVERRIDE` second `-f` (done); mutation text rewritten with a restore step |
| 4 images compile `frontend/e2e` | accepted | `.dockerignore` excludes `frontend/e2e` and `frontend/playwright.config.ts` (done) |
| 5 IMAGE_TAG rule uncovered | accepted | rule stated in the Makefile brief; three-case check added |
| 6 t2 image stages lose the Makefile's exports | accepted | `ci_compose_env` in `lib.sh` duplicates the three expressions; the shim scenario asserts the environment the `docker` shim sees; R1 goes through `t2.sh --stage image-*` |
| 7 `E2E_BASE_URL ?=` ignores `WEB_PORT` when exported | accepted | the Makefile assigns it with `:=`; check added |
| 8 `e2e` stage runs both projects | accepted | the `e2e` stage forwards `E2E_ARGS` from the environment (documented in usage); a stage `e2e-disruptive` runs the disruptive file |
| 9 axe wording drift | accepted | plan text rewritten |
| 10 helper shapes drift | accepted | shapes block regenerated from the files |
| 11 bootstrap without pnpm | already done by slice C with a PATH of symlinks that omits pnpm | — |
| 12 section signs | accepted | replaced by section titles |
| 13 version assertion, contract validity in TS | accepted | `edge` asserts format and not `dev`/`unknown`-only; problems are checked by required keys and types in `api.ts` (no validator dependency); `problem-check.py` stays in the edge smoke |
| 14 post-flood assertions | accepted | `ensureServing` polls ≥ 5 s |
| 15 EXIT trap semantics | accepted | `down` runs only when `up` was attempted, and its row is recorded in the summary; test with a failing earlier stage |
| 16 leases for `up --build` and R4 | accepted | see the recorded-run line |
| 17 dispatch schedule | accepted | S1 done; J1 done; J2 and S2 running; then S4, S3, J3; Sonnet slices run tsc/eslint/prettier before handing back |
| 18 missing checks | accepted | added to the recorded-run line; the `theme` abort test sets `allowConsole` for `net::ERR_FAILED` |
| 19 `tsconfig.node.json` owned file | accepted | listed |
