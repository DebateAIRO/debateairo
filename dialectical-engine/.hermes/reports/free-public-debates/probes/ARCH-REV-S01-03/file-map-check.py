#!/usr/bin/env python3
"""ARCH-REV-S01-02: does every production file a step names appear in PLAN section 1.1?
argv[1] optional: a mutant PLAN to check instead of the live one."""
import re,sys,pathlib
src=sys.argv[1] if len(sys.argv)>1 else "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/docs/missions/free-public-debates/slices/S01/PLAN.md"
plan=pathlib.Path(src).read_text()
mapsec=plan.split("### 1.1 Single-writer file map")[1].split("No cluster writes")[0]
owner={}
for l in mapsec.splitlines():
    if l.startswith("| `"):
        cells=[c.strip() for c in l.strip("|").split("|")]
        owner[cells[0].split("`")[1]]=cells[1]
print("MAP rows: %d"%len(owner))
steps=plan.split("## 2. Steps")[1].split("## 3. SPEC")[0]
blocks=re.split(r'^### S01-(C\d)',steps,flags=re.M)
PATH=re.compile(r'`((?:apps|packages|migrations)/[A-Za-z0-9_./\-]+\.(?:ts|sql|tsx))[`:]')
bad=0
for i in range(1,len(blocks),2):
    c=blocks[i]; body=blocks[i+1]
    for f in sorted(set(m.group(1) for m in PATH.finditer(body))):
        o=owner.get(f)
        if o is None:
            print("  %s UNMAPPED  %s"%(c,f)); bad+=1
        elif c not in o:
            print("  %s OTHER(%s) %s"%(c,o,f))
print("UNMAPPED count: %d"%bad)
