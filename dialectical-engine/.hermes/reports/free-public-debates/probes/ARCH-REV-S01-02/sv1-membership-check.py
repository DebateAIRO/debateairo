#!/usr/bin/env python3
"""ARCH-REV-S01-02: does SV-1's 52-route membership list actually match the inventory?
argv[1] = the index.ts to check (base file, or a mutant)."""
import re,sys,pathlib
plan=pathlib.Path("/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/docs/missions/free-public-debates/slices/S01/PLAN.md").read_text()
block=plan.split("**SV-1 R-23 route membership")[1].split("**SV-2")[0]
listed=[m.strip(" `") for m in re.findall(r'`([A-Z]+ /v1/[^`]*)`',block)]
src=pathlib.Path(sys.argv[1]).read_text()
actual=re.findall(r'\{ route: "([^"]+)"',src)
print("SV-1 listed:",len(listed)," inventory rows:",len(actual))
print("listed but NOT in file:",[r for r in listed if r not in actual] or "none")
print("in file but NOT listed:",[r for r in actual if r not in listed] or "none")
print("duplicates in SV-1 list:",[r for r in set(listed) if listed.count(r)>1] or "none")
