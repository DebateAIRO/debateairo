#!/usr/bin/env python3
"""ARCH-REV-S02 probe · enumerate every tests/unit/api.test.ts case that touches
the admission surface, independently of the ARCH seat's re-fixture table.

Run from the S02 lane root:
  /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/tiers-s02/dialectical-engine

Result at 7f89f7b7 (2026-09-09): 20 it() blocks + the 4 rows of the it.each at :96
= the 24 tests the suite reports. Exactly THREE touch the admission surface —
:124-145, :146-187 (which holds the sub-assertions :159-167, :169-177, :179-186)
and :283-405 — so the orchestrator's N2 fold plus finding F-3 name every affected
case and there is no fourth. The it.each at :96 tests preserveSubmittedTierSource
and is untouched by the R3 roster filter.
"""
import re

p = "tests/unit/api.test.ts"
lines = open(p).read().splitlines()

its = [(i + 1, l.strip()) for i, l in enumerate(lines) if re.match(r"\s*it\(", l)]
spans = []
for k, (ln, txt) in enumerate(its):
    end = its[k + 1][0] - 1 if k + 1 < len(its) else len(lines)
    spans.append((ln, end, txt))

KEYS = ["admissionSettings", "evaluateAskAdmission", "PostgresAskApplication",
        ".submit(", "fixtureDiscoveredPanel", "resolveDiscoveredPanel"]

print(f"{len(spans)} it() blocks in {p}\n")
hit = 0
for ln, end, txt in spans:
    body = "\n".join(lines[ln - 1:end])
    found = [k for k in KEYS if k in body]
    title = re.search(r'it\(\s*"([^"]+)"', txt)
    title = title.group(1) if title else txt[:60]
    if found:
        hit += 1
        print(f"  :{ln}-{end}  {found}\n      {title}")
print(f"\nblocks touching the admission surface: {hit} of {len(spans)}")
