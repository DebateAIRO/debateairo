#!/usr/bin/env python3
"""Mechanical `path:line` sweep for any mission artifact (COMMON §10.24).

    python3 cite-sweep.py <artifact.md> <search-root> [<search-root> ...]

Resolves every `path:line` / `path:a-b` citation in the artifact against the file
it names and prints the line, so a citation lifted out of a DIFF (whose numbers
describe the patch, not the tree) is visible before the artifact is filed.
Roots come from argv, never hard-coded (COMMON §10.35).

Measured 2026-09-07: found five bad citations in this seat's own verdict — four
`path:line` pairs copied from a review package's diff and one repeated from an
author's handoff without measuring. Exhortation ("cite only what you measured")
did not prevent them; this did.
"""
import re, sys, os

if len(sys.argv) < 3:
    sys.exit(__doc__)
artifact, roots = sys.argv[1], sys.argv[2:]
text = open(artifact).read()
cites = sorted(set(re.findall(r'`([A-Za-z0-9/._-]+\.(?:tsx|ts|css|mjs|json|md)):(\d+)(?:-(\d+))?`', text)))
print(f"{len(cites)} distinct path:line citations in {artifact}\n")
unresolved = 0
for f, a, b in cites:
    path = next((c for r in roots
                 for c in (os.path.join(r, f),)
                 if os.path.isfile(c)), None)
    span = f"{f}:{a}" + (f"-{b}" if b else "")
    if path is None:
        print(f"  UNRESOLVED  {span}")
        unresolved += 1
        continue
    lines = open(path, errors="replace").read().split("\n")
    n = int(a)
    body = lines[n - 1].strip()[:78] if 0 < n <= len(lines) else "<<< PAST END OF FILE >>>"
    print(f"  {span}\n      {body}")
print(f"\nunresolved: {unresolved} (a bare basename may simply need another root)")
