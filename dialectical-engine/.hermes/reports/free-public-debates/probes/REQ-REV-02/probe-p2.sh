#!/bin/zsh
# REQ-REV-02 probes. cwd = packet cwd (dialectical-engine).
# Never executes probes/REQ-REV-01/probe.sh (it tees into that directory's probe.out).
set -euo pipefail
ROOT="${0:A:h}"
OUT="$ROOT/probe-p2.out"
exec > >(tee "$OUT") 2>&1
cd /Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/all/dialectical-engine

echo "PROBE REQ-REV-02 $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "cwd $(pwd)"
echo "HEAD $(git rev-parse --short HEAD)"

echo
echo "=== S0 pass-1 original sha256 (must be unchanged) ==="
sha256sum .hermes/reports/free-public-debates/probes/REQ-REV-01/probe.sh \
          .hermes/reports/free-public-debates/probes/REQ-REV-01/probe.out \
          .hermes/reports/free-public-debates/probes/REQ-REV-02/probe-p1-copy.sh

echo
echo "=== S1 SPEC.md byte-identical to 06e4eceb (charge 1) ==="
git diff --stat 06e4eceb -- docs/missions/free-public-debates/slices/S01/SPEC.md | wc -l | awk '{print "diff-stat-lines", $1}'
git diff --stat 06e4eceb -- docs/missions/free-public-debates/slices/S01/SPEC.md

echo
echo "=== S2 freeze 03a59ae1..69d119c5 (seat under review) ==="
git diff --stat 03a59ae1..69d119c5 -- docs/missions/free-public-debates

echo
echo "=== S3 P9 detector (pass-1) on SPEC.md vs SPEC-v2.md ==="
python3 - <<'PY'
from pathlib import Path
import re
def flat(p):
    return re.sub(r"\s+", " ", Path(p).read_text())
def report(label, text):
    r9_general = "`PRIVATE` with nothing outstanding is a" in text and "violation of this requirement" in text
    r8_blocked = "outstanding auto-publish work for that run reaches 0 and stays 0" in text
    r9_scoped = "publishable bound run's** answer is served" in text or "publishable bound run's answer is served" in text
    r8_disclaim = "R-9 does not apply to it" in text
    closed = (not r9_general) or (r9_scoped and r8_disclaim)
    print(f"{label}: R-9-general={r9_general} R-8-blocked={r8_blocked} R-9-scoped-to-publishable={r9_scoped} R-8-disclaims-R-9={r8_disclaim} -> B1 closed={closed}")
report("SPEC.md", flat("docs/missions/free-public-debates/slices/S01/SPEC.md"))
report("SPEC-v2.md", flat("docs/missions/free-public-debates/slices/S01/SPEC-v2.md"))
PY

echo
echo "=== S4 P10 detector (ack / grant literals) ==="
for f in docs/missions/free-public-debates/slices/S01/SPEC.md docs/missions/free-public-debates/slices/S01/SPEC-v2.md; do
  echo "-- $f --"
  grep -nE 'warning_acknowledged|copies_may_persist_acknowledged|DELETE_PRIVATE_DEBATE|step_up_grant.token' "$f" || echo "NO_HITS"
done

echo
echo "=== S5 spec-v2-check.sh on SPEC-v2.md ==="
zsh docs/missions/free-public-debates/slices/S01/spec-v2-check.sh; echo "checker-rc $?"

echo
echo "=== S6 spec-v2-check.sh on frozen SPEC.md (must FAIL — detector sees the old defects) ==="
set +e
zsh docs/missions/free-public-debates/slices/S01/spec-v2-check.sh docs/missions/free-public-debates/slices/S01/SPEC.md
echo "checker-on-SPEC.md-rc $?"
set -e

echo
echo "=== S7 mutant: un-scope R-9 in a copy (B1 re-introduced) ==="
MUT="$ROOT/mutant-b1.md"
cp docs/missions/free-public-debates/slices/S01/SPEC-v2.md "$MUT"
python3 - "$MUT" <<'PY'
from pathlib import Path
import sys, re
p = Path(sys.argv[1])
t = p.read_text()
t2, n1 = re.subn(r"After a \*\*publishable bound run's\*\* answer is served",
                 "After a bound run's answer is served", t, count=1)
t2, n2 = re.subn(r"This requirement says nothing about a run\n  that is not publishable; R-8 governs those, and the two requirements are therefore satisfiable\n  together\. ",
                 "", t2, count=1)
print("n1", n1, "n2", n2)
if n1 == 0:
    raise SystemExit("mutant did not land")
p.write_text(t2)
print("mutant-b1 landed")
PY
set +e
zsh docs/missions/free-public-debates/slices/S01/spec-v2-check.sh "$MUT"
echo "checker-on-mutant-b1-rc $?"
set -e

echo
echo "=== S8 mutant: append a new requirement R-26 (checker should still PASS — gap) ==="
MUT2="$ROOT/mutant-r26.md"
cp docs/missions/free-public-debates/slices/S01/SPEC-v2.md "$MUT2"
printf '\n- **R-26** A new requirement the findings did not ask for.\n' >> "$MUT2"
set +e
zsh docs/missions/free-public-debates/slices/S01/spec-v2-check.sh "$MUT2"
echo "checker-on-mutant-r26-rc $?"
set -e

echo
echo "=== S9 R-id count and V-range lag ==="
python3 - <<'PY'
from pathlib import Path
import re
spec = Path("docs/missions/free-public-debates/slices/S01/SPEC-v2.md").read_text()
instr = Path("docs/missions/free-public-debates/INSTRUCTIONS.md").read_text()
ids = re.findall(r"\*\*R-(\d+)\*\*", spec)
print("R-ids", ids, "count", len(ids), "unique", sorted(set(int(x) for x in ids)))
print("INSTRUCTIONS V-1…V-5", "V-1…V-5" in instr)
print("INSTRUCTIONS V-1…V-6", "V-1…V-6" in instr)
print("SPEC-v2 authority V-1…V-5", "V-1…V-5" in spec)
print("SPEC-v2 mentions V-6", "V-6" in spec)
print("R-11 points at DECISIONS.md §3", "DECISIONS.md` §3" in spec or "DECISIONS.md §3" in spec)
print("R-21 residue points at DECISIONS.md §4", "DECISIONS.md` §4" in spec or "recorded as residue in `DECISIONS.md` §4" in spec)
print("INSTRUCTIONS wc", len(instr.splitlines()))
PY

echo
echo "=== S10 AskRequestSchema required key count ==="
python3 - <<'PY'
from pathlib import Path
import re
t = Path("packages/contract/src/index.ts").read_text()
m = re.search(r"export const AskRequestSchema = z\.object\(\{([\s\S]*?)\}\)\.strict\(\)", t)
body = m.group(1)
keys = re.findall(r"^\s{2}([A-Za-z_]+):", body, re.M)
print("AskRequestSchema keys", keys, "count", len(keys))
PY

echo
echo "=== S11 banned words in SPEC-v2 (ban list exempt N/A) ==="
grep -nio -E 'improve|better|robust|handle|appropriate' docs/missions/free-public-debates/slices/S01/SPEC-v2.md || echo "NO_HITS"

echo "DONE"
