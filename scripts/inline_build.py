#!/usr/bin/env python3
"""Inline dist/bundle.js into index.html and write the result to release/index.html.

This is invoked by both build.sh and build.bat so the inlining behavior stays
consistent across platforms.
"""

import re
import sys
from pathlib import Path


def main() -> int:
    if len(sys.argv) != 4:
        print("usage: inline_build.py <index.html> <bundle.js> <out.html>", file=sys.stderr)
        return 2

    html_path = Path(sys.argv[1])
    js_path = Path(sys.argv[2])
    out_path = Path(sys.argv[3])

    html = html_path.read_text(encoding="utf-8")
    js = js_path.read_text(encoding="utf-8")

    pattern = re.compile(r'<script src="dist/bundle\.js"></script>')
    if not pattern.search(html):
        print("error: could not find <script src=\"dist/bundle.js\"> in index.html", file=sys.stderr)
        return 1

    # Make sure the JS does not contain a closing script tag that would break parsing.
    safe_js = js.replace("</script>", "<\\/script>")
    replacement = "<script>\n" + safe_js + "\n</script>"
    html = pattern.sub(lambda _m: replacement, html, count=1)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(html, encoding="utf-8")
    print(f"wrote {out_path} ({out_path.stat().st_size} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
