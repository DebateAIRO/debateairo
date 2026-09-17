# [claude@opus-5] F-T17T9-3 · T17's cost-envelope tightness claim went false the day T9 landed — V should see this

```yaml
state:
  ticket: F-T17T9-3
  risk_tier: medium         # CORRECTED 2026-09-05 by codex t17t9 r1: the seat's double never exercised the maximum path; true max 106 vs sealed 109 (~3% conservative). The stale part is the 7-vs-2 site assertion and the row's description of retired organs, not the ceiling's tightness
  status: done # MERGED INTO DEV by the orchestrator under D70 (10:19 2026-09-07): lane/t17t9-3 85a05425 → dev c56208c9 (tree cebc08b0 == dry-run); already on integration at c6f967da. The b14 attribution stays UNRESOLVED on the record (V's exception); F-REG-DEADLINE-MARGIN open. Not pushed
  owner: { agent: claude, session: agent-ac80208b995d96000 }
  contract: { allowed: [], readonly: [], forbidden: all_others, verification: [codex static review, judge verdict], human_review: yes }
  worktree: { path: /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-t17t9-3, branch: lane/t17t9-3, merge_status: transferred-to-integration-c6f967da; merged-into-dev-c56208c9, base: 2af816f1, tip: 85a05425 (evidence), fix at 40217895 }
  authority_epoch: 1
  rework_round: 3
  wakes_since_transition: 0
  waiting_since: n/a
  escalation_target: v_packet
  self_unblock_enabled: false
  comments_read_through: t17t9-r1-2026-09-05
```

Found by lane/t17t9, invisible until now because the claim-time gate killed every acceptance run
~100 lines before this assertion. T17's envelope test expects the serve leg to be **7** call sites
and measures **2** (`COMPOSER:SYNTHESIZER:INITIAL:1`, `POST_COMPOSE_R9:EVALUATOR:1`) — T9 retired
the composer/conformance/restatement organs into the synthesizer/evaluator pair. Observed attempt
count drops from ~109 to ~94 while the sealed `envelopeFormulaInputs` row still yields 109. **The
ceiling still COVERS the run; its TIGHTNESS claim is now false.** The row's formula inputs
(`fixedOrgansPerComposition`, `compositionSegmentCap`, `maxRecompose`, …) describe the retired
architecture.

The seat's own words: *"I could have made this green in thirty seconds by editing two numbers —
that would have converted a live cost-ceiling divergence into a green suite, so I left it red."*

**Why human_review.** The sealed row is V-approved (T16/T17). The fix is not "edit the expected
number": it is a decision about what the envelope formula's inputs MEAN after T9 — re-derive the
sealed row from the post-T9 serve leg (a sealed-row change, same class as W10's bounds), or
declare the ceiling a deliberate over-approximation and retire the tightness assertion on the
record. **Recommendation:** re-derive; a ceiling that is 16% loose on a cost the goal makes V
approve is a wrong number wearing a green test.

## CORRECTION 2026-09-05 — codex t17t9 r1, blocking finding

The "observed ~94" figure was an artifact of the seat's test double: it returned `satisfied: true`
for every EVALUATOR input, so `runSynthesisLoop` exited after round 1. The allowed maximum is 3
rounds / 6 role sites / **106** attempts. Against the sealed 109 the ceiling is **~3%
conservative**, not 16% loose. The orchestrator carried the wrong number into the V register and
into a status to V; both are corrected on the record.

What remains true and still needs V: the tightness assertion expects 7 serve-leg sites and T9's
architecture has 2, and the sealed row's formula inputs name organs that no longer exist. Codex:
keep those assertions red pending the ruling rather than editing them to fit. Risk lowered to
medium: a wrong DESCRIPTION is sealed, not a materially wrong NUMBER.

**Codex t17t9 r2 (2026-09-05):** the fix is NOT 'expected site count becomes 2' — the assertion queries all rounds: 2 roles × 3 rounds = 6 run-level sites, 18 serve attempts, 106 total. The V-register row is corrected accordingly.

**Correction (seat r1, P6, 2026-09-05):** `compositionSegmentCap` is NOT retired — it still caps the synthesizer's segment array (runner:135). The retired organs are composer/conformance/restatement CALL SITES; the segment cap is a live bound. **Added scope (P5):** `t17-envelope-ledger.test.ts:658` pins 109 against `:618`'s 106 in the same file, and the 'ceiling is TIGHT' comment at `:660` is false post-T9 — same fix, same round.
