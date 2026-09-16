#!/usr/bin/env python3
"""reanchor-quotes.py <packet> — re-grep every `path:LINE — `text`` quote against the file as it stands NOW and rewrite LINE.
   Prints each change; exits 1 when a quoted text no longer exists in its file (a stale quote that cannot be re-anchored)."""
import re, sys, pathlib
p = pathlib.Path(sys.argv[1]); text = p.read_text(); missing = []; changed = 0
def fix(m):
    global changed
    path, line, quote = m.group(1), int(m.group(2)), m.group(3)
    f = pathlib.Path(path)
    if not f.is_file(): missing.append(f"{path} (no file)"); return m.group(0)
    lines = f.read_text().splitlines()
    hits = [i + 1 for i, l in enumerate(lines) if quote.strip() in l]
    if not hits: missing.append(f"{path}:{line} `{quote[:60]}`"); return m.group(0)
    new = min(hits, key=lambda h: abs(h - line))
    if new != line: changed += 1; print(f"  {path.split('/dialectical-engine/')[-1]}:{line} → :{new}  `{quote[:50]}`")
    return f"{path}:{new} — `{quote}`"
out = re.sub(r"(/Users/[^\s:`]+):(\d+) — `([^`]+)`", fix, text)
p.write_text(out); print(f"re-anchored {changed} quote(s); unresolvable: {len(missing)}")
for x in missing: print("  MISSING", x)
sys.exit(1 if missing else 0)
