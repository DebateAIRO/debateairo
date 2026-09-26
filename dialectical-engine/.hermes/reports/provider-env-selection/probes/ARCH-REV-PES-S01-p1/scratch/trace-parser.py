#!/usr/bin/env python3
"""ARCH-REV-PES-S01-p1 both-ways trace. Reads SPEC-v3 and PLAN only."""
import re
from pathlib import Path

spec = Path("/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/provider-env-selection/slices/S01/SPEC-v3.md").read_text()
plan = Path("/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/provider-env-selection/slices/S01/PLAN.md").read_text()
plan_lines = plan.splitlines()

reqs = re.findall(r"\*\*(R1\.\d+)\*\*", spec)
# sections the plan traces as requirements
sections = ["§4", "§5", "§6"]
print("SPEC requirements", reqs)

steps = []
for i, line in enumerate(plan_lines, 1):
    m = re.match(r"\*\*(S01-\d+)\s+·\s+(\w+)", line)
    if m:
        steps.append((m.group(1), m.group(2), i, line))
print("PLAN step headings", len(steps))
for s, kind, ln, _ in steps:
    print(f"  {s} {kind} PLAN.md:{ln}")

# forward table: lines between the trace heading and Reverse trace
fwd = {}
in_fwd = False
for i, line in enumerate(plan_lines, 1):
    if line.startswith("| requirement |"):
        in_fwd = True
        continue
    if line.startswith("**Reverse trace"):
        break
    if not in_fwd or not line.startswith("| R") and not line.startswith("| §"):
        continue
    cells = [c.strip() for c in line.strip("|").split("|")]
    if len(cells) < 3:
        continue
    req = cells[0]
    ids = re.findall(r"S01-\d+", cells[2])
    fwd[req] = (ids, i)

rev_line = next(i for i, line in enumerate(plan_lines, 1) if line.startswith("**Reverse trace"))
rev_blob = " ".join(plan_lines[rev_line - 1: rev_line + 6])
rev = {}
for m in re.finditer(r"(S01-\d+)\s+((?:R1\.\d+|§\d+)(?:\s*,\s*(?:R1\.\d+|§\d+))*)", rev_blob):
    rev[m.group(1)] = re.findall(r"R1\.\d+|§\d+", m.group(2))

print("\nFORWARD gaps (requirement with no step):")
for r in reqs + sections:
    ids = fwd.get(r, ([], None))[0]
    if not ids:
        print(f"  GAP {r}")
print("FORWARD steps cited that have no heading:")
headings = {s for s, _, _, _ in steps}
for r, (ids, ln) in fwd.items():
    for s in ids:
        if s not in headings:
            print(f"  {r} cites {s} at PLAN.md:{ln} with no heading")

print("\nREVERSE gaps (heading with no requirement):")
for s, kind, ln, _ in steps:
    if s not in rev:
        print(f"  GAP {s} ({kind}) PLAN.md:{ln}")
print("REVERSE cites unknown requirement:")
known = set(reqs + sections)
for s, rs in rev.items():
    for r in rs:
        if r not in known:
            print(f"  {s} -> {r}")

print("\nPROD steps missing 'RED when omitted' before the next step heading:")
prod_idx = [i for i, (s, k, ln, _) in enumerate(steps) if k == "PROD"]
for n in prod_idx:
    s, kind, ln, _ = steps[n]
    end = steps[n + 1][2] if n + 1 < len(steps) else len(plan_lines) + 1
    body = "\n".join(plan_lines[ln - 1: end - 1])
    if "RED when omitted" not in body:
        print(f"  MISSING {s} PLAN.md:{ln}")

print("\nDone-criterion mentions a later step id:")
for n, (s, kind, ln, _) in enumerate(steps):
    end = steps[n + 1][2] if n + 1 < len(steps) else len(plan_lines) + 1
    body = "\n".join(plan_lines[ln - 1: end - 1])
    # only the Done when sentence
    for m in re.finditer(r"Done when:.*", body):
        later = [x for x in re.findall(r"S01-\d+", m.group(0)) if x > s]
        if later:
            print(f"  {s} done-when cites later {later} PLAN.md:{ln}")

print("\nCase-count check C2 headings A-G:")
body = "\n".join(plan_lines)
labels = re.findall(r"\*\*([A-G]\d+)\*\*", "\n".join(plan_lines[315:356]))
print(" ", labels, "count", len(labels))
print("I", re.findall(r"\*\*(I\d+)\*\*", body), "count", len(re.findall(r"\*\*(I\d+)\*\*", body)))
print("H", re.findall(r"\*\*(H\d+)\*\*", body))
print("K", re.findall(r"\*\*(K\d+)\*\*", body))

print("\nBanned words outside the counter-example paragraph (lines 26-31):")
banned = re.compile(r"\b(improve|better|robust|handle|appropriate)\b", re.I)
for i, line in enumerate(plan_lines, 1):
    if 26 <= i <= 31:
        continue
    if banned.search(line):
        print(f"  PLAN.md:{i}: {line[:160]}")
print("done")
