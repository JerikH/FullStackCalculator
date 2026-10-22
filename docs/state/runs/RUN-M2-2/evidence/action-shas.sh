#!/usr/bin/env bash
# Compares every `uses: owner/name@<sha> # vX.Y.Z` of the workflow with the tag in the action's
# repository (git ls-remote, annotated tags dereferenced). One call per action under timeout 20;
# a network failure is reported as «not verified», never as a pass.
set -uo pipefail
root=$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)
file=${1:-$root/.github/workflows/ci.yml.disabled}
status=0
declare -A seen=()
while read -r action sha version; do
  key="$action@$sha $version"
  [[ -n ${seen[$key]+x} ]] && continue
  seen[$key]=1
  if ! out=$(timeout 20 git ls-remote "https://github.com/$action.git" "refs/tags/$version" "refs/tags/$version^{}" 2>&1); then
    printf 'NOT VERIFIED %s %s (%s)\n' "$action" "$version" "${out%%$'\n'*}"; status=1; continue
  fi
  want=$(awk '/\^\{\}$/ {print $1; found=1} END {}' <<<"$out")
  [[ -n $want ]] || want=$(awk 'NR==1 {print $1}' <<<"$out")
  if [[ $want == "$sha" ]]; then printf 'OK           %s %s -> %s\n' "$action" "$version" "$sha"
  else printf 'MISMATCH     %s %s: workflow %s, tag %s\n' "$action" "$version" "$sha" "${want:-none}"; status=1; fi
done < <(sed -nE 's/^[[:space:]]*(-[[:space:]]+)?uses:[[:space:]]+([A-Za-z0-9_.\/-]+)@([0-9a-f]{40})[[:space:]]+#[[:space:]]*(v[0-9.]+).*$/\2 \3 \4/p' "$file")
exit "$status"
