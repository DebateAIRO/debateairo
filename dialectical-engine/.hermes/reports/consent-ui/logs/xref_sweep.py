#!/usr/bin/env python3
"""REQ-01 rework R1 — N1 class sweep.

Every `S0x-Rnn` / bare `Rnn` mention in both SPECs and both PLANs is resolved to the
requirement heading that defines it, and the heading's subject is printed beside the
referencing sentence so a reviewer checks the resolution mechanically instead of
re-deriving it.

Usage: xref_sweep.py <mission-root>
"""
import re
import sys
from pathlib import Path

ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else
            "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/consent-ui")

FILES = [
    ("S01", ROOT / "slices/S01/SPEC.md"),
    ("S01", ROOT / "slices/S01/PLAN.md"),
    ("S02", ROOT / "slices/S02/SPEC.md"),
    ("S02", ROOT / "slices/S02/PLAN.md"),
]

DEF_RE = re.compile(r"^\*\*(S0\d)-R(\d{2}) — (.*)$")
REF_RE = re.compile(r"\b(?:(S0\d)-)?R(\d{2})\b")

# Definitions: slice -> {num: (line, title, section)}
defs = {}
sections = {}
for slice_id in ("S01", "S02"):
    spec = ROOT / f"slices/{slice_id}/SPEC.md"
    d = {}
    sec = None
    secs = {}
    for i, line in enumerate(spec.read_text(encoding="utf-8").splitlines(), 1):
        if line.startswith("## "):
            sec = line[3:].strip()
        m = DEF_RE.match(line)
        if m and m.group(1) == slice_id:
            d[int(m.group(2))] = (i, m.group(3).rstrip("*").strip(), sec)
            secs[int(m.group(2))] = sec
    defs[slice_id] = d
    sections[slice_id] = secs

print("=" * 78)
print("REQUIREMENT DEFINITIONS")
for slice_id in ("S01", "S02"):
    nums = sorted(defs[slice_id])
    contiguous = nums == list(range(1, len(nums) + 1))
    page_order = [n for n in
                  sorted(defs[slice_id], key=lambda k: defs[slice_id][k][0])]
    outside = {n: s for n, s in sections[slice_id].items() if s != "Requirements"}
    print(f"  {slice_id}: {len(nums)} defs -> R{nums[0]:02d}..R{nums[-1]:02d}  "
          f"contiguous={contiguous}")
    print(f"      page order ascending = {page_order == nums}"
          + ("" if page_order == nums else f" -> {page_order}"))
    print(f"      definitions OUTSIDE '## Requirements': "
          f"{ {f'R{n:02d}': s for n, s in outside.items()} or 'none'}")

print("=" * 78)
print("CROSS-REFERENCE RESOLUTION (every Rnn mention, both SPECs + both PLANs)")
total = 0
unresolved = []
rows = []
for owner, path in FILES:
    text = path.read_text(encoding="utf-8").splitlines()
    in_trace = False
    for i, line in enumerate(text, 1):
        # skip the SPEC-trace table rows in PLAN.md: they are index rows, not prose claims
        if path.name == "PLAN.md":
            if line.startswith("## SPEC trace"):
                in_trace = True
                continue
            if in_trace and line.startswith("## "):
                in_trace = False
        for m in REF_RE.finditer(line):
            explicit, num = m.group(1), int(m.group(2))
            # a definition line is not a reference to itself
            dm = DEF_RE.match(line)
            if dm and int(dm.group(2)) == num and m.start() < 12:
                continue
            slice_id = explicit or owner
            total += 1
            target = defs.get(slice_id, {}).get(num)
            label = f"{slice_id}-R{num:02d}"
            if target is None:
                unresolved.append((path.name, owner, i, label, line.strip()[:90]))
                rows.append((f"{owner}/{path.name}:{i}", label, "*** NO SUCH REQUIREMENT ***",
                             line.strip()[:100]))
            else:
                rows.append((f"{owner}/{path.name}:{i}", label, target[1][:62],
                             line.strip()[:100]))

for loc, label, title, ctx in rows:
    print(f"  {loc:<24} {label:<10} -> {title}")
print(f"\n  TOTAL REFERENCES: {total}   UNRESOLVED: {len(unresolved)}")
for u in unresolved:
    print(f"    !! {u[0]}:{u[2]} {u[3]}  in: {u[4]}")

print("=" * 78)
print("TRACE COUNTS (SPEC defs vs PLAN trace rows)")
for slice_id in ("S01", "S02"):
    plan = (ROOT / f"slices/{slice_id}/PLAN.md").read_text(encoding="utf-8")
    trace = sorted(int(n) for n in
                   re.findall(rf"^\| {slice_id}-R(\d{{2}}) ", plan, re.M))
    spec_nums = sorted(defs[slice_id])
    print(f"  {slice_id}: SPEC defs {len(spec_nums)}  PLAN trace rows {len(trace)}  "
          f"equal={spec_nums == trace}   "
          f"in SPEC not PLAN={sorted(set(spec_nums)-set(trace))}   "
          f"in PLAN not SPEC={sorted(set(trace)-set(spec_nums))}")

print("=" * 78)
print("BANNED WORDS (improve, better, robust, handle, appropriate — whole word, ci)")
banned = re.compile(r"\b(improve[a-z]*|better|robust[a-z]*|handles?|handling|handled|appropriate[a-z]*)\b",
                    re.I)
for owner, path in FILES:
    hits = []
    for i, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        for m in banned.finditer(line):
            hits.append((i, m.group(0), line.strip()[:88]))
    print(f"  {owner}/{path.name}: {len(hits)} hit(s)")
    for i, w, ctx in hits:
        print(f"      :{i} [{w}] {ctx}")

# ---------------------------------------------------------------- N1 semantic guard v2
# A reference can resolve to a REAL requirement and still be the WRONG one (REQ-REV-01 N1:
# two sentences ABOUT the Settings re-entry pointed at R18, the focus-trap requirement).
# Mechanical guard: classify both the referencing sentence and the target requirement into a
# fixed TOPIC vocabulary for this mission. Flag only when BOTH carry a topic and the sets are
# disjoint — that is exactly the shape of the reported defect, with no noise from table cells
# or id enumerations.
print("=" * 78)
print("N1 SEMANTIC GUARD — topic of the referencing sentence vs topic of its target")
TOPICS = {
 "settings":  r"settings|re-entry|reentry|cookie preferences panel|privacy panel",
 "storage":   r"localstorage|debateai\.consent|stored decision|storage|decidedat|schema version",
 "token":     r"token|--z-|globals\.css|terracotta|chamber|colour literal|color literal",
 "focus":     r"focus trap|focus return|focus restore|initial focus|traps? focus",
 "esc":       r"\besc\b|escape|keydown",
 "copy":      r"verbatim|byte-exact|copy string|eyebrow|lede|label text",
 "mount":     r"layout\.tsx|appshell|mounts? once|every route|pre-paint",
 "geometry":  r"geometry|breakpoint|viewport width|max-height|border-radius|px viewport",
 "scroll":    r"scroll-to-end|scrolltop|scrollheight|scroll gate|reached the end",
 "submit":    r"client\.register|submit handler|formdata|create account|disabled unless",
 "checkbox":  r"checkbox|check square|adult-affirmed|privacy-accepted|tickbox",
}
def topics(s):
    s = s.lower()
    return {k for k, pat in TOPICS.items() if re.search(pat, s)}
flagged = 0
for owner, path in FILES:
    lines = path.read_text(encoding="utf-8").splitlines()
    # full requirement BODY, not just its heading, is the target's topic source
    for i, line in enumerate(lines, 1):
        for m in REF_RE.finditer(line):
            explicit, num = m.group(1), int(m.group(2))
            dm = DEF_RE.match(line)
            if dm and int(dm.group(2)) == num and m.start() < 12:
                continue
            sl = explicit or owner
            tgt = defs.get(sl, {}).get(num)
            if not tgt:
                continue
            spec_lines = (ROOT / f"slices/{sl}/SPEC.md").read_text(encoding="utf-8").splitlines()
            nxt = min([v[0] for v in defs[sl].values() if v[0] > tgt[0]] or [tgt[0] + 24])
            body = " ".join(spec_lines[tgt[0] - 1: nxt - 1])
            st, tt = topics(line), topics(body)
            if st and tt and not (st & tt):
                flagged += 1
                print(f"  FLAG {owner}/{path.name}:{i} -> {sl}-R{num:02d}")
                print(f"       sentence topic {sorted(st)}: {line.strip()[:100]}")
                print(f"       target   topic {sorted(tt)}: {tgt[1][:80]}")
print(f"\n  TOPIC MISMATCHES: {flagged}   (the N1 defect shape; 0 = swept clean)")
