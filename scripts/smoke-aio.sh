#!/usr/bin/env bash
# Smoke test of the all-in-one container (UC-OPS-03): starts the image with the hardened
# run options, checks it with curl, stops it and removes it.
#
# Usage: scripts/smoke-aio.sh <image> <host-port> <container-name>
#   The container is published on 127.0.0.1:<host-port> and removed by name on exit.
#   Prints one PASS/FAIL line per check; exits non-zero when any check fails.
set -uo pipefail

if (( $# != 3 )); then
  printf 'usage: smoke-aio.sh <image> <host-port> <container-name>\n' >&2
  exit 2
fi
image=$1 port=$2 name=$3
if [[ ! $port =~ ^[0-9]{1,5}$ ]]; then
  printf 'smoke-aio: host port must be a number, got %s\n' "$port" >&2
  exit 2
fi
if [[ ! $name =~ ^[A-Za-z0-9][A-Za-z0-9_.-]*$ ]]; then
  printf 'smoke-aio: invalid container name %s\n' "$name" >&2
  exit 2
fi

root=$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)
base=http://127.0.0.1:$port
work=$(mktemp -d)
pass=0 fail=0

started=0
cleanup() {
  # Only a container this run created is removed: a container that already carried the name is left alone.
  if (( started )); then docker rm -f "$name" > /dev/null 2>&1 || true; fi
  rm -rf "$work"
}
trap cleanup EXIT

ok() { pass=$((pass + 1)); printf 'PASS %s\n' "$1"; }
bad() { fail=$((fail + 1)); printf 'FAIL %s — %s\n' "$1" "$2"; }
eq() { if [[ $2 == "$3" ]]; then ok "$1"; else bad "$1" "got '$2', want '$3'"; fi; }
matches() { if [[ $2 =~ $3 ]]; then ok "$1"; else bad "$1" "got '$2', want match of '$3'"; fi; }

# req <name> [curl args…] <url>: headers in $work/<name>.h, body in $work/<name>.b, status in $work/<name>.s
# A curl failure (timeout, truncated body) is a failed check even when the headers said 200.
req() {
  local n=$1 code=0
  shift
  curl -sS --max-time 10 -D "$work/$n.h" -o "$work/$n.b" -w '%{http_code}' "$@" > "$work/$n.s" 2> "$work/$n.err" || code=$?
  if (( code != 0 )); then bad "curl $n completed" "curl exit $code: $(head -c 200 "$work/$n.err")"; fi
}
status() { cat "$work/$1.s"; }
hcount() { grep -ci "^$2:" "$work/$1.h" || true; }
hval() { grep -i "^$2:" "$work/$1.h" | head -1 | cut -d: -f2- | sed 's/^ //; s/\r$//' || true; }
body() { cat "$work/$1.b"; }

# The edge's header values are the reference: deploy/nginx/security-headers.conf.
edge_value() { grep -E "^add_header $1 " "$root/deploy/nginx/security-headers.conf" | sed -E 's/^add_header [^ ]+ "(.*)" always;$/\1/'; }
policy_headers=(Content-Security-Policy X-Content-Type-Options Referrer-Policy Permissions-Policy Cross-Origin-Opener-Policy)

# --- start: hardened run, no --rm so the exit code can be read after the stop ---------------
if docker inspect "$name" > /dev/null 2>&1; then
  printf 'smoke-aio: a container named %s already exists; remove it or choose another name\n' "$name" >&2
  exit 1
fi
started=1
if ! docker run -d --name "$name" --read-only --cap-drop ALL --security-opt no-new-privileges \
  -p "127.0.0.1:$port:8080" "$image" > /dev/null; then
  printf 'smoke-aio: could not start %s on port %s (is the port free? the split stack uses the same port)\n' "$image" "$port" >&2
  exit 1
fi

health=starting
for _ in $(seq 60); do
  health=$(docker inspect -f '{{.State.Health.Status}}' "$name" 2> /dev/null || echo gone)
  [[ $health == healthy || $health == unhealthy || $health == gone ]] && break
  sleep 2
done
eq 'container is healthy' "$health" healthy

hardening=$(docker inspect -f '{{.HostConfig.ReadonlyRootfs}} {{.HostConfig.CapDrop}} {{.HostConfig.SecurityOpt}}' "$name")
eq 'read-only root, all capabilities dropped, no-new-privileges' "$hardening" 'true [ALL] [no-new-privileges]'
published=$(docker port "$name" | awk '{print $1}' | sort -u | tr '\n' ' ')
eq 'only 8080/tcp is published' "$published" '8080/tcp '

# --- the app: HTML, bootstrap, assets --------------------------------------------------------
req root "$base/"
eq 'GET / is 200' "$(status root)" 200
matches 'GET / is HTML' "$(hval root Content-Type)" '^text/html'
eq 'GET / is no-cache' "$(hval root Cache-Control)" no-cache
for h in "${policy_headers[@]}"; do
  eq "GET / $h once" "$(hcount root "$h")" 1
  eq "GET / $h equals the edge value" "$(hval root "$h")" "$(edge_value "$h")"
done
js=$(grep -o 'assets/[^"]*\.js' "$work/root.b" | head -1)
css=$(grep -o 'assets/[^"]*\.css' "$work/root.b" | head -1)
if [[ -z $js || -z $css ]]; then bad 'index.html names a hashed script and stylesheet' "script '$js' stylesheet '$css'"; else ok 'index.html names a hashed script and stylesheet'; fi

req theme "$base/theme-init.js"
eq 'GET /theme-init.js is 200' "$(status theme)" 200
matches 'theme-init.js is JavaScript' "$(hval theme Content-Type)" '^(text|application)/javascript'
eq 'theme-init.js is no-cache' "$(hval theme Cache-Control)" no-cache
eq 'theme-init.js CSP once' "$(hcount theme Content-Security-Policy)" 1

req script "$base/$js"
eq 'hashed script is 200' "$(status script)" 200
matches 'hashed script is JavaScript' "$(hval script Content-Type)" '^(text|application)/javascript'
eq 'hashed script is immutable' "$(hval script Cache-Control)" 'public, max-age=31536000, immutable'
req style "$base/$css"
eq 'hashed stylesheet is 200' "$(status style)" 200
matches 'hashed stylesheet is CSS' "$(hval style Content-Type)" '^text/css'
eq 'hashed stylesheet is immutable' "$(hval style Cache-Control)" 'public, max-age=31536000, immutable'
req map "$base/$js.map"
eq 'source map is 200' "$(status map)" 200
matches 'source map is JSON' "$(hval map Content-Type)" '^application/json'
eq 'source map is immutable' "$(hval map Cache-Control)" 'public, max-age=31536000, immutable'

# --- the API: a calculation and a problem; the API header set (E4) ----------------------------
req add -X POST -H 'Content-Type: application/json' -d '{"operands":["0.1","0.2"]}' "$base/api/v1/operations/add"
eq 'POST add 0.1 + 0.2 is 200' "$(status add)" 200
matches 'POST add result is 0.3' "$(body add)" '"result":"0\.3"'
eq 'API response is no-store' "$(hval add Cache-Control)" no-store
eq 'API response CSP is the API one' "$(hval add Content-Security-Policy)" "default-src 'none'; frame-ancestors 'none'"
eq 'API response has no Permissions-Policy' "$(hcount add Permissions-Policy)" 0
eq 'API response has no Cross-Origin-Opener-Policy' "$(hcount add Cross-Origin-Opener-Policy)" 0
eq 'API response has one X-Request-ID' "$(hcount add X-Request-ID)" 1
req zero -X POST -H 'Content-Type: application/json' -d '{"operands":["1","0"]}' "$base/api/v1/operations/divide"
eq 'POST divide 1 / 0 is 422' "$(status zero)" 422
matches 'division by zero is a problem+json' "$(hval zero Content-Type)" '^application/problem\+json'
matches 'division by zero carries its code' "$(body zero)" '"code":"DIVISION_BY_ZERO"'
req health "$base/healthz"
eq 'GET /healthz is 200' "$(status health)" 200

# --- E2: unknown paths are problems, never a listing, redirect or HTML fallback ---------------
req missing "$base/nope.js"
eq 'missing file is 404' "$(status missing)" 404
matches 'missing file is the NOT_FOUND problem' "$(body missing)" '"code":"NOT_FOUND"'
req dir "$base/assets/"
eq 'a directory is 404' "$(status dir)" 404
matches 'a directory is the NOT_FOUND problem' "$(body dir)" '"code":"NOT_FOUND"'
req dot "$base/.gitkeep"
eq 'a dotfile is 404' "$(status dot)" 404
req post_unknown -X POST "$base/nope"
eq 'POST on an unknown path is 405' "$(status post_unknown)" 405
eq 'the 405 allows GET, HEAD' "$(hval post_unknown Allow)" 'GET, HEAD'

# --- E3: HEAD, Range, If-None-Match -----------------------------------------------------------
etag=$(hval root ETag)
matches 'GET / has a strong ETag' "$etag" '^"[0-9a-f]+"$'
req head -I "$base/"
eq 'HEAD / is 200' "$(status head)" 200
eq 'HEAD / keeps the cache policy' "$(hval head Cache-Control)" no-cache
req range -H 'Range: bytes=0-9' "$base/"
eq 'Range on / is 206' "$(status range)" 206
matches 'Range gives a Content-Range' "$(hval range Content-Range)" '^bytes 0-9/[0-9]+$'
eq 'Range response is 10 bytes' "$(wc -c < "$work/range.b" | tr -d ' ')" 10
req cond -H "If-None-Match: $etag" "$base/"
eq 'If-None-Match gives 304' "$(status cond)" 304
eq '304 keeps the cache policy' "$(hval cond Cache-Control)" no-cache
eq '304 keeps the ETag' "$(hval cond ETag)" "$etag"

# --- stop: the service drains and exits 0 ------------------------------------------------------
docker stop "$name" > /dev/null 2>&1
eq 'docker stop exits the service with code 0' "$(docker inspect -f '{{.State.ExitCode}}' "$name" 2> /dev/null)" 0

printf 'TOTAL pass=%d fail=%d\n' "$pass" "$fail"
(( fail == 0 ))
