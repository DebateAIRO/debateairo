#!/usr/bin/env python3
"""ARCH-REV-S01-03 — the B1-p2 detector as a plan-level check.
Every schema-qualified SQL function named on a GRANT BULLET of C2-S4 must be DEFINED by a
function bullet of the same step. Revision 2 granted two functions nothing defined.
argv[1] optional: a mutant PLAN."""
import re,sys,pathlib
src=sys.argv[1] if len(sys.argv)>1 else "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/docs/missions/free-public-debates/slices/S01/PLAN.md"
plan=pathlib.Path(src).read_text()
step=plan.split("#### C2-S4:")[1].split("#### C2-S5:")[0]
head,tail=step.split("GRANTs:")
QUAL=re.compile(r'((?:serve|core|identity)\.[a-z_]+)')
# definitions: a bullet whose FIRST backticked token starts with schema.name
defined=set()
for l in head.splitlines():
    if l.startswith("- `"):
        tok=l.split("`")[1]
        m=QUAL.match(tok)
        if m: defined.add(m.group(1))
# grants: only the bullet lines of the GRANTs block, stopping at the first non-bullet paragraph
granted=set()
for l in tail.splitlines():
    if l.startswith("- "):
        granted.update(m.group(1) for m in QUAL.finditer(l))
    elif l.strip() and not l.startswith("- ") and granted:
        break
missing=sorted(g for g in granted if g not in defined)
print("defined in C2-S4 : %s"%sorted(defined))
print("granted in C2-S4 : %s"%sorted(granted))
print("GRANTED BUT NOT DEFINED: %s"%(missing or "none"))
sys.exit(1 if missing else 0)
