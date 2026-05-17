#!/usr/bin/env bash
# Build pipeline (replaces the old hand-maintained dist/bundle.js).
# Delegates to scripts/build.mjs which:
#   1. Bundles src/index.ts → dist/bundle.js (esbuild, IIFE)
#   2. Inlines the bundle into release/index.html
#
# Requires Node + the dev dependencies installed (`npm install`).

set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"

if [[ ! -d "$ROOT/node_modules" ]]; then
  echo "node_modules missing — running 'npm install' first..."
  (cd "$ROOT" && npm install)
fi

node "$ROOT/scripts/build.mjs" "$@"
