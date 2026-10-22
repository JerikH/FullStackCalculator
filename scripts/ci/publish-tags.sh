#!/usr/bin/env bash
# Computes the image tags that a workflow run may publish.
#
# Library: source this file and call
#   publish_tags <event> <ref> <sha> [main-ref]
# It prints one tag per line on stdout and returns 0, or prints the reason on
# stderr and returns 1 (nothing on stdout). main-ref is a git revision and
# defaults to origin/main.
#
# CLI: publish-tags.sh <event> <ref> <sha> [main-ref]
#      exits with the status of publish_tags; a wrong argument count exits 2.
#
# Rules: the event is exactly "push"; the sha is 40 lower-case hex digits;
# refs/heads/main gives sha-<sha> and main; refs/tags/vX.Y.Z (no leading zeros,
# no suffix) gives sha-<sha> and X.Y.Z when the tag resolves to <sha> and <sha>
# is reachable from main-ref; everything else fails. Every value is matched
# against anchored patterns and never evaluated. Git runs in $PUBLISH_REPO
# (default: the current directory).
if (( BASH_VERSINFO[0] < 5 )); then
  printf 'Bash 5 or newer is required\n' >&2
  if [[ ${BASH_SOURCE[0]} == "$0" ]]; then exit 2; else return 2; fi
fi

publish_tags() {
  local event=${1-} ref=${2-} sha=${3-} main_ref=${4:-origin/main}
  local repo=${PUBLISH_REPO:-.}
  local tag_re='^refs/tags/(v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*))$'
  local rev_re='^[A-Za-z0-9_][A-Za-z0-9._/-]*$'
  local name resolved

  if [[ $event != push ]]; then
    printf 'publish: event is not "push"; only push events publish\n' >&2; return 1
  fi
  if ! [[ $sha =~ ^[0-9a-f]{40}$ ]]; then
    printf 'publish: the commit is not 40 lower-case hexadecimal digits\n' >&2; return 1
  fi
  if [[ $ref == refs/heads/main ]]; then
    printf 'sha-%s\nmain\n' "$sha"; return 0
  fi
  if ! [[ $ref =~ $tag_re ]]; then
    printf 'publish: the ref is neither refs/heads/main nor a release tag vMAJOR.MINOR.PATCH\n' >&2; return 1
  fi
  name=${BASH_REMATCH[1]}
  if ! [[ $main_ref =~ $rev_re ]]; then
    printf 'publish: the main revision name is not acceptable\n' >&2; return 1
  fi
  if ! resolved=$(git -C "$repo" rev-parse --verify --quiet "refs/tags/${name}^{commit}"); then
    printf 'publish: tag %s does not exist\n' "$name" >&2; return 1
  fi
  if [[ $resolved != "$sha" ]]; then
    printf 'publish: tag %s does not point at the commit being published\n' "$name" >&2; return 1
  fi
  if ! git -C "$repo" rev-parse --verify --quiet "${main_ref}^{commit}" >/dev/null; then
    printf 'publish: revision %s is missing; fetch the full history of main\n' "$main_ref" >&2; return 1
  fi
  if ! git -C "$repo" merge-base --is-ancestor "$sha" "$main_ref"; then
    printf 'publish: tag %s is not reachable from %s\n' "$name" "$main_ref" >&2; return 1
  fi
  printf 'sha-%s\n%s\n' "$sha" "${name#v}"
}

if [[ ${BASH_SOURCE[0]} == "$0" ]]; then
  set -euo pipefail
  if (( $# < 3 || $# > 4 )); then
    printf 'usage: publish-tags.sh <event> <ref> <sha> [main-ref]\n' >&2; exit 2
  fi
  publish_tags "$@"
fi
