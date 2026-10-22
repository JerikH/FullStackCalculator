#!/usr/bin/env bash
# Proves the order and the refusals of `t3.sh --job publish --stage push` without a registry: `docker` is a
# shim on PATH that records argv only (never stdin) and answers from tables. Usage: publish-push-shim-test.sh
set -uo pipefail
root=$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)
cd "$root" || exit 2
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
export PYTHONDONTWRITEBYTECODE=1 GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE

# Scratch repository: main with two commits, a release tag on the tip.
repo=$work/repo
git init -q -b main "$repo"
g() { git -C "$repo" -c user.name=t -c user.email=t@example.invalid -c commit.gpgsign=false -c tag.gpgsign=false "$@"; }
g commit -q --allow-empty -m one
g commit -q --allow-empty -m two
sha=$(g rev-parse HEAD)
g update-ref refs/remotes/origin/main "$sha"
g tag v1.2.3 "$sha"

# Archives, manifest and the shim's answer table.
images=$work/images
mkdir -p "$images" "$work/shim"
id_api=sha256:$(printf 'a%.0s' $(seq 64)); id_web=sha256:$(printf 'b%.0s' $(seq 64)); id_aio=sha256:$(printf 'c%.0s' $(seq 64))
for n in calculator-api calculator-web calculator; do printf 'archive of %s\n' "$n" > "$images/$n.tar.gz"; done
cat > "$images/image-ids.txt" <<EOF
calculator-api calculator-api:ci $id_api $sha v
calculator-web calculator-web:ci $id_web $sha v
calculator calculator:ci $id_aio $sha v
EOF
cat > "$work/ids" <<EOF
calculator-api:ci $id_api
calculator-web:ci $id_web
calculator:ci $id_aio
EOF
cat > "$work/shim/docker" <<'EOF'
#!/usr/bin/env bash
printf 'docker %s\n' "$*" >> "$SHIM_LOG"
case "$1 $2" in
  "image inspect") ref=${*: -1}; awk -v r="$ref" '$1 == r {print $2}' "$SHIM_IDS" ;;
  "load -i") echo "Loaded image" ;;
  "manifest inspect")
    if [[ -n ${SHIM_EXISTS:-} && ${*: -1} == *":$SHIM_EXISTS" ]]; then echo '{}'; exit 0; fi
    if [[ -n ${SHIM_NETDOWN:-} ]]; then echo 'dial tcp: i/o timeout' >&2; exit 1; fi
    echo 'no such manifest: x' >&2; exit 1 ;;
  "login ghcr.io") cat > /dev/null ;;
  "push "*) echo "digest: sha256:$(printf 'd%.0s' $(seq 64)) size: 1" ;;
esac
case "$1" in push) echo "digest: sha256:$(printf 'd%.0s' $(seq 64)) size: 1" ;; esac
exit 0
EOF
chmod +x "$work/shim/docker"

fail=0
# run <name> <expected exit 0|1> <expected log file or '-'> <extra env…>: runs the push stage with the base environment plus the extras.
run() {
  local name=$1 want=$2 expected=$3 status log="$work/$1.log" out="$work/$1.out"
  shift 3
  : > "$log"
  env PATH="$work/shim:$PATH" SHIM_LOG="$log" SHIM_IDS="$work/ids" PUBLISH_REPO="$repo" PUBLISH_IMAGES_DIR="$images" \
    GITHUB_ACTIONS=true GITHUB_TOKEN=secret-token-123 GITHUB_ACTOR=tester GITHUB_REPOSITORY_OWNER=JerikH \
    EVENT_NAME=push REF=refs/tags/v1.2.3 SHA="$sha" "$@" \
    timeout 120 scripts/ci/t3.sh --job publish --stage push > "$out" 2>&1
  status=$?
  if (( status != want )); then printf 'FAIL %s: exit %d, want %d\n' "$name" "$status" "$want"; tail -15 "$out"; fail=1; return; fi
  if [[ $expected == - ]]; then
    if [[ -s $log ]]; then printf 'FAIL %s: docker was called:\n' "$name"; cat "$log"; fail=1; return; fi
  elif ! diff -u <(printf '%s\n' "$expected") "$log" > "$work/$name.diff"; then
    printf 'FAIL %s: docker calls differ\n' "$name"; cat "$work/$name.diff"; fail=1; return
  fi
  if grep -q secret-token-123 "$log" "$out"; then printf 'FAIL %s: the token appears in the log or the output\n' "$name"; fail=1; return; fi
  printf 'PASS %s\n' "$name"
}
loads=$(printf 'docker load -i %s/%s.tar.gz\n' "$images" calculator-api "$images" calculator-web "$images" calculator | sed 's/ *$//')
inspects=$(printf 'docker image inspect --format {{.Id}} %s\n' calculator-api:ci calculator-web:ci calculator:ci)
login='docker login ghcr.io -u tester --password-stdin'
logout='docker logout ghcr.io'
pushes_release=$(for n in calculator-api calculator-web calculator; do
  printf 'docker tag %s:ci ghcr.io/jerikh/%s:sha-%s\n' "$n" "$n" "$sha"
  printf 'docker push ghcr.io/jerikh/%s:sha-%s\n' "$n" "$sha"
  printf 'docker tag %s:ci ghcr.io/jerikh/%s:1.2.3\n' "$n" "$n"
  printf 'docker push ghcr.io/jerikh/%s:1.2.3\n' "$n"
done)
exists=$(printf 'docker manifest inspect ghcr.io/jerikh/%s:1.2.3\n' calculator-api calculator-web calculator)

run release 0 "$(printf '%s\n' "$loads" "$inspects" "$login" "$exists" "$pushes_release" "$logout")"
pushes_main=$(for n in calculator-api calculator-web calculator; do
  printf 'docker tag %s:ci ghcr.io/jerikh/%s:sha-%s\n' "$n" "$n" "$sha"
  printf 'docker push ghcr.io/jerikh/%s:sha-%s\n' "$n" "$sha"
  printf 'docker tag %s:ci ghcr.io/jerikh/%s:main\n' "$n" "$n"
  printf 'docker push ghcr.io/jerikh/%s:main\n' "$n"
done)
run main-tip 0 "$(printf '%s\n' "$loads" "$inspects" "$login" "$pushes_main" "$logout")" REF=refs/heads/main
run version-exists 1 "$(printf '%s\n' "$loads" "$inspects" "$login" 'docker manifest inspect ghcr.io/jerikh/calculator-api:1.2.3' "$logout")" SHIM_EXISTS=1.2.3
run registry-unreachable 1 "$(printf '%s\n' "$loads" "$inspects" "$login" 'docker manifest inspect ghcr.io/jerikh/calculator-api:1.2.3' "$logout")" SHIM_NETDOWN=1
# An image whose ID differs from the manifest: stop before the login.
sed 's/^calculator-web:ci .*/calculator-web:ci sha256:0000000000000000000000000000000000000000000000000000000000000000/' "$work/ids" > "$work/ids-bad"
run id-differs 1 "$(printf '%s\n' "$loads" 'docker image inspect --format {{.Id}} calculator-api:ci' 'docker image inspect --format {{.Id}} calculator-web:ci')" SHIM_IDS="$work/ids-bad"
# Refusals that must not reach docker at all.
run no-actions 1 - GITHUB_ACTIONS=false
run no-token 1 - GITHUB_TOKEN=
run no-actor 1 - GITHUB_ACTOR=
run pull-request-event 1 - EVENT_NAME=pull_request
run branch-ref 1 - REF=refs/heads/feature/x
run bad-owner 1 - 'GITHUB_REPOSITORY_OWNER=Ja/rik'
# A manifest built from another commit.
cp "$images/image-ids.txt" "$work/ids.keep"
sed -i "s/$sha/0000000000000000000000000000000000000000/" "$images/image-ids.txt"
run manifest-other-commit 1 -
cp "$work/ids.keep" "$images/image-ids.txt"
exit "$fail"
