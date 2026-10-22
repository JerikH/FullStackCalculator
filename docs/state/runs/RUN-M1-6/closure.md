# Closure of RUN-M1-6 — 2026-10-22

Parallel worker of wave W2 on branch `wf/RUN-M1-6`; the integrator applies this closure to the shared state exactly as written. Every item names its target file. Evidence paths are written as they will be after the run folder moves to `docs/state/archive/runs/RUN-M1-6/`. 21b98e3 below stands for the implementation commit listed in «Commits».

## Commits
| Member | Commit(s) on wf/RUN-M1-6 | Summary |
|---|---|---|
| OPS-EDGE-01 | 21b98e3 | `frontend/Dockerfile`, `deploy/nginx/default.conf.template`, `deploy/nginx/security-headers.conf`, `deploy/nginx/proxy-api.conf`, `.dockerignore` (`**/.env*`), with the run folder's reviewed spec, plan, findings and evidence |
| Run records | 15c8e9e (spec), 03b7483 (plan and spec review), and the closing `docs(state)` commit | Spec, plan and review triage, findings, closure |

## Per member

### OPS-EDGE-01
- **current.md:** check `OPS-EDGE-01`; add 🔎 findings: «Findings of OPS-EDGE-01» (a)–(j).
- **tasks/OPS.md — DONE paragraph** (replaces «Open.»; its two Registered follow-up lines stay, now resolved):
  `- [x] **DONE 2026-10-22 (run RUN-M1-6, commit 21b98e3; 🔎 findings: «Findings of OPS-EDGE-01» (a)–(j)).** Built the web image (frontend/Dockerfile: Node 24.14.1 alpine build stage by tag and digest with pnpm 10.33.0 from packageManager and the frozen lockfile, the built app with its source maps served by nginx-unprivileged 1.30.6 alpine 3.24 by tag and digest as uid 101 on :8080, healthcheck on /nginx-health, conf.d writable through a plain tmpfs) and the nginx edge (deploy/nginx/): static files no-cache and hashed /assets/ immutable on hits only, /nginx-health, /api/ through two hops in one nginx (outer: 20 r/s burst 40 per address, 1 MiB transport limit, edge 413/429 problems; inner on 127.0.0.1:8079: proxy_intercept_errors for 502/503/504 only, so the service's own problems, its 413 included, pass through), probes proxied directly (draining 503 unchanged, no body forwarded), the routed path forwarded, never the raw target, connect 2 s and read/send 10 s with no retries, the RNF-SEC-03 headers and one validated X-Request-ID on every response with the upstream copies hidden, edge problems from constants and the validated ID, gzip, 10 s client timeouts, X-Accel headers from the service ignored; .dockerignore excludes .env files at any depth. Verified: hadolint clean; image builds from the scaffolded app (91.8 MB on disk, no Node, sources, lockfile or default pages); run read-only with --cap-drop ALL, no-new-privileges and tmpfs /tmp and /etc/nginx/conf.d against a stub of the service: edge-smoke.sh 520 checks green (routes and cache headers, single-valued security headers on every class of response including server-level errors, request IDs at 128/129 characters, forbidden characters, duplicates and empty values, pass-through of 400/404/405/413/415/422/500 bodies byte-identical, interception of 502/503/504, read and connect timeouts, no retried POSTs across two instances, draining readiness, 413 above 1 MiB with Content-Length and chunked, 429 under a burst and none on static files and probes, every edge problem valid against the contract Problem schema, encoded paths, X-Accel-Redirect ignored, a stalled body dropped after 10 s); mutations.sh 15 of 15 caught; Chromium desktop and Pixel 7 through the edge with the OS dark and stored theme unset/light/dark: theme set before the app renders, source map and API same-origin, zero CSP violations and console errors (54 checks). Three independent reviews (spec, plan, security) and a final diff review. Evidence in docs/state/archive/runs/RUN-M1-6/evidence/.`
- **traceability.md row(s):**
  - replace `| UC-OPS-02 / RF-OPS-04, RF-OPS-05, RF-OPS-06, RF-OPS-08 | ⬜ | — | — | OPS-EDGE-01, OPS-IMAGE-01, OPS-STACK-01 |` with `| UC-OPS-02 / RF-OPS-04, RF-OPS-05, RF-OPS-06, RF-OPS-08 | 🟡 | 21b98e3 | Targeted tests: edge image against a stub of the service, edge-smoke.sh 520 checks, 15 mutations, browser check 54 checks (2026-10-22) | RF-OPS-04 done (edge against the real service at W2 integration and in OPS-E2E-01); RF-OPS-05 OPS-IMAGE-01, RF-OPS-06/08 OPS-STACK-01 |`;
  - RNF-SEC-01 row: add 21b98e3 to its commits and replace its notes with `Header limit in OBS-RUNTIME-01; edge transport limit 1 MiB done in OPS-EDGE-01 (413 problem above it, Content-Length and chunked)`;
  - RNF-SEC-02 row: add 21b98e3 to its commits; notes gain `; edge-built JSON from constants and the validated request ID only (OPS-EDGE-01: smoke checks of every edge problem, invalid IDs never reflected)`;
  - RNF-SEC-03 row: add 21b98e3 to its commits; notes become `App side done (no inline script/style, external theme bootstrap); edge headers done (OPS-EDGE-01: one value on every response class, zero CSP violations through the edge); embedded handler by OPS-IMAGE-01, E2E by OPS-E2E-01`;
  - replace `| RNF-SEC-04 | ⬜ | — | — | OPS-IMAGE-01, OPS-EDGE-01, OPS-STACK-01 |` with `| RNF-SEC-04 | 🟡 | 21b98e3 | Targeted tests: web image run read-only, --cap-drop ALL, no-new-privileges, uid 101, healthy (2026-10-22) | Web image done; API image OPS-IMAGE-01; compose settings OPS-STACK-01 |`;
  - RNF-QUAL-02 row: add 21b98e3 to its commits; notes become `Go and frontend static checks, Redocly and actionlint done; hadolint on frontend/Dockerfile clean (OPS-EDGE-01); backend Dockerfile with OPS-IMAGE-01`.
- **context/OPS.md additions:** «Architecture as built»: add `- Web image and nginx edge (RUN-M1-6): frontend/Dockerfile (build stage Node 24.14.1 alpine, runtime nginx-unprivileged 1.30.6 alpine as uid 101 on :8080, docroot /usr/share/nginx/calculator, template /etc/nginx/templates/default.conf.template, snippets /etc/nginx/snippets/), deploy/nginx/default.conf.template (outer server :8080 and inner API hop 127.0.0.1:8079), security-headers.conf (edge-owned headers added and upstream copies hidden), proxy-api.conf (settings of every hop to the service). Rules as built: «Findings of OPS-EDGE-01» (a).` and remove `deploy/nginx/`, `frontend/Dockerfile` from the «Planned» line. «Invariants» add: `- The edge forwards the path nginx routed, never the raw request target; API problems, the service's 413 included, pass through: only the inner hop intercepts, and only 502/503/504 (Findings of OPS-EDGE-01 (a)).` and `- A plain tmpfs over an image directory is root-owned with that directory's mode: an image that renders into a tmpfs mount makes the directory writable for its user (Findings of OPS-EDGE-01 (e)).`
- **context/test-environment.md additions:** «Tier commands» add a row `| Edge image | under the heavy lease: docker build -f frontend/Dockerfile -t calculator-web:local . (41 s cold, seconds warm); bash docs/state/archive/runs/RUN-M1-6/evidence/edge-smoke.sh calculator-web:local (PREFIX, WEB_PORT; about 2 min; uses WEB_PORT and WEB_PORT+4); mutations.sh (about 3 min per mutation) | 520 checks, 15 mutations (RUN-M1-6) |`; «Known traps» add the Docker/nginx items of Findings of OPS-EDGE-01 (e) and the frontend-stage selection of (f).
- **methodology.md:** OPS stays 🟡; «Done» adds `web image and nginx edge (RUN-M1-6)`; «Pending» loses nothing else.
- **Spec changes:** none.

## Registered follow-ups for other tasks
- `tasks/API.md` → none (finding (b) is backlog: `API-backlog`).
- `tasks/OPS.md` → entry `OPS-STACK-01`: `- Registered follow-up (from OPS-EDGE-01): web depends on api with condition service_healthy and restart: true, proved by recreating api in the running stack; cap the web tmpfs /tmp size; the owner decides on a per-address connection limit at the edge. 🔎 findings: «Findings of OPS-EDGE-01» (c), (h)`
- `tasks/OPS.md` → entry `OPS-E2E-01`: `- Registered follow-up (from OPS-EDGE-01): prove the edge against the real service in the composed stack (calculation, the service's 413 for 5000-byte and 1 MiB bodies unchanged, an application problem unchanged, draining readiness 503, single-valued headers on API responses, the same X-Request-ID in header, problem body and service log, 128-character ID kept and invalid IDs replaced, 429 under a burst). 🔎 findings: «Findings of OPS-EDGE-01» (g)`
- `tasks/DOC.md` → entry `DOC-README-01`: `- Registered follow-up (from OPS-EDGE-01): the README trade-offs state that the edge rate limit keys on the client address nginx sees, so behind Docker's userland proxy all local clients share one 20 r/s budget. 🔎 findings: «Findings of OPS-EDGE-01» (i)`

## Needs from other tasks (blockers discovered)
- none.

## Targeted checks (the integrator re-runs these after merging)
```
bin/.tools/hadolint-2.15.1/hadolint frontend/Dockerfile
.workflow/bin/wf lease acquire heavy --wait && docker build -f frontend/Dockerfile -t calculator-web:local . ; .workflow/bin/wf lease release heavy
PREFIX=fullstackcalculator-w2 WEB_PORT=<free port> bash docs/state/archive/runs/RUN-M1-6/evidence/edge-smoke.sh calculator-web:local   # 520 PASS, 0 FAIL
scripts/ci/t0.sh --base <pre-merge main>   # with frontend/node_modules installed (Findings of OPS-EDGE-01 (f))
```
Against the real service (wave plan «Risks for the integrator»): run `cd backend && go run ./cmd/calculator` (or the built binary) on a free port, start the image with `--add-host` or a shared network and `API_UPSTREAM=<host>:<port>`, and check a calculation, a 5000-byte POST (the service's 413 with `instance` unchanged), a 1 MiB + 1 POST (edge 413), a 128- and a 129-character `X-Request-ID`, `<script>` as ID, the draining readiness 503 during shutdown, and one value of each security header on `/api/v1/operations`.

## Tests and CI changes
- New verification tooling in the run folder (not product code): `evidence/edge-smoke.sh`, `evidence/mutations.sh`, `evidence/problem-check.py`, `evidence/stub-upstream.mjs`, `evidence/browser-check.mjs`.
- `scripts/ci/` unchanged: the dockerfiles stage of t0/t3 already runs hadolint on `frontend/Dockerfile`; building and smoke-testing images in CI is OPS-CI-02's `images` job.

## Notes for the integrator
- Integration order (wave plan): this run lands last; no file overlaps with RUN-M1-4 or RUN-M1-5 (`wf own check --diff`: no overlaps). `.dockerignore` is touched (one line, `.env*` → `**/.env*`), allowed by the wave plan's ownership row.
- Contract consumed from RUN-M1-4 (message #7): matches what the stub mimics (security headers hidden and replaced, `Cache-Control: no-store` passing through, draining readiness as Health JSON 503). The edge forwards the normalised routed path: `/api/v1/operations/a%2Fb` reaches the service as `/api/v1/operations/a/b` (404 `NOT_FOUND` instead of `UNKNOWN_OPERATION`), every canonical path byte-identical.
- The worktree had no `frontend/node_modules` (W2: no host installs), so the worker's t0 ran the shell and dockerfiles stages only; the TypeScript build ran inside each image build.
