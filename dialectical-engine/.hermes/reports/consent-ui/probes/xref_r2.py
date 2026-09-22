#!/usr/bin/env python3
"""REQ-REV-01 round 2 — my own cross-reference sweep over the v2 artifacts.

Independent of the author's script: I resolve every reference, then flag a pair
using LEXICAL OVERLAP between the referencing sentence and the target's own
heading text (not a hand-built topic vocabulary), which is a different heuristic
and therefore a real second opinion.
"""
import re, sys, os, collections

ROOT = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/consent-ui"
FILES = {
    ("S01", "SPEC"): f"{ROOT}/slices/S01/SPEC.md",
    ("S01", "PLAN"): f"{ROOT}/slices/S01/PLAN.md",
    ("S02", "SPEC"): f"{ROOT}/slices/S02/SPEC.md",
    ("S02", "PLAN"): f"{ROOT}/slices/S02/PLAN.md",
}
DEF_RE = re.compile(r"\*\*(S0[12])-R(\d\d)\s*—\s*(.*)")
REQ_SECTION = "## Requirements"

STOP = set("""a an and are as at be been but by can does do for from has have how if in into is it its
may must no not of on once one only or over per so than that the their them then there these they this
to under until up via was were what when where which while who will with within without your you it's
same both each every any all also both same new old two three four five s t don't""".split())


def words(s):
    s = re.sub(r"`[^`]*`", " ", s)                      # drop code spans
    s = re.sub(r"[^A-Za-z]+", " ", s).lower()
    return {w for w in s.split() if len(w) > 3 and w not in STOP}


defs = {}          # (slice, num) -> (lineno, heading_text, body_text)
order = collections.defaultdict(list)
outside = collections.defaultdict(list)
lines_of = {}

for (sl, kind), path in FILES.items():
    lines = open(path, encoding="utf-8").read().split("\n")
    lines_of[(sl, kind)] = lines
    if kind != "SPEC":
        continue
    in_req = False
    for i, ln in enumerate(lines, 1):
        if ln.startswith("## "):
            in_req = ln.strip().startswith(REQ_SECTION)
            cur_section = ln.strip()
        m = DEF_RE.match(ln.strip())
        if m and m.group(1) == sl:
            num = int(m.group(2))
            # body = until next definition or next '## '
            body = []
            for j in range(i, min(i + 40, len(lines))):
                nxt = lines[j]
                if nxt.startswith("## ") or (DEF_RE.match(nxt.strip()) and j > i):
                    break
                body.append(nxt)
            defs[(sl, num)] = (i, m.group(3), "\n".join(body))
            order[sl].append((i, num))
            if not in_req:
                outside[sl].append((num, cur_section))

print("=" * 78)
print("REQUIREMENT DEFINITIONS  (my own parse)")
for sl in ("S01", "S02"):
    nums = [n for _, n in order[sl]]
    print(f"  {sl}: {len(nums)} defs -> R{min(nums):02d}..R{max(nums):02d}  "
          f"contiguous={nums and sorted(nums) == list(range(1, max(nums) + 1))}")
    print(f"      page order ascending = {nums == sorted(nums)}   sequence={nums}")
    print(f"      definitions OUTSIDE '## Requirements': {outside[sl] if outside[sl] else 'none'}")

# ---------------- PLAN trace rows ----------------
print()
print("=" * 78)
print("TRACE COUNTS  (SPEC defs vs PLAN trace rows)")
for sl in ("S01", "S02"):
    plan = "\n".join(lines_of[(sl, "PLAN")])
    rows = set()
    for ln in lines_of[(sl, "PLAN")]:
        st = ln.strip()
        if st.startswith("|"):
            first = st.split("|")[1].strip().strip("*` ")
            m = re.fullmatch(rf"(?:{sl}-)?R(\d\d)", first)
            if m:
                rows.add(int(m.group(1)))
    spec = {n for (s, n) in defs if s == sl}
    print(f"  {sl}: SPEC defs {len(spec)}  PLAN trace rows {len(rows)}  equal={spec == rows}  "
          f"in SPEC not PLAN={sorted(spec - rows)}  in PLAN not SPEC={sorted(rows - spec)}")

# ---------------- reference resolution ----------------
print()
print("=" * 78)
print("CROSS-REFERENCE RESOLUTION + LEXICAL-OVERLAP FLAGS")
REF_RE = re.compile(r"\b(?:(S0[12])-)?R(\d\d)\b")
total = unresolved = 0
flags = []
for (sl, kind), lines in sorted(lines_of.items()):
    for i, ln in enumerate(lines, 1):
        # skip the supersession header block and the trace tables themselves
        for m in REF_RE.finditer(ln):
            tgt_slice = m.group(1) or sl
            num = int(m.group(2))
            total += 1
            key = (tgt_slice, num)
            if key not in defs:
                unresolved += 1
                print(f"  !! UNRESOLVED {sl}/{kind}.md:{i}  -> {tgt_slice}-R{num:02d}  :: {ln.strip()[:120]}")
                continue
            _, heading, body = defs[key]
            # benign shapes: a range (R01-R29), a trace-table row, an id enumeration
            around = ln[max(0, m.start() - 6):m.end() + 6]
            if re.search(r"R\d\d\s*[-–]\s*R?\d\d", around):
                continue
            if kind == "PLAN" and ln.strip().startswith("|"):
                continue
            src = words(ln)
            tw = words(heading) | words(body[:600])
            if src and tw and not (src & tw):
                flags.append((f"{sl}/{kind}.md:{i}", f"{tgt_slice}-R{num:02d}", heading[:70], ln.strip()[:150]))
print(f"\n  TOTAL REFERENCES: {total}   UNRESOLVED: {unresolved}")
print(f"  LEXICAL-OVERLAP FLAGS (zero shared content word with the target): {len(flags)}")
for f in flags:
    print(f"\n   FLAG {f[0]}  ->  {f[1]}  [{f[2]}]")
    print(f"        sentence: {f[3]}")

# ---------------- the two named N1 instances ----------------
print()
print("=" * 78)
print("N1's TWO NAMED INSTANCES, re-read in v2")
s01 = lines_of[("S01", "SPEC")]
for i, ln in enumerate(s01, 1):
    if "10b lede promises" in ln or "Settings re-entry (" in ln:
        print(f"  S01/SPEC.md:{i}| {ln.strip()}")
print(f"  R21 is defined at S01/SPEC.md:{defs[('S01',21)][0]} -> {defs[('S01',21)][1][:80]}")
print(f"  R18 is defined at S01/SPEC.md:{defs[('S01',18)][0]} -> {defs[('S01',18)][1][:80]}")

# ---------------- banned words ----------------
print()
print("=" * 78)
print("BANNED WORDS (improve, better, robust, handle, appropriate — whole word, case-insensitive)")
BAN = re.compile(r"\b(improve[a-z]*|better|robust[a-z]*|handl(?:e|es|ed|ing)|appropriate[a-z]*)\b", re.I)
for (sl, kind), lines in sorted(lines_of.items()):
    hits = [(i, ln.strip()[:130]) for i, ln in enumerate(lines, 1) if BAN.search(ln)]
    print(f"  {sl}/{kind}.md: {len(hits)} hit(s)")
    for i, t in hits:
        print(f"      :{i}  {t}")
