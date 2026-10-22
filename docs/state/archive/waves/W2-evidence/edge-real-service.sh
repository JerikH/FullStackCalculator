#!/usr/bin/env bash
# shellcheck disable=SC2016 # single-quoted bash -c bodies are meant literally; values arrive as arguments.
# Wave W2 integration (RF-OPS-04, RF-API-07, RNF-SEC-03): the merged web image against the REAL calculator service.
# Usage: edge-real-service.sh <image> <service-binary> <scratch-dir>
set -uo pipefail
IMAGE=$1 BIN=$2 S=$3
REPO=$(git rev-parse --show-toplevel)
API_ADDR=172.17.0.1:4101 ADMIN_ADDR=127.0.0.1:4102 WEB_PORT=4106
WEB=fullstackcalculator-w2-real-web
BASE=http://127.0.0.1:$WEB_PORT
LOG=$S/service.log
T=$(mktemp -d)
pass=0 fail=0
ok()  { pass=$((pass + 1)); printf 'PASS %s\n' "$1"; }
bad() { fail=$((fail + 1)); printf 'FAIL %s — %s\n' "$1" "$2"; }
check() { local n=$1; shift; if "$@"; then ok "$n"; else bad "$n" "${WHY:-false}"; fi; WHY=; }
req() { local n=$1; shift; sleep 0.06; curl -sS --path-as-is -D "$T/$n.h" -o "$T/$n.b" -w '%{http_code}' "$@" > "$T/$n.s" 2>"$T/$n.err" || true; }
st() { cat "$T/$1.s"; }
hcount() { grep -ci "^$2:" "$T/$1.h"; }
hval() { grep -i "^$2:" "$T/$1.h" | head -1 | cut -d: -f2- | sed 's/^ //; s/\r$//'; }
is_status() { WHY="status $(st "$1"), want $2"; [[ $(st "$1") == "$2" ]]; }
is_header() { WHY="$2: '$(hval "$1" "$2")' x$(hcount "$1" "$2"), want '$3' once"; [[ $(hcount "$1" "$2") == 1 && $(hval "$1" "$2") == "$3" ]]; }
jq_is() { WHY="$2 = $(jq -c "$2" "$T/$1.b"), want $3"; [[ $(jq -c "$2" "$T/$1.b") == "$3" ]]; }
same_body() { WHY="bodies differ: $(cat "$T/$1.b") vs $(cat "$T/$2.b")"; cmp -s "$T/$1.b" "$T/$2.b"; }
in_log() { WHY="no service log line with request_id $1"; sleep 0.2; grep -F "\"request_id\":\"$1\"" "$LOG" > /dev/null; }
not_in_log() { WHY="service log contains $1"; ! grep -F -- "$1" "$LOG" > /dev/null; }
problem_ok() { WHY=$(python3 "$REPO/docs/state/archive/runs/RUN-M1-6/evidence/problem-check.py" "$REPO/backend/api/openapi.yaml" "$T/$1.b" "$2" "$(hval "$1" X-Request-ID)"); [[ -z $WHY ]]; }
CSP="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'none'"
edge_headers() {
  check "$1: CSP once (edge value)" is_header "$1" Content-Security-Policy "$CSP"
  check "$1: nosniff once" is_header "$1" X-Content-Type-Options nosniff
  check "$1: Referrer-Policy once" is_header "$1" Referrer-Policy no-referrer
  check "$1: Permissions-Policy once" is_header "$1" Permissions-Policy "camera=(), microphone=(), geolocation=()"
  check "$1: COOP once" is_header "$1" Cross-Origin-Opener-Policy same-origin
  WHY="X-Request-ID x$(hcount "$1" X-Request-ID)"; check "$1: X-Request-ID once" test "$(hcount "$1" X-Request-ID)" = 1
}

cleanup() { docker rm -f "$WEB" > /dev/null 2>&1; [[ -n ${SVC:-} ]] && kill "$SVC" 2> /dev/null; rm -rf "$T"; }
trap cleanup EXIT
docker rm -f "$WEB" > /dev/null 2>&1

CALC_HTTP_ADDR=$API_ADDR CALC_ADMIN_ADDR=$ADMIN_ADDR CALC_SHUTDOWN_DRAIN=4s CALC_LOG_FORMAT=json "$BIN" > "$LOG" 2>&1 &
SVC=$!
docker run -d --name "$WEB" --read-only --cap-drop ALL --security-opt no-new-privileges \
  --tmpfs /tmp --tmpfs /etc/nginx/conf.d -p 127.0.0.1:$WEB_PORT:8080 -e API_UPSTREAM=$API_ADDR "$IMAGE" > /dev/null
for _ in $(seq 50); do curl -sf "$BASE/readyz" > /dev/null 2>&1 && break; sleep 0.2; done

D=http://$API_ADDR
# 1. Calculation.
req calc -X POST -H 'Content-Type: application/json' -d '{"operands":["0.1","0.2"]}' "$BASE/api/v1/operations/add"
check "calc: 200" is_status calc 200
check "calc: result 0.3" jq_is calc .result '"0.3"'
check "calc: Cache-Control no-store from the service, once" is_header calc Cache-Control no-store
check "calc: CORP same-origin from the service, once" is_header calc Cross-Origin-Resource-Policy same-origin
edge_headers calc
# 2. Catalog headers.
req list "$BASE/api/v1/operations"
check "list: 200" is_status list 200
edge_headers list
# 3. Service problem passes through unchanged (same id direct and through the edge).
req p422e -X POST -H 'X-Request-ID: w2-div0' -H 'Content-Type: application/json' -d '{"operands":["1","0"]}' "$BASE/api/v1/operations/divide"
req p422d -X POST -H 'X-Request-ID: w2-div0' -H 'Content-Type: application/json' -d '{"operands":["1","0"]}' "$D/api/v1/operations/divide"
check "422: status" is_status p422e 422
check "422: body byte-identical to the direct service body" same_body p422e p422d
check "422: Content-Type problem+json" is_header p422e Content-Type application/problem+json
req p404e -H 'X-Request-ID: w2-nope' "$BASE/api/v1/operations/nope"
req p404d -H 'X-Request-ID: w2-nope' "$D/api/v1/operations/nope"
check "404 unknown operation: body identical" same_body p404e p404d
req p405e -X DELETE -H 'X-Request-ID: w2-405' "$BASE/api/v1/operations"
req p405d -X DELETE -H 'X-Request-ID: w2-405' "$D/api/v1/operations"
check "405: body identical" same_body p405e p405d
check "405: Allow passes through once" is_header p405e Allow "$(hval p405d Allow)"
edge_headers p405e
# 4. The service's own 413 (5000 bytes) passes through; above 1 MiB the edge answers.
head -c 4990 /dev/zero | tr '\0' ' ' > "$T/pad"; { printf '{"operands":["1","2"]'; cat "$T/pad"; printf '}'; } > "$T/5000.json"
req big1e -X POST -H 'X-Request-ID: w2-413' -H 'Content-Type: application/json' --data-binary @"$T/5000.json" "$BASE/api/v1/operations/add"
req big1d -X POST -H 'X-Request-ID: w2-413' -H 'Content-Type: application/json' --data-binary @"$T/5000.json" "$D/api/v1/operations/add"
check "service 413: status" is_status big1e 413
check "service 413: body identical (instance unchanged)" same_body big1e big1d
check "service 413: instance is the request path" jq_is big1e .instance '"/api/v1/operations/add"'
head -c 1048577 /dev/zero | tr '\0' 'a' > "$T/1m"
req big2 -X POST -H 'X-Request-ID: w2-1m' -H 'Content-Type: application/json' --data-binary @"$T/1m" "$BASE/api/v1/operations/add"
check "edge 413 above 1 MiB: status" is_status big2 413
check "edge 413: valid edge problem" problem_ok big2 PAYLOAD_TOO_LARGE
edge_headers big2
# 5. Request ID: header = problem body = service log.
req rid -X POST -H 'X-Request-ID: w2-corr-1' -H 'Content-Type: application/json' -d '{"operands":["1"]}' "$BASE/api/v1/operations/add"
check "rid: header echoed" is_header rid X-Request-ID w2-corr-1
check "rid: problem requestId = header" jq_is rid .requestId '"w2-corr-1"'
check "rid: service log carries it" in_log w2-corr-1
ID128=$(printf 'a%.0s' $(seq 128)); ID129=${ID128}b
req r128 -H "X-Request-ID: $ID128" "$BASE/api/v1/operations/nope"
check "128-char id kept in header" is_header r128 X-Request-ID "$ID128"
check "128-char id in problem body" jq_is r128 .requestId "\"$ID128\""
check "128-char id in service log" in_log "$ID128"
for c in 129 script space; do
  case $c in 129) v=$ID129 ;; script) v='<script>' ;; space) v='a b' ;; esac
  req "r$c" -H "X-Request-ID: $v" "$BASE/api/v1/operations/nope"
  got=$(hval "r$c" X-Request-ID)
  WHY="replaced id '$got'"; check "$c id replaced by a 32-hex id" bash -c '[[ $0 =~ ^[0-9a-f]{32}$ ]]' "$got"
  check "$c id: problem requestId = replaced header" jq_is "r$c" .requestId "\"$got\""
  check "$c id: service log has the replaced id" in_log "$got"
done
check "129-char id never reaches the service" not_in_log "$ID129"
check "<script> id never reaches the service" not_in_log '<script>'
# 6. OpenAPI document through the edge.
req spec "$BASE/api/v1/openapi.yaml"
WHY="spec differs"; check "openapi.yaml byte-identical through the edge" cmp -s "$T/spec.b" "$REPO/backend/api/openapi.yaml"
# 7. Rate limit under a burst.
seq 80 | xargs -P 40 -I{} curl -s -o /dev/null -w '%{http_code}\n' "$BASE/api/v1/operations" > "$T/burst"
WHY="$(sort "$T/burst" | uniq -c | tr '\n' ' ')"; check "burst: some 429" grep -q 429 "$T/burst"
sleep 2.5
curl -s -D "$T/rl.h" -o "$T/rl.b" -H 'X-Request-ID: w2-rl' "$BASE/api/v1/operations" > /dev/null
# (rate-limit problem validity is covered by the stub smoke; here only that it is emitted)
# 8. Draining readiness passes through; healthz stays 200; then the service is gone.
req ready0 "$BASE/readyz"; check "readyz before drain: 200" is_status ready0 200
kill -TERM "$SVC"; sleep 0.5
req ready1 -H 'X-Request-ID: w2-drain' "$BASE/readyz"
req ready1d "$D/readyz"
check "draining readyz through the edge: 503" is_status ready1 503
check "draining readyz: Health JSON status draining" jq_is ready1 .status '"draining"'
check "draining readyz: the service's Content-Type (not the edge problem)" is_header ready1 Content-Type "$(hval ready1d Content-Type)"
WHY="direct Content-Type $(hval ready1d Content-Type)"; check "draining readyz: JSON, not problem+json" bash -c '[[ $0 == application/json* ]]' "$(hval ready1 Content-Type)"
check "draining readyz: body identical to direct" same_body ready1 ready1d
edge_headers ready1
req health1 "$BASE/healthz"; check "healthz while draining: 200" is_status health1 200
wait "$SVC"; echo "service exit code $?"; SVC=
req gone -H 'X-Request-ID: w2-gone' "$BASE/api/v1/operations"
check "service gone: 503" is_status gone 503
check "service gone: valid SERVICE_UNAVAILABLE edge problem" problem_ok gone SERVICE_UNAVAILABLE
edge_headers gone
grep -c '"msg":"shutdown complete"' "$LOG" | xargs -I{} echo "shutdown complete lines: {}"
printf 'TOTAL pass=%d fail=%d\n' "$pass" "$fail"
[[ $fail == 0 ]]
