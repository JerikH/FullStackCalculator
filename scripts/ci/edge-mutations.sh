#!/usr/bin/env bash
# shellcheck disable=SC2016 # single-quoted bash -c bodies and sed scripts are meant literally; values arrive as arguments.
# Mutation checks: each breaks one rule in a copy of the edge
# configuration, runs edge-stub-smoke.sh (beside this script) with the copy mounted
# over the image's files, and expects the named check to fail. The image and the
# repository are unchanged.
# Usage: edge-mutations.sh <web-image> ["id ..."]
set -uo pipefail
IMAGE=${1:?usage: edge-mutations.sh <web-image> ["id ..."]}
ALL_IDS='M1 M2 M3 M4 M5 M6 M8 M9 M10 M11 M12 M13 M14 M15 M7 MLC MPB'
read -r -a selected <<< "${2-$ALL_IDS}"
if (( ${#selected[@]} == 0 )); then
  echo 'No mutation ids selected' >&2; exit 2
fi
selected_ids=' '
for id in "${selected[@]}"; do
  if [[ " $ALL_IDS " != *" $id "* || $selected_ids == *" $id "* ]]; then
    echo "Unknown or duplicate mutation id: $id" >&2; exit 2
  fi
  selected_ids+="$id "
done
HERE=$(cd "$(dirname "$0")" && pwd)
REPO=$(git -C "$HERE" rev-parse --show-toplevel)
W=$(mktemp -d); trap 'rm -rf "$W"' EXIT
total=0 caught=0

# mutate <id> <file> <sed expression> <check that must fail>
mutate() {
  local id=$1 file=$2 expr=$3 expect=$4 dir="$W/$1" out
  [[ $selected_ids == *" $id "* ]] || return 0
  mkdir -p "$dir"
  sed -e "$expr" "$REPO/deploy/nginx/$file" > "$dir/$file"
  total=$((total + 1))
  if cmp -s "$dir/$file" "$REPO/deploy/nginx/$file"; then echo "MISSED $id — the mutation changed nothing"; return; fi
  out=$(bash "$HERE/edge-stub-smoke.sh" "$IMAGE" "$dir" 2>&1)
  # A mutation that breaks the configuration itself proves nothing about the check.
  if ! grep -q '^PASS R2 container healthy' <<< "$out" || ! grep -q '^PASS R2 nginx -t after rendering' <<< "$out"; then
    echo "MISSED $id — the mutated configuration does not run"; return
  fi
  if grep -q "^FAIL $expect" <<< "$out"; then
    caught=$((caught + 1)); echo "CAUGHT $id — $(grep -c '^FAIL' <<< "$out") failing checks, including: $(grep -m1 "^FAIL $expect" <<< "$out" | cut -c1-160)"
  else
    echo "MISSED $id — expected FAIL $expect; $(tail -1 <<< "$out")"
  fi
}

mutate M1 default.conf.template 's/{1,128}/{1,129}/' 'R6 129 characters replaced'
mutate M2 security-headers.conf '/^proxy_hide_header/d' 'api: CSP once'
mutate M3 default.conf.template '/^    location \/api\/ {/,/^    }/s|^        error_page 413 = @payload_too_large;|        proxy_intercept_errors on;\n        error_page 413 = @payload_too_large;|' 'R7 5000-byte body: service problem unchanged'
mutate M4 default.conf.template '/^        types { }$/d' 'extmime413: problem+json'
mutate M5 default.conf.template 's|^    location = /healthz {|    location = /healthz {\n        limit_req zone=api burst=40 nodelay;|' 'R11 probes never limited'
mutate M6 default.conf.template 's|^        add_header Cache-Control "public, max-age=31536000, immutable";|        add_header Cache-Control "public, max-age=31536000, immutable" always;|' 'R3 missing asset not cached'
mutate M8 default.conf.template '/^        proxy_set_header X-Request-ID \$correlation_id;$/d' 'R6 two headers replaced'
mutate M9 default.conf.template '/^    include \/etc\/nginx\/snippets\/security-headers.conf;$/d' 'trace: CSP once'
mutate M10 default.conf.template 's|proxy_pass http://${API_UPSTREAM}/healthz;|proxy_pass http://${API_UPSTREAM};|' 'R4 raw encoded target never forwarded'
mutate M11 proxy-api.conf '/^proxy_ignore_headers/d' 'service cannot redirect nginx internally'
mutate M12 default.conf.template 's|proxy_pass http://${API_UPSTREAM}/readyz;|proxy_pass http://${API_UPSTREAM};|' 'R4 encoded path resolved to /readyz'
mutate M13 default.conf.template 's|proxy_pass http://127.0.0.1:8079/api/;|proxy_pass http://127.0.0.1:8079;|' 'R4 API gets the routed path'
mutate M14 default.conf.template '/^    location \/api\/ {/,/^    }/{/^        error_page 502 504 = @service_unavailable;$/d}' 'noinner: status 503'
mutate M15 default.conf.template 's/^    client_body_timeout 10s;/    client_body_timeout 60s;/' 'D7b stalled body dropped'
mutate M7 proxy-api.conf 's/^proxy_next_upstream off;/proxy_next_upstream error timeout http_502 non_idempotent;/' 'R8 failed POSTs never retried'

mutate MLC default.conf.template '/^        limit_conn apiconn 20;$/d' 'lc20: status 429'
mutate MPB default.conf.template 's/client_max_body_size 16k;/client_max_body_size 1m;/g' 'healthz_16k1: status 413'

printf '\n%d of %d mutations caught\n' "$caught" "$total"
(( total == ${#selected[@]} && caught == total ))
