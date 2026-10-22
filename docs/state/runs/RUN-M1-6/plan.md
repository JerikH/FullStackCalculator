# RUN-M1-6 — plan (OPS-EDGE-01)

Follows `spec.md` (D1–D12). Configuration only: no application code, no frontend source change, no dependency install on the host. Implementation is done by the controller (small, fully specified configuration, written while the spec review ran and corrected by it); reviews and the security pass go to independent Claude subagents (U15: no Codex in this run).

## Interfaces

- Image `calculator-web:local`, built with `docker build -f frontend/Dockerfile -t calculator-web:local .` (repository root as context).
- Runtime input: `API_UPSTREAM` = `host:port` (default `api:8081`); only variable rendered (`NGINX_ENVSUBST_FILTER=^API_UPSTREAM$`).
- Listener `:8080` (uid/gid 101). Writable: `/tmp`, `/etc/nginx/conf.d`. Healthcheck: `GET /nginx-health` → 200.
- Paths in the image: template `/etc/nginx/templates/default.conf.template`; snippets `/etc/nginx/snippets/security-headers.conf`, `/etc/nginx/snippets/proxy-api.conf`; docroot `/usr/share/nginx/calculator`; `/etc/nginx/conf.d` mode 1777 without the base `default.conf`. Inner API hop on `127.0.0.1:8079` (loopback, not exposed).
- Edge problem bodies (exact, `requestId` = `$correlation_id`), key order `type, title, status, detail, code, requestId`:
  - `{"type":"urn:calculator:problem:rate-limited","title":"Too many requests","status":429,"detail":"slow down and retry shortly","code":"RATE_LIMITED","requestId":"…"}`
  - `{"type":"urn:calculator:problem:service-unavailable","title":"Service unavailable","status":503,"detail":"the calculator service is temporarily unavailable","code":"SERVICE_UNAVAILABLE","requestId":"…"}`
  - `{"type":"urn:calculator:problem:payload-too-large","title":"Payload too large","status":413,"detail":"request body must not exceed 4096 bytes","code":"PAYLOAD_TOO_LARGE","requestId":"…"}`

## Rules (each with the check that proves it; all checks are T1 in `evidence/edge-smoke.sh` unless marked)

R1 Image: Node 24.14.1 build stage, frozen lockfile, pinned digests; runtime has no Node, sources, lockfile, default nginx pages. — T0 hadolint; T1 `docker run --entrypoint sh … -c 'command -v node; ls /usr/share/nginx/html /src'` (all absent), docroot listing = dist.
R2 Read-only, non-root, no capabilities: — T1 container started with `--read-only --cap-drop ALL --security-opt no-new-privileges --tmpfs /tmp --tmpfs /etc/nginx/conf.d` reaches `healthy`; `docker exec … id -u` = 101; `nginx -t` OK; rendered `default.conf` contains `api:8081`-style substituted upstream and literal `$request_id`, `$binary_remote_addr`, `$correlation_id`.
R3 Static: `/` and `/index.html` 200 `text/html` `no-cache`; `/theme-init.js` 200 `application/javascript` `no-cache`; `/favicon.svg` `image/svg+xml` `no-cache`; an asset `.js` and `.css` and `.map` 200 with `public, max-age=31536000, immutable`, `.map` `application/json`; conditional request on `/index.html` → 304 keeps the security headers; missing asset 404 without the immutable header; unknown path 404 (no index fallback); `/assets/` directory 404.
R4 Never metrics/pprof: `/metrics`, `/debug/pprof/`, `/api/../metrics`, `/api/%2e%2e/metrics`, `/api/v1/%2e%2e/%2e%2e/metrics` → 404 and the body is not the stub's admin text; `/api` → 404 without `Location`.
R5 Security headers: the five RNF-SEC-03 headers exactly once with the exact value, and exactly one `X-Request-ID`, on: server-level errors (`TRACE` 405, 9 KB header 400, 9 KB URI 414, `Content-Length` + `Transfer-Encoding` 400, duplicate `Host` 400 by a raw request), static 200, 304, static 404, `/api` 404, proxied API 200, proxied API problem, `/healthz`, `/readyz` (200 and draining 503), `/nginx-health`, each edge problem (413, 429, 503 from both hops); no `Strict-Transport-Security`, no `Access-Control-*`; service-only `Cross-Origin-Resource-Policy` single-valued on proxied responses; `Server` header without version. The stub sends its own values of all six owned headers (`Permissions-Policy` and `Cross-Origin-Opener-Policy` included), so hiding each is tested.
R6 Request ID: valid ID echoed in header, seen once by the stub, equal in body; 128-char valid kept; 129 chars, `<script>`, a space, an empty value and two inbound headers → replaced by a 32-hex ID (header = what the stub saw = edge problem `requestId`); absent → generated.
R7 API pass-through: stub 400, 404, 405 (+`Allow: POST`), 415, 422, 500 bodies byte-identical to the stub's direct answer modulo the per-request ID (requests sent with a fixed valid ID so bodies compare exactly); POST of 5000 bytes and of exactly 1,048,576 bytes → the stub's 413 with `instance`.
R8 Interception: stub-returned 502, 503, 504 → edge 503 problem; timeout (stub sleeps 11 s) → edge 503 problem after 9–12 s; connect timeout (a second edge container with `API_UPSTREAM=10.255.255.1:8081`, published on base+4) → 503 problem on `/api/…` and `/healthz` after 1.5–4 s; no retries (a second stub behind the same name `api`, nginx reloaded: four failing POSTs reach the instances exactly four times); stub stopped → `/api/v1/operations` 503 problem, `/healthz` and `/readyz` 503 problem, `/nginx-health` 200, `/` 200.
R9 Probes: `/readyz` draining (stub `READY=0`) → 503 Health JSON byte-identical to the stub's; `/healthz` 200 Health; probes not rate-limited.
R10 Body limit: Content-Length 1,048,577 → edge 413 problem; chunked 2 MiB → edge 413 problem; the stub never sees either (stub request count unchanged).
R11 Rate limit: 120 parallel requests to `/api/v1/operations` → at least one 429 and at least 41 served; one 429 of a second burst checked as an edge problem; the same burst on `/` and `/healthz` → all 120 are 200.
R12 Edge problem shape: every edge problem body validates against the contract `Problem` schema (python `jsonschema`, Draft 2020-12, components from `backend/api/openapi.yaml`), equals the exact constant body above with its `requestId`, has `Content-Type: application/problem+json` (also for `/api/x.js`), `Cache-Control: no-store`, no `instance`, no `errors`.
R13 gzip: an asset `.js` above 1 KiB with `Accept-Encoding: gzip` → `Content-Encoding: gzip` and `Vary: Accept-Encoding`.
R14 Browser (T1): Chromium through the edge on `http://127.0.0.1:4130/` — page loads, `data-theme` bootstrap runs (stored `dark` → attribute set before the app), zero `securitypolicyviolation` events, zero console errors.

## Tasks (ordered)

1. `deploy/nginx/security-headers.conf`, `deploy/nginx/proxy-api.conf`, `deploy/nginx/default.conf.template` (outer server on 8080, inner server on the socket, named problem locations). Owned: `deploy/nginx/**`.
2. `frontend/Dockerfile` (build + runtime stages, healthcheck). Owned: `frontend/Dockerfile`.
3. `evidence/edge-smoke.sh <image> [override-dir]` (bash + curl + `evidence/problem-check.py` with python3 jsonschema; creates and removes its own network, stub(s) and edge containers named with `PREFIX`, publishes only `WEB_PORT` and `WEB_PORT+4` on 127.0.0.1; one PASS/FAIL line per check and a total; exit 1 on any failure), `evidence/mutations.sh <image>` and `evidence/browser-check.mjs` (Playwright from `frontend/node_modules`). Owned: run folder.
4. Build under `heavy`, run, smoke, mutation checks (template mounted read-only over `/etc/nginx/templates/default.conf.template`), browser check; outputs to `evidence/`.
5. Diff review by two independent readers (double review level), security checklist (template 4), fixes, re-run.
6. Commit `feat(delivery): add hardened web image and nginx edge` (product files) with the run folder records; closure and findings.

Mutation checks (`evidence/mutations.sh`: a mutated copy is mounted over the image's file, the repository is untouched; each must turn the named check red): M1 map pattern `{1,129}` → R6; M2 remove the `proxy_hide_header` lines → R5 (two values on proxied responses); M3 `proxy_intercept_errors on` in the outer `/api/` → R7 (the 5000-byte 413 replaced); M4 remove `types { }` → R12 (`/api/…/add.js` problem served as JavaScript); M5 `limit_req` in `/healthz` → R11 (probe burst not all 200); M6 immutable `Cache-Control` with `always` → R3 (missing asset cached); M7 `proxy_next_upstream error timeout http_502 non_idempotent` → R8 (POST retried on the second instance); M8 remove the outer hop's `proxy_set_header X-Request-ID` → R6 (two inbound IDs: header ≠ ID the service saw); M9 remove the server-level snippet include → R5 (`TRACE` 405 without the edge headers).

## What NOT to touch

`frontend/**` except `frontend/Dockerfile`; `.dockerignore`; `backend/**`; `scripts/ci/**`; `.github/**`; `tools/versions.env`; shared records under `docs/` outside the run folder.

## Review log

(filled at step 6)
