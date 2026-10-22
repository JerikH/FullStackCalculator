#!/usr/bin/env bash
# Integrator check (W3): headers and cache policy of the embedded app served by the Go service.
# Usage: embedded-headers.sh <base-url> <repo-root>
set -uo pipefail
BASE=$1 REPO=$2
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
pass=0 fail=0
ok() { pass=$((pass + 1)); printf 'PASS %s\n' "$1"; }
bad() { fail=$((fail + 1)); printf 'FAIL %s — %s\n' "$1" "$2"; }
hval() { grep -i "^$2:" "$T/$1.h" | head -1 | cut -d: -f2- | sed 's/^ //; s/\r$//'; }
hcount() { grep -ci "^$2:" "$T/$1.h"; }
req() { local n=$1; shift; curl -sS -D "$T/$n.h" -o "$T/$n.b" -w '%{http_code}' "$@" > "$T/$n.s"; }
eq() { if [[ $2 == "$3" ]]; then ok "$1"; else bad "$1" "got '$2', want '$3'"; fi; }

# Source of truth for the edge header values: deploy/nginx/security-headers.conf
conf=$REPO/deploy/nginx/security-headers.conf
edge() { grep -E "^add_header $1 " "$conf" | sed -E 's/^add_header [^ ]+ "(.*)" always;$/\1/'; }

index=$(grep -o 'assets/[^"]*\.js' "$REPO/backend/internal/web/dist/index.html" | head -1)
css=$(grep -o 'assets/[^"]*\.css' "$REPO/backend/internal/web/dist/index.html" | head -1)
# shellcheck disable=SC2010 # the dist folder holds only hashed asset names.
map=$(ls "$REPO/backend/internal/web/dist/assets/" | grep '\.map$' | head -1)
printf 'bundle=%s css=%s map=%s\n' "$index" "$css" "$map"

for path in / /index.html /theme-init.js "/$index" "/$css" "/assets/$map"; do
  n=$(echo "$path" | tr '/.' '__')
  req "$n" "$BASE$path"
  eq "$path status" "$(cat "$T/$n.s")" 200
  for h in Content-Security-Policy X-Content-Type-Options Referrer-Policy Permissions-Policy Cross-Origin-Opener-Policy; do
    eq "$path $h once" "$(hcount "$n" "$h")" 1
    eq "$path $h == security-headers.conf" "$(hval "$n" "$h")" "$(edge "$h")"
  done
  case $path in
    /assets/*) eq "$path Cache-Control" "$(hval "$n" Cache-Control)" 'public, max-age=31536000, immutable' ;;
    *) eq "$path Cache-Control" "$(hval "$n" Cache-Control)" 'no-cache' ;;
  esac
done
eq "/ Content-Type" "$(hval _ Content-Type)" 'text/html; charset=utf-8'

# API responses keep the API header set: no-store, API CSP (default-src 'none'...), no app CSP.
req api -X POST -H 'Content-Type: application/json' -d '{"operands":["0.1","0.2"]}' "$BASE/api/v1/operations/add"
eq "api status" "$(cat "$T/api.s")" 200
eq "api Cache-Control" "$(hval api Cache-Control)" no-store
printf 'API CSP: %s\n' "$(hval api Content-Security-Policy)"
if [[ $(hval api Content-Security-Policy) != "$(edge Content-Security-Policy)" ]]; then ok "api CSP differs from the app CSP"; else bad "api CSP" "equal to app CSP"; fi
eq "api CSP once" "$(hcount api Content-Security-Policy)" 1
req ops "$BASE/api/v1/operations"; eq "operations Cache-Control" "$(hval ops Cache-Control)" no-store
req hz "$BASE/healthz"; eq "healthz status" "$(cat "$T/hz.s")" 200
eq "healthz Cache-Control" "$(hval hz Cache-Control)" no-store
req rz "$BASE/readyz"; eq "readyz status" "$(cat "$T/rz.s")" 200

# Conditional request and unknown file
etag=$(hval _ ETag); req cond -H "If-None-Match: $etag" "$BASE/"
eq "/ If-None-Match 304" "$(cat "$T/cond.s")" 304
eq "304 Cache-Control" "$(hval cond Cache-Control)" no-cache
req miss "$BASE/nope.js"; eq "missing file 404" "$(cat "$T/miss.s")" 404
eq "missing file problem+json" "$(hval miss Content-Type)" 'application/problem+json'
req dot "$BASE/.gitkeep"; eq "dotfile 404" "$(cat "$T/dot.s")" 404
printf 'TOTAL pass=%d fail=%d\n' "$pass" "$fail"
[[ $fail == 0 ]]
