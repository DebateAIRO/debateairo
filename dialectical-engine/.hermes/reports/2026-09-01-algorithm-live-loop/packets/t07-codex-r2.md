# PACKET — codex review T7 r2 (answers your r1: B1, B2, N1) · four elements per spine §4

## 1. Ticket-state block
Lane ticket /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/board/T07-adaptive-stopping.md
(rework_round 2, status waiting_review). Writable surface: EXACTLY
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/T7-codex-r2.md
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/T7-codex-self.md
(append `## r2`). No tests, builds, git changes, no live provider calls.

## 2. Immediate upstream artifacts
RULINGS FIRST (they narrow your r1 "required correction" — read before the report):
- J15 ADDENDUM-2 in /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/DECISIONS.md
  (section "J15 ADDENDUM-2 — freeze marks must be TRUE"): B2's required correction is the
  mark's TRUTH (no freeze mark for a branch already fully expanded, or a distinct truthful
  record); the round-major replan is V-T7-r2-1, not this lane. B1's correction: every
  expected maker root compared in both rounds; a caller may never pre-filter a root out.
- D22 (same file): the r1/r2 seat was killed by a rate limit; the orchestrator's wip
  checkpoint c248f7f sits in the lane history; a FRESH seat authored r3 on top of it.
THEN the work:
- Diff: `git -C /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t7 diff 7433be7..HEAD`
  (tip 754090a; this round alone = `git diff c248f7f..HEAD`, 4 files +466/−24, of which
  TOOLING-TRAPS.md +16 docs-only). Count the commits from base yourself (the seat says ten).
- The report — marker line 1, line 2 `report sha256:` computed as
  `sed '2d' t07-stopping.md | shasum -a 256` (D21 scheme; NOT r2's `tail -n +3`),
  verified 59ef6101… (the seat re-filed once after the orchestrator's first read; final); r3 section begins at the heading `# T7 STOPPING r3` (line 316):
  /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t07-stopping.md
  + self-report `## r3` in t07-stopping-self.md beside it.
- Logs: /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/t07/
  (r3b-RED-B1-invariant-B2-general.log, r3b-GREEN-…, r3b-FINAL.log, r3b-mut-*.log,
  r3b-zone-r{1,2,3}.log, r3b-intg-r{1,2,3}.log, r3b-audit-*.log, D16 pairs).
Verify, priority order:
(1) B1 as CLOSED BY CONSTRUCTION: `selectAuthoritativeRootScope(effectiveMakerCount,
    authoredRootNodeIdByMakerIndex)` is never told standing; `expectedRootCount` is a
    REQUIRED field of the decision input; the strict `decideRoundContinuation` gates ONLY
    the convergence arm (`moved.length === 0 && compared.length !== expectedRootCount` →
    CONTINUE / ROOT_SCOPE_INCOMPLETE); floor and ceiling untouched; the loud
    STOPPING_ROOT_STRENGTH_UNRESOLVED guard still reachable. Then RULE the substitution:
    your r1 asked for a partial-standing M=2 fixture at the live caller; the seat proved
    mutant MB1a (your exact bug, at your exact seam) SURVIVES every unit test — no
    fixture in the repo gives a root without standing — and pinned it with a
    semantic invariant + a STRUCTURAL source-reading pin (labelled as such), pricing the
    true integration fixture at 45–90 min as F-T7-11. Is closure-by-construction +
    labelled structural pin sufficient for this lane, or is the fixture required within
    rework 3/3? Say which, with the risk you are accepting or refusing.
(2) The record is TRUE: `comparedRootNodeIds` empty on ROUND_1_FLOOR / NO_PREVIOUS_ROUND
    (the checkpoint's false field CORRECTED — verify the three-state walk at(0)/at(1)/at(2)).
(3) B2: no-mark arm (J15 ADDENDUM-2 arm one; no mint — confirm CONDITION_MARKS shows only
    r2's BRANCH-FROZEN-LOW-LEVERAGE and the tail is untouched); your M=2/d=2 enumeration
    asserted verbatim (carrying [2,3,8,9] → preventable [8,9]); the three generality
    properties over (2,2),(3,2),(2,3),(4,3): empty authored subtree at the boundary ⇔
    markable; final boundary marks nothing; markable set = LAST maker's carrying branches.
    The seat DISCLOSED three of its four B2 tests were green at inherit (characterisation,
    red only under MB2a) — is the RED-before-GREEN law satisfied by MB2b + the prior seat's
    r3-RED log it explicitly does not claim?
(4) N1 withdrawn: is the corrected three-state sequence (ROUND_1_FLOOR → NO_PREVIOUS_ROUND
    → GLOBAL_DELTA_CONVERGED on identical graphs) itself lawful under J15(c)?
(5) Mutants MB1b/c/d, MB2a/b CAUGHT; MN1 survived correctly (boundary leg's parent is a
    maker root); MN2 survived → treated as a GAP and pinned (87eaf8b) — verify the pins
    exercise the three guards. Transcripts: token, run, restore, porcelain, sha both sides.
(6) Suites: root tsc 0; D16 pairs 1 pre-existing each, 0 new; zone ×3 216/216;
    integration ×3 set-equal to the STORED base row (the seat did NOT re-measure base —
    disclosed; D15 re-measures on integration); audits byte-identical to stored base.
(7) F-T7-10 (a permanently uncomparable root can never δ-stop → expands to the ceiling):
    is the analysis true, and does it interact with J15 ADDENDUM's partial savings in a
    way the judge must weigh beyond what the seat states?
(8) One-way-door clause: no persisted field, no DDL, no mint — confirm `RoundContinuationReason`
    is in-memory only. (9) Packet review: THIS packet and the resume packet
    /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/packets/t07-rework-r2-resume.md
    (the seat reports its hash-recipe discrepancy and its ruling-after-verdict ordering).

## 3. Handoff marker
First line: `CODEX REVIEW T7 r2 — APPROVE|CHANGES · comments read through: t07-r2-2026-09-01`

## 4. Stop conditions
- STATIC only; verbatim re-runs of recorded output only; CANNOT-ASSESS over guesses.
- ~40 minutes; codex round r2; the worker has ONE rework round left (3/3).
- Self-report `## r2` BEFORE the marker. End with PREDICTIONS.
- Final message = `FILED: <path>` + VERDICT line + finding count.
