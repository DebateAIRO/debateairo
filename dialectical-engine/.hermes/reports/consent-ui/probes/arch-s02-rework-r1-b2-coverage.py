# ARCH-S02-REWORK-R1 — B2 discharge check: is every stale reference covered by a correction row?
import re, pathlib
dec = pathlib.Path("/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/consent-ui/slices/S02/DECISIONS.md").read_text().splitlines()
STALE = [77, 82, 89, 99, 100, 101, 107, 109]          # the eight the verdict named
covered = {}
for i, ln in enumerate(dec, 1):
    m = re.match(r'^\s*\| `:(\d+)` \| ', ln)
    if m: covered[int(m.group(1))] = i
print("stale lines named by ARCH-REV-S02-r1 B2 :", STALE)
print("correction rows found, {stale line -> correction row line}:")
for k in sorted(covered): print(f"    :{k} -> DECISIONS:{covered[k]}")
missing = [s for s in STALE if s not in covered]
extra   = [k for k in covered if k not in STALE]
print("stale lines with NO correction row :", missing)
print("correction rows for lines B2 did not name:", extra)
print("the eight original lines are UNEDITED (append-only):",
      all(re.search(r'S02-S\d{2}', dec[s-1]) for s in STALE))
print("VERDICT:", "0 uncovered stale references" if not missing and not extra else "UNCOVERED REFERENCES REMAIN")
