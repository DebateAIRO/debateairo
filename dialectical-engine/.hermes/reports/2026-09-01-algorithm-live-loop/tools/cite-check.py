#!/usr/bin/env python3
"""cite-check.py — proves a citation ANCHOR resolves to exactly ONE site, and emits the record (D55).

usage: cite-check.py <worktree> <anchors-file> [--out <record>]

anchors-file: one citation per line, `<repo-relative-path><TAB><anchor text>`.
Blank lines and lines starting with # are ignored. The anchor is matched as a LITERAL substring
of the WHOLE FILE, not line by line, so `\n` in the anchor means a real newline. That matters:
some sites are genuinely indistinguishable on one line — `apps/runner/src/index.ts` holds four
identical `"PANEL_WEIGHTING_UNRESOLVED",` lines — and for those a unique anchor MUST span lines.
A checker that could only match within a line would be unusable for exactly the citations that
most need it.

WHY THIS EXISTS. D53 ruled that a `file:line` citation acquires a silent expiry the moment
another lane merges into the file it cites, and prescribed citing the SEARCH instead of the
number. The first implementation of that cure used `grep -n <anchor> | head -1`: it recorded a
first match and never counted matches. A reviewer showed three filed anchors matching two, four
and two sites respectively — so the anchors did not identify anything, and a future insertion
could silently change which duplicate `head -1` picked, without any gate failing. The cure had
reproduced the disease it was adopted to prevent.

So uniqueness is the whole contract here:
  exit 0  <=>  EVERY anchor matches exactly one line in its file
  exit 1  <=>  any anchor matches zero, or two or more
  exit 2  <=>  unusable input (missing worktree, missing anchors file, missing cited file)

The emitted record carries the measured checkout's own commit and tree, so a citation record is
bound to the tree it was derived from exactly as a gate record is.
"""
import os, subprocess, sys

def git(wt, *args):
    return subprocess.run(["git", "-C", wt, *args], capture_output=True, text=True).stdout.strip()

if len(sys.argv) < 3:
    print(__doc__); raise SystemExit(2)
wt, anchors_path = sys.argv[1], sys.argv[2]
out = None
if "--out" in sys.argv:
    out = sys.argv[sys.argv.index("--out") + 1]
if not os.path.isdir(wt):
    print(f"REFUSING: worktree '{wt}' is not a directory"); raise SystemExit(2)
if not os.path.isfile(anchors_path):
    print(f"REFUSING: anchors file '{anchors_path}' does not exist"); raise SystemExit(2)

commit, tree = git(wt, "rev-parse", "HEAD"), git(wt, "rev-parse", "HEAD^{tree}")
porcelain = git(wt, "status", "--porcelain").replace("\n", ";")
lines = []
entries = []
for raw in open(anchors_path):
    s = raw.rstrip("\n")
    if not s.strip() or s.lstrip().startswith("#"):
        continue
    if "\t" not in s:
        print(f"REFUSING: anchors line {s!r} has no TAB separating path from anchor"); raise SystemExit(2)
    rel, anchor = s.split("\t", 1)
    entries.append((rel.strip(), anchor))
if not entries:
    print("REFUSING: the anchors file lists no citations — an empty result is not a pass")
    raise SystemExit(2)

lines.append(f"commit={commit} tree={tree}  cite-check  worktree={wt}")
lines.append(f"porcelain : [{porcelain}]")
lines.append(f"anchors   : {len(entries)} from {anchors_path}")
lines.append("")
bad = 0
for rel, anchor in entries:
    path = os.path.join(wt, rel)
    if not os.path.isfile(path):
        lines.append(f"MISSING FILE  {rel}  <- {anchor!r}"); bad += 1; continue
    body = open(path, errors="replace").read()
    needle = anchor.replace("\\n", "\n").replace("\\t", "\t")
    hits, at = [], body.find(needle)
    while at != -1:
        hits.append(body.count("\n", 0, at) + 1)
        at = body.find(needle, at + 1)
    if len(hits) == 1:
        lines.append(f"UNIQUE   {rel}:{hits[0]} @{commit[:8]}   anchor={anchor!r}")
    elif not hits:
        lines.append(f"ABSENT   {rel}  anchor={anchor!r} matches NOTHING"); bad += 1
    else:
        lines.append(f"AMBIGUOUS {rel}  anchor={anchor!r} matches {len(hits)} sites: "
                     + ", ".join(str(h) for h in hits)
                     + "  -> this anchor identifies nothing; make it longer or compound"); bad += 1
lines.append("")
lines.append(f"TOTAL {len(entries)}  unique={len(entries)-bad}  problems={bad}")
lines.append("VERDICT: " + ("EVERY anchor resolves to exactly one site" if bad == 0
                            else f"{bad} anchor(s) do NOT uniquely identify a site — the citation is not durable"))
text = "\n".join(lines)
print(text)
if out:
    open(out, "w").write(text + "\n")
raise SystemExit(0 if bad == 0 else 1)
