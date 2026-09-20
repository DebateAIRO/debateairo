#!/usr/bin/env python3
import re, pathlib
plan = pathlib.Path("/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/docs/missions/free-public-debates/slices/S01/PLAN.md").read_text()
mapsec = plan.split("### 1.1 Single-writer file map")[1].split("---")[0]
owner = {}
for l in mapsec.splitlines():
    if l.startswith("| `"):
        cells=[c.strip() for c in l.strip("|").split("|")]
        f=re.sub(r'`','',cells[0]).split(" ")[0]
        owner[f]=cells[1]
steps = plan.split("## 2. Steps")[1].split("## 3. SPEC")[0]
blocks = re.split(r'^### S01-(C\d)', steps, flags=re.M)
PATH=re.compile(r'`((?:apps|packages|migrations|tests|docs)/[A-Za-z0-9_./\-]+)`')
print("MAP:"); [print("  %-60s %s"%(k,v)) for k,v in owner.items()]
for i in range(1,len(blocks),2):
    c=blocks[i]; body=blocks[i+1]
    writable=set()
    for m in PATH.finditer(body):
        writable.add(m.group(1))
    print("\n=== %s files mentioned, not owned by %s in the map ==="%(c,c))
    for f in sorted(writable):
        o=owner.get(f)
        if o is None:
            print("  UNMAPPED  %s"%f)
        elif c not in o:
            print("  OTHER(%s) %s"%(o,f))
