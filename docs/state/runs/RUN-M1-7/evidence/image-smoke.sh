#!/usr/bin/env bash
# Smoke test of the API image: hardened run, health, injected build info, API-only,
# exposed ports, user and size. Usage: image-smoke.sh <image> <expected-version> <expected-commit> <host-port>
# The container is named after the image tag and removed by name on exit.
set -euo pipefail

image=$1 version=$2 commit=$3 port=$4
name="${image##*:}-api-smoke"
fail=0
check() { # check <description> <command...>: the command's exit status is the verdict
  local description=$1
  shift
  if "$@"; then printf 'ok   %s\n' "$description"; else printf 'FAIL %s\n' "$description"; fail=1; fi
}
# shellcheck disable=SC2329 # invoked indirectly through check
has() { [[ $1 == *"$2"* ]]; } # has <haystack> <needle>
cleanup() { docker rm -f "$name" > /dev/null 2>&1 || true; docker rm -f "$name-p" > /dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup

docker run -d --name "$name" --read-only --cap-drop ALL --security-opt no-new-privileges \
  -p "127.0.0.1:$port:8081" "$image" > /dev/null

timeout 120 bash -c "until [[ \$(docker inspect -f '{{.State.Health.Status}}' '$name') == healthy ]]; do sleep 2; done" || true
status=$(docker inspect -f '{{.State.Health.Status}}' "$name")
check "health status is healthy (got $status)" [ "$status" = healthy ]

body=$(curl -s "http://127.0.0.1:$port/healthz")
echo "healthz: $body"
check "healthz carries the injected version" has "$body" "\"version\":\"$version\""
check "healthz carries the injected commit" has "$body" "\"commit\":\"$commit\""
ops=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$port/api/v1/operations")
check "GET /api/v1/operations is 200 (got $ops)" [ "$ops" = 200 ]
add=$(curl -s -X POST -H 'Content-Type: application/json' -d '{"operands":["0.1","0.2"]}' "http://127.0.0.1:$port/api/v1/operations/add")
check "0.1 + 0.2 = 0.3 (got $add)" has "$add" '"result":"0.3"'
root=$(curl -s -i "http://127.0.0.1:$port/")
check "GET / is a 404 (API-only image)" has "$root" ' 404 '
check "GET / is the NOT_FOUND problem" has "$root" '"code":"NOT_FOUND"'
metrics=$(curl -s --max-time 2 "http://127.0.0.1:$port/metrics" -o /dev/null -w '%{http_code}')
check "/metrics is not served on the API port (got $metrics)" [ "$metrics" = 404 ]

user=$(docker inspect -f '{{.Config.User}}' "$image")
check "image user is 65532:65532 (got $user)" [ "$user" = 65532:65532 ]
exposed=$(docker inspect -f '{{range $p, $_ := .Config.ExposedPorts}}{{$p}} {{end}}' "$image")
check "only 8081/tcp is exposed (got $exposed)" [ "$exposed" = '8081/tcp ' ]
ro=$(docker inspect -f '{{.HostConfig.ReadonlyRootfs}} {{.HostConfig.CapDrop}} {{.HostConfig.SecurityOpt}}' "$name")
echo "hardening: $ro"
check "read-only root, all capabilities dropped, no-new-privileges" [ "$ro" = 'true [ALL] [no-new-privileges]' ]
hc=$(docker inspect -f '{{json .Config.Healthcheck.Test}}' "$image")
check "healthcheck is [\"/calculator\",\"healthcheck\"] (got $hc)" [ "$hc" = '["CMD","/calculator","healthcheck"]' ]

# docker run -P must publish the API port only.
docker run -d --name "$name-p" --read-only --cap-drop ALL --security-opt no-new-privileges -P "$image" > /dev/null
published=$(docker port "$name-p" | awk '{print $1}' | sort -u | tr '\n' ' ')
echo "docker run -P publishes: $published"
check "docker run -P publishes only 8081/tcp" [ "$published" = '8081/tcp ' ]

docker images --format 'docker images reports {{.Repository}}:{{.Tag}} {{.Size}} (containerd disk usage, snapshot accounting included)' "$image"
layers=$(docker history --human=false --format '{{.Size}}' "$image" | awk '{s += $1} END {print s}')
compressed=$(docker image inspect -f '{{.Size}}' "$image")
echo "layers sum to $layers bytes ($((layers / 1000)) kB); compressed content $compressed bytes"
check "layers sum to under 20 MB" [ "$layers" -lt 20000000 ]

exit "$fail"
