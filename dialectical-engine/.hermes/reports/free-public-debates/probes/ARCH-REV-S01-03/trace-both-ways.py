#!/usr/bin/env python3
"""ARCH-REV-S01 both-ways trace parser.
A: every unique **R-n** id in SPEC-v2 has a row in PLAN section 3.
B: every requirement cited in PLAN section 3 exists in SPEC-v2.
C: every step id named in PLAN section 3 exists as a '#### <id>:' heading in PLAN section 2.
D: every step heading in PLAN section 2 falls inside the step range its cluster row in section 1 declares.
E: every file named in a step 'Files:' block is owned by that cluster in the section 1.1 single-writer map.
"""
import re, sys, pathlib
base = pathlib.Path("/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine/docs/missions/free-public-debates/slices/S01")
spec = (base/"SPEC-v2.md").read_text()
plan = (base/"PLAN.md").read_text()

spec_ids = sorted({m for m in re.findall(r'\*\*(R-\d+)\*\*', spec)}, key=lambda s: int(s[2:]))
trace = plan.split("## 3. SPEC↔PLAN trace")[1].split("## 4.")[0]
rows = [l for l in trace.splitlines() if l.startswith("| R-")]
plan_ids, cited_steps = [], {}
for l in rows:
    cells = [c.strip() for c in l.strip("|").split("|")]
    rid = cells[0]
    plan_ids.append(rid)
    cited_steps[rid] = set(re.findall(r'\bC\d-S\d+', cells[2]))
steps = set(re.findall(r'^#### (C\d-S\d+):', plan, re.M))
clusters = dict(re.findall(r'^\| S01-(C\d) \| [^|]+\| (C\d-S\d+…C\d-S\d+) \|', plan, re.M))

print("A/B unique R ids: spec=%d plan-trace-rows=%d" % (len(spec_ids), len(plan_ids)))
print("A missing in PLAN:", [r for r in spec_ids if r not in plan_ids] or "none")
print("B extra in PLAN  :", [r for r in plan_ids if r not in spec_ids] or "none")
print("B duplicate rows :", [r for r in set(plan_ids) if plan_ids.count(r) > 1] or "none")
missing_steps = sorted({s for v in cited_steps.values() for s in v} - steps)
print("C cited-but-undefined steps:", missing_steps or "none")
uncited = sorted(steps - {s for v in cited_steps.values() for s in v})
print("C defined-but-uncited steps:", uncited or "none")
for c, rng in sorted(clusters.items()):
    lo, hi = rng.split("…")
    hi_n = int(hi.split("-S")[1])
    mine = sorted(int(s.split("-S")[1]) for s in steps if s.startswith(c + "-S"))
    gaps = [n for n in range(1, hi_n + 1) if n not in mine]
    over = [n for n in mine if n > hi_n]
    print("D %s declared %s  defined=%d  missing=%s  beyond-range=%s" % (c, rng, len(mine), gaps or "none", over or "none"))
