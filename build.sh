#!/usr/bin/env bash
# Builds a single-file index.html into release/.
# Inlines dist/bundle.js so the output has no external dependencies.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
SRC_HTML="$ROOT/index.html"
SRC_JS="$ROOT/dist/bundle.js"
OUT_DIR="$ROOT/release"
OUT_HTML="$OUT_DIR/index.html"

if [[ ! -f "$SRC_HTML" ]]; then
  echo "index.html not found at $SRC_HTML" >&2
  exit 1
fi
if [[ ! -f "$SRC_JS" ]]; then
  echo "dist/bundle.js not found at $SRC_JS" >&2
  exit 1
fi

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

python3 - "$SRC_HTML" "$SRC_JS" "$OUT_HTML" <<'PY'
import sys, pathlib, re

html_path = pathlib.Path(sys.argv[1])
js_path = pathlib.Path(sys.argv[2])
out_path = pathlib.Path(sys.argv[3])

html = html_path.read_text(encoding="utf-8")
js = js_path.read_text(encoding="utf-8")

pattern = re.compile(r'<script src="dist/bundle\.js"></script>')
replacement = f"<script>\n{js}\n</script>"
if not pattern.search(html):
    raise SystemExit("could not find <script src=\"dist/bundle.js\"> in index.html")
html = pattern.sub(lambda _m: replacement, html, count=1)

out_path.write_text(html, encoding="utf-8")
print(f"wrote {out_path} ({out_path.stat().st_size} bytes)")
PY

echo "Build complete: $OUT_HTML"
