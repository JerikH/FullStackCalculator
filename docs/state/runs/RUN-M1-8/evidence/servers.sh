#!/usr/bin/env bash
# Starts or stops the Go service and the Vite dev server for one port block (PIDs recorded, stopped by PID).
# Usage: servers.sh start|stop|status [BASE]   BASE defaults to WF_PORT_BASE (web, api = BASE+1, admin = BASE+2, vite = BASE+3)
set -euo pipefail
cmd="${1:?start|stop|status}"
base="${2:-${WF_PORT_BASE:?run: eval \"\$(.workflow/bin/wf env --export)\"}}"
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../../.." && pwd)"
scratch="${WF_SCRATCH:?}"
run="$scratch/servers-$base"
mkdir -p "$run"
api=$((base + 1)) admin=$((base + 2)) vite=$((base + 3))
case "$cmd" in
  start)
    if [[ ! -x "$scratch/bin/calculator" ]]; then
      (cd "$root/backend" && PATH="$HOME/.local/go/bin:$PATH" go build -o "$scratch/bin/calculator" ./cmd/calculator)
    fi
    CALC_HTTP_ADDR=":$api" CALC_ADMIN_ADDR=":$admin" CALC_LOG_FORMAT=text \
      nohup "$scratch/bin/calculator" > "$run/api.log" 2>&1 &
    echo $! > "$run/api.pid"
    (cd "$root/frontend" && VITE_PORT="$vite" API_PROXY_TARGET="http://127.0.0.1:$api" \
      nohup pnpm exec vite --host 127.0.0.1 > "$run/vite.log" 2>&1 & echo $! > "$run/vite.pid")
    for _ in $(seq 1 60); do
      if curl -fsS "http://127.0.0.1:$api/healthz" > /dev/null 2>&1 && curl -fsS "http://127.0.0.1:$vite/" > /dev/null 2>&1; then
        echo "up: api :$api vite :$vite"; exit 0
      fi
      sleep 0.5
    done
    echo "servers did not come up; see $run/*.log" >&2; exit 1 ;;
  stop)
    for name in api vite; do
      if [[ -f "$run/$name.pid" ]]; then
        pid="$(cat "$run/$name.pid")"
        # the vite pid is the pnpm wrapper: stop its children first
        pkill -TERM -P "$pid" 2> /dev/null || true
        kill -TERM "$pid" 2> /dev/null || true
        rm -f "$run/$name.pid"
      fi
    done
    echo "stopped block $base" ;;
  status)
    for name in api vite; do
      if [[ -f "$run/$name.pid" ]] && kill -0 "$(cat "$run/$name.pid")" 2> /dev/null; then echo "$name running pid $(cat "$run/$name.pid")"; else echo "$name stopped"; fi
    done ;;
esac
