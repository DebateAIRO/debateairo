#!/bin/zsh
# spec-v2-check.sh — the detector for the ten REQ-REV-p1 findings SPEC-v2.md closes.
# Written by REQ-FIX-02 and handed forward: the next REQ-REV pass runs it instead of
# re-deriving the checks from prose.
#
#   usage: ./spec-v2-check.sh [<spec file>]      (default: SPEC-v2.md beside this script)
#
# Every check is a substring or absence assertion over the spec text plus three
# repository facts. It is designed to be run against a MUTANT of the spec that
# re-introduces a closed defect: a checker that has only ever passed is a decoration.
set -uo pipefail
HERE="${0:A:h}"
SPEC="${1:-$HERE/SPEC-v2.md}"
REPO="$HERE/../../../../.."          # docs/missions/<m>/slices/S01 -> repo root
INSTRUCTIONS="$HERE/../../INSTRUCTIONS.md"
FROZEN_REV="06e4eceb"                 # COMMON §6: the REQ READY freeze

python3 - "$SPEC" "$INSTRUCTIONS" <<'PY'
import sys, pathlib, re
spec = pathlib.Path(sys.argv[1]).read_text()
instr = pathlib.Path(sys.argv[2]).read_text()
lines = spec.splitlines()
fails = []

# Markdown hard-wraps prose, so a needle must not depend on where a line breaks.
# Every search runs against the whitespace-flattened text.
flat = re.sub(r"\s+", " ", spec)
def _f(n): return re.sub(r"\s+", " ", n)

def need(fid, label, *needles):
    missing = [n for n in needles if _f(n) not in flat]
    if missing:
        fails.append(f"{fid} {label}: MISSING {missing!r}")

def forbid(fid, label, *needles):
    present = [n for n in needles if _f(n) in flat]
    if present:
        fails.append(f"{fid} {label}: PRESENT but must not be {present!r}")

# --- shape: line 3 is the ui line, line 4 is the supersession line
if len(lines) < 4 or lines[2].strip() != "ui: no":
    fails.append(f"SHAPE line 3 must be 'ui: no', found {lines[2]!r}" if len(lines) > 2 else "SHAPE too short")
if len(lines) < 4 or not lines[3].startswith("SUPERSEDES "):
    fails.append("SHAPE line 4 must be the SUPERSEDES line")
for tag in ("REWORK", "B1", "B2", "B3", "N1", "N2", "N3", "N4", "N5", "N6", "N7"):
    if len(lines) > 3 and tag not in lines[3]:
        fails.append(f"SHAPE supersession line does not name {tag}")

# --- B1: R-9 scoped away from BLOCKED, and R-8 says so too
need("B1", "R-9 scoped to publishable",
     "publishable bound run", "This requirement says nothing about a run\nthat is not publishable")
need("B1", "R-8 disclaims R-9", "R-9 does not apply to it")
# the contradiction itself: the general clause may survive ONLY next to its scope
if "`PRIVATE` with nothing outstanding is a violation" in flat and "publishable bound run's** answer is served" not in flat:
    fails.append("B1 R-9 keeps the general clause without the publishable scope")
# --- B1 class sweep: R-5 and R-7
need("B1-sweep", "R-5 scoped", "has no publication and is not measured by this requirement")
need("B1-sweep", "R-7 scoped", "does not pull it into R-9")

# --- B2: the wire field is named, strict is acknowledged, no third state value
need("B2", "wire field named", "publish_pending", "`.strict()`", "no\n     third value is added")
need("B2", "absent-unless-outstanding", "absent\n     otherwise")
forbid("B2", "field left unnamed", "in a field a test names")

# --- B3: the request contracts are pinned
need("B3", "ask body", "all eleven keys", '"status":"QUEUED"', "run_ref", "202")
need("B3", "ack literals", "warning_acknowledged", "copies_may_persist_acknowledged")
need("B3", "grant action", "DELETE_PRIVATE_DEBATE")
forbid("B3", "erase grant name", '"erase" grant', "mint the erase")
need("B3", "token extraction", "step_up_grant.token")
need("B3", "step-up body", '"password"', '"code"', '"authorization"')

# --- N1: anonymous delete status named
need("N1", "401 SESSION_REQUIRED", "SESSION_REQUIRED", "`apps/api/src/index.ts:515`")

# --- N2: the corrected citation, and the drifted one gone
need("N2", "corrected cite", "apps/api/src/publications.ts:382-407", ":401-402")
forbid("N2", "drifted cite", "publications.ts:301-321")

# --- N3: CSRF pair and origin
need("N3", "csrf", "x-csrf-token", "CSRF_VALIDATION_FAILED", "origin: $WEB")

# --- N4: refused-unpublish audit row removed from the requirements
need("N4", "scope note", "is **removed here**")
need("N4", "failure half pinned", "append_audit_event_internal")

# --- N5: the served page paths
need("N5", "web paths", "$WEB/public/debate/", "$WEB/`")

# --- N6: poll timeout and full pagination
need("N6", "poll bound", "at most 15 minutes")
need("N6", "pagination", "offset=100")

# --- N7: the compass names V-5
if "V-1…V-5" not in instr:
    fails.append("N7 INSTRUCTIONS.md does not say V-1…V-5")
if "V-1…V-4" in instr:
    fails.append("N7 INSTRUCTIONS.md still says V-1…V-4")
if len(instr.splitlines()) > 100:
    fails.append(f"N7 INSTRUCTIONS.md is {len(instr.splitlines())} lines, cap is 100")

# --- banned words (the ban list line in INSTRUCTIONS is exempt; the spec has no exemption)
for w in ("improve", "better", "robust", "handle", "appropriate"):
    for m in re.finditer(w, spec, re.I):
        fails.append(f"BANNED word {w!r} at offset {m.start()}")

print("CHECKS: 24 assertions over", sys.argv[1])
if fails:
    print("RESULT: FAIL")
    for f in fails:
        print("  -", f)
    sys.exit(1)
print("RESULT: PASS")
PY
rc=$?

echo
echo "=== repo facts the spec pins ==="
echo -n "R-23 route table count (expect 52): "
awk 'NR>=100 && NR<=166' "$REPO/apps/api/src/index.ts" | grep -c '{ route: "'
echo -n "R-24 apps/ui files changed since base (expect 0): "
git -C "$REPO" diff --name-only 5b6cc9b1..HEAD -- apps/ui | wc -l | tr -d ' '
echo -n "SPEC.md byte-identical to the $FROZEN_REV freeze: "
if git -C "$REPO" show "$FROZEN_REV:./docs/missions/free-public-debates/slices/S01/SPEC.md" 2>/dev/null \
   | cmp -s - "$HERE/SPEC.md"; then echo "YES"; else echo "NO — the frozen version was modified"; rc=1; fi

exit $rc
