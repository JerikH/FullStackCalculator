#!/usr/bin/env bash
# Check changed files and affected packages; options: --base REF, --keep-going, -h.
set -euo pipefail
if (( BASH_VERSINFO[0] < 5 )); then printf 'Bash 5 or newer is required\n' >&2; exit 2; fi
# shellcheck source=scripts/ci/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
usage() { printf 'usage: t0.sh [--base <ref>] [--keep-going] [-h]\n'; }
base=main
while (( $# )); do
  case $1 in
    --base) if (( $# < 2 )); then usage >&2; exit 2; fi; base=$2; shift 2 ;;
    --keep-going) CI_KEEP_GOING=1; shift ;;
    -h) usage; exit 0 ;;
    *) usage >&2; exit 2 ;;
  esac
done
ci_changed_files "$base"
if (( ${#CI_CHANGED[@]} == 0 )); then printf 'nothing to check\n'; exit 0; fi
ci_partition
ci_selected_stages
ci_finish; exit $?
