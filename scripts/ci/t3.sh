#!/usr/bin/env bash
# Run CI jobs and stages: whole jobs, or exactly the named stages of one job (--stage).
set -euo pipefail
if (( BASH_VERSINFO[0] < 5 )); then printf 'Bash 5 or newer is required\n' >&2; exit 2; fi
# shellcheck source=scripts/ci/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
usage() {
  printf 'usage: t3.sh [--job <name>] [--stage <name>]… [--keep-going] [--list] [-h]\n'
  printf 'jobs:\n'
  ci_t3_list | sed 's/^/  /'
  cat <<'TEXT'
Without --job: the jobs contract, backend, frontend and images, every default stage in the order above.
--job <name>: the default stages of that job (stages marked + run only when named; e2e has no stages).
--stage <name> (repeatable, in the order given; needs --job, not valid for e2e): exactly those stages.
--list prints the jobs and their stages and runs nothing. A failed stage ends the run unless
--keep-going is given. Exit status: 0 all passed, 1 a stage failed, 2 usage error.
Settings: CI_STAGE_TIMEOUT (seconds per command, default 600), EDGE_MUTATIONS (ids for the
edge-mutations stage; default all), PUBLISH_IMAGES_DIR (publish/push archives, default coverage/images);
publish/tags and publish/push read EVENT_NAME, REF and SHA (GITHUB_EVENT_NAME, GITHUB_REF, GITHUB_SHA).
TEXT
}
job=''
list=0
stages=()
while (( $# )); do
  case $1 in
    --job) if (( $# < 2 )) || [[ -n $job ]]; then usage >&2; exit 2; fi; job=$2; shift 2 ;;
    --stage) if (( $# < 2 )); then usage >&2; exit 2; fi; stages+=("$2"); shift 2 ;;
    --keep-going) CI_KEEP_GOING=1; shift ;;
    --list) list=1; shift ;;
    -h) usage; exit 0 ;;
    *) usage >&2; exit 2 ;;
  esac
done
if [[ -n $job ]] && ! ci_t3_valid_job "$job"; then printf 'unknown job %s\n' "$job" >&2; usage >&2; exit 2; fi
if (( ${#stages[@]} )); then
  if [[ -z $job ]]; then printf -- '--stage needs --job\n' >&2; usage >&2; exit 2; fi
  if [[ $job == e2e ]]; then printf 'the e2e job has no stages: it always runs the whole sequence\n' >&2; exit 2; fi
  for stage in "${stages[@]}"; do
    if ! ci_t3_valid_stage "$job" "$stage"; then
      printf 'unknown stage %s of job %s; valid: %s %s\n' "$stage" "$job" "${CI_T3_STAGES[$job]}" "${CI_T3_NAMED[$job]:+(by name only) ${CI_T3_NAMED[$job]}}" >&2
      exit 2
    fi
  done
fi
if (( list )); then ci_t3_list; exit 0; fi
printf 't3: CI jobs and stages — agent sessions run one stage per command\n'
jobs=(contract backend frontend images)
if [[ -n $job ]]; then jobs=("$job"); fi
for job in "${jobs[@]}"; do
  if [[ $job == e2e ]]; then
    if ! ci_t3_e2e; then :; fi
    continue
  fi
  if (( ${#stages[@]} )); then run_stages=("${stages[@]}"); else read -r -a run_stages <<<"${CI_T3_STAGES[$job]}"; fi
  # A failed stage ends the run (ci_failure) unless --keep-going; the guard keeps errexit from
  # skipping the summary in that mode.
  for stage in "${run_stages[@]}"; do
    if ! ci_t3_run "$job" "$stage"; then :; fi
  done
done
ci_finish; exit $?
