#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
dist_dir="$project_dir/dist"
archive="$dist_dir/clean-article-project.zip"
version="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1], encoding="utf-8"))["version"])' "$project_dir/extension/manifest.json")"
versioned_archive="$dist_dir/clean-article-$version-project.zip"

"$project_dir/scripts/build-extension.sh" >/dev/null
rm -f "$archive" "$versioned_archive"

(
  cd "$project_dir"
  zip -q -r "$archive" README.md .gitignore live-test.config.example.json extension scripts examples \
    -x '*.DS_Store'
  zip -q "$archive" \
    dist/clean-article-extension-unsigned.xpi \
    dist/clean-article-extension-source.zip
)

cp "$archive" "$versioned_archive"

echo "$versioned_archive"
