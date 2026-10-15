#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

python3 -m json.tool "$project_dir/extension/manifest.json" >/dev/null
node --check "$project_dir/extension/core.js"
node --check "$project_dir/extension/background.js"
node --check "$project_dir/extension/content/content.js"
node --check "$project_dir/extension/settings/settings.js"
node --check "$project_dir/extension/worker/worker.js"
node --check "$project_dir/scripts/live-e2e.mjs"
node "$project_dir/scripts/test-background.mjs"
node "$project_dir/scripts/test-action-route.mjs"
node "$project_dir/scripts/test-android-retrieval.mjs"
node "$project_dir/scripts/test-android-save-route.mjs"
node "$project_dir/scripts/test-worker-lifecycle.mjs"
node "$project_dir/scripts/test-worker-retrieval.mjs"

if grep -RIn --exclude='*.min.js' -E 'browser\.downloads|downloads\.download|browser\.alarms' "$project_dir/extension"; then
  echo "Forbidden background/download API usage found in extension source." >&2
  exit 1
fi

node -e '
  const fs = require("fs");
  const manifest = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  if (manifest.version !== "0.3.3") throw new Error("Expected manifest version 0.3.3");
  if (manifest.background?.scripts?.[0] !== "background.js") throw new Error("Missing extension-menu action listener");
  if (manifest.permissions.some((value) => ["downloads", "alarms"].includes(value))) throw new Error("Forbidden manifest permission");
  if (manifest.action?.default_title !== "Clean Article") throw new Error("Unexpected extension-menu label");
  if (manifest.action?.default_popup) throw new Error("Action must activate the article, not open a popup");
' "$project_dir/extension/manifest.json"

"$project_dir/scripts/build-extension.sh" >/dev/null
unzip -t "$project_dir/dist/clean-article-extension-unsigned.xpi" >/dev/null
