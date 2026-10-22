#!/usr/bin/env bash
# Evidence for UI-SCAF-01 (RNF-SEC-03, RF-UI-11, RF-UI-14): inspects the built frontend/dist.
# Usage (repository root, after `pnpm -C frontend build`): bash docs/state/runs/RUN-M1-2/evidence/check-dist.sh
set -uo pipefail
dist=frontend/dist
html=$dist/index.html
fails=0
ok() { printf 'ok   %s\n' "$1"; }
bad() { printf 'FAIL %s\n' "$1"; fails=$((fails + 1)); }
expect() { if eval "$2"; then ok "$1"; else bad "$1"; fi; }

expect "index.html exists" "[[ -f $html ]]"
expect "theme-init.js copied" "[[ -f $dist/theme-init.js ]]"
expect "favicon.svg copied" "[[ -f $dist/favicon.svg ]]"
expect "favicon under 400 bytes" "(( \$(wc -c <$dist/favicon.svg) < 400 ))"
expect "hashed assets present" "compgen -G '$dist/assets/*.js' >/dev/null"
# Every <script> has a src attribute (no inline script).
inline=$(grep -oE '<script[^>]*>' "$html" | grep -cv 'src=')
expect "no inline <script> (found $inline)" "(( inline == 0 ))"
expect "no <style> element" "! grep -qi '<style' $html"
expect "no style= attribute" "! grep -qiE '[[:space:]]style=' $html"
expect "no inline event handler" "! grep -qiE '[[:space:]]on[a-z]+=' $html"
head_part=$(sed -n '/<head>/,/<\/head>/p' "$html")
if grep -qF '<script src="/theme-init.js"></script>' <<<"$head_part"; then ok "theme-init.js is a classic script in <head>"; else bad "theme-init.js is a classic script in <head>"; fi
ti=$(grep -n 'theme-init.js' "$html" | head -1 | cut -d: -f1)
mod=$(grep -n 'type="module"' "$html" | head -1 | cut -d: -f1)
expect "theme-init.js (line $ti) before the module script (line $mod)" "(( ti < mod ))"
expect "stylesheets are external files" "! grep -qE '<link[^>]*rel=\"stylesheet\"[^>]*href=\"data:' $html"
printf '\n%d failure(s)\n' "$fails"
(( fails == 0 ))
