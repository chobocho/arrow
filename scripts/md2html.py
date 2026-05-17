#!/usr/bin/env python3
"""Convert a project markdown file (history.md / TODO.md) to a self-contained
HTML page. Handles the subset of markdown actually used in this repo:

- ATX headings #..####
- Unordered lists "- ..." with nesting via leading spaces (2-space step)
- Fenced code blocks ```lang ... ```
- Inline `code`, **bold**, *italic*
- Paragraphs between blocks

The output is one file with inline CSS so it opens directly in a browser
without external dependencies — matches the project's "single index.html"
philosophy.

Usage: md2html.py <input.md> <output.html> "<page title>"
"""

from __future__ import annotations

import html
import re
import sys
from pathlib import Path

CSS = """
:root { color-scheme: light dark; }
* { box-sizing: border-box; }
body {
  font-family: "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR",
               system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI",
               sans-serif;
  background: #fafafa; color: #222;
  max-width: 880px; margin: 0 auto;
  padding: 28px 24px 80px;
  line-height: 1.62;
}
h1 { font-size: 26px; margin: 0 0 18px; border-bottom: 2px solid #3a7afe; padding-bottom: 8px; }
h2 {
  font-size: 20px; margin: 28px 0 12px;
  padding: 6px 10px; background: #eef3ff; color: #1c3a8e;
  border-left: 4px solid #3a7afe; border-radius: 4px;
}
h3 { font-size: 16px; margin: 22px 0 8px; color: #2a2a2a; }
h4 { font-size: 14px; margin: 16px 0 6px; color: #444; }
p  { margin: 8px 0; }
ul { margin: 6px 0 12px; padding-left: 24px; }
li { margin: 3px 0; }
code {
  background: #f0f1f5; padding: 1px 5px; border-radius: 3px;
  font-family: "JetBrains Mono", "Fira Code", Menlo, Consolas, monospace;
  font-size: 0.92em;
}
pre {
  background: #1f2330; color: #e6e6e6;
  padding: 12px 14px; border-radius: 6px; overflow-x: auto;
  font-size: 13px; line-height: 1.5;
}
pre code { background: transparent; padding: 0; color: inherit; }
a { color: #3a7afe; }
strong { color: #1c3a8e; }
hr { border: none; border-top: 1px solid #ddd; margin: 22px 0; }
nav.toc { background: #fff; border: 1px solid #e2e2ea; border-radius: 6px; padding: 10px 16px; margin: 12px 0 20px; font-size: 13px; }
nav.toc a { text-decoration: none; }
@media (prefers-color-scheme: dark) {
  body { background: #15171c; color: #e6e6ea; }
  h2 { background: #1d2a44; color: #d6e2ff; border-left-color: #3a7afe; }
  h3 { color: #ddd; } h4 { color: #bbb; }
  code { background: #2a2d36; color: #f0f1f5; }
  nav.toc { background: #1a1d24; border-color: #2a2d36; }
  hr { border-top-color: #2a2d36; }
}
"""


def inline(text: str) -> str:
    """Apply inline transforms: escape HTML, then re-introduce code/bold/italic."""
    # Pull out fenced inline code FIRST so HTML escaping doesn't eat backticks.
    placeholders: list[str] = []

    def stash(m: re.Match[str]) -> str:
        placeholders.append(m.group(1))
        return f"\x00INLINECODE{len(placeholders) - 1}\x00"

    text = re.sub(r"`([^`]+)`", stash, text)
    text = html.escape(text)
    text = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", text)
    text = re.sub(r"(?<!\*)\*([^*]+)\*(?!\*)", r"<em>\1</em>", text)
    # Naive autolink for explicit URLs.
    text = re.sub(
        r"(?<!\")(https?://[^\s<]+)",
        r'<a href="\1" target="_blank" rel="noopener">\1</a>',
        text,
    )

    def unstash(m: re.Match[str]) -> str:
        idx = int(m.group(1))
        return f"<code>{html.escape(placeholders[idx])}</code>"

    text = re.sub(r"\x00INLINECODE(\d+)\x00", unstash, text)
    return text


def convert(md: str) -> str:
    lines = md.splitlines()
    out: list[str] = []
    i = 0
    n = len(lines)
    # List stack of indent levels (each entry = the indent column for that <ul>).
    open_lists: list[int] = []

    def close_lists(to_depth: int = 0) -> None:
        while len(open_lists) > to_depth:
            out.append("</li>")
            out.append("</ul>")
            open_lists.pop()

    def flush_para(buf: list[str]) -> None:
        if not buf:
            return
        out.append("<p>" + "<br>".join(inline(x) for x in buf) + "</p>")
        buf.clear()

    para: list[str] = []

    while i < n:
        line = lines[i]
        # Fenced code block.
        m = re.match(r"^```(\w*)\s*$", line)
        if m:
            close_lists(0)
            flush_para(para)
            lang = m.group(1)
            i += 1
            code_lines: list[str] = []
            while i < n and not re.match(r"^```\s*$", lines[i]):
                code_lines.append(lines[i])
                i += 1
            i += 1  # skip closing fence
            cls = f' class="language-{html.escape(lang)}"' if lang else ""
            joined = html.escape("\n".join(code_lines))
            out.append(f"<pre><code{cls}>{joined}</code></pre>")
            continue

        # Headings #..####.
        m = re.match(r"^(#{1,4})\s+(.*?)\s*#*\s*$", line)
        if m:
            close_lists(0)
            flush_para(para)
            level = len(m.group(1))
            text = inline(m.group(2))
            slug = re.sub(r"[^\w가-힣ㄱ-ㅎㅏ-ㅣ-]+", "-", m.group(2).strip()).strip("-")[:64]
            out.append(f'<h{level} id="{html.escape(slug)}">{text}</h{level}>')
            i += 1
            continue

        # Horizontal rule.
        if re.match(r"^---+\s*$", line):
            close_lists(0)
            flush_para(para)
            out.append("<hr>")
            i += 1
            continue

        # List item — leading spaces decide nesting.
        m = re.match(r"^(\s*)-\s+(.*)$", line)
        if m:
            flush_para(para)
            indent = len(m.group(1))
            content = inline(m.group(2))
            # Adjust list nesting to match indent.
            depth = indent // 2 + 1
            # Open more lists if needed.
            while len(open_lists) < depth:
                if open_lists:
                    # Promote: keep previous <li> open and nest inside it.
                    out.append("<ul>")
                else:
                    out.append("<ul>")
                open_lists.append(indent)
            # Close deeper lists if needed.
            while len(open_lists) > depth:
                out.append("</li>")
                out.append("</ul>")
                open_lists.pop()
                if open_lists:
                    out.append("</li>")
            # Close previous sibling <li> at this depth.
            if out and out[-1].startswith("<li>"):
                out[-1] = out[-1]  # no-op, kept for clarity
            # Open new <li>.
            out.append(f"<li>{content}")
            i += 1
            continue

        # Blank line: end paragraph and (optionally) lists.
        if line.strip() == "":
            flush_para(para)
            # Blank line does NOT close a list — markdown allows blanks within
            # lists. But two consecutive blanks effectively end the list.
            if i + 1 < n and lines[i + 1].strip() == "":
                close_lists(0)
            i += 1
            continue

        # Default: paragraph line.
        close_lists(0)
        para.append(line.rstrip())
        i += 1

    flush_para(para)
    close_lists(0)
    return "\n".join(out)


def main() -> int:
    if len(sys.argv) != 4:
        sys.stderr.write("usage: md2html.py <input.md> <output.html> <title>\n")
        return 2
    src = Path(sys.argv[1]).read_text(encoding="utf-8")
    title = sys.argv[3]
    body = convert(src)
    page = f"""<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{html.escape(title)}</title>
<style>{CSS}</style>
</head>
<body>
{body}
</body>
</html>
"""
    Path(sys.argv[2]).write_text(page, encoding="utf-8")
    print(f"wrote {sys.argv[2]} ({len(page)} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
