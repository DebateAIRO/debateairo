#!/usr/bin/env python3
"""D15 set-equality classifier (D60) — standalone so a filed log can be re-classified without re-running.

Usage: d15-classify.py <mission-dir> <suite-log> <classification-out>
Exit 0 = classified. Exit 2 = PARSE MISMATCH, refused (summary count != parsed names).

Key = the FULL normalised name. The v1 key truncated at 120 chars, which collapsed two t16
sealed-version names that differ only after char 120 (b12: summary 48, parsed 47, refused).
A key that can merge two distinct failures can also hide a NEW one behind a known one.
Suite-level FAIL lines (`FAIL  path [ path ]`) are counted separately, never as tests.
"""
import re, sys, pathlib
M, OUT, CL = sys.argv[1:4]

def key(s):
    s = s.replace("`", "").strip()
    s = re.sub(r"\s+\d+(?:\.\d+)?(?:ms|s)$", "", s)
    return re.sub(r"\s+", " ", s)

# AUTHORITY SCOPE (D60): t00-baseline.md RETAINS the pre-provisioning r1 record under D9 as a
# later h1 section. Only the POST-PROVISIONING section is the baseline of record. Parse from
# that heading to the next h1; reading the whole file re-admits five render tests that
# provisioning fixed and double-counts nine names that appear in both sections.
lines = open(f"{M}/agent-reports/t00-baseline.md").read().splitlines()
start = next(i for i, l in enumerate(lines) if l.startswith("## PRE-EXISTING FAILURES (POST-PROVISIONING)"))
end = next((i for i in range(start + 1, len(lines)) if lines[i].startswith("# ")), len(lines))
stable, unstable = set(), set()
for l in lines[start:end]:
    m = re.match(r"\|\s*X\s*\|\s*X\s*\|\s*X\s*\|\s*(.+?)\s*\|", l)
    if m: stable.add(key(m.group(1))); continue
    m = re.match(r"\|\s*[X·]\s*\|\s*[X·]\s*\|\s*[X·]\s*\|\s*(.+?)\s*\|", l)
    if m: unstable.add(key(m.group(1)))
# D60 ADDENDUM 2: names closed since T0 (agent-reports/t00-closed.md) are subtracted from stable-red,
# so a diagnosed fix stops reporting as VANISHED. Only rows with a fix commit and a ticket count.
# A closed name is subtracted ONLY when the measured tree CONTAINS its fix commit — a batch taken
# before the fix must still see the name as stable-red, or historical logs re-classify wrongly.
import subprocess
INT = "/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/integration"
head = open(OUT, errors="replace").read(4000)
mt = re.search(r"tip ([0-9a-f]{7,40})", head) or re.search(r"commit=([0-9a-f]{7,40})", head)
measured_tip = mt.group(1) if mt else None
closed = set()
cp = pathlib.Path(f"{M}/agent-reports/t00-closed.md")
if cp.exists() and measured_tip:
    for l in cp.read_text().splitlines():
        m = re.match(r"\|\s*(`?[^|]+?)\s*\|\s*([0-9a-f]{7,40})", l)
        if m and " > " in m.group(1):
            fix = m.group(2)
            contains = subprocess.run(["git", "-C", INT, "merge-base", "--is-ancestor", fix, measured_tip],
                                      capture_output=True).returncode == 0
            if contains: closed.add(key(m.group(1)))
stable -= closed
if not stable:
    print("AUTHORITY EMPTY — refusing: the POST-PROVISIONING section parsed to zero stable-red rows"); sys.exit(3)

fails, suites, summary = set(), set(), None
for l in open(OUT, errors="replace").read().splitlines():
    r = l.rstrip()
    m = re.match(r"\s*FAIL\s+(\S+)\s+\[\s*\1\s*\]\s*$", r)
    if m: suites.add(m.group(1)); continue
    m = re.match(r"\s*(?:FAIL|×)\s+(.+)$", r)
    if m and ".test." in m.group(1) and " > " in m.group(1): fails.add(key(m.group(1)))
    m2 = re.search(r"^\s*Tests\s+(\d+)\s+failed", r)
    if m2: summary = int(m2.group(1))

if summary is not None and len(fails) != summary:
    open(CL, "w").write(
        f"PARSE MISMATCH — refusing to classify.\nsummary says {summary} failed; parsed {len(fails)} names.\n"
        f"failed suites (not tests): {len(suites)}\n"
        "vitest's FAIL/x lines are not always emitted in captured output (F-S09-6): fix the parser before trusting any set-equality verdict.\n")
    print(f"PARSE MISMATCH: summary {summary} vs parsed {len(fails)} — refused"); sys.exit(2)

new = sorted(fails - stable - unstable); gone = sorted(stable - fails)
still = sorted(fails & stable); unst = sorted(fails & unstable)
with open(CL, "w") as f:
    f.write(f"authority: {len(stable)} stable-red + {len(unstable)} unstable (closed since T0 and subtracted: {len(closed)})\nfailing names: {len(fails)}\n"
            f"failed suites (could not load, tests NOT counted): {len(suites)}\n" + "".join(f"  {s}\n" for s in sorted(suites)) +
            f"\nNEW ({len(new)}):\n" + "\n".join(new) +
            f"\n\nVANISHED from stable-red ({len(gone)}):\n" + "\n".join(gone) +
            f"\n\nstable-red still failing: {len(still)}\nunstable-family failing: {len(unst)}\n" + "\n".join(unst) + "\n")
print(f"classified: {len(fails)} failing · NEW {len(new)} · VANISHED {len(gone)} · suites-failed {len(suites)}")
