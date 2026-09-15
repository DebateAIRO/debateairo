# PACKET — codex review S07 r2 (your three r1 findings + J26's two follow-ups) · spine §4

## 1. Ticket-state block
Lane ticket /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/board/T09-synthesis.md
(rework 1/3; two rounds remain). Writable surface: EXACTLY
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/S07-codex-r2.md
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/S07-codex-self.md
(append `## r2`). No tests, builds, git changes, no live provider calls. Fresh session; your r1
verdict defines the scope.

## 2. Immediate upstream artifacts
RULINGS FIRST: J24, J25 (from your own r1 theme), J26 (new — answers the seat's three questions:
migration 0057 is uncontested; the at-claim refusal must NOT re-queue but MUST reach and ASSERT a
terminal persisted state; the borrowed record's meaningless zeros must become null or a distinct
event value), D24 + ADDENDA, D27 + ADDENDUM, D35 (an oracle written from the code's own reading is
not a second opinion) — mission DECISIONS.md.
THE WORK: `git -C /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-s07 diff e040b1ee..HEAD`
(tip 4fbbf2e3, 7 commits, clean, 0 mode changes; the r1 answers are `git diff 70149af0..3fc06e64` and J26's follow-ups are `git diff 3fc06e64..HEAD` — review the whole span as one round).
Report (marker line 1; line 2 `report sha256:` verified ad2e6d02…):
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/s07-synthesis.md
Logs under .../logs/s07/ (eight gate logs, each stamped GATE-STAMP commit/tree on line 1; the
orchestrator re-ran the stale comparison independently and found none off the filed tip).
Verify, priority order:
(1) B1: four discriminators, each EXECUTED — missing family; ref not configured pre-claim (work
    item stays READY, zero provider calls, no answer row); configured ref absent at claim
    (refuses against the claim-eligible set, `healthySecondary.calls()` is 0 so no substitution,
    durable `ledger.could_not_do` with state SYNTHESIS_ROLE_PROVIDER_ABSENT and
    call_site_key `SYNTHESIZER:<ref>` read back from the row); genuine post-claim death. Confirm
    the resolver no longer reads the stale configured set, and that the absent-at-claim path
    cannot substitute. J26(b) additionally requires the PERSISTED terminal work-item state to be
    asserted — check whether this round does it; if not, it is the round's one open item.
(2) B2: migration 0057 adds serve.synthesis_round; `persist` writes one ordered row per round
    inside the answer's transaction; `readSynthesisRounds` reads back. `referenceCandidate` is
    DELETED and the synthesizer returns {candidate, candidateRef}; the runner supplies
    rawArtifactRef per round. Assertions are on DATABASE ROWS: round 2's persisted priorObjection
    verbatim, priorCandidateRef equal to round 1's stored candidate_ref, and that ref not matching
    /^candidate:round-/. Verify the transaction boundary and that a failed answer write rolls the
    rounds back with it.
(3) B3: PROTECTED-CORE-GUARD-RETIRED minted with a paired record and asserted on the reloaded
    projection, the record AND `serve.answer.condition_marks` — confirm it is not projection-only,
    and that the mint follows the canonical mark discipline (mid-list, tail intact, count pins,
    one forced label line per UI switch).
(4) J26(c): RunLifecycleEventValue is now a union of the cooldown value and a distinct
    RunSynthesisRoleRefusalValue, rather than widening the cooldown's real measurements to
    nullable; the refusal states state, call_site_key, role_ref, role, absent_failure_code and the
    test uses toEqual so an invented field fails. Verify the union has no other reference that
    now accepts the wrong member, and that nothing else in the lane states a quantity it did not
    measure.
(5) Evidence: cluster ×3 63/63; zone 13 failed/1347 set-equal to base; integration 1 failed/80 with
    the failure byte-identical to base; typecheck 0; seven mutants R2M1-R2M6 red and R2N1 green with
    the D24 gates plus four more (R3M1-R3M3 red, R3N1 green) at the r3 tip — eleven across both
    campaigns; the seat's re-check of pro01-runner-tree because its new database write could have
    changed that signature; and its disclosure that the r3 campaign ABORTED on a dirty tree
    (D24 ADDENDUM-2 working) caused by a stray empty node_modules from a misfired command.
    Also assess the seat's own catch: a `-t "at claim"` filter matched a pre-existing test and
    never ran the new arm, so a green looked like a disproof — is any other filtered run in this
    lane exposed to that?
(6) Under D35: does any assertion in this lane rest on an oracle written from the same reading as
    the code it checks? The lane's own ledger-row assertions are the good pattern; name any that
    are not. (7) Packet review of this packet.

## 3. Handoff marker
First line: `CODEX REVIEW S07 r2 — APPROVE|CHANGES · comments read through: s07-r2-2026-09-02`

## 4. Stop conditions
- STATIC only; ~40 minutes; CANNOT-ASSESS over guesses. Self-report `## r2` BEFORE the marker.
  End with PREDICTIONS. Final message = `FILED: <path>` + VERDICT line + finding count.
