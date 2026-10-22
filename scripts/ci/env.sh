# shellcheck shell=bash
# Per-agent local environment. Source it, do not execute it:
#
#   eval "$(.workflow/bin/wf env --export)"
#   source scripts/ci/env.sh
#
# Exports WEB_PORT, CALC_HTTP_ADDR, CALC_ADMIN_ADDR, VITE_PORT, API_PROXY_TARGET,
# E2E_BASE_URL and COMPOSE_PROJECT_NAME derived from the agent's port block, and
# puts the Go toolchain and the repository bin/ on PATH. The main checkout keeps
# the documented defaults (8080, 8081, 9091, 5173). Returns 0 on success, 1 on
# any error (nothing is exported on error).

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  echo 'env.sh: source this file: source scripts/ci/env.sh' >&2
  exit 2
fi

_calc_env_load() {
  local src="${1-}" dir root agent=""
  local wf_agent="${WF_AGENT-}" wf_index="${WF_INDEX-}" wf_base="${WF_PORT_BASE-}" wf_end="${WF_PORT_END-}"
  local base web http admin vite proxy e2e compose label
  local new_path="${PATH-}" go_dir

  if [[ "$src" == */* ]]; then dir="${src%/*}"; else dir="."; fi
  dir="$(cd -P -- "$dir" 2>/dev/null && pwd -P)" || {
    echo 'env.sh: cannot resolve the script directory' >&2
    return 1
  }
  root="$(cd -P -- "$dir/../.." 2>/dev/null && pwd -P)" || {
    echo 'env.sh: cannot resolve the repository root' >&2
    return 1
  }

  if [[ -f "$root/.wf-agent" ]]; then
    agent="$(sed -n 's/^[[:space:]]*"agent":[[:space:]]*"\([^"]*\)".*/\1/p' "$root/.wf-agent" 2>/dev/null)" || agent=""
    agent="${agent%%$'\n'*}"
    if [[ -z "$agent" ]]; then
      echo "env.sh: cannot read the agent name from $root/.wf-agent" >&2
      return 1
    fi
    if [[ "$wf_agent" != "$agent" ]]; then
      echo "env.sh: this worktree belongs to $agent but WF_AGENT is '$wf_agent'; run eval \"\$(.workflow/bin/wf env --export)\" first" >&2
      return 1
    fi
    if ! [[ "$wf_index" =~ ^[1-9][0-9]*$ ]]; then
      echo "env.sh: WF_INDEX must be a positive integer for a worker (got '$wf_index'); run eval \"\$(.workflow/bin/wf env --export)\" first" >&2
      return 1
    fi
    if ! [[ "$wf_base" =~ ^[0-9]{1,9}$ ]]; then
      echo "env.sh: WF_PORT_BASE must be a non-negative integer (got '$wf_base')" >&2
      return 1
    fi
    base=$((10#$wf_base))
    if ((base + 3 > 65535)); then
      echo "env.sh: WF_PORT_BASE is too high (got '$wf_base')" >&2
      return 1
    fi
    if [[ -n "$wf_end" ]]; then
      if ! [[ "$wf_end" =~ ^[0-9]{1,9}$ ]] || ((10#$wf_end < base + 3)); then
        echo "env.sh: WF_PORT_END must be an integer >= WF_PORT_BASE + 3 (got '$wf_end', base '$wf_base')" >&2
        return 1
      fi
    fi
    web="$base"
    http=":$((base + 1))"
    admin=":$((base + 2))"
    vite="$((base + 3))"
    proxy="http://localhost:$((base + 1))"
    e2e="http://127.0.0.1:$base"
    compose="${agent,,}"
    compose="fullstackcalculator-${compose//[^abcdefghijklmnopqrstuvwxyz0123456789_-]/-}"
    label="$agent"
  else
    if [[ -z "$wf_agent" && -z "$wf_index" ]]; then
      echo 'env.sh: no agent identity (WF_AGENT/WF_INDEX unset); using the main-checkout defaults' >&2
    elif { [[ -n "$wf_agent" && "$wf_agent" != main ]]; } || { [[ -n "$wf_index" && "$wf_index" != 0 ]]; }; then
      echo "env.sh: identity mismatch: the main checkout cannot use WF_AGENT=$wf_agent WF_INDEX=$wf_index" >&2
      return 1
    fi
    web=8080
    http=:8081
    admin=:9091
    vite=5173
    proxy=http://localhost:8081
    e2e=http://127.0.0.1:8080
    compose=fullstackcalculator
    label=main
  fi

  go_dir="${HOME-}/.local/go/bin"
  if [[ -n "${HOME-}" && -d "$go_dir" && ":$new_path:" != *":$go_dir:"* ]]; then
    new_path="$go_dir:$new_path"
  fi
  if [[ ":$new_path:" != *":$root/bin:"* ]]; then
    new_path="$root/bin:$new_path"
  fi

  if ! PATH="$new_path" command -v go >/dev/null 2>&1; then
    # shellcheck disable=SC2016 # $HOME is shown literally on purpose
    echo 'env.sh: Go not found. Install Go 1.27 from https://go.dev/dl/ into $HOME/.local/go (tar -C "$HOME/.local" -xzf go1.27.*.tar.gz) or put go on PATH, then source this file again.' >&2
    return 1
  fi

  export WEB_PORT="$web" CALC_HTTP_ADDR="$http" CALC_ADMIN_ADDR="$admin" VITE_PORT="$vite"
  export API_PROXY_TARGET="$proxy" E2E_BASE_URL="$e2e" COMPOSE_PROJECT_NAME="$compose"
  export PATH="$new_path"
  echo "env.sh: $label — web $web · api $http · admin $admin · vite $vite · compose $compose" >&2
  return 0
}

if _calc_env_load "${BASH_SOURCE[0]}"; then
  unset -f _calc_env_load
  return 0
fi
unset -f _calc_env_load
return 1
