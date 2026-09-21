# [claude@opus-5] F-GATE-1 · the T16 seeding test expects nine envelope keys and the seeder emits ten — masked since b12 by the conformance break

```yaml
state:
  ticket: F-GATE-1
  risk_tier: medium          # a sealed-row test that cannot pass on integration; on the dev seeding path
  status: done # MERGED at 1485b9e2 (W3 r4, codex APPROVE 0/4): the t16 envelope expectation imports EXPANSION_DEPTH_MAX from the owner — justified by owner consistency plus the separate numeric pin (NOT by the oracle, which does not scan tests; my earlier rationale was wrong, F-W3-R4-3). RED 10-vs-9 keys → GREEN 16/16. Closes on green b13 · b13 14:11 2026-09-05 on 1485b9e2: 22 red = 21 T0 stable-red + 1 NEW (F-T17T9-3, V's decision); 0 load failures; FAIR-02 VANISHED from red. Not green by the closed-list rule; closes on b14 after V's F-T17T9-3 call
  owner: { agent: claude, session: lane-w3b }
  contract: { allowed: [], readonly: [], forbidden: all_others, verification: [codex static review, D15 batch], human_review: no }
  worktree: { path: /Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-w3b, branch: lane/w3b, merge_status: merged, base: fd3bf47a }
  authority_epoch: 1
  rework_round: 0
  wakes_since_transition: 0
  waiting_since: n/a
  escalation_target: v_packet
  self_unblock_enabled: false
  comments_read_through: w3-gate-2026-09-05
```

Surfaced by W3's full-suite gate as one of eight NEW names, then **measured on integration's own
content** (lane-t17t9 at 9818b56c, whose copy of the test file is byte-identical to 7e8f1e51's):

```
tests/integration/t16-algorithm-register.test.ts > T16 algorithm register rows + seeding >
  seeds every ruled algorithm row with its default value and dev provenance
  → envelopeFormulaInputs: expected { …(10) } to deeply equal { …(9) }
```

**Not W3's.** It was in b12's NEW list at 7dda3cc0 too, attributed then to the conformance break
that killed the whole file; with conformance fixed at d08ee928 the second cause is exposed. Third
instance this week of one red name carrying two stacked causes (the lifecycle test; F33/F34).

The seeded `envelopeFormulaInputs` row has ten keys; the test's expected object has nine. The
tenth is whichever key the seeder gained after the test's expectation was last written (the
orchestrator's key-set diff is in the gate log beside this ticket). **Fix:** diagnose which side is
right — a sealed row that gained a key the test never learned, or a test that pins a shape the
register was ruled to have — then either update the expectation with its reason or remove the key
with a ruling. Do not add the key to the expectation without reading why it exists.

## DIAGNOSED 2026-09-05 (orchestrator, key-set diff + git dates)

The tenth key is **`maxDepth`**. The seeded `envelopeFormulaInputs` value carries
`kind, branchingFactor, compositionSegmentCap, fixedOrgansPerComposition, maxRecompose,
reviewerCallsPerNode, synthesizerMaxRounds, evaluatorMaxRounds, panelCallsPerNodeBasis, maxDepth`;
the test's expected value stops at `panelCallsPerNodeBasis`.

- Test expectation last written: `c85d8c6f` (2026-09-01, "T16 r2: mint new register versions").
- Seeder gained `maxDepth`: `4bbb13e5` (2026-09-02, "fix(T17): rework r2"), deliberately — the
  sealed admission bound T17B refuses above, the very literal W3 just derived from the owner.

**Verdict: STALE TEST.** The row is right and ruled; the expectation predates the key by a day and
the conformance break hid the mismatch from every batch since. **Fix (after W3 merges):** add
`maxDepth: EXPANSION_DEPTH_MAX` to the expectation — importing the owner, never restating `5`, so
T1's oracle stays green — with a comment naming `4bbb13e5` as the reason. Test-only, one lane,
small. Fourth stacked-cause name this week.

## 2026-09-16 continuation
Moved `waiting_product_proof` → `done` by RECORDS(CONT-T19). This row waited on an ACCOUNTING gate, not
on code — the code had landed (see the `landed?` column of the 2026-09-16 status map §4.2, *"Code landed;
each row closes by accounting against a gate that has already been taken … No further code is owed."*).
That gate exists and was taken. Citation: `LEDGER.md:487` — the full suite on dev `169941c6`, the closing
run's own tree: **77 / 1 / None / 1**, passed 3379 of 3456, 33 of 265 files, attribution *"0 appeared · 2
disappeared"*, and the orchestrator's own closing sentence: *"Nothing unexplained."* STRENGTH: entailed.
The 2026-09-16 continuation added no code to this subject; the move is a records correction of a row that
had been closeable since 2026-09-08.
