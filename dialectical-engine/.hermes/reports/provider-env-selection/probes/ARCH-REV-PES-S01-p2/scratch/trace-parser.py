#!/usr/bin/env python3
"""ARCH-REV-PES-S01-p2 own both-ways trace. SPEC-v5 is the record. The p6 fold is applied, not trusted."""
import re
from pathlib import Path

root = Path("/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/provider-env-selection/slices/S01")
spec = (root / "SPEC-v5.md").read_text()
plan = (root / "PLAN.md").read_text()
spec_lines = spec.splitlines()
plan_lines = plan.splitlines()

req_at = {}
for n, line in enumerate(spec_lines, 1):
    m = re.match(r"^\*\*(R1\.\d+)", line)
    if m:
        req_at[m.group(1)] = n
sec_at = {}
for n, line in enumerate(spec_lines, 1):
    m = re.match(r"^## ([456])\. ", line)
    if m:
        sec_at[f"§{m.group(1)}"] = n

print("SPEC-v5 requirement starts:")
for r, n in req_at.items():
    print(f"  {r} SPEC-v5.md:{n}")
print("SPEC-v5 section starts:", {k: f"SPEC-v5.md:{v}" for k, v in sec_at.items()})

steps = []
for i, line in enumerate(plan_lines, 1):
    m = re.match(r"\*\*(S01-\d+)\s+·\s+(\w+)", line)
    if m:
        steps.append((m.group(1), m.group(2), i))
print(f"\nPLAN headings {len(steps)}")
for s, kind, ln in steps:
    print(f"  {s} {kind} PLAN.md:{ln}")

fwd = {}
in_fwd = False
for i, line in enumerate(plan_lines, 1):
    if line.startswith("| requirement |"):
        in_fwd = True
        continue
    if line.startswith("**Reverse trace"):
        break
    if not in_fwd or not (line.startswith("| R") or line.startswith("| §")):
        continue
    cells = [c.strip() for c in line.strip("|").split("|")]
    req = cells[0]
    ids = re.findall(r"S01-\d+", cells[2])
    cite = re.search(r"SPEC-v4\.md:(\d+)", cells[0])
    fwd[req.split(" ")[0]] = (ids, i, int(cite.group(1)) if cite else None, cells[2])

# fold map, DECISIONS.md ## REQ-FIX p6 — orchestrator fold
fold = {228: 243, 233: 248, 249: 264, 266: 281, 338: 353, 275: 290}

print("\nFORWARD gaps (no S01- id in the step cell):")
for r in list(req_at) + ["§4", "§5", "§6"]:
    ids, ln, cite, cell = fwd.get(r, ([], None, None, ""))
    if not ids:
        print(f"  GAP {r} PLAN.md:{ln} cell={cell[:120]!r}")

print("\nCITATIONS vs SPEC-v5 start, raw and after the p6 fold:")
for r, start in req_at.items():
    ids, ln, cite, _ = fwd.get(r, ([], None, None, ""))
    if cite is None:
        print(f"  NO CITE {r}")
        continue
    folded = fold.get(cite, cite)
    raw_ok = cite == start
    fold_ok = folded == start
    if not raw_ok or not fold_ok:
        print(f"  {r} PLAN cites SPEC-v4.md:{cite} fold->{folded} SPEC-v5 starts :{start} raw_ok={raw_ok} fold_ok={fold_ok} PLAN.md:{ln}")
    else:
        print(f"  {r} :{cite} matches SPEC-v5:{start}")
for sec, start in sec_at.items():
    ids, ln, cite, _ = fwd.get(sec, ([], None, None, ""))
    if cite is None:
        print(f"  NO CITE {sec}")
        continue
    folded = fold.get(cite, cite)
    print(f"  {sec} PLAN cites :{cite} fold->{folded} SPEC-v5 starts :{start} fold_ok={folded == start} PLAN.md:{ln}")

headings = {s for s, _, _ in steps}
print("\nFORWARD ids with no heading:")
for r, (ids, ln, _, _) in fwd.items():
    for s in ids:
        if s not in headings:
            print(f"  {r} cites {s} PLAN.md:{ln}")

rev_line = next(i for i, line in enumerate(plan_lines, 1) if line.startswith("**Reverse trace"))
rev_blob = " ".join(plan_lines[rev_line - 1: rev_line + 8])
rev = {}
for m in re.finditer(r"(S01-\d+)\s+((?:R1\.\d+|§\d+)(?:\s*,\s*(?:R1\.\d+|§\d+))*)", rev_blob):
    rev[m.group(1)] = re.findall(r"R1\.\d+|§\d+", m.group(2))
print("\nREVERSE gaps:")
for s, kind, ln in steps:
    if s not in rev:
        print(f"  GAP {s} {kind} PLAN.md:{ln}")
known = set(req_at) | {"§4", "§5", "§6"}
print("REVERSE unknown requirement:")
for s, rs in rev.items():
    for r in rs:
        if r not in known:
            print(f"  {s} -> {r}")
print("REVERSE ids with no heading:")
for s in rev:
    if s not in headings:
        print(f"  {s}")

print("\nPROD missing RED when omitted:")
for n, (s, kind, ln) in enumerate(steps):
    if kind != "PROD":
        continue
    end = steps[n + 1][2] if n + 1 < len(steps) else len(plan_lines) + 1
    body = "\n".join(plan_lines[ln - 1: end - 1])
    if "RED when omitted" not in body:
        print(f"  MISSING {s} PLAN.md:{ln}")

print("\nDone-when cites a later step id:")
for n, (s, kind, ln) in enumerate(steps):
    end = steps[n + 1][2] if n + 1 < len(steps) else len(plan_lines) + 1
    body = "\n".join(plan_lines[ln - 1: end - 1])
    for m in re.finditer(r"Done when:.*", body):
        later = [x for x in re.findall(r"S01-\d+", m.group(0)) if x > s]
        if later:
            print(f"  {s} cites later {later} PLAN.md:{ln}")

print("\nCase labels:")
body = "\n".join(plan_lines)
for prefix in ("A", "B", "C", "D", "E", "F", "G", "I", "H", "K"):
    labels = re.findall(rf"\*\*({prefix}\d+)\*\*", body)
    print(f"  {prefix} {len(labels)} {labels}")

print("\nBanned words outside PLAN.md:39-45 counter-example:")
banned = re.compile(r"\b(improve|better|robust|handle|appropriate)\b", re.I)
for i, line in enumerate(plan_lines, 1):
    if 39 <= i <= 45:
        continue
    if banned.search(line):
        print(f"  PLAN.md:{i}: {line[:180]}")

print("\nRejection bullets missing 'guards before' / 'g1':")
for i, line in enumerate(plan_lines, 1):
    if re.search(r"\*\*(A[3-6]|G7|G1[3-6]|I3|I6|I7|I15)\*\*", line):
        has = ("guards before" in line) or ("g1" in line) or ("fires first" in line)
        print(f"  PLAN.md:{i} prior_named={has} {line[:140]}")

print("\nRaw counts in criteria:")
for i, line in enumerate(plan_lines, 1):
    if "count(*)" in line or "rowCount` is `49`" in line or "of length 34" in line or "of length 33" in line:
        print(f"  PLAN.md:{i}: {line[:160]}")
print("TRACE PARSER DONE")
