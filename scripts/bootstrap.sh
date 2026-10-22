#!/usr/bin/env bash
# Prepares a fresh checkout: checks the prerequisites, then installs the pinned
# tools, the Go modules, the frontend dependencies and the Playwright browser.
#
# Usage: scripts/bootstrap.sh
#
# It never edits shell profiles, never runs a downloaded script and never moves
# a pin: versions come from tools/versions.env, backend/go.mod and the frontend
# lockfile. Running it twice installs nothing new.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

die() {
  printf 'bootstrap: %s\n' "$*" >&2
  exit 1
}

step() {
  printf '▶ %s\n' "$*"
}

check_platform() {
  local os
  os="$(uname -s)"
  case "$os" in
    Linux | Darwin) ;;
    *)
      die "unsupported platform $os: install Go 1.27, Node 24 with pnpm, the pinned tools of tools/versions.env into bin/, then run 'go mod download' in backend/ and 'pnpm -C frontend install --frozen-lockfile' by hand"
      ;;
  esac
}

# Go is often installed under $HOME/.local/go without a PATH entry.
check_go() {
  if ! command -v go >/dev/null 2>&1 && [ -x "${HOME:-}/.local/go/bin/go" ]; then
    PATH="$HOME/.local/go/bin:$PATH"
    export PATH
  fi
  command -v go >/dev/null 2>&1 || die "go not found: install Go (see backend/go.mod for the version) or add it to PATH"
}

check_node() {
  local major
  command -v node >/dev/null 2>&1 || die "node not found: install Node 24 or newer"
  major="$(node -p 'process.versions.node.split(".")[0]')"
  [ "$major" -ge 24 ] 2>/dev/null || die "Node 24 or newer is required, found $(node -p 'process.versions.node')"
}

check_pnpm() {
  command -v pnpm >/dev/null 2>&1 ||
    die "pnpm not found: enable it with 'corepack enable pnpm' (Node 24 ships corepack)"
}

# Only a warning: the composed stack and the image targets need Docker, the
# rest of the project does not.
check_docker() {
  command -v docker >/dev/null 2>&1 ||
    printf 'bootstrap: warning: docker not found; the composed stack and image targets need it\n' >&2
}

main() {
  check_platform
  check_go
  check_node
  check_pnpm
  check_docker

  step "scripts/ci/install-tools.sh"
  "$root/scripts/ci/install-tools.sh"

  step "go mod download (backend)"
  (cd "$root/backend" && go mod download)

  step "pnpm install --frozen-lockfile (frontend)"
  pnpm -C "$root/frontend" install --frozen-lockfile

  step "playwright install chromium (frontend)"
  pnpm -C "$root/frontend" exec playwright install chromium

  printf 'bootstrap: done\n'
}

main "$@"
