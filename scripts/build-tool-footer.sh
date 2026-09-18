#!/usr/bin/env bash
# Keeps the standalone tool HTML files in sync with layouts/partials/tool-footer.html.
#
# Single source of truth is the Hugo partial: this script builds the site, pulls the
# rendered <section class="tool-footer">...</section> out of each tool's built page, and
# splices that same rendered markup into the standalone copy. Nothing here hand-authors
# the footer markup, so the two can't drift apart. (HTML comments can't be used as markers
# here: Go's html/template, which Hugo layouts render through, strips literal HTML comments
# from output, so the section tag itself is the boundary.)
#
# Add a "tool-key:standalone-file" entry to $targets whenever a new tool gets a
# standalone distributable copy.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

echo "Building site to extract rendered tool-footer markup..."
hugo --gc --quiet

targets="rhythm-builder:rhythm-builder.html"

for pair in $targets; do
  key="${pair%%:*}"
  standalone="${pair#*:}"
  built="public/${key}/index.html"

  if [ ! -f "$built" ]; then
    echo "skip $key: $built not found" >&2
    continue
  fi
  if [ ! -f "$standalone" ]; then
    echo "skip $key: standalone file $standalone not found" >&2
    continue
  fi

  fragment="$(awk '/<section class="tool-footer"/,/<\/section>/' "$built")"
  if [ -z "$fragment" ]; then
    echo "skip $key: no tool-footer section in $built (missing data/tool_footer.yaml entry?)" >&2
    continue
  fi

  # awk's -v can't hold a multi-line value on macOS's awk; pass it through the
  # environment instead, which isn't subject to that parsing limit.
  tmp="$(mktemp)"
  if grep -q '<section class="tool-footer"' "$standalone"; then
    TOOL_FOOTER_FRAGMENT="$fragment" awk '
      /<section class="tool-footer"/ { print ENVIRON["TOOL_FOOTER_FRAGMENT"]; skip=1; next }
      skip && /<\/section>/ { skip=0; next }
      skip { next }
      { print }
    ' "$standalone" > "$tmp"
  else
    TOOL_FOOTER_FRAGMENT="$fragment" awk '
      /<\/body>/ { print ENVIRON["TOOL_FOOTER_FRAGMENT"] }
      { print }
    ' "$standalone" > "$tmp"
  fi
  mv "$tmp" "$standalone"
  echo "updated $standalone from $built"
done
