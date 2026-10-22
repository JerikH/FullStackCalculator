#!/usr/bin/env bash
# Activates the pnpm version pinned by "packageManager" in frontend/package.json.
#
# Usage: scripts/ci/setup-pnpm.sh
# Environment: SETUP_PNPM_BIN_DIR installs the corepack shims there instead of
# next to node; COREPACK_HOME (read by corepack itself) relocates its cache.
set -euo pipefail
if (( BASH_VERSINFO[0] < 5 )); then printf 'Bash 5 or newer is required\n' >&2; exit 2; fi
root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$root"
enable=(corepack enable pnpm)
if [[ -n ${SETUP_PNPM_BIN_DIR:-} ]]; then
  mkdir -p "$SETUP_PNPM_BIN_DIR"
  enable+=(--install-directory "$SETUP_PNPM_BIN_DIR")
  PATH="$SETUP_PNPM_BIN_DIR:$PATH"
fi
"${enable[@]}"
pm=$(node -p "require('./frontend/package.json').packageManager || ''")
if [[ $pm != pnpm@* ]]; then
  printf 'setup-pnpm: frontend/package.json packageManager is missing or not pnpm@<version>\n' >&2
  exit 1
fi
corepack install --global "$pm"
pnpm --version
