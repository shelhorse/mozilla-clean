#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

python3 -m json.tool "$project_dir/extension/manifest.json" >/dev/null
node --check "$project_dir/extension/background.js"
node --check "$project_dir/extension/content/content.js"
node --check "$project_dir/extension/settings/settings.js"
node "$project_dir/scripts/test-background.mjs"

"$project_dir/scripts/build-extension.sh" >/dev/null
unzip -t "$project_dir/dist/clean-article-extension-unsigned.xpi" >/dev/null
