#!/usr/bin/env python3
"""ARCH-REV-S02 · independent both-ways SPEC<->PLAN trace parser.

Built from the artefacts, not from the ARCH seat's tables: step ids are read out
of PLAN.md section 4 / 5 / 7 headings, requirement ids out of SPEC-v2.md section 1,
and the two trace tables (section 3 forward, section 3b backward) are parsed
separately and compared against those two independently-derived sets.
"""
import re, sys

ROOT = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/debate-tiers/slices/S02"
spec = open(f"{ROOT}/SPEC-v2.md").read().splitlines()
plan = open(f"{ROOT}/PLAN.md").read().splitlines()

def section(lines, start_re, end_re):
    out, on = [], False
    for i, l in enumerate(lines, 1):
        if re.match(start_re, l):
            on = True; continue
        if on and re.match(end_re, l):
            break
        if on:
            out.append((i, l))
    return out

# ---- requirements, from the SPEC's own bold "- **Rn.**" definitions -------
reqs = {}
for i, l in enumerate(spec, 1):
    m = re.match(r"\s*-\s+\*\*(R\d+)\.\*\*", l)
    if m:
        reqs[m.group(1)] = i
REQS = sorted(reqs, key=lambda r: int(r[1:]))

# ---- steps, from PLAN section 4's own "- **S02-...·" definitions ---------
steps = {}
for i, l in enumerate(plan, 1):
    m = re.match(r"\s*-\s+\*\*(S02-[A-Z0-9-]+?)\s*·", l)
    if m:
        steps[m.group(1)] = i
STEPS = list(steps)

def expand(cell):
    """Expand the trace tables' shorthand into concrete step ids."""
    found = set()
    # explicit ranges: S02-C1-S1...S02-C1-S7  /  S02-C1-S1...S8  /  S02-C2-S1...S10
    for a, b in re.findall(r"(S02-[A-Z0-9]+-S\d+|S02-M1|S02-V1)…(S02-[A-Z0-9-]*S?\d+|S\d+|M\d+|V\d+)", cell):
        pre = re.match(r"(S02-(?:[A-Z0-9]+-)?)([SMV])(\d+)", a)
        if not pre:
            continue
        stem, kind, lo = pre.group(1), pre.group(2), int(pre.group(3))
        hi = int(re.findall(r"(\d+)$", b)[0])
        for n in range(lo, hi + 1):
            found.add(f"{stem}{kind}{n}")
    # bare ids, and the "S02-C2-S1/S4/S5" slash form
    for m in re.finditer(r"S02-([A-Z0-9]+)-S(\d+)((?:/S?\d+)*)", cell):
        cl, first, rest = m.group(1), m.group(2), m.group(3)
        found.add(f"S02-{cl}-S{first}")
        for n in re.findall(r"\d+", rest or ""):
            found.add(f"S02-{cl}-S{n}")
    for m in re.finditer(r"S02-([MV])(\d+)", cell):
        found.add(f"S02-{m.group(1)}{m.group(2)}")
    return found

# ---- forward table: section 3 -------------------------------------------
fwd = {}
for i, l in section(plan, r"^## 3\. SPEC → PLAN trace", r"^## 3b\."):
    if not l.startswith("|") or l.startswith("|---") or "SPEC req" in l:
        continue
    cells = [c.strip() for c in l.strip("|").split("|")]
    m = re.match(r"\*?\*?(R\d+)", cells[0])
    if m:
        fwd[m.group(1)] = expand(cells[1])

# ---- backward table: section 3b -----------------------------------------
bwd = {}
for i, l in section(plan, r"^## 3b\. PLAN → SPEC trace", r"^Zero steps serve nothing"):
    if not l.startswith("|") or l.startswith("|---") or "Step" in l:
        continue
    cells = [c.strip() for c in l.strip("|").split("|")]
    for s in expand(cells[0]):
        bwd[s] = cells[1]

print(f"SPEC requirements defined  : {len(REQS)}  {REQS}")
print(f"PLAN steps defined (§4)    : {len(STEPS)}")
for cl in ("M", "C1", "C3", "C2", "C4"):
    got = sorted([s for s in STEPS if re.match(rf"S02-{cl}(-S|\d)", s)],
                 key=lambda s: int(re.findall(r"\d+$", s)[0]))
    print(f"   {cl:>2}: {len(got):>2}  {got}")
verif = [f"S02-V{n}" for n in range(1, 8)]
print(f"   V : {len(verif)}  {verif}  (§7)")

print("\n--- FORWARD: a requirement with no steps ---")
gaps = [r for r in REQS if r not in fwd or not fwd[r]]
print("  " + (", ".join(gaps) if gaps else "none — every R has at least one step"))

print("\n--- FORWARD: a step NAMED in §3 that §4 never defines ---")
named = set().union(*fwd.values()) if fwd else set()
ghost = sorted(named - set(STEPS) - set(verif))
print("  " + (", ".join(ghost) if ghost else "none"))

print("\n--- BACKWARD: a step DEFINED in §4 that §3b's table never covers ---")
missing_b = [s for s in STEPS if s not in bwd]
print("  " + (", ".join(missing_b) if missing_b else "none"))

print("\n--- BACKWARD: a step defined in §4 that NO forward row names either ---")
orphan = [s for s in STEPS if s not in named and s not in bwd]
print("  " + (", ".join(orphan) if orphan else "none"))

print("\n--- CROSS: steps outside BOTH tables (the PLAN claims zero at PLAN.md:164) ---")
outside = [s for s in STEPS if s not in named and s not in bwd]
outside += [s for s in STEPS if s not in bwd and s in named]
print("  " + (", ".join(sorted(set(outside))) if outside else "none"))

print("\n--- per requirement, the steps the forward table names ---")
for r in REQS:
    print(f"  {r:>3}: {sorted(fwd.get(r, []))}")
