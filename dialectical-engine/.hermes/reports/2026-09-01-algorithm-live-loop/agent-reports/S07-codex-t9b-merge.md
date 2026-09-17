CODEX MERGE REVIEW T9B — PASS · comments read through: t9b-merge-2026-09-03

VERDICT: PASS. The repaired tree at `6a57a998` is correct as a merge, not merely
conflict-free. T17B's pending-attempt boundary and T9's retired-guard behavior coexist;
no other T9 deletion was reinstated; the incoming assertion surface is intact; and all
ten re-taken kills are credited to assertions that directly observe the mutation.

FIT TO MERGE: **YES**. Finding count: **0** (0 blocking, 0 non-blocking); therefore no
new ticket is required. `F-T9B-2` and `F-T9B-3` are previously filed carry-forwards,
not findings introduced by this merge review. `F-T9B-4` is correctly retracted.

## 1. The two boundary decisions genuinely coexist

The frozen goal hash recomputes to
`78238eebe3a04c38bf6bda89207371abb580c380c8d93a0f4559f5f7a6381986`.
Its lines 248–251 explicitly retire the restatement guard and require the HARD_STOP
terminal independently of restatement status.

The repaired runner implements both independent decisions:

- `apps/runner/src/index.ts:3834-3843` retains T17B's optional
  `pendingModelAttempts` argument and forwards it to `evaluateRunPressure`.
- `packages/budget/src/index.ts:405-412` refuses a new model call at
  `consumed >= max`. The provider wrapper invokes that refusal at runner line 4476,
  before the HTTP call and before a new MODEL_CALL ledger row can be appended.
- The catch therefore still observes `consumed == max`. Its
  `evaluateEnvelope(1)` at runner line 4169 asks about the refused next attempt;
  `consumed + 1 <= max` is false, so `decideBudgetPressure` returns HARD_STOP.
- The normal reporting calls retain the default zero. Thus a completed run at exact
  equality remains WITHIN, while a refused next attempt at the same count is a
  HARD_STOP. The incoming boundary is not weakened.
- Runner line 4177 now tests only `exhausted.kind !== "HARD_STOP"`. No restatement
  conjunct remains. `makeEnvelopeTerminal` observes a non-PASS status in its disclosure
  ternary, adds `PROTECTED-CORE-GUARD-RETIRED` as a paired record, and passes the status
  to `createEnvelopeExhaustedResult`, whose `!== "PASS"` observation adds the visible
  mark and trace. Neither observation decides whether the terminal fires.

There is only one production throw site for `RUN_COST_ENVELOPE_EXHAUSTED`, in
`BudgetRepository.assertModelAttemptAllowed`. The catch cannot accidentally reinterpret
an unrelated exception with the same code. The retained F4 database arm supplies a
FAILED restatement, requires completion, reloads the persisted answer, and asserts the
components-only terminal, both marks, the paired FAIL record, and the stored mark.

Conclusion: `evaluateEnvelope(1)` determines which budget question is answered; removal
of the restatement conjunct determines whether a confirmed HARD_STOP is allowed to take
the retired-guard terminal. They are orthogonal and correctly composed.

## 2. Independent deletion-preservation audit

The graph is unambiguous: `e9b46023` has parents `b0591d9b` and `58c4715e`, their
merge-base is `19bbb4c4`, and `6a57a998` is the one-parent repair on top.

I did not use the seat's substring sweep. I compared the changed-path sets and blobs:

- Lane and integration overlap in exactly one path:
  `dialectical-engine/apps/runner/src/index.ts`.
- All 21 paths changed only by the lane are byte-identical between `b0591d9b` and
  `6a57a998`. Every deletion in those files is therefore preserved.
- All 21 paths changed only by integration are byte-identical between `58c4715e` and
  `6a57a998`.
- In the sole overlap, integration's `19bbb4c4..58c4715e` patch contains 30 added and
  9 removed lines. All 30 additions are present at `6a57a998`; none is missing.
  `packages/serve/src/index.ts` is unchanged across that integration range, so all 30
  additions are in the runner.
- Relative to the lane tip, the bad merge added 31 lines: the same 30 incoming lines
  plus exactly one other line, the reinstated
  `if (exhausted.kind !== "HARD_STOP" || servedRoot.restatementStatus !== "PASS")`
  guard. This is a direct patch-set classification, not a generic-line search.
- Relative to the lane tip, the repaired tree adds 37 lines: the same 30 incoming lines
  plus exactly seven new explanatory comment lines. Its nine removals are precisely the
  old `evaluateEnvelope` form replaced by T17B's parameterized form. No other lane-deleted
  line is added back.

The runner-scoped symbol recount independently reproduces the class result:

| symbol | `b0591d9b` | `e9b46023` | `6a57a998` |
|---|---:|---:|---:|
| `restatementStatus !== "PASS"` | 0 | 1 | 0 |
| literal `restatementStatus === "PASS"` occurrences | 2 | 2 | 2 |
| executable `protectedCoreVerified` identifier | 0 | 0 | 0 |
| `conformanceBound` | 4 | 4 | 4 |
| `conformanceContractHash` | 3 | 3 | 3 |
| `conformanceRawArtifactRefs` | 5 | 5 | 5 |
| `buildRepairPacket` | 2 | 2 | 2 |

The seat's count of two `=== "PASS"` literals is numerically reproducible, but its label
must not be read as two executable ternaries: one occurrence is the disclosure ternary
and one is the nearby comment that explicitly says no such conjunct governs the initial
terminal. Both are unchanged and neither is the reinstated `!== "PASS"` guard.
The zero for `protectedCoreVerified` is a runner/executable-symbol count; historical prose
in serve comments still names the retired identifier and is not executable code.

Conclusion: the bad merge reinstated exactly one deletion. The repair removes it, and no
second deletion was silently undone.

## 3. Incoming assertions were not weakened, renamed, or lost

All 16 test, acceptance, proof, and test-support blobs changed by integration are
byte-identical at `58c4715e` and `6a57a998`, including the complete T17 and T15 suites.
The repair commit touches only runner source. The incoming
`fixtureStructuralCeiling` expansion is present byte-for-byte, and T9's database fixtures
consume that shared helper, so their envelope bases inherit its required members.

The T9B-only range `9a3a5f60..b0591d9b` removes zero `it`, `test`, or `describe`
declarations, including `.each` forms. The merge/repair does not delete or rename an
incoming test declaration. For precision, the broader original T9 product range does
retire legacy gate tests as part of the already reviewed frozen-goal change; I do not use
the zero-declaration statement for that broader range.

Conclusion: no landed assertion from integration was weakened, renamed, or lost.

## 4. Re-taken mutant credit

The static index independently derives:

```text
TALLY: transcripts=12  killed=10  survived=2  invalid=0
CLEAN: every transcript well-formed, every outcome matches the manifest
```

Reading each OLD/TOKEN pair and its raw failure frame gives genuine causal credit:

| mutant | mutated property | assertion that kills it |
|---|---|---|
| B1M1 | role-key equality becomes self-comparison | the real ambidextrous artifact/key promise resolves instead of rejecting |
| B1M2 | exact ledger producer cardinality is disabled | the same-run wrong-producer promise resolves instead of rejecting |
| B1M3 | derived round is hard-coded to 1 | the real round-1 pair filed as round 2 resolves instead of rejecting |
| F1M1 | `conforms` is removed from the cited-set filter | the tracing-failed basis changes from all zeroes to LOOKED_UP=1/REASONING=1, and the one-segment band becomes FULL rather than the floor |
| F1M2 | tracing failure no longer bypasses the no-cited-node refusal | the T9/T12 serve-regardless promises reject with `SERVED_STATEMENT_CITES_NO_VERIFIED_NODE` instead of resolving |
| F1M4 | the row floor is replaced with the candidate band | the floor and full six-field ceiling-record assertion receives FULL plus DEFAULT/retain-band metadata |
| F1M5 | the tracing-failed serve arm is disabled | the one-segment tracing-failed promise rejects on the unrelated two-segment reasoning precondition instead of resolving |
| F1M6 | the two-segment precondition is disabled | the typed `COMPOSITION_CONTRACT_ERROR` assertion receives a downstream TypeError |
| F1M7 | the record selects the entry that does not name the floor | the tuple assertion receives DEFAULT/retain-band metadata beside the floor band |
| F1M8 | floor-label membership validation is disabled | the explicit invalid-label refusal arm no longer throws |

B1N1 changes only error prose and F1N1 drops the currently vacuous state-axis conjunct;
both survive with exit zero, as required. The B1 commands select only the three producer
tests, and their two non-target tests pass, so the lifecycle red cannot supply false
credit. The F1 deaths each include at least one assertion owned by the mutated property;
some also expose compatible failures in older permissive fixtures, but those extra frames
are not needed for credit.

## 5. Provenance and retained static evidence

- Removing line 2 from `agent-reports/s07-synthesis.md` recomputes exactly
  `db49fb6b1c81cf09f27c5b5b3c5c57a94b3250514bab3ce0f4488c3316d15866`.
- The standing stamp comparator finds 12/12 mutant records and 10/10 final gate/citation
  records at full commit `6a57a998d364e4b44aa3e06dfde2013f52b88d4d`, with zero
  failures. The recorded tree matches current `HEAD^{tree}`:
  `b5aae82f736f6e0e499c99dd549f869597433498`.
- I independently searched all 15 literal anchors printed by the citation record in the
  current tree; every one has exactly one occurrence.
- The retained typecheck records show exit 0 three times. The retained T9 unit/architecture
  records show `87 passed (87)` three times.
- The retained database records show `1 failed | 83 passed (84)` three times. In each,
  F4 passes and the sole failure is
  `claims, judges through the HTTP gateway, propagates, serves, and settles`. Earlier
  pre-merge records at `9a3a5f60` already contain that same lifecycle failure.
- Current worktree HEAD/tree match the stamps and porcelain is empty. Static `diff --check`
  on `b0591d9b..6a57a998` reports no whitespace error.

I ran no test, build, install, compiler, database, provider, or mutating Git command.
Accordingly, fresh runtime truth is **CANNOT-ASSESS** under this review's static-only rule;
the execution statements above are verified immutable records, not executions performed
by this reviewer. That limitation is not a merge finding.

## PREDICTIONS

- A three-tree or patch-set reviewer should reproduce one overlap path and exactly one
  bad-merge-only reinstatement; a short-substring sweep is likely to recreate the false
  multi-hit result.
- A closing run should keep F4 green while preserving T17B's equality split. If F4 regresses
  after the next merge, the first discriminator is the runner count of
  `restatementStatus !== "PASS"`, which must remain zero.
- A mutation-credit review that reads the raw frames should agree on all ten kills; an
  index-only review will reach the same tally but will not independently prove causation.
