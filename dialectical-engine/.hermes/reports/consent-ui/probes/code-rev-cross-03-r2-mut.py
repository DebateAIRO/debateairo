#!/usr/bin/env python3
"""CODE-REV-CROSS-03 r2 mutant harness.

Snapshot with cp, plant with an anchor asserted UNIQUE, prove the plant LANDED
(diff non-empty), run the command, restore with cp, prove the restore landed
(files byte-identical).  Never `git checkout` (TOOLING-TRAPS :2111, :1470).

Classification is BROKEN / CAUGHT / SURVIVED, never zero-vs-nonzero
(COMMON §10.17; TRAPS :1637, :1890, :2310):
  * no `Tests` summary line at all              -> BROKEN
  * nonzero exit + empty FAIL list + `Errors N` -> CAUGHT (TRAPS :1890)
  * nonzero exit                                -> CAUGHT
  * zero exit                                   -> SURVIVED

usage: mut.py <snapdir> <id> <target-file> <old> <new> <cmd...>
"""
import filecmp
import os
import re
import shutil
import subprocess
import sys

snapdir, mid, target, old, new = sys.argv[1:6]
cmd = sys.argv[6:]
if not cmd:
    sys.exit("no command given")

os.makedirs(snapdir, exist_ok=True)
snap = os.path.join(snapdir, os.path.basename(target) + ".pristine")
if not os.path.exists(snap):
    shutil.copyfile(target, snap)

src = open(target, encoding="utf-8").read()
n = src.count(old)
assert n == 1, f"anchor not unique ({n}): {old!r}"
open(target, "w", encoding="utf-8").write(src.replace(old, new, 1))

landed = not filecmp.cmp(snap, target, shallow=False)
assert landed, "PLANT DID NOT LAND (file byte-identical to snapshot)"

proc = subprocess.run(cmd, capture_output=True, text=True, cwd=os.environ.get("LANE"))
out = proc.stdout + proc.stderr

shutil.copyfile(snap, target)
restored = filecmp.cmp(snap, target, shallow=False)

summary = [l for l in out.splitlines() if re.match(r"^\s*Tests\s+", l)]
files = [l for l in out.splitlines() if re.match(r"^\s*Test Files\s+", l)]
errors = [l for l in out.splitlines() if re.match(r"^\s*Errors\s+\d+ error", l)]
fails = [l.strip() for l in out.splitlines() if re.match(r"^\s*FAIL\s", l)]

if not summary:
    verdict = "BROKEN"
elif proc.returncode != 0:
    verdict = "CAUGHT"
else:
    verdict = "SURVIVED"

print(f"{mid} | exit={proc.returncode} | {verdict} | plant-landed={landed} restore-ok={restored}")
for l in files + summary + errors:
    print("   " + l.strip())
for f in fails:
    print("   " + f)
