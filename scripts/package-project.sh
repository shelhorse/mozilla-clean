#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
dist_dir="$project_dir/dist"
archive="$dist_dir/clean-article-project.zip"

"$project_dir/scripts/build-extension.sh" >/dev/null
rm -f "$archive"

(
  cd "$project_dir"
  zip -q -r "$archive" README.md .gitignore extension scripts examples \
    -x '*.DS_Store'
  zip -q "$archive" \
    dist/clean-article-extension-unsigned.xpi \
    dist/clean-article-extension-source.zip
)

echo "$archive"
