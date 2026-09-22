# PACKET — codex MERGE REVIEW T3C (merge + the J27 class gate) · spine §4

## 1. Ticket-state block
Lane ticket /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/board/T3C-panel-policy-entrypoint.md
(judged PASS WITH RECORDED RESIDUE at r3; this reviews the merge and the ruled additions, not a
rework round). Writable surface: EXACTLY
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/T3C-codex-merge.md
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/T3C-codex-self.md
(append `## merge`). No tests, builds, git changes, no live provider calls. Fresh session.

## 2. Immediate upstream artifacts
RULINGS FIRST: J27 (the stoppingPolicy fix STAYS in this lane and the class gate is REQUIRED —
D28's enumeration has been owed since the second instance and F37 was the third), J20, J21, J25,
D28, D31 (a clean merge can still falsify assertions), D27 ADDENDUM-3 (the corrected comparator;
the earlier forms were the orchestrator's and were broken) — mission DECISIONS.md. F37's ticket is
at board/F37-stopping-policy-entrypoint.md.
THE WORK: `git -C /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t3c diff 44836ecf..HEAD`
(tip d2acaea6, tree 4a4303a1, clean; four commits above the merge: 31c2a8ab the merge itself
which had ZERO conflicted paths, 5ee89ee9 the wiring, edec30ad the class gate, d2acaea6 one gate
correction a mutant forced).
Report (marker line 1; line 2 `report sha256:` verified):
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/t3c-panel-policy.md
Verify, priority order:
(1) F37 ITSELF: confirm independently that at 44836ecf main.ts passes judgementPolicy,
    runDeathPolicy and verdictLabelPolicy and NOT stoppingPolicy, and that dev-runner-policy.ts
    has no reference to it — i.e. merged code refused every multi-maker work item. Then confirm
    5ee89ee9 is a pure pass-through (reader owns schema, values and loud failure; nothing
    restated; provenance pin extended) that alters no landed semantics, and that T7's own 63
    tests pass at the merged tip.
(2) THE CLASS GATE (edec30ad + d2acaea6): it enumerates WalkingSkeletonSettings' optional members
    from the interface and requires each to be composed by main.ts or listed INTENTIONALLY_ABSENT
    with a reason — no third state; the allowlist is empty because all 14 are composed. Two design
    points to test rather than accept: the enumeration is DEPTH-1 (a first draft reported two
    fields of a nested return type as unwired, which would have put fiction in the allowlist on
    day one — two negative pins now cover that), and it is scoped to the settings literal handed
    to `new WalkingSkeletonRunner(...)`. Can you defeat the gate? Specifically: add an optional
    member the composition does not pass, rename the interface, nest a member, or compose a key
    outside that literal.
(3) THE SURVIVING MUTANT the seat reports and fixed: `indexOf("interface WalkingSkeletonSettings")`
    substring-matched a renamed interface, so the gate passed vacuously; anchoring on `\s*\{`
    killed M3 and M4. Verify the anchor and that M5 still dies on a missing member.
(4) The merge: zero conflicted paths, yet both behavioural arms went RED at the merge commit —
    D31's point. Confirm no assertion was weakened on either side; guard order J12 → T7 → T11
    unreordered; mark cardinality 33 with all three pins reading 33 and no fourth pin unswept.
(5) Revertibility, which the seat TESTED rather than claimed: `git revert --no-commit 5ee89ee9`
    is clean (4 files, +1/−34) even though two later commits touch the same test file, and it
    notes that reverting the wiring leaves the gate correctly failing on stoppingPolicy unless the
    reverter adds an allowlist entry. Check that claim.
(6) Gates at d2acaea6: contract 0 with zero drift; typecheck 0; T3C cluster ×3 14/14; t06 19,
    t10 15, t11 20, t07 63; D14/D16 four halves 0 errors; mode changes 0; zone count +1 exactly
    with an EMPTY set difference both ways; the r4 RSS singleton did not recur.
(7) Packet review of this packet.

## 3. Handoff marker
First line: `CODEX MERGE REVIEW T3C — APPROVE|CHANGES · comments read through: t3c-merge-2026-09-02`

## 4. Stop conditions
- STATIC only; ~30 minutes; CANNOT-ASSESS over guesses. Self-report `## merge` BEFORE the marker.
  End with PREDICTIONS. Final message = `FILED: <path>` + VERDICT line + finding count.
