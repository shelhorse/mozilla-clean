#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
extension_dir="$project_dir/extension"
dist_dir="$project_dir/dist"
version="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1], encoding="utf-8"))["version"])' "$extension_dir/manifest.json")"

mkdir -p "$dist_dir"
python3 -m json.tool "$extension_dir/manifest.json" >/dev/null

artifact="$dist_dir/clean-article-extension-unsigned.xpi"
source_archive="$dist_dir/clean-article-extension-source.zip"
versioned_artifact="$dist_dir/clean-article-$version-unsigned.xpi"
versioned_source_archive="$dist_dir/clean-article-$version-source.zip"
rm -f "$artifact" "$source_archive" "$versioned_artifact" "$versioned_source_archive"

(
  cd "$extension_dir"
  zip -q -r "$artifact" . -x '*.DS_Store'
  zip -q -r "$source_archive" . -x '*.DS_Store'
)

cp "$artifact" "$versioned_artifact"
cp "$source_archive" "$versioned_source_archive"

echo "$versioned_artifact"
echo "$versioned_source_archive"
