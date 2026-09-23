# PACKET — codex review S08 r4 (evidence re-emitted; rework 3/3 SPENT) · spine §4

## 1. Ticket-state block
Lane ticket /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/board/T12-T13-band-downgrade.md
(the worker has NO round left; anything blocking becomes a V DECISIONS PACKET row — say so).
Writable surface: EXACTLY
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/S08-codex-r4.md
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/S08-codex-self.md
(append `## r4`). No tests, builds, git changes, no live provider calls. Fresh session; your r3
verdict defines the scope, and its product findings are already closed there.

## 2. Immediate upstream artifacts
RULINGS FIRST: D42 (transcripts emitted by the tool), D43 (a mutant is credited to the assertion
that killed it, or it is loudness evidence), D44 (evidence has a LOCATION contract — a content
check proves nothing about where artifacts live or whether they outlive the lane), D41 —
mission DECISIONS.md.
THE WORK: NO PRODUCT CHANGE — same tip e60e0296, same tree 28126352, same diff as r3, mode changes
0. `git -C /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-s08 diff e040b1ee..HEAD`
Report (marker line 1; line 2 `report sha256:` verified 06f09403…):
/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/s08-band-downgrade.md
Orchestrator's checks: 21 transcripts in the mission directory, all 21 tool-shaped, stamp-check
22 records / 0 failures, and zero r4 transcripts left in the lane's gitignored logs.
Verify:
(1) B1 CLOSED? All 21 pairs re-run through tools/mutate.sh from the unchanged clean tip; the only
    seat-authored file is a driver that supplies a pair and a command and does not post-process;
    the index is GENERATED from the raw transcripts. 19 caught, 2 neighbour controls survive,
    21/21 as designed. Read at least four transcripts and the driver: does anything post-process
    or reconstruct?
(2) D43 attribution: each row names the assertion that failed, or says execution threw first, and
    mixed cases are broken out per test (m3 has two tests that threw and one assertion failure).
    Verify the index derives ASSERTION FAILED vs EXECUTION THREW mechanically rather than from
    prose.
(3) YOUR N1 CORRECTION, which the seat accepts fully: l1 and l2 are NOT caught by a pre-existing
    completion assertion — no assertion runs at all. l1 throws ANSWER_PERSIST_FAILED from the
    runner stage; l2 throws VERDICT_LABEL_BASIS_UNRESOLVED from deriveHonestVerdict; both
    propagate out of executeWorkItem before the first expect. The claim is narrowed to what they
    do prove: the two halves of the label boundary must agree, and disagreement stops the run
    rather than persisting a label-less answer. The pins remain l3 and l4. Confirm the narrowing
    is exactly right and that the correction is made in place, not only restated.
(4) THE TWO TOKEN FITS, tool untouched: five multi-line NEW tokens became single-line with
    identical semantics (the tool's gates were line-oriented), and f6's OLD was re-anchored
    because the substitution interpolates `$ @ \ /` even inside a quoted region. The seat audited
    every pair for those characters first. BOTH limits were real defects in the mission tool: it
    now counts substring occurrences in python and documents the character restriction. Confirm
    the refitted tokens preserve each mutant's meaning.
(5) LOCATION (D44): logs/s08/location-proof-r4.out is a raw pwd + ls -la showing the 21
    transcripts, the index, the pair directories, the driver and the stamp output all under the
    mission directory. Confirm, and say whether anything else this lane cites would die with the
    worktree.
(6) Packet review of this packet.

## 3. Handoff marker
First line: `CODEX REVIEW S08 r4 — APPROVE|CHANGES · comments read through: s08-r4-2026-09-02`

## 4. Stop conditions
- STATIC only; ~30 minutes; CANNOT-ASSESS over guesses. Self-report `## r4` BEFORE the marker.
  End with PREDICTIONS. Final message = `FILED: <path>` + VERDICT line + finding count.
