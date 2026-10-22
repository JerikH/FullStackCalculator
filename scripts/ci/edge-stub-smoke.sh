#!/usr/bin/env bash
# shellcheck disable=SC2016 # single-quoted bash -c bodies and sed scripts are meant literally; values arrive as arguments.
# Runtime proof of the web image and nginx edge.
# Starts a private network, the stub upstream (stub-upstream.mjs) as
# `api` and the web image with the production restrictions, runs every check,
# prints one PASS/FAIL line per check and removes what it started.
#
# Usage: edge-stub-smoke.sh <image> [override-dir]
#        override-dir: files named default.conf.template, security-headers.conf or
#        proxy-api.conf in it are mounted over the image's copies (mutation checks).
# Env:   PREFIX (container/network name prefix), WEB_PORT (host port on 127.0.0.1;
#        WEB_PORT+2 is used too), REPO (repository root, for backend/api/openapi.yaml).
# The Node image that runs the stub is read from the build stage of frontend/Dockerfile.
set -uo pipefail

IMAGE=${1:?usage: edge-stub-smoke.sh <image> [override-dir]}
OVERRIDE=${2:-}
PREFIX=${PREFIX:-${COMPOSE_PROJECT_NAME:-fullstackcalculator-ci}}
WEB_PORT=${WEB_PORT:-8080}
# The connect-timeout checks also publish WEB_PORT+2.
if ! [[ $WEB_PORT =~ ^[0-9]+$ ]] || (( WEB_PORT < 1024 || WEB_PORT > 65532 )); then
  echo "WEB_PORT must be a number between 1024 and 65532 (got '$WEB_PORT')" >&2; exit 2
fi
HERE=$(cd "$(dirname "$0")" && pwd)
REPO=${REPO:-$(git -C "$HERE" rev-parse --show-toplevel)}
NODE_IMAGE=$(sed -nE 's/^FROM .*[[:space:]](node:[^[:space:]]+)[[:space:]]+AS[[:space:]].*/\1/p' "$REPO/frontend/Dockerfile" 2> /dev/null | head -n 1)
if [[ -z $NODE_IMAGE ]]; then
  echo "no 'FROM ... node:<tag> AS <stage>' line found in $REPO/frontend/Dockerfile" >&2; exit 2
fi
NET=$PREFIX-smoke
STUB=$PREFIX-smoke-api
STUB2=$PREFIX-smoke-api2
WEB3=$PREFIX-smoke-web-blackhole
WEB4=$PREFIX-smoke-web-noinner
WEB=$PREFIX-smoke-web
BASE=http://127.0.0.1:$WEB_PORT
T=$(mktemp -d)
pass=0 fail=0 i=0

held_fds=()
close_held() {
  local fd
  for fd in "${held_fds[@]}"; do
    exec {fd}>&-
  done
  held_fds=()
}
cleanup() { close_held; docker rm -f "$WEB" "$WEB3" "$WEB4" "$STUB" "$STUB2" > /dev/null 2>&1; docker network rm "$NET" > /dev/null 2>&1; rm -rf "$T"; }
trap cleanup EXIT
cleanup; T=$(mktemp -d)

ok()  { pass=$((pass + 1)); printf 'PASS %s\n' "$1"; }
bad() { fail=$((fail + 1)); printf 'FAIL %s — %s\n' "$1" "$2"; }
check() { local name=$1; shift; if "$@"; then ok "$name"; else bad "$name" "${WHY:-condition false}"; fi; WHY=; }

# req <name> [curl args…] <url>: headers in $T/<name>.h, body in $T/<name>.b,
# status in $T/<name>.s. API requests are paced below the 20 r/s limit.
req() {
  local name=$1; shift
  case "${*: -1}" in */api/*) sleep 0.06 ;; esac
  curl -sS --path-as-is -D "$T/$name.h" -o "$T/$name.b" -w '%{http_code}' "$@" > "$T/$name.s" 2> "$T/$name.err" || true
}
status() { cat "$T/$1.s"; }
# hcount <name> <header>: number of header lines with that name.
hcount() { grep -ci "^$2:" "$T/$1.h"; }
hval() { grep -i "^$2:" "$T/$1.h" | head -1 | cut -d: -f2- | sed 's/^ //; s/\r$//'; }
body() { cat "$T/$1.b"; }

is_status() { WHY="status $(status "$1"), want $2"; [[ $(status "$1") == "$2" ]]; }
is_header() { WHY="$2: '$(hval "$1" "$2")' ×$(hcount "$1" "$2"), want '$3' once"; [[ $(hcount "$1" "$2") == 1 && $(hval "$1" "$2") == "$3" ]]; }
no_header() { WHY="$2 present"; [[ $(hcount "$1" "$2") == 0 ]]; }

CSP="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'none'"
edge_headers() {
  local n=$1
  check "$n: CSP once" is_header "$n" Content-Security-Policy "$CSP"
  check "$n: nosniff once" is_header "$n" X-Content-Type-Options nosniff
  check "$n: Referrer-Policy once" is_header "$n" Referrer-Policy no-referrer
  check "$n: Permissions-Policy once" is_header "$n" Permissions-Policy 'camera=(), microphone=(), geolocation=()'
  check "$n: COOP once" is_header "$n" Cross-Origin-Opener-Policy same-origin
  WHY="X-Request-ID ×$(hcount "$n" X-Request-ID)"; check "$n: one X-Request-ID" test "$(hcount "$n" X-Request-ID)" = 1
  check "$n: no HSTS" no_header "$n" Strict-Transport-Security
  check "$n: no CORS" no_header "$n" 'Access-Control-[A-Za-z-]*'
  check "$n: Server without version" is_header "$n" Server nginx
}

# problem <name> <status> <code>: an edge-built problem (R12).
problem() {
  local n=$1 st=$2 code=$3 id
  id=$(hval "$n" X-Request-ID)
  check "$n: status $st" is_status "$n" "$st"
  check "$n: problem+json" is_header "$n" Content-Type application/problem+json
  check "$n: no-store" is_header "$n" Cache-Control no-store
  WHY=$(python3 -I "$HERE/problem-check.py" "$REPO/backend/api/openapi.yaml" "$T/$n.b" "$code" "$id" 2>&1)
  check "$n: exact $code body, valid Problem, requestId = header" test -z "$WHY"
  edge_headers "$n"
}

# Docker writes container logs asynchronously: wait before counting.
stub_seen() { sleep 0.5; docker logs "$STUB" 2>&1 | grep -c "^REQ $1" || true; }
direct() { # direct <method> <path> <bytes> <id>: the stub's own answer, from inside its container
  docker exec "$STUB" node -e "
    const [m, p, n, id] = process.argv.slice(1);
    fetch('http://127.0.0.1:8081' + p, { method: m, headers: { 'X-Request-ID': id, 'Content-Type': 'application/json' },
      body: m === 'POST' ? 'a'.repeat(Number(n)) : undefined })
      .then((r) => r.text()).then((t) => process.stdout.write(t));" "$@"
}

# --- start ---------------------------------------------------------------------
docker network create "$NET" > /dev/null
docker run -d --name "$STUB" --network "$NET" --network-alias api \
  -v "$HERE/stub-upstream.mjs:/stub.mjs:ro" "$NODE_IMAGE" node /stub.mjs > /dev/null
mount=()
if [[ -n $OVERRIDE ]]; then
  [[ -f $OVERRIDE/default.conf.template ]] && mount+=(-v "$OVERRIDE/default.conf.template:/etc/nginx/templates/default.conf.template:ro")
  for f in security-headers.conf proxy-api.conf; do
    [[ -f $OVERRIDE/$f ]] && mount+=(-v "$OVERRIDE/$f:/etc/nginx/snippets/$f:ro")
  done
fi
sleep 1
docker run -d --name "$WEB" --network "$NET" -p "127.0.0.1:$WEB_PORT:8080" \
  --read-only --cap-drop ALL --security-opt no-new-privileges \
  --tmpfs /tmp --tmpfs /etc/nginx/conf.d "${mount[@]}" "$IMAGE" > /dev/null
for _ in $(seq 40); do
  [[ $(docker inspect -f '{{.State.Health.Status}}' "$WEB" 2>/dev/null) == healthy ]] && break
  [[ $(docker inspect -f '{{.State.Running}}' "$WEB" 2>/dev/null) == true ]] || break
  sleep 0.5
done

# --- R2 runtime ----------------------------------------------------------------
WHY="health $(docker inspect -f '{{.State.Health.Status}}' "$WEB" 2>&1); $(docker logs "$WEB" 2>&1 | tail -3)"
check "R2 container healthy (read-only, cap-drop ALL, no-new-privileges)" test "$(docker inspect -f '{{.State.Health.Status}}' "$WEB" 2>/dev/null)" = healthy
check "R2 runs as uid 101" test "$(docker exec "$WEB" id -u 2>/dev/null)" = 101
WHY=$(docker exec "$WEB" nginx -t 2>&1 | tail -2)
check "R2 nginx -t after rendering" docker exec "$WEB" nginx -t -q
rendered=$(docker exec "$WEB" cat /etc/nginx/conf.d/default.conf 2>/dev/null)
WHY="upstream not substituted"; check "R2 API_UPSTREAM substituted" grep -q 'proxy_pass http://api:8081;' <<< "$rendered"
WHY="nginx variable lost"; check "R2 nginx variables kept" bash -c 'grep -q "\$request_id;" <<< "$1" && grep -q "\$binary_remote_addr" <<< "$1" && grep -q "\"requestId\":\"\$correlation_id\"" <<< "$1"' _ "$rendered"
WHY=$(docker exec "$WEB" sh -c 'touch /etc/nginx/x /usr/share/nginx/calculator/x 2>&1; command -v node; ls /src /usr/share/nginx/html 2>&1; find / -xdev \( -name pnpm-lock.yaml -o -name package.json -o -name node_modules -o -name "*.ts" \) 2>/dev/null' | tr '\n' ' ')
check "R1 read-only root; no Node, sources, lockfile, packages or default pages" bash -c '[[ $1 == *"Read-only file system"*"Read-only file system"* && $1 != *"/node "* && $1 == *"/src"*"No such file"*"/usr/share/nginx/html"*"No such file"* && $1 != *pnpm-lock* && $1 != *package.json* && $1 != *node_modules* && $1 != *.ts\ * ]]' _ "$WHY"
WHY=$(docker exec "$WEB" sh -c 'cd /usr/share/nginx/calculator && find . -type f | sed "s|^\./||" | sort' | tr '\n' ' ')
check "R1 docroot is the built app only" bash -c 'for f in $1; do [[ $f =~ ^(index\.html|theme-init\.js|favicon\.svg|assets/index-[A-Za-z0-9_-]+\.(js|js\.map|css))$ ]] || exit 1; done; [[ $1 == *assets/*.js.map* && $1 == *index.html* && $1 == *theme-init.js* ]]' _ "$WHY"
req defaultpage "$BASE/50x.html"
check "R1 base image default pages not served" is_status defaultpage 404

# --- R3 static -----------------------------------------------------------------
req root "$BASE/"
check "R3 / 200" is_status root 200
check "R3 / text/html" is_header root Content-Type text/html
check "R3 / no-cache" is_header root Cache-Control no-cache
WHY="index.html markers missing"; check "R3 / is the built app" bash -c 'grep -q "<script src=\"/theme-init.js\"></script>" "$1" && grep -q "/assets/" "$1"' _ "$T/root.b"
edge_headers root
JS=$(grep -o '/assets/[^"]*\.js' "$T/root.b" | head -1)
CSS=$(grep -o '/assets/[^"]*\.css' "$T/root.b" | head -1)
req index "$BASE/index.html"
check "R3 /index.html no-cache" is_header index Cache-Control no-cache
etag=$(hval index ETag)
req notmod -H "If-None-Match: $etag" "$BASE/index.html"
check "R3 304 on revalidation" is_status notmod 304
check "R3 304 keeps no-cache" is_header notmod Cache-Control no-cache
edge_headers notmod
req theme "$BASE/theme-init.js"
check "R3 theme-init 200" is_status theme 200
check "R3 theme-init JS type" is_header theme Content-Type application/javascript
check "R3 theme-init no-cache" is_header theme Cache-Control no-cache
req favicon "$BASE/favicon.svg"
check "R3 favicon svg" is_header favicon Content-Type image/svg+xml
check "R3 favicon no-cache" is_header favicon Cache-Control no-cache
req js "$BASE$JS"
check "R3 asset js 200" is_status js 200
check "R3 asset js type" is_header js Content-Type application/javascript
check "R3 asset js immutable" is_header js Cache-Control 'public, max-age=31536000, immutable'
edge_headers js
req css "$BASE$CSS"
check "R3 asset css type" is_header css Content-Type text/css
check "R3 asset css immutable" is_header css Cache-Control 'public, max-age=31536000, immutable'
req map "$BASE$JS.map"
check "R3 source map 200" is_status map 200
check "R3 source map JSON" is_header map Content-Type application/json
check "R3 source map immutable" is_header map Cache-Control 'public, max-age=31536000, immutable'
edge_headers map
req missingasset "$BASE/assets/missing-0000.js"
check "R3 missing asset 404" is_status missingasset 404
check "R3 missing asset not cached" no_header missingasset Cache-Control
edge_headers missingasset
req missingmap "$BASE/assets/missing-0000.js.map"
check "R3 missing source map 404" is_status missingmap 404
check "R3 missing source map not cached" no_header missingmap Cache-Control
req missing "$BASE/some/page"
check "R3 unknown path 404 (no index fallback)" is_status missing 404
req assetsdir "$BASE/assets/"
check "R3 /assets/ directory 404" is_status assetsdir 404

# --- R13 gzip ------------------------------------------------------------------
req gz -H 'Accept-Encoding: gzip' "$BASE$JS"
check "R13 asset gzip" is_header gz Content-Encoding gzip
check "R13 Vary" is_header gz Vary Accept-Encoding

req gzapi -H 'Accept-Encoding: gzip' "$BASE/api/v1/big"
check "R13 proxied API response gzip once" is_header gzapi Content-Encoding gzip
check "R13 proxied API Vary once" is_header gzapi Vary Accept-Encoding

# --- routed path forwarded, never the raw target (security review) ----------------------
req enc_probe -X POST --data-binary @/dev/null "$BASE/api/v1/operations/add%2f..%2f..%2f..%2f..%2fhealthz"
WHY=$(body enc_probe); check "R4 encoded path resolved to a probe reaches the service as /healthz" test "$(body enc_probe)" = '{"status":"ok","version":"stub","commit":"stub"}'
WHY="raw target reached the service"; check "R4 raw encoded target never forwarded" bash -c 'sleep 0.5; ! docker logs "$1" 2>&1 | grep -q "%2f"' _ "$STUB"
req enc_ready "$BASE/api/v1/operations/x%2f..%2f..%2f..%2f..%2freadyz"
WHY=$(body enc_ready); check "R4 encoded path resolved to /readyz reaches the service as /readyz" test "$(body enc_ready)" = '{"status":"ready","version":"stub","commit":"stub"}'
req enc_api "$BASE/api/v1/x%2fy?q=%2f"
WHY=$(body enc_api); check "R4 API gets the routed path, query unchanged" grep -q '"path":"/api/v1/x/y?q=%2f"' "$T/enc_api.b"
# Stay within the probe transport limit while proving no body is forwarded.
head -c 16384 /dev/zero | tr '\0' a > "$T/16k"
req probe_body -X POST --data-binary @"$T/16k" "$BASE/healthz"
WHY=$(docker logs "$STUB" 2>&1 | grep '^REQ POST /healthz' | tail -1)
check "R9 probes forward no body" bash -c 'sleep 0.5; docker logs "$1" 2>&1 | grep "^REQ POST /healthz" | tail -1 | grep -q " 0$"' _ "$STUB"
head -c 1048577 /dev/zero | tr '\0' a > "$T/1m1"
req probe_big -X POST --data-binary @"$T/1m1" "$BASE/readyz"
problem probe_big 413 PAYLOAD_TOO_LARGE
req accel "$BASE/api/v1/accel"
WHY=$(body accel); check "service cannot redirect nginx internally (X-Accel-Redirect ignored)" bash -c '[[ $(cat "$1.s") == 200 ]] && grep -q "\"path\":\"/api/v1/accel\"" "$1.b" && ! grep -qi "^X-Accel" "$1.h"' _ "$T/accel"

# --- R4 metrics and pprof never routed ------------------------------------------
for p in /metrics /debug/pprof/ /api/../metrics /api/%2e%2e/metrics /api/v1/%2e%2e/%2e%2e/metrics; do
  n=admin$((++i))
  req "$n" "$BASE$p"
  WHY="status $(status "$n"), body $(head -c 40 "$T/$n.b")"
  check "R4 $p not routed" bash -c '[[ $(cat "$1.s") == 404 ]] && ! grep -q "stub admin surface" "$1.b"' _ "$T/$n"
done

# --- server-level errors (answered before a location is chosen) ---------------------
srv() { # srv <name> <expected status> <curl args…>
  local n=$1 st=$2; shift 2
  req "$n" "$@"
  check "$n: status $st" is_status "$n" "$st"
  edge_headers "$n"
}
srv trace 405 -X TRACE "$BASE/api/v1/operations"
srv bighdr 400 -H "X-Big: $(head -c 9000 /dev/zero | tr '\0' a)" "$BASE/"
srv biguri 414 "$BASE/$(head -c 9000 /dev/zero | tr '\0' a)"
srv clte 400 -X POST -H 'Content-Length: 4' -H 'Transfer-Encoding: chunked' --data-binary @/dev/null "$BASE/api/v1/operations/add"
# curl sends one Host header only: a raw request for the duplicate.
{ exec 3<> "/dev/tcp/127.0.0.1/$WEB_PORT" && printf 'GET / HTTP/1.1\r\nHost: a\r\nHost: b\r\nConnection: close\r\n\r\n' >&3 && cat <&3 > "$T/duphost.raw"; exec 3<&-; } 2> /dev/null
sed -n '1,/^\r$/p' "$T/duphost.raw" | tr -d '\r' > "$T/duphost.h"
head -1 "$T/duphost.h" | cut -d' ' -f2 > "$T/duphost.s"
check "duphost: status 400" is_status duphost 400
edge_headers duphost
req apinoslash "$BASE/api"
check "/api is 404, no redirect" is_status apinoslash 404
check "/api: no Location" no_header apinoslash Location
edge_headers apinoslash

# --- D7b: a client that stops sending is dropped after 10 s -------------------------
start=$(date +%s)
{ exec 3<> "/dev/tcp/127.0.0.1/$WEB_PORT" && printf 'POST /api/v1/operations/add HTTP/1.1\r\nHost: a\r\nContent-Length: 10\r\n\r\n' >&3 && timeout 20 cat <&3 > /dev/null; exec 3<&-; } 2> /dev/null
held=$(( $(date +%s) - start ))
WHY="connection held ${held}s"; check "D7b stalled body dropped after the 10 s body timeout" test "$held" -ge 9 -a "$held" -le 13

# --- nginx-health --------------------------------------------------------------
req health "$BASE/nginx-health"
check "nginx-health 200" is_status health 200
check "nginx-health body" test "$(body health)" = ok
edge_headers health

# --- R5/R7 API pass-through ------------------------------------------------------
ID=fixed-id_1.A
req api -H "X-Request-ID: $ID" "$BASE/api/v1/operations?x=1"
check "R7 API 200" is_status api 200
check "R7 API Cache-Control from the service" is_header api Cache-Control no-store
check "R5 CORP from the service, once" is_header api Cross-Origin-Resource-Policy same-origin
edge_headers api
req http10 -0 -H 'Host:' "$BASE/api/v1/operations"
check "R7 HTTP/1.0 without Host reaches the service" is_status http10 200
WHY=$(body api); check "R7 path and query unchanged" grep -q '"path":"/api/v1/operations?x=1"' "$T/api.b"
for st in 400 404 405 415 422 500; do
  n=pass$st
  req "$n" -H "X-Request-ID: $ID" "$BASE/api/v1/status/$st"
  check "R7 $st status passes" is_status "$n" "$st"
  WHY="body differs: $(body "$n")"
  check "R7 $st body unchanged" test "$(body "$n")" = "$(direct GET "/api/v1/status/$st" 0 "$ID")"
  check "R7 $st problem+json" is_header "$n" Content-Type application/problem+json
done
check "R7 405 Allow passes" is_header pass405 Allow POST
edge_headers pass422
head -c 5000 /dev/zero | tr '\0' a > "$T/5k"
req p5k -X POST -H 'Content-Type: application/json' -H "X-Request-ID: $ID" --data-binary @"$T/5k" "$BASE/api/v1/operations/add"
check "R7 5000-byte body: service 413" is_status p5k 413
WHY=$(body p5k); check "R7 5000-byte body: service problem unchanged" test "$(body p5k)" = "$(direct POST /api/v1/operations/add 5000 "$ID")"
head -c 1048576 /dev/zero | tr '\0' a > "$T/1m"
req p1m -X POST -H 'Content-Type: application/json' -H "X-Request-ID: $ID" --data-binary @"$T/1m" "$BASE/api/v1/operations/add"
WHY=$(body p1m); check "R7/R10 exactly 1 MiB reaches the service (its 413, with instance)" grep -q '"instance":"/api/v1/operations/add"' "$T/p1m.b"

# --- R10 transport limit ---------------------------------------------------------
before=$(stub_seen POST)
head -c 1048577 /dev/zero | tr '\0' a > "$T/1m1"
req big -X POST -H 'Content-Type: application/json' --data-binary @"$T/1m1" "$BASE/api/v1/operations/add"
problem big 413 PAYLOAD_TOO_LARGE
head -c 2097152 /dev/zero | tr '\0' a > "$T/2m"
req chunked -X POST -H 'Content-Type: application/json' -H 'Transfer-Encoding: chunked' --data-binary @"$T/2m" "$BASE/api/v1/operations/add"
problem chunked 413 PAYLOAD_TOO_LARGE
WHY="stub saw $(( $(stub_seen POST) - before )) POSTs"; check "R10 oversize bodies never reach the service" test "$(stub_seen POST)" = "$before"

# --- R6 request IDs ---------------------------------------------------------------
L128=$(head -c 128 /dev/zero | tr '\0' a); L129=${L128}b
req id_ok -H "X-Request-ID: $ID" "$BASE/api/v1/operations"
check "R6 valid ID echoed" is_header id_ok X-Request-ID "$ID"
WHY=$(body id_ok); check "R6 service saw the valid ID once" grep -q "\"requestIdHeaders\":1,\"requestId\":\"$ID\"" "$T/id_ok.b"
req id_128 -H "X-Request-ID: $L128" "$BASE/api/v1/operations"
check "R6 128 characters kept" is_header id_128 X-Request-ID "$L128"
replaced() { # replaced <name>: a generated 32-hex ID, the one the service saw
  local id; id=$(hval "$1" X-Request-ID)
  WHY="header '$id', body $(body "$1")"
  [[ $id =~ ^[0-9a-f]{32}$ ]] && grep -q "\"requestIdHeaders\":1,\"requestId\":\"$id\"" "$T/$1.b"
}
req id_129 -H "X-Request-ID: $L129" "$BASE/api/v1/operations"; check "R6 129 characters replaced" replaced id_129
req id_xss -H 'X-Request-ID: <script>' "$BASE/api/v1/operations"; check "R6 <script> replaced" replaced id_xss
req id_sp -H 'X-Request-ID: a b' "$BASE/api/v1/operations"; check "R6 space replaced" replaced id_sp
req id_two -H 'X-Request-ID: aaa' -H 'X-Request-ID: bbb' "$BASE/api/v1/operations"; check "R6 two headers replaced" replaced id_two
req id_empty -H 'X-Request-ID;' "$BASE/api/v1/operations"; check "R6 empty value replaced" replaced id_empty
req id_none "$BASE/api/v1/operations"; check "R6 absent: generated" replaced id_none
req id_static -H 'X-Request-ID: <script>' "$BASE/"
WHY=$(hval id_static X-Request-ID); check "R6 static response: one validated ID" bash -c '[[ $1 =~ ^[0-9a-f]{32}$ ]]' _ "$WHY"
req id_prob -H 'X-Request-ID: <script>' -X POST --data-binary @"$T/1m1" "$BASE/api/v1/operations/add"
problem id_prob 413 PAYLOAD_TOO_LARGE
WHY="raw ID reflected"; check "R6/RNF-SEC-02 invalid ID never reflected" bash -c '! grep -q "<script>" "$1.b" "$1.h"' _ "$T/id_prob"
req id_prob_ok -H "X-Request-ID: $ID" -X POST --data-binary @"$T/1m1" "$BASE/api/v1/operations/add"
check "R6 edge problem keeps a valid ID" is_header id_prob_ok X-Request-ID "$ID"

# --- R8 interception ----------------------------------------------------------------
for st in 502 503 504; do
  req "up$st" "$BASE/api/v1/status/$st"
  problem "up$st" 503 SERVICE_UNAVAILABLE
done
start=$(date +%s)
req slow "$BASE/api/v1/slow"
elapsed=$(( $(date +%s) - start ))
problem slow 503 SERVICE_UNAVAILABLE
WHY="${elapsed}s"; check "R8 timeout answered by the 10 s read timeout" test "$elapsed" -ge 9 -a "$elapsed" -le 12

# --- R9 probes ---
req rzok "$BASE/readyz"
check "R9 /readyz 200 passes" is_status rzok 200
WHY=$(body rzok); check "R9 /readyz body unchanged" test "$(body rzok)" = '{"status":"ready","version":"stub","commit":"stub"}'
edge_headers rzok
req hz "$BASE/healthz"
check "R9 /healthz 200" is_status hz 200
WHY=$(body hz); check "R9 /healthz body unchanged" test "$(body hz)" = '{"status":"ok","version":"stub","commit":"stub"}'
check "R9 /healthz no-store from the service" is_header hz Cache-Control no-store
edge_headers hz
docker exec "$STUB" touch /tmp/draining
req rz "$BASE/readyz"
check "R9 draining /readyz 503 passes" is_status rz 503
check "R9 draining body is Health JSON" test "$(body rz)" = '{"status":"draining","version":"stub","commit":"stub"}'
check "R9 draining type" is_header rz Content-Type application/json
edge_headers rz
docker exec "$STUB" rm -f /tmp/draining

# Boundary and streamed-body checks use GET, as the real probes do.
head -c 16385 /dev/zero | tr '\0' a > "$T/16k1"
for probe in healthz readyz; do
  req "${probe}_16k" -X GET --data-binary @"$T/16k" "$BASE/$probe"
  check "R9 /$probe 16384-byte body accepted" is_status "${probe}_16k" 200
  probe_before=$(stub_seen "GET /$probe ")
  req "${probe}_16k1" -X GET --data-binary @"$T/16k1" "$BASE/$probe"
  problem "${probe}_16k1" 413 PAYLOAD_TOO_LARGE
  req "${probe}_chunked" -X GET -H 'Transfer-Encoding: chunked' --data-binary @"$T/16k1" "$BASE/$probe"
  problem "${probe}_chunked" 413 PAYLOAD_TOO_LARGE
  check "R9 /$probe oversized bodies never reach the service" test "$(stub_seen "GET /$probe ")" = "$probe_before"
done

# --- R-LC connection limit -----------------------------------------------------
# Host sockets and host curl share the bridge gateway address seen by nginx.
# A container holding the sockets would have a different client address.
# Refill the request-rate bucket before opening paced, incomplete POSTs.
lc_quiet_start=$SECONDS
sleep 3
lc_before=$(stub_seen 'POST /api/v1/operations/add ')
open_held() {
  local fd
  if exec {fd}<> "/dev/tcp/127.0.0.1/$WEB_PORT"; then
    held_fds+=("$fd")
    printf 'POST /api/v1/operations/add HTTP/1.1\r\nHost: localhost\r\nContent-Length: 100\r\nContent-Type: application/json\r\n\r\n' >&"$fd"
  else
    return 1
  fi
}
held_pending() {
  local fd byte rc
  [[ ${#held_fds[@]} == 20 ]] || return 1
  for fd in "${held_fds[@]}"; do
    # Timeout (>128), rather than EOF or a response byte, proves it is pending.
    IFS= read -r -n 1 -t 0.02 -u "$fd" byte
    rc=$?
    (( rc > 128 )) && [[ -z $byte ]] || return 1
  done
}
lc_start=$SECONDS
lc_open=true
for _ in $(seq 19); do
  open_held || lc_open=false
  sleep 0.06
done
req lc19 --max-time 0.5 -X POST -H 'Content-Type: application/json' --data '{}' "$BASE/api/v1/operations/add"
check "R-LC 19 held: 20th request accepted" is_status lc19 200
open_held || lc_open=false
sleep 0.06
check "R-LC 20 held sockets opened" "$lc_open"
check "R-LC 20 held sockets still pending" held_pending
# The preceding sleep was at least three seconds; the 21 paced requests fit
# inside the empty rate bucket's burst even if they all arrived together.
check "R-LC rate bucket refilled before held requests" test "$((lc_start - lc_quiet_start))" -ge 3
req lc20 --max-time 0.5 -X POST -H 'Content-Type: application/json' --data '{}' "$BASE/api/v1/operations/add"
for entry in root:/ nginx:/nginx-health probe:/healthz; do
  n=${entry%%:*}; path=${entry#*:}
  req "lc_$n" --max-time 0.5 "$BASE$path"
  check "R-LC 20 held: $path stays available" is_status "lc_$n" 200
done
# Close before schema validation and log inspection so neither extends the hold.
close_held
check "R-LC held sockets closed within 8 seconds" test "$((SECONDS - lc_start))" -le 8
problem lc20 429 RATE_LIMITED
check "R-LC held POSTs never complete at the service" test "$(stub_seen 'POST /api/v1/operations/add ')" = "$((lc_before + 1))"
# Poll at most five seconds, including curl's deadline, for nginx to release slots.
for _ in $(seq 10); do
  req lc_released --max-time 0.25 -X POST -H 'Content-Type: application/json' --data '{}' "$BASE/api/v1/operations/add"
  [[ $(status lc_released) == 200 ]] && break
  sleep 0.1
done
check "R-LC after close: POST accepted again" is_status lc_released 200

# --- R11 rate limit (last API use of the bucket in this phase) --------------------------
sleep 3
# API bursts use 15 workers to isolate request rate from the 20-connection limit.
# Static and probe bursts keep 60 workers to exercise their unlimited locations.
burst() { seq 120 | xargs -P "${2:-60}" -I{} curl -s -o /dev/null -w '%{http_code}\n' "$1" | sort | uniq -c | tr '\n' ' '; }
start=$(date +%s%N)
api_burst=$(burst "$BASE/api/v1/operations" 15)
burst_ms=$(( ($(date +%s%N) - start) / 1000000 ))
WHY=$api_burst; check "R11 API burst: some 429" grep -q ' 429' <<< "$api_burst"
n200=$(grep -o '[0-9]* 200' <<< "$api_burst" | cut -d' ' -f1)
WHY=$api_burst; check "R11 API burst: at least 41 served" test "${n200:-0}" -ge 41
limit=$(( 41 + 20 * burst_ms / 1000 + 5 ))
WHY="$api_burst in ${burst_ms} ms, at most $limit allowed"; check "R11 API burst: no more than 20 r/s beyond the burst of 40" test "${n200:-0}" -le "$limit"
# One rejected request of a second burst, kept whole for the problem checks.
seq 80 | xargs -P 15 -I{} sh -c 'curl -s -D "$1/rl$2.h" -o "$1/rl$2.b" -w "%{http_code}" "$3" > "$1/rl$2.s"' _ "$T" {} "$BASE/api/v1/operations"
for f in "$T"/rl*.s; do [[ $(cat "$f") == 429 ]] && { cp "$f" "$T/rl.s"; cp "${f%.s}.h" "$T/rl.h"; cp "${f%.s}.b" "$T/rl.b"; break; }; done
problem rl 429 RATE_LIMITED
static_burst=$(burst "$BASE/")
WHY=$static_burst; check "R11 static never limited (all 200)" bash -c '[[ $1 =~ ^\ *120\ 200\ $ ]]' _ "$static_burst"
probe_burst=$(burst "$BASE/healthz")
WHY=$probe_burst; check "R11 probes never limited (all 200)" bash -c '[[ $1 =~ ^\ *120\ 200\ $ ]]' _ "$probe_burst"
sleep 3
# `return` must not take the MIME type from the URI extension (both hops).
req extmime "$BASE/api/v1/status/503.js"
problem extmime 503 SERVICE_UNAVAILABLE
req extmime413 -X POST --data-binary @"$T/1m1" "$BASE/api/v1/operations/add.js"
problem extmime413 413 PAYLOAD_TOO_LARGE

# --- no retried requests: a second service instance behind the same name -------------
docker run -d --name "$STUB2" --network "$NET" --network-alias api \
  -v "$HERE/stub-upstream.mjs:/stub.mjs:ro" "$NODE_IMAGE" node /stub.mjs > /dev/null
sleep 1
docker exec "$WEB" nginx -s reload 2> /dev/null; sleep 1
# Round-robin state is per nginx worker: enough requests to reach both instances.
for k in $(seq 12); do
  req "retry$k" -X POST -H 'Content-Type: application/json' --data '{}' "$BASE/api/v1/status/502"
  check "retry$k: failed POST answered 503" is_status "retry$k" 503
done
sleep 0.5
one=$(docker logs "$STUB" 2>&1 | grep -c '^REQ POST /api/v1/status/502'); two=$(docker logs "$STUB2" 2>&1 | grep -c '^REQ POST /api/v1/status/502')
WHY="instances saw $one and $two"; check "retry check reaches both instances" test "$one" -ge 1 -a "$two" -ge 1
seen=$(( $(docker logs "$STUB" 2>&1 | grep -c '^REQ POST /api/v1/status/502') + $(docker logs "$STUB2" 2>&1 | grep -c '^REQ POST /api/v1/status/502') ))
WHY="the service instances saw $seen POSTs for 12 requests"; check "R8 failed POSTs never retried on another instance" test "$seen" = 12

# --- R8 service down (last) --------------------------------------------------------------
docker stop -t 1 "$STUB" "$STUB2" > /dev/null
req down "$BASE/api/v1/operations"
problem down 503 SERVICE_UNAVAILABLE
req downpost -X POST -H 'Content-Type: application/json' --data '{"operands":["1","2"]}' "$BASE/api/v1/operations/add"
problem downpost 503 SERVICE_UNAVAILABLE
req downhz "$BASE/healthz"
problem downhz 503 SERVICE_UNAVAILABLE
req downrz "$BASE/readyz"
problem downrz 503 SERVICE_UNAVAILABLE
req downhealth "$BASE/nginx-health"
check "R8 nginx-health independent of the service" is_status downhealth 200
req downroot "$BASE/"
check "R8 app served without the service" is_status downroot 200

# --- connect timeout: an upstream that never answers the TCP handshake --------------
# An unused address of the private network: no host answers, so the TCP connect
# waits for the 2 s timeout.
subnet=$(docker network inspect -f '{{(index .IPAM.Config 0).Subnet}}' "$NET")
# One request per address and container: a failed neighbour lookup is cached, so
# a second request to the same address would fail at once instead of timing out.
octet=240
for p in /api/v1/operations /healthz; do
  hole=${subnet%.*}.$((octet++))
  docker run -d --name "$WEB3" --network "$NET" -e "API_UPSTREAM=$hole:8081" -p "127.0.0.1:$((WEB_PORT + 2)):8080" \
    --read-only --cap-drop ALL --security-opt no-new-privileges \
    --tmpfs /tmp --tmpfs /etc/nginx/conf.d "${mount[@]}" "$IMAGE" > /dev/null
  sleep 2
  n=blackhole$((++i))
  start=$(date +%s%N); req "$n" "http://127.0.0.1:$((WEB_PORT + 2))$p"; ms=$(( ($(date +%s%N) - start) / 1000000 ))
  WHY="${ms} ms"; check "R8 connect timeout on $p: answered after about 2 s" test "$ms" -ge 1500 -a "$ms" -le 4000
  problem "$n" 503 SERVICE_UNAVAILABLE
  docker rm -f "$WEB3" > /dev/null 2>&1
done

# --- outer hop failure: the inner hop not listening (a copy of the template) -------------
tpl=$REPO/deploy/nginx/default.conf.template
[[ -n $OVERRIDE && -f $OVERRIDE/default.conf.template ]] && tpl=$OVERRIDE/default.conf.template
sed 's|proxy_pass http://127.0.0.1:8079/api/;|proxy_pass http://127.0.0.1:8078/api/;|' "$tpl" > "$T/noinner.template"
WHY="the inner-hop address was not found in the template"; check "outer-hop failure set-up changed the template" bash -c '! cmp -s "$1" "$2"' _ "$tpl" "$T/noinner.template"
docker run -d --name "$WEB4" --network "$NET" -e "API_UPSTREAM=$hole:8081" -p "127.0.0.1:$((WEB_PORT + 2)):8080" \
  --read-only --cap-drop ALL --security-opt no-new-privileges --tmpfs /tmp --tmpfs /etc/nginx/conf.d \
  -v "$T/noinner.template:/etc/nginx/templates/default.conf.template:ro" "$IMAGE" > /dev/null
sleep 2
start=$(date +%s%N); req noinner "http://127.0.0.1:$((WEB_PORT + 2))/api/v1/operations"; ms=$(( ($(date +%s%N) - start) / 1000000 ))
# A refused loopback connection fails at once; the inner hop's own failure would take 2 s.
WHY="${ms} ms"; check "R8 outer hop answers its own failure at once" test "$ms" -lt 1000
problem noinner 503 SERVICE_UNAVAILABLE
docker rm -f "$WEB4" > /dev/null 2>&1

printf '\n%d passed, %d failed\n' "$pass" "$fail"
(( fail == 0 ))
