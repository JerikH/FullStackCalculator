#!/usr/bin/env bash
# Installs the pinned standalone tools into <repository>/bin.
#
# Usage: scripts/ci/install-tools.sh [golangci-lint|actionlint|hadolint|shellcheck|trivy|govulncheck ...]
#        No argument installs all six. An unknown name exits with status 2.
#
# Versions and SHA-256 digests live in tools/versions.env. Each binary is
# installed at bin/.tools/<tool>-<version>/<tool>; bin/<tool> is a relative link
# to it. Other versions already present under bin/.tools are left untouched.
# Downloads are verified against the pinned digest before anything is extracted.
# govulncheck has no release binaries: it is built with `go install` (Go on PATH
# or in $HOME/.local/go/bin) and verified by the Go module checksum database.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
bindir="$root/bin"
all_tools=(golangci-lint actionlint hadolint shellcheck trivy govulncheck)

# Work directory for the download in progress; global so the EXIT trap sees it.
tmp=""
trap 'rm -rf "${tmp-}"' EXIT

die() {
  printf 'install-tools: %s\n' "$*" >&2
  exit 1
}

# shellcheck source=/dev/null
source "$root/tools/versions.env"

is_known_tool() {
  local t
  for t in "${all_tools[@]}"; do
    if [ "$t" = "$1" ]; then
      return 0
    fi
  done
  return 1
}

sha256_of() {
  local out
  if command -v sha256sum >/dev/null 2>&1; then
    out="$(sha256sum "$1")"
  elif command -v shasum >/dev/null 2>&1; then
    out="$(shasum -a 256 "$1")"
  else
    die "neither sha256sum nor shasum is available"
  fi
  printf '%s\n' "${out%% *}"
}

# probe_ok <tool> <version> <binary>: succeeds when the binary reports the version.
probe_ok() {
  local tool="$1" version="$2" bin="$3" out
  case "$tool" in
    golangci-lint)
      out="$("$bin" version 2>&1)" || return 1
      case "$out" in *"version $version "*) return 0 ;; esac
      ;;
    actionlint)
      out="$("$bin" --version 2>&1)" || return 1
      [ "${out%%$'\n'*}" = "$version" ] && return 0
      ;;
    hadolint)
      out="$("$bin" --version 2>&1)" || return 1
      case "$out" in *" $version"*) return 0 ;; esac
      ;;
    shellcheck)
      out="$("$bin" --version 2>&1)" || return 1
      case $'\n'"$out"$'\n' in *$'\n'"version: $version"$'\n'*) return 0 ;; esac
      ;;
    trivy)
      out="$("$bin" --version 2>&1)" || return 1
      [ "${out%%$'\n'*}" = "Version: $version" ] && return 0
      ;;
    govulncheck)
      # -version also reads the vulnerability database, so it fails offline;
      # the module version recorded in the binary answers without the network.
      out="$("$bin" -version 2>&1)" || out=""
      case $'\n'"$out"$'\n' in *$'\n'"Scanner: govulncheck@v$version"$'\n'*) return 0 ;; esac
      if command -v go >/dev/null 2>&1; then
        out="$(go version -m "$bin" 2>&1)" || return 1
        case "$out" in *$'\t'"golang.org/x/vuln"$'\t'"v$version"$'\t'*|*$'\t'"golang.org/x/vuln"$'\t'"v$version") return 0 ;; esac
      fi
      ;;
  esac
  return 1
}

# ensure_link <tool> <version>: points bin/<tool> at the versioned binary.
ensure_link() {
  local tool="$1" version="$2" target current tmplink
  target=".tools/$tool-$version/$tool"
  current="$(readlink "$bindir/$tool" 2>/dev/null || true)"
  if [ "$current" = "$target" ]; then
    return 0
  fi
  tmplink="$(mktemp -u "$bindir/.link.XXXXXX")"
  ln -s "$target" "$tmplink"
  mv -f "$tmplink" "$bindir/$tool" || {
    rm -f "$tmplink"
    die "could not link $bindir/$tool"
  }
}

# install_with_go <tool> <version> <dest_dir> <dest>: builds govulncheck with
# `go install` into a scratch GOBIN, then moves the binary into place. The module
# checksum database verifies the source; there is no digest to pin.
install_with_go() {
  local tool="$1" version="$2" dest_dir="$3" dest="$4" gobin
  if ! command -v go >/dev/null 2>&1 && [ -x "${HOME:-}/.local/go/bin/go" ]; then
    PATH="$PATH:$HOME/.local/go/bin"
  fi
  command -v go >/dev/null 2>&1 ||
    die "Go is required to build $tool $version: put go on PATH or install it in \$HOME/.local/go"

  tmp="$(mktemp -d "$bindir/.install.XXXXXX")"
  gobin="$tmp/gobin"
  printf 'building %s %s with go install\n' "$tool" "$version"
  GOBIN="$gobin" GOFLAGS=-mod=mod GOTOOLCHAIN=local \
    go install "golang.org/x/vuln/cmd/$tool@v$version" ||
    die "go install failed for $tool $version"
  [ -f "$gobin/$tool" ] && [ ! -L "$gobin/$tool" ] || die "$tool binary not found after go install"

  chmod 0755 "$gobin/$tool"
  mkdir -p "$dest_dir"
  mv -f "$gobin/$tool" "$dest"
  if ! probe_ok "$tool" "$version" "$dest"; then
    rm -f "$dest"
    die "$tool installed at $dest does not report version $version"
  fi
  ensure_link "$tool" "$version"

  rm -rf "$tmp"
  tmp=""
  printf '%s %s installed: %s\n' "$tool" "$version" "$dest"
}

install_tool() {
  local tool="$1" upper version version_var hash_var expected actual
  local os arch o a hos harch
  local dest_dir dest url member base asset bin

  upper="$(printf '%s' "$tool" | tr '[:lower:]-' '[:upper:]_')"
  version_var="${upper}_VERSION"
  version="${!version_var:-}"
  [ -n "$version" ] || die "$version_var is not set in tools/versions.env"

  os="$(uname -s | tr '[:upper:]' '[:lower:]')"
  arch="$(uname -m)"
  case "$os" in
    linux | darwin) o="$os" ;;
    *) die "unsupported platform $os/$arch: install $tool $version manually into $bindir" ;;
  esac
  case "$arch" in
    x86_64 | amd64) a="amd64" ;;
    aarch64 | arm64) a="arm64" ;;
    *) die "unsupported platform $os/$arch: install $tool $version manually into $bindir" ;;
  esac

  dest_dir="$bindir/.tools/$tool-$version"
  dest="$dest_dir/$tool"
  mkdir -p "$bindir"

  if [ -x "$dest" ] && probe_ok "$tool" "$version" "$dest"; then
    ensure_link "$tool" "$version"
    printf '%s %s already installed\n' "$tool" "$version"
    return 0
  fi

  if [ "$tool" = "govulncheck" ]; then
    install_with_go "$tool" "$version" "$dest_dir" "$dest"
    return 0
  fi

  hash_var="${upper}_SHA256_${o}_${a}"
  expected="${!hash_var:-}"
  [ -n "$expected" ] || die "$hash_var is not set in tools/versions.env"

  # member is the path of the binary inside the archive; empty for a bare binary.
  case "$tool" in
    golangci-lint)
      base="golangci-lint-$version-$o-$a"
      url="https://github.com/golangci/golangci-lint/releases/download/v$version/$base.tar.gz"
      member="$base/golangci-lint"
      ;;
    actionlint)
      url="https://github.com/rhysd/actionlint/releases/download/v$version/actionlint_${version}_${o}_${a}.tar.gz"
      member="actionlint"
      ;;
    hadolint)
      hos="$o"
      [ "$o" = "darwin" ] && hos="macos"
      harch="x86_64"
      [ "$a" = "arm64" ] && harch="arm64"
      url="https://github.com/hadolint/hadolint/releases/download/v$version/hadolint-$hos-$harch"
      member=""
      ;;
    shellcheck)
      harch="x86_64"
      [ "$a" = "arm64" ] && harch="aarch64"
      url="https://github.com/koalaman/shellcheck/releases/download/v$version/shellcheck-v$version.$o.$harch.tar.gz"
      member="shellcheck-v$version/shellcheck"
      ;;
    trivy)
      case "$o-$a" in
        linux-amd64) harch="Linux-64bit" ;;
        linux-arm64) harch="Linux-ARM64" ;;
        darwin-amd64) harch="macOS-64bit" ;;
        darwin-arm64) harch="macOS-ARM64" ;;
      esac
      url="https://github.com/aquasecurity/trivy/releases/download/v$version/trivy_${version}_${harch}.tar.gz"
      member="trivy"
      ;;
  esac

  tmp="$(mktemp -d "$bindir/.install.XXXXXX")"
  asset="$tmp/asset"
  printf 'downloading %s\n' "$url"
  curl -fsSL --retry 3 --connect-timeout 20 --max-time 300 --proto '=https' --tlsv1.2 -o "$asset" "$url" ||
    die "download failed: $url"

  actual="$(sha256_of "$asset")"
  if [ "$actual" != "$expected" ]; then
    die "SHA-256 mismatch for $tool $version ($url): expected $expected, got $actual"
  fi

  if [ -n "$member" ]; then
    mkdir "$tmp/extract"
    tar -xzf "$asset" -C "$tmp/extract" "$member" ||
      die "could not extract $member from the $tool archive"
    bin="$tmp/extract/$member"
  else
    bin="$asset"
  fi
  [ -f "$bin" ] && [ ! -L "$bin" ] || die "$tool binary not found in the download"

  chmod 0755 "$bin"
  mkdir -p "$dest_dir"
  mv -f "$bin" "$dest"
  if ! probe_ok "$tool" "$version" "$dest"; then
    rm -f "$dest"
    die "$tool installed at $dest does not report version $version"
  fi
  ensure_link "$tool" "$version"

  rm -rf "$tmp"
  tmp=""
  printf '%s %s installed: %s\n' "$tool" "$version" "$dest"
}

main() {
  local requested=() t
  if [ "$#" -eq 0 ]; then
    requested=("${all_tools[@]}")
  else
    requested=("$@")
    for t in "${requested[@]}"; do
      if ! is_known_tool "$t"; then
        printf 'install-tools: unknown tool "%s"; valid names: %s\n' "$t" "${all_tools[*]}" >&2
        exit 2
      fi
    done
  fi
  for t in "${requested[@]}"; do
    install_tool "$t"
  done
}

main "$@"
