#!/bin/zsh
# spec-v3-check.sh — the detector for SPEC-v3.md. Supersedes spec-v2-check.sh, which
# stays beside it and still describes SPEC-v2. Written by REQ-FIX-03 and handed forward:
# the next review pass runs it instead of re-deriving the checks from prose.
#
#   usage: ./spec-v3-check.sh [<spec file>]      (default: SPEC-v3.md beside this script)
#
# It carries every pass-2 assertion forward, adds the three findings this version closes
# (P-B2 / S-N7 / C-B1's oracle) and adds the assertion the pass-2 reviewer found missing
# (DECISIONS §10, N3-p2): the requirement set is exactly R-1…R-25, so a mutant that
# introduces an R-26 must FAIL.
#
# Every check is a substring or absence assertion over the whitespace-flattened spec text
# plus four repository facts. It is designed to be run against a MUTANT of the spec that
# re-introduces a closed defect: a checker that has only ever passed is a decoration.
set -uo pipefail
HERE="${0:A:h}"
SPEC="${1:-$HERE/SPEC-v3.md}"
REPO="$HERE/../../../../.."          # docs/missions/<m>/slices/S01 -> repo root
INSTRUCTIONS="$HERE/../../INSTRUCTIONS.md"
FROZEN_REV="06e4eceb"                 # COMMON §6: the REQ READY freeze (SPEC.md)
FROZEN_V2_REV="69d119c5"              # COMMON §6: the REQ-FIX p2 READY freeze (SPEC-v2.md)

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
for tag in ("REWORK", "P-B2", "S-N7", "C-B1", "V-10", "N1-p2", "N2-p2", "R-1…R-25"):
    if len(lines) > 3 and tag not in lines[3]:
        fails.append(f"SHAPE supersession line does not name {tag}")
if len(lines) > 0 and not lines[0].startswith("# SPEC-v3 "):
    fails.append(f"SHAPE line 1 must title this as SPEC-v3, found {lines[0][:40]!r}")

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
if "V-1…V-10" not in instr:
    fails.append("N7/N1-p2 INSTRUCTIONS.md does not say V-1…V-10")
for stale in ("V-1…V-4", "V-1…V-5", "V-1…V-6"):
    if stale in instr:
        fails.append(f"N1-p2 INSTRUCTIONS.md still says {stale}")
if len(instr.splitlines()) > 100:
    fails.append(f"N7 INSTRUCTIONS.md is {len(instr.splitlines())} lines, cap is 100")

# =====================================================================
# pass 3 — the three findings of the REV(S01) p1 union assigned to REQ-FIX
# =====================================================================

# --- P-B2 (row V-10): the served answer is not one named route
need("P-B2", "answer-serving route defined", "An **answer-serving route** is a route that returns the *whole* answer")
need("P-B2", "mechanical test", "a route is answer-serving exactly when a success reply of that route sends a body parsed by `AnswerSchema`")
need("P-B2", "any route triggers", "The **served answer** is the state in which **any** answer-serving route first returns 200")
# Both routes must appear as TABLE ROWS with their send sites. Asserting the bare path is a
# decoration: "GET /v1/answers/{id}" is a prefix of ".../inspection", so the row can be deleted
# and a naive substring search still passes (mutant PB2-second-route-dropped).
need("P-B2", "route table row 1", "| `GET /v1/runs/{id}/answer` | `apps/api/src/index.ts:163` | `:1115` |")
need("P-B2", "route table row 2", "| `GET /v1/answers/{id}` | `apps/api/src/index.ts:154` | `:1007` |")
need("P-B2", "projections excluded", "AnswerIndexSchema", "InspectionSchema", "NodeSchema")
need("P-B2", "future route obligation", "A route added later is bound by the same test")
need("P-B2", "V-10 cited", "V-10")
forbid("P-B2", "old one-route definition",
       "The **served answer** is the state in which `GET /v1/runs/{id}/answer` first returns 200")
# R-4 and R-9's Check must not pin the trigger/observation to one route. The antecedent is
# R-4's own Check text: if R-4 is present at all, it must carry the per-route sweep.
if "*Check:*" in flat and "**R-4**" in flat and "once per answer-serving route" not in flat:
    fails.append("P-B2 sweep: R-4's Check does not run once per answer-serving route")
if "`GET /v1/runs/{id}/answer` still returns 200 for the owner" in flat:
    fails.append("P-B2 sweep: R-9's Check is still pinned to one named route")
# Acceptance must exercise the SECOND route and then clean up after itself. Assert the step
# BODIES: "11b." alone also matches the cross-reference "…Keep <free_run2> for step 11b."
need("P-B2", "acceptance 3b", "3b. Start a **second** Free debate")
need("P-B2", "acceptance 3c", "3c. `GET $API/v1/answers/<free_answer2>` as the owner")
need("P-B2", "acceptance cleans up", "11b. Delete `<free_run2>`")

# --- S-N7: R-6's Check is not a property of user-authored text
need("S-N7", "user text disclaimed", "*What this requirement does NOT govern:* the words the owner wrote")
need("S-N7", "email case named", "is not a violation of R-6 — on either path")
forbid("S-N7", "old text-scan check",
       "the decrypted snapshot contains no user id, owner ref, session id or email\n  address anywhere in it")
need("S-N7", "parity assertion", "**Parity.**", "field-for-field equal to the snapshot the **owner-driven** path writes")

# --- C-B1 (oracle half): R-6's Check is assertable on the system path
need("C-B1", "system path named", "against the **decrypted snapshot** a **system** publish wrote")
need("C-B1", "not the parameters", "never against the parameters handed to the transition function")
need("C-B1", "the parameter trap cited", "migrations/0067_system_run_publication.sql:336")
need("C-B1", "ownerRef mutant killed", "is **not equal to** any of that run's `run_id`, the owner's `user_id`, `owner_ref`")
need("C-B1", "a test must go RED", "turns **RED** under the B1 mutant")

# --- N3-p2: the assertion the pass-2 reviewer found missing — exactly R-1…R-25
ids = sorted({int(m) for m in re.findall(r"\*\*R-(\d+)", spec)})
if ids != list(range(1, 26)):
    fails.append(f"N3-p2 requirement set is not exactly R-1…R-25: found {len(ids)} ids {ids[:3]}…{ids[-3:]}")

# --- banned words (the ban list line in INSTRUCTIONS is exempt; the spec has no exemption)
for w in ("improve", "better", "robust", "handle", "appropriate"):
    for m in re.finditer(w, spec, re.I):
        fails.append(f"BANNED word {w!r} at offset {m.start()}")

print("CHECKS: 45 assertions over", sys.argv[1])
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
echo -n "SPEC-v2.md byte-identical to the $FROZEN_V2_REV freeze: "
if git -C "$REPO" show "$FROZEN_V2_REV:./docs/missions/free-public-debates/slices/S01/SPEC-v2.md" 2>/dev/null \
   | cmp -s - "$HERE/SPEC-v2.md"; then echo "YES"; else echo "NO — the frozen version was modified"; rc=1; fi
echo -n "answer-serving routes in the API (AnswerSchema.parse send sites; SPEC §1 expects 2): "
grep -c 'AnswerSchema.parse(' "$REPO/apps/api/src/index.ts"

exit $rc
