#!/usr/bin/env bash
# Check affected stages in full, then integration; options: --base REF, --keep-going.
set -euo pipefail
if (( BASH_VERSINFO[0] < 5 )); then printf 'Bash 5 or newer is required\n' >&2; exit 2; fi
# shellcheck source=scripts/ci/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
usage() { printf 'usage: t2.sh [--base <ref>] [--keep-going] [-h]\n'; }
base=main
while (( $# )); do
  case $1 in
    --base) if (( $# < 2 )); then usage >&2; exit 2; fi; base=$2; shift 2 ;;
    --keep-going) CI_KEEP_GOING=1; shift ;;
    -h) usage; exit 0 ;;
    *) usage >&2; exit 2 ;;
  esac
done
ci_agent_env
ci_changed_files "$base"
if (( ${#CI_CHANGED[@]} == 0 )); then ci_note selection 'no changed files'
else ci_partition; ci_selected_stages --full; fi
ci_integration() {
  if [[ ! -f Makefile ]]; then ci_note integration:make 'not present (no Makefile)'; return 0; fi
  # The Makefile and the integration targets this tier runs arrive together.
  ci_problem integration:make 'Makefile present but no integration targets are wired into scripts/ci/t2.sh' || return 0
}
ci_integration
ci_finish; exit $?
