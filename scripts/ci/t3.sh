#!/usr/bin/env bash
# Run the complete suite or one job; options: --job NAME, --keep-going.
set -euo pipefail
if (( BASH_VERSINFO[0] < 5 )); then printf 'Bash 5 or newer is required\n' >&2; exit 2; fi
# shellcheck source=scripts/ci/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
usage() { printf 'usage: t3.sh [--job <name>] [--keep-going] [-h]\njobs: contract backend frontend images\n'; }
job=''
while (( $# )); do
  case $1 in
    --job) if (( $# < 2 )); then usage >&2; exit 2; fi; job=$2
      case $job in contract|backend|frontend|images) ;; *) usage >&2; exit 2 ;; esac
      shift 2 ;;
    --keep-going) CI_KEEP_GOING=1; shift ;;
    -h) usage; exit 0 ;;
    *) usage >&2; exit 2 ;;
  esac
done
printf 't3: complete suite — for CI; agent sessions run t0/t1 only\n'
jobs=(contract backend frontend images)
if [[ -n $job ]]; then jobs=("$job"); fi
for job in "${jobs[@]}"; do
  case $job in
    contract) ci_stage_contract --full; ci_stage_workflows --full; ci_stage_shell --full ;;
    backend) ci_stage_backend --full ;;
    frontend) ci_stage_frontend --full ;;
    images) ci_stage_dockerfiles --full ;;
  esac
done
ci_finish; exit $?
