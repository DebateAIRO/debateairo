#!/bin/bash
set -u
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/rev-grok-10b/dialectical-engine || exit 99
echo "HEAD=$(git rev-parse --short HEAD)"
echo "--- Download PDF in apps/ui ---"
grep -nF 'Download PDF' apps/ui || echo "NONE"
echo "--- ConsentSettingsPanel mounted ---"
grep -n 'ConsentSettingsPanel' apps/ui/app/settings/page.tsx
echo "--- SDK names under consent + lib/consent.ts ---"
grep -nE 'plausible|gtag|googletagmanager|segment\.|mixpanel|posthog|amplitude' apps/ui/components/consent apps/ui/lib/consent.ts apps/ui/lib/privacyPolicy.ts || echo "NONE"
echo "--- colour literals outside token blocks in S01 files ---"
python3 - << 'PY'
from pathlib import Path
import re
css = Path("apps/ui/app/globals.css").read_text()
# two token blocks: :root { ... } then html[data-mode="chamber"] { ... }
# colour-literal test scans globals.css outside those two blocks, layout, ModeToggle, debatePresentation
pat = re.compile(r'oklch\(|#[0-9A-Fa-f]{3,8}\b|\brgba?\(', re.I)
# crude: find first two top-level blocks after :root and chamber
start_root = css.find(":root {")
start_ch = css.find('html[data-mode="chamber"] {')
# find matching close of chamber block: from start_ch, brace count
def block_end(src, start):
    i = src.find("{", start)
    depth = 0
    for j in range(i, len(src)):
        if src[j] == "{": depth += 1
        elif src[j] == "}":
            depth -= 1
            if depth == 0: return j
    return -1
end_root = block_end(css, start_root)
end_ch = block_end(css, start_ch)
outside = css[:start_root] + css[end_root+1:start_ch] + css[end_ch+1:]
hits = []
for m in pat.finditer(outside):
    line = outside[:m.start()].count("\n")  # wrong line — recompute on full file
# recount on full file skipping the two block ranges
hits = []
for i, line in enumerate(css.splitlines(), 1):
    in_root = start_root <= css.find(line) <= end_root  # unreliable
# line-based: compute line ranges
root_line = css[:start_root].count("\n")+1
root_end_line = css[:end_root].count("\n")+1
ch_line = css[:start_ch].count("\n")+1
ch_end_line = css[:end_ch].count("\n")+1
print(f":root lines {root_line}-{root_end_line}; chamber {ch_line}-{ch_end_line}")
for i, line in enumerate(css.splitlines(), 1):
    if root_line <= i <= root_end_line or ch_line <= i <= ch_end_line:
        continue
    if pat.search(line):
        hits.append(f"{i}:{line.strip()[:120]}")
print("hits", len(hits))
for h in hits:
    print(h)
PY
echo "--- layout colour literals ---"
grep -nE 'oklch\(|#[0-9A-Fa-f]{3,8}\b|rgba?\(' apps/ui/app/layout.tsx || echo "NONE"
echo "--- cookie names product vs copy ---"
grep -nE 'de_session|de_mfa|de_device|de_quality|de_analytics' apps/ui/lib/consent.ts
echo "DONE"
