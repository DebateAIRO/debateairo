#!/usr/bin/env python3
"""REQ-REV-01 probes 6 + 1: trace counts, R-id contiguity, banned words,
and every internal cross-reference resolved against what that R-id actually says."""
import re
import sys

M = "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/consent-ui/"
BANNED = ["improve", "better", "robust", "handle", "appropriate"]

for slice_ in ("S01", "S02"):
    spec_p = M + "slices/%s/SPEC.md" % slice_
    plan_p = M + "slices/%s/PLAN.md" % slice_
    spec = open(spec_p, encoding="utf-8").read()
    plan = open(plan_p, encoding="utf-8").read()
    spec_lines = spec.splitlines()
    plan_lines = plan.splitlines()

    print("=" * 72)
    print(slice_)
    print("=" * 72)

    # --- requirement DEFINITIONS: a bold heading "**Sxx-Rnn — ..."
    defs = {}
    for n, line in enumerate(spec_lines, 1):
        m = re.match(r"\*\*%s-R(\d\d) — (.*)" % slice_, line)
        if m:
            defs[int(m.group(1))] = (n, m.group(2)[:70])
    ids = sorted(defs)
    print("SPEC requirement DEFINITIONS: %d  -> %s" % (len(ids), ids))
    gaps = [i for i in range(1, max(ids) + 1) if i not in defs]
    print("  contiguous 1..%d ? %s   gaps=%s" % (max(ids), not gaps, gaps))
    # order on the page
    order = [i for i, _ in sorted(((i, defs[i][0]) for i in ids), key=lambda t: t[1])]
    print("  page order ascending ? %s" % (order == ids))
    if order != ids:
        print("    page order: %s" % order)
    # which section each definition sits under
    sec = None
    secmap = {}
    for n, line in enumerate(spec_lines, 1):
        if line.startswith("## ") or line.startswith("### "):
            sec = line.strip()
        m = re.match(r"\*\*%s-R(\d\d) — " % slice_, line)
        if m:
            secmap[int(m.group(1))] = sec
    outside = {i: s for i, s in secmap.items() if s and not (
        s.startswith("### ") or s == "## Requirements")}
    print("  definitions OUTSIDE the '## Requirements' section: %s" % (outside or "none"))

    # --- PLAN trace rows
    rows = {}
    for n, line in enumerate(plan_lines, 1):
        m = re.match(r"\|\s*%s-R(\d\d)\s*\|" % slice_, line)
        if m:
            rows[int(m.group(1))] = n
    print("PLAN trace ROWS: %d -> %s" % (len(rows), sorted(rows)))
    print("  rows == defs ? %s" % (sorted(rows) == ids))
    print("  in SPEC not in PLAN: %s" % sorted(set(ids) - set(rows)))
    print("  in PLAN not in SPEC: %s" % sorted(set(rows) - set(ids)))

    # --- banned words, whole-word, case-insensitive
    print("BANNED WORDS:")
    for w in BANNED:
        hits = [(n, l.strip()[:150]) for n, l in enumerate(spec_lines, 1)
                if re.search(r"\b%s\b" % w, l, re.I)]
        ph = [(n, l.strip()[:150]) for n, l in enumerate(plan_lines, 1)
              if re.search(r"\b%s\b" % w, l, re.I)]
        if hits or ph:
            print("  %-12s SPEC %d hit(s), PLAN %d hit(s)" % (w, len(hits), len(ph)))
            for n, l in hits:
                print("     SPEC.md:%d  %s" % (n, l))
            for n, l in ph:
                print("     PLAN.md:%d  %s" % (n, l))
        else:
            print("  %-12s clean" % w)

    # --- internal cross references "(R21)" / "R18" / "S01-R20" inside the SPEC
    print("INTERNAL CROSS-REFERENCES (resolved against the definition text):")
    seen = set()
    for n, line in enumerate(spec_lines, 1):
        if re.match(r"\*\*%s-R\d\d — " % slice_, line):
            continue  # the definition itself
        for m in re.finditer(r"\b(?:%s-)?R(\d\d)\b" % slice_, line):
            i = int(m.group(1))
            key = (n, i)
            if key in seen:
                continue
            seen.add(key)
            tgt = defs.get(i)
            print("  SPEC.md:%-4d refs R%02d -> %s" % (
                n, i, tgt[1] if tgt else "*** NO SUCH REQUIREMENT ***"))
            print("        ctx: %s" % line.strip()[:150])
    print()
