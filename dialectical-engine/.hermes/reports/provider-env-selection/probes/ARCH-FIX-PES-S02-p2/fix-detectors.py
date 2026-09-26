#!/usr/bin/env python3
# ARCH-FIX-PES-S02-p2 — text detectors for B1, N1, N2 of ARCH-REV-S02-p1 (the findings arrived as prose).
# Usage: fix-detectors.py <PLAN.md>. Prints one line per check and a final ALL-PASS / FAILED:<ids>.
import re, sys
plan = open(sys.argv[1], encoding="utf-8").read()
probe = open(__file__.rsplit("/", 1)[0] + "/b1-lookup-shapes.ts", encoding="utf-8").read()
lines = plan.split("\n")
def block(text, head):
    out, on = [], []
    for ln in text.split("\n"):
        if ln.startswith(head): on = [ln]; continue
        if on:
            on.append(ln)
            if ln == "}": out.append("\n".join(on)); on = []
    return out
fails = []
def check(cid, ok, detail):
    print(f"{cid} {'PASS' if ok else 'FAIL'} {detail}")
    if not ok: fails.append(cid)
n = plan.count("deps.lookup(FAKE_VENDOR_HOST")
check("B1a", n == 0, f"calls of deps.lookup(FAKE_VENDOR_HOST…) outside resolveAll: {n} (want 0)")
row3 = [l for l in lines if l.startswith("| 3 |")]
check("B1b", len(row3) == 1 and "resolveAll(deps.lookup, FAKE_VENDOR_HOST)" in row3[0], "S02-S18 row 3 goes through resolveAll(deps.lookup, FAKE_VENDOR_HOST)")
pr, pp = block(probe, "function resolveAll("), block(plan, "function resolveAll(")
check("B1c", len(pp) == 1 and pr and pp[0] == pr[0], f"resolveAll blocks in PLAN: {len(pp)} (want 1), byte-equal to the probe run: {bool(pp) and bool(pr) and pp[0] == pr[0]}")
cr, cp = block(probe, "function callbackLookup("), block(plan, "function callbackLookup(")
check("B1d", len(cp) == 2 and all(c == cr[0] for c in cp), f"callbackLookup blocks in PLAN: {len(cp)} (want 2: S02-S13, S02-S17), each byte-equal to the probe run")
m = len(re.findall(r"a lookup (answering|calling back)", plan))
check("B1e", m == 0, f"lookups described in prose instead of callbackLookup(...): {m} (want 0)")
d = plan.count("`lookup` = the CALLBACK `lookup` of `import { lookup } from \"node:dns\";`")
check("B1f", d == 1, f"S02-S16 default names the callback node:dns import: {d} (want 1)")
g = plan.count("grep -cE 'node:dns/promises|promises\\.lookup|dns\\.promises'")
check("B1g", g == 1, f"S02-S18 dns.promises gate present: {g} (want 1)")
old = len(re.findall(r"9 / 3|9 passed / 3", plan)); new = plan.count("dev-api-environment **10 / 2**")
check("N1a", old == 0 and new == 1, f"9/3 checkpoint mentions: {old} (want 0); 10 / 2 in §3: {new} (want 1)")
b = plan.count("both fail their `endsWith`")
check("N1b", b == 0, f"S02-S03 'both fail their endsWith': {b} (want 0)")
bad = []
for i, l in enumerate(lines):
    if '{"' in l and not any(("EXACT" in x or "CONTAINS" in x) for x in lines[max(0, i - 3):i + 1]):
        bad.append(i + 1)
check("N2", not bad, f"lines holding {{\" with no EXACT/CONTAINS on it or the 3 lines above: {bad} (want [])")
print("ALL-PASS" if not fails else "FAILED:" + ",".join(fails))
