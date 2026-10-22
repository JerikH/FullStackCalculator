# Verification record

What was run, how long it took and what it showed. Every local command stayed under ten minutes (`timeout 600`); the composed stack came up once, in the run recorded in section 2. Dates are 2026-10-22 on one machine (4 CPUs, 14 GB RAM, WSL2, Docker 29.3.1, Compose v5.1.1, Node 24.22.1, Go 1.27.3, Chromium from Playwright 1.64.1). Raw outputs are in `docs/state/archive/runs/RUN-M2-1/evidence/`.

**Source revision.** Every figure in sections 1 to 4 was measured at revision `5a00a5d` (the commit that added the browser suite and the all-in-one smoke). The README repeats only figures that equal the ones below. The figures stay valid while `git diff --stat 5a00a5d -- backend frontend deploy compose.yaml Dockerfile Makefile scripts tools` shows no change to product code; changes confined to the continuous-integration files under `scripts/ci/` (other than `env.sh`) and to `tools/versions.env` do not affect what was measured. A change anywhere else means the affected figure is measured again and its revision updated here.

## 1. Pieces run before the stack (OPS-STACK-01)

| Piece | Command | Duration | Result |
|---|---|---|---|
| API contract | `pnpm -C frontend run lint:api`; `pnpm -C frontend run gen:api` twice | 0.9 s; seconds | valid (2 warnings about the example server URL); second generation produces no diff |
| Contract tests | `go test -race -count=1 ./api/ ./internal/httpapi/` | 52.5 s (cold compile) | ok, tests unchanged |
| Compose render | `docker compose config --format json` + `evidence/stack/check-compose.py` | seconds | 26 assertions pass (only `web` publishes `${WEB_PORT}:8080`, no `container_name`, both services read-only, `cap_drop: [ALL]`, `no-new-privileges`, web tmpfs `/tmp` `size=64m` and `/etc/nginx/conf.d`, `CALC_SHUTDOWN_DRAIN=2s`, grace period 25 s, `depends_on.api` healthy with `restart: true`); a `WEB_PORT=18081` override renders `18081:8080` |
| Web image | `docker build -f frontend/Dockerfile -t calculator-web:local .` | 41.2 s cold | built |
| Edge against a stub of the service | `edge-smoke.sh calculator-web:local` | 2 min 37 s | 599 checks, 0 failures (79 new: 20 held connections and the 21st refused with the 429 problem, 19 held and the 20th accepted, probe bodies of 16,384 bytes accepted and 16,385 refused with Content-Length and chunked, probes and static files unlimited) |
| Edge mutations | `mutations.sh … "MLC MPB"`; `"M5 M3"`; `"M14"` | 4 min 30 s; 3 min 23 s; 1 min 37 s | 5 of 5 caught (connection limit removed; probe limit raised; limit_req on a probe; the service's 413 intercepted; inner hop failure) |
| Backend coverage | `make coverage-backend` | 7.2 s warm (51.8 s cold) | 98.11 % of statements (782 of 797) against the 90 % gate; `go tool cover` agrees (98.1 %) |
| Coverage gate checks | `evidence/gates/check-gates.sh` | 20–25 s | 54 cases, 15 mutations of the script all caught (90.00 % passes, 89.99 % fails, duplicate blocks merged, other modes and malformed profiles fail, bench median rule) |
| Frontend coverage | `make coverage-frontend` | 53.2 s | 1342 tests; statements 99.77 %, branches 100 %, functions 99.15 %, lines 100 % against 90/85/90/90; raising the functions threshold to 100 fails the target |
| Fuzz | `make fuzz` | 1 min 5 s | `FuzzParse` and `FuzzCalculate` 30 s each, no panics |
| Benchmarks | `make bench` | 54.3 s | gate passes; medians below 1,000,000 ns/op (largest `power_fractional` 290,082) and below 50,000,000 ns/op for the worst cases (largest 12,956,672) |
| Images | `t2.sh --stage image-api --stage image-web`; `make image-aio` | 14.9 s + 3.5 s (layers cached); 6.3 s | built |
| Lint | `make lint` | 47.3 s | clean (golangci-lint, go vet with and without `embedui`, ESLint, Prettier, typecheck, Redocly, hadolint, actionlint, shellcheck) |
| API reference | `make docs-api` | 1.1 s | written and git-ignored |
| Tier scripts | `evidence/tiers/check-tiers.sh` | seconds | 115 checks, 8 mutations caught; `t1.sh make:help` passes; the default `t2.sh --base HEAD` took 264 s on a dirty tree and ends with «all 21 targets present»; it starts no container |

## 2. The recorded run of the composed stack (OPS-E2E-01)

| Piece | Command | Duration | Result |
|---|---|---|---|
| R2 up | `make up` (images cached) | 16.8 s | `api` healthy, then `web` healthy; `web` is the only published service (`0.0.0.0:8080`) |
| R3 chromium | `make e2e E2E_ARGS="--project=chromium"` | 4 min 8 s | 186 passed, 1 skipped (a touch-only test) |
| R3 mobile-chromium | `make e2e E2E_ARGS="--project=mobile-chromium"` | 4 min 9 s | 187 passed |
| R3 disruptive | `E2E_STACK=1 make e2e E2E_ARGS="--project=chromium e2e/stack-disruptive.spec.ts"` | 1 min 10 s | 6 passed (hardening and private listeners; 20 held connections pending and only the 21st refused; rate burst gives valid 429 problems while static files and probes answer; drain window passes the service's `draining` Health JSON through, then the edge's 503 problem, exit code 0 inside the grace period, a plain start restores service; replacing `api` at a new address restarts `web`; the UI calculates afterwards) |
| R3b second port | `COMPOSE_PROJECT_NAME=fullstackcalculator-e1 WEB_PORT=18081 docker compose up -d --wait`, `GET /`, one POST, `down` | 16.3 s | 200, `0.3`; the main stack kept answering on 8080 |
| R5 down | `make down` | seconds | no project container or network remains |
| R6 all-in-one | `make image-aio`; `make smoke-aio` | 6.3 s; 9.5 s | 58 checks, 0 failures (healthy, hardened run, five policy headers once and equal to the edge file, cache classes, MIME types, `0.1 + 0.2` → `0.3`, problem responses, missing file, directory and dotfile are `NOT_FOUND`, `405` with `Allow: GET, HEAD`, HEAD, Range, `If-None-Match`, API header set, exit code 0 on stop) |

Pieces above five minutes: none. The disruptive file took 1 min 10 s (`real 1m9.996s` in the run log; the first version of this table carried 1 min 2 s, the duration of another piece). Two runs of the disruptive file were needed: the first showed that `depends_on … restart: true` restarts `web` only when `web` is part of the same `docker compose up` (see «Findings of OPS-STACK-01»), and the test now proves that case with a new address for `api`.

## 3. Benchmarks and coverage detail

`make bench` (54.3 s) runs `go test ./internal/calc -bench . -benchmem -count=3` and `scripts/coverage.sh bench` takes the **median** of the three samples of each case. The budgets are 1,000,000 ns/op for `BenchmarkCalculate` and 50,000,000 ns/op for `BenchmarkCalculateWorstCase` (powers with operands at the edges of the range). Revision `5a00a5d`, Go 1.27.3, 4 CPUs.

| Case | Median ns/op | Largest sample ns/op | Budget ns/op |
|---|---|---|---|
| `BenchmarkCalculate/add` | 1,536 | 1,652 | 1,000,000 |
| `BenchmarkCalculate/divide_repeating` | 1,697 | 2,214 | 1,000,000 |
| `BenchmarkCalculate/sqrt_irrational` | 8,590 | 12,155 | 1,000,000 |
| `BenchmarkCalculate/power_overflow` | 20,821 | 21,759 | 1,000,000 |
| `BenchmarkCalculate/power_large_integer` | 65,379 | 67,000 | 1,000,000 |
| `BenchmarkCalculate/power_fractional` | 290,082 | 321,575 | 1,000,000 |
| `BenchmarkCalculateWorstCase/max^0.5` | 3,945,532 | 5,102,116 | 50,000,000 |
| `BenchmarkCalculateWorstCase/(-1)^1e6144` | 4,332,797 | 4,588,549 | 50,000,000 |
| `BenchmarkCalculateWorstCase/min^0.5` | 4,513,705 | 5,177,862 | 50,000,000 |
| `BenchmarkCalculateWorstCase/min^0.99…9` | 9,349,798 | 9,920,711 | 50,000,000 |
| `BenchmarkCalculateWorstCase/1.5e-6143^-0.99…9` | 11,037,900 | 12,947,908 | 50,000,000 |
| `BenchmarkCalculateWorstCase/max^0.99…9` | 12,889,222 | 13,504,033 | 50,000,000 |
| `BenchmarkCalculateWorstCase/max^-0.99…9` | 12,956,672 | 13,165,890 | 50,000,000 |

Coverage totals (`make coverage-backend` 7.2 s warm, `make coverage-frontend` 53.2 s):

| Area | Gate | Measured |
|---|---|---|
| Backend statements (`./internal/...`) | 90 % | 98.11 % (782 of 797) |
| Frontend statements | 90 % | 99.77 % (442 of 443) |
| Frontend branches | 85 % | 100 % (374 of 374) |
| Frontend functions | 90 % | 99.15 % (118 of 119) |
| Frontend lines | 90 % | 100 % (387 of 387) |

The frontend run has 1,342 tests in 34 files.

## 4. Image sizes (three readings)

| Image | Layer sum | Compressed content (`docker image inspect`) | `docker images` listing |
|---|---|---|---|
| `calculator-api` | 16.5 MB (16,490,496 B) | 5.3 MB | 21.8 MB |
| `calculator` (all-in-one) | 18.0 MB (18,014,208 B) | 5.6 MB | 23.7 MB |
| `calculator-web` | 66.1 MB | 25.9 MB | 92 MB |

The reading of «the API image is under 20 MB» is the layer sum; the listing includes the containerd store's snapshot accounting.

## 5. Not part of this record

The mutation checks of the browser specs (a header removed from the edge file, `limit_conn` removed, `restart` off, the request-id header removed), the failing-assertion build of the root Dockerfile (empty app directory), `make bootstrap` twice and without `pnpm`, `make dev-backend` / `make dev-frontend`, and `make clean` were not run in this record. Once the owner enables the workflow, continuous integration runs the hosted pass of both browser projects on a clean runner, the clean-clone build and the image scan.

## 6. Documentation checks (README, API reference, screenshots)

Run on the same machine on 2026-10-22, after the figures above were copied unchanged (`git diff --stat 5a00a5d -- backend frontend deploy compose.yaml Dockerfile Makefile scripts tools` was empty). Scripts and raw outputs are in `docs/state/archive/runs/RUN-M2-3/evidence/`.

| Piece | Command | Duration | Result |
|---|---|---|---|
| Static checker | `python3 -B -I check_docs.py --terms-file <term list outside the repository>` | 0.2 s | 15 rules pass; the sixteenth (named paths of the continuous-integration files that exist only after that work is merged) reports them as pending: links to tracked files only, the twelve README sections in order, the Design decisions table equals the ADR index, the configuration table equals the variables read by the service, `env.sh`, Compose, `.env.example`, the Makefile, the Vite config, the Playwright config and the Dockerfiles, the problem catalog equals the contract's `ProblemCode` enum with status and title per code, every ADR path exists as written, every Make target exists and the target table equals `make help`, every figure equals the raw evidence and this record, the screenshots are PNG files of the expected size embedded in the Overview, no forbidden wording (the product and planning names come from a list kept outside the repository: 10 terms, 0 matches), the CI/CD section content, the API reference notes, the trade-off statements, and the curl examples' structure |
| Checker mutations | `python3 -B -I check_docs_mutations.py` | 7 s | 40 of 40 mutations caught (broken link, swapped section, changed ADR title, missing and extra variable, changed default, changed status, wrong Make target, changed figure digit, wrong PNG width, forbidden term, removed CI wording and so on); the unmutated copy passes |
| ADR rules | `python3 -B -I check_adrs.py` (after the path correction in ADR 0001) | 0.1 s | 0 failures |
| Curl examples | `python3 -B -I run_curl_examples.py --readme README.md --base http://127.0.0.1:4121` against the service built with `go build ./cmd/calculator` | 0.2 s | 20 of 20: status and JSON body equal the documented ones (the probe is compared on status and `status`); a mutated README fails the runner |
| App for the screenshots | `pnpm -C frontend build`, copy `frontend/dist` into `backend/internal/web/dist`, `go build -tags embedui ./cmd/calculator` | 9.3 s | built; the copied files were removed afterwards |
| Screenshots | `cd frontend && node ../docs/state/archive/runs/RUN-M2-3/evidence/take_screenshots.mjs --base http://127.0.0.1:4120 --out ../docs/assets` against the embedded binary (`CALC_HTTP_ADDR=:4120`) | 1.4 s | `calculator-desktop.png` 1280 × 800 (38,631 bytes) and `calculator-mobile.png` 1082 × 2279, the Pixel 7 descriptor at scale 2.625 (108,484 bytes); System theme on a light OS; `1 ÷ 3 =` shows `≈` with the 34-digit value and the history row `1 ÷ 3 ≈ 0.3333333333333333333333333333333333`; no console error, page error or failed request; a second run produced byte-identical files |
| API reference | `make docs-api`; `node check_api_page.mjs ../docs/api/index.html` | 0.9 s | `docs/api/index.html` written (270 KiB), git-ignored; the page renders its title, version, description, servers and the `operations` and `system` groups with no page error |

How the pages render on a hosting service is not part of this record.
