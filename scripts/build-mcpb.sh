#!/usr/bin/env bash
# Builds cledara.mcpb, a one-click Claude Desktop extension, into build/.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
stage="$root/build/mcpb"
out="$root/build/cledara.mcpb"

cd "$root"
npm run build

rm -rf "$stage" "$out"
mkdir -p "$stage"
cp -R dist package.json package-lock.json README.md "$stage/"

# Keep the manifest version in step with package.json.
node -e '
  const fs = require("node:fs");
  const [src, dest] = process.argv.slice(1);
  const m = JSON.parse(fs.readFileSync(src, "utf8"));
  m.version = require(process.cwd() + "/package.json").version;
  fs.writeFileSync(dest, JSON.stringify(m, null, 2) + "\n");
' manifest.json "$stage/manifest.json"

# Runtime dependencies only; no build step inside the bundle.
(cd "$stage" && npm ci --omit=dev --ignore-scripts --no-audit --no-fund --loglevel=error)

npx mcpb validate "$stage/manifest.json"
npx mcpb pack "$stage" "$out"
echo "Built $out"
