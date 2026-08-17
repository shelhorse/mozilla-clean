#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
extension_dir="$project_dir/extension"
dist_dir="$project_dir/dist"

mkdir -p "$dist_dir"
python3 -m json.tool "$extension_dir/manifest.json" >/dev/null

artifact="$dist_dir/clean-article-extension-unsigned.xpi"
source_archive="$dist_dir/clean-article-extension-source.zip"
rm -f "$artifact" "$source_archive"

(
  cd "$extension_dir"
  zip -q -r "$artifact" . -x '*.DS_Store'
  zip -q -r "$source_archive" . -x '*.DS_Store'
)

echo "$artifact"
echo "$source_archive"

