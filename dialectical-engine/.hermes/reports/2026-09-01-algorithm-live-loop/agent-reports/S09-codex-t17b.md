CODEX REVIEW T17B — CHANGES · comments read through: t17b-2026-09-03

# CODEX REVIEW T17B

## VERDICT

**CHANGES — 0 blocking findings, 2 non-blocking mandatory tickets. The product lane is fit to
merge.** Both blockers from
`/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/S09-codex-s09b.md`
are closed at `55354f4f0181c99df02c44cca428d443571f8c3b`. B1 now distinguishes completed-run reporting
from a refused pending attempt without reverting J28; B2 rejects both a smaller selected arm and
the wrong tie selection. The merge repair is fixture provisioning only, and the six killed
mutants have the causes credited to them. The two tickets below correct current explanatory and
process records; neither identifies a product-behaviour defect or delays integration.

This was static review only. I ran no tests, builds, typechecks, installs, mutation commands,
provider calls, or mutating Git commands. Runtime outcomes below are readings of filed records,
not independently reproduced executions.

## FINDINGS

### N1 — NON-BLOCKING · T17B-CODEX-N1 · the guard algebra and “character-for-character” wording are not literally true

**WHAT.** The implementation is correct, but its explanation says all three receipt guards obey
“any two imply the third” and that no input can make exactly one fire. The tie test in the same
file is a counterexample: with equal arms, `serve` equal to that arm, and `selected =
SYNTHESIS_LOOP`, selected-count agreement and larger-arm agreement both hold while only the
constructor tie-policy check refuses. The accurate relation is narrower: tie policy plus either
count check implies the other count check; the two count checks do not imply the tie policy at a
tie. The landed selected-count predicate remains redundant as a bare accept/reject predicate,
but its distinct refusal message is now observable and killable.

The phrase “character-for-character J28's comparison” is also textual overstatement. The source
expression changed from `consumed <= max` to `consumed + pending <= max`; its default-0 outcome,
returned `state: "WITHIN"`, and the pre-existing successful-terminal assertion are preserved.

**WHERE.** Current statements appear at
`/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-s09/dialectical-engine/tests/unit/t17-envelope.test.ts:356`,
`/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-s09/dialectical-engine/packages/budget/src/index.ts:283`,
`/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/s09-envelope.md:979`,
`/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/s09-envelope.md:1061`,
`/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/s09-envelope-self.md:153`, and
`/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/board/T17B-envelope-boundary.md:7`.

**WHY.** This does not weaken B1, B2, or M6b, but it is a present-tense source/report truth defect
in the same class already tracked by `S09B-D28-REPORT`.

**WHEN / FIX.** Route `T17B-CODEX-N1` as an addendum to `S09B-D28-REPORT` and correct these
sentences during the mandatory D28 report sweep, before mission closure and before the report is
used as a derivation authority. Preserve the guards and assertions; only the algebra and literal
comparison claim need correction.

### N2 — NON-BLOCKING · T17B-CODEX-N2 · the review-response process floor and write-boundary guard were absent

**WHAT.** The packet discloses that the worker did not load `superpowers:receiving-code-review`
because the ticket calls this `rework_round: 0`, although T17B is materially a response to review.
The worker also crossed the authorized write boundary once by editing the main checkout, then
reverted it immediately. My current static inspection of
`/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5` finds no main-checkout
product diff: its tracked and untracked changes are confined to
`/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes`
mission artifacts. Whether the main
checkout is byte-identical to an unrecorded session-start snapshot is **CANNOT-ASSESS** from the
current tree alone; an immutable start snapshot would settle that stronger historical claim.

**WHERE.** The disclosures are at
`/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/packets/s09-codex-t17b.md:66`,
`/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/s09-envelope-self.md:128`, and the misleading round label at
`/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/board/T17B-envelope-boundary.md:23`.

**WHY.** Neither lapse survived into product code, and this independent review supplies the
technical scrutiny the missing skill was intended to prompt. They are still real process-floor
failures, not optional observations.

**WHEN / FIX.** Before the next worker makes any edit that responds to review—T17B re-entry if
there is one, otherwise the next applicable lane—classify the task as review response regardless
of its reset round number, load `superpowers:receiving-code-review`, and add a pre-write check that
refuses main-checkout product paths when the ticket names a lane worktree. Record the disposition
under `T17B-CODEX-N2` at mission closure; do not reopen this correct product diff merely to replay
a retrospective skill invocation.

## REVIEW ANSWERS

### 1. Equality contexts and J28

Yes, the contexts now differ genuinely. At
`/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-s09/dialectical-engine/packages/budget/src/index.ts:268`,
the default is zero, and line 288 compares `consumed + pending <= max`. The completed-run calls at
`/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-s09/dialectical-engine/apps/runner/src/index.ts:3646`
and line 3787 use zero; only the refused-attempt catch at line 3782 supplies one. Thus equality is
`WITHIN` for a completed run but `HARD_STOP` when asking permission for one more attempt.

The successful-terminal state is preserved exactly: the existing assertion at
`/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-s09/dialectical-engine/tests/integration/t17-envelope-ledger.test.ts:545`
still requires `"WITHIN"`, and its answer-survival assertions at lines 558-564 still require one
answer, no `ENVELOPE_EXHAUSTED`, and `"DOWNGRADED"`. The diff from `59f23153` adds the new B1 test
after that block and does not modify the block. The filed GREEN record at
`/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/s09/t17b-GREEN-B1-runner-refusal-boundary.log`
states `Tests  2 passed (2)`. The comparison expression itself is not character-for-character;
N1 corrects that wording.

### 2. Smaller-arm and tie-policy refusal

Yes. The parser at
`/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-s09/dialectical-engine/packages/budget/src/index.ts:109`
requires `call_sites.serve === Math.max(composition_sites, synthesis_loop_sites)`, and line 117
requires the same `>=` tie policy used by the constructor at
`/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-s09/dialectical-engine/packages/register/src/index.ts:337`.
The exact smaller-arm, wrong-tie, and lawful-tie controls are at
`/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-s09/dialectical-engine/tests/unit/t17-envelope.test.ts:394`,
line 428, and line 448.

They are independently killable at the observable contract. M4 disables the larger-arm guard and
fails only the assertion for `"are not the larger arm 7"`; its filed result is
`Tests  1 failed | 37 passed (38)`. M5 changes `>=` to `>` and fails the wrong-tie rejection plus
the lawful-tie acceptance neighbour; its filed result is `Tests  2 failed | 36 passed (38)`.
The unmutated B2 record at
`/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/s09/t17b-GREEN-B2-receipt-smaller-arm.log`
states `Tests  38 passed (38)`.

### 3. Landed selected-count check

The additive pin is real for the refusal-reason contract, but the predicate remains logically
shadowed for bare accept/reject semantics. The new assertion at
`/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-s09/dialectical-engine/tests/unit/t17-envelope.test.ts:371`
requires the selected-count guard's own message. With that guard disabled, the larger-arm guard
still refuses, but with the wrong message. Consequently M6b fails on line 375 with expected
`"serve call sites 6 disagree with the COMPOSITION arm 7"` and received the larger-arm refusal;
`/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/s09/t17b-MUTANT-M6b-landed-count-check-now-pinned.log`
states `Tests  1 failed | 38 passed (39)`. This is a right-cause diagnostic-contract kill, not a
claim that disabling the predicate changes the accepted input set.

### 4. Merge repair and the exact maximum path

The repair did not weaken an assertion. Commit `59f23153` adds only 22 fixture-provisioning lines
to
`/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-s09/dialectical-engine/tests/integration/t17-envelope-ledger.test.ts:311`:
the T7 `stoppingPolicy` with delta zero and epsilon zero. The existing maximum-path block remains
unchanged and still requires seven named serve namespaces at lines 489-497, both composition
rounds at line 499, observed attempts exactly 109 at line 514, and ceiling exactly 109 at line
517. A truncated fixture cannot satisfy those exact ledger assertions. The final-tree C1 records
therefore make the 109 evidence genuine for this fixture and this path; it is not merely an
in-memory ceiling comparison.

### 5. Mutant credit

All six kills have the filed cause; none is a D43 wrong-cause death.

| mutant | actual failing surface read from the transcript |
|---|---|
| M1 | `evaluateEnvelope(1)` to `(0)` restores the rethrow; the B1 test dies during the awaited `executeWorkItem` act with `RUN_COST_ENVELOPE_EXHAUSTED`. It is correctly classified `THREW`, not credited to an `expect`. Filed: `Tests  1 failed | 1 passed (2)`. |
| M2 | Dropping `+ pendingModelAttempts` has the same exact act-phase error path. Filed: `Tests  1 failed | 1 passed (2)`. |
| M3 | Reverting `<=` to `<` fails the pre-existing J28 assertion with expected `"WITHIN"`, received `"EXHAUSTED"`; the B1 refusal test passes. Filed: `Tests  1 failed | 1 passed (2)`. |
| M4 | Disabling the larger-arm guard fails the smaller-arm message assertion; the remaining tie-policy refusal lacks the credited message. Filed: `Tests  1 failed | 37 passed (38)`. |
| M5 | Changing tie policy `>=` to `>` makes the wrong-tie receipt parse and the lawful COMPOSITION tie refuse. Filed: `Tests  2 failed | 36 passed (38)`. |
| M6b | Disabling the landed selected-count guard fails its newly added message assertion while the larger-arm message still refuses. Filed: `Tests  1 failed | 38 passed (39)`. |

The raw records match the absolute glob
`/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/s09/t17b-MUTANT-*`.
The index at
`/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/s09/t17b-MUTANT-INDEX.log`
correctly reports `transcripts=7  killed=6  survived=1  invalid=0`; credit above was established
from the raw failure frames, not inferred from that index.

### 6. Merge fitness

Yes: the product lane is fit to merge. B1 and B2 are closed; M6b is a real observable-contract
pin; the merge repair leaves the exact ledger oracle intact; and no wrong-cause kill was counted.
N1 and N2 are mandatory non-blocking record/process work with explicit timing, not product merge
gates.

## CUSTODY, GATES, AND PACKET REVIEW

The lane is clean on `lane/s09`; HEAD is
`55354f4f0181c99df02c44cca428d443571f8c3b` and tree is
`a36d473a885e1770091d93b5e3fc93f302dc96e6`. Deleting line 2 from
`/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/agent-reports/s09-envelope.md`
reproduces SHA-256 `eabb419a0b4a158d4b774bfc87c25c22456964a3ff59262f53a2b40d2eda36e4`.
`git diff --check 5bf8960f..55354f4f` printed nothing, and the range has no mode change.

D57 is satisfied without misusing whole-prefix stamp comparison. From `ab2f508c` to the filed
tip, the production targets
`/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-s09/dialectical-engine/apps/runner/src/index.ts`,
`/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-s09/dialectical-engine/packages/budget/src/index.ts`, and
`/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-s09/dialectical-engine/packages/register/src/index.ts`
are byte-identical; the only change is 21 added lines in
`/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/.worktrees/lane-s09/dialectical-engine/tests/unit/t17-envelope.test.ts`.
This also checks the runner target that M1 mutated, not only the two package directories named in
the packet.

Filed final-tree records state:

- typecheck `EXIT = 0` in
  `/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/s09/t17b-GATE-typecheck.log`;
- each of the three C1 records states `Tests  51 passed (51)` in
  `/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/s09/t17b-GREEN-T17B-C1-run1.log`,
  `/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/s09/t17b-GREEN-T17B-C1-run2.log`, and
  `/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/s09/t17b-GREEN-T17B-C1-run3.log`;
- the final unit-zone record states `Tests  7 failed | 1134 passed (1141)` in
  `/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/s09/t17b-ZONE-unit-HEAD.log`;
- the comparator at
  `/Users/stefan.nour/Library/CloudStorage/OneDrive-adessoGroup/Debate/V5/dialectical-engine/.hermes/reports/2026-09-01-algorithm-live-loop/logs/s09/t17b-ZONE-set-equality.log`
  reports no new or fixed failure names and `SET-EQUALITY: PASS`.

The packet's commit, tree, merge, report-hash, log, and gate constants are correct. Its D57 warning
was necessary and correct. N1 is its only truth-level wording correction. The existing worker
routes remain appropriate: parser/constructor coupling stays on the W12 re-verification list;
the stale deletion-matrix arithmetic stays on `S09B-D28-REPORT`; and the zero-overlap settings
coupling should become a pre-merge lane-suite requirement. None changes the T17B product verdict.

Fresh runtime reproduction is **CANNOT-ASSESS** under this review's static-only rule. The judge's
authorized D15 batch suite would settle execution against the filed tree; this review establishes
source correctness and the internal causal validity of the supplied records.

## PREDICTIONS

- A later reader may call M6b either fully independent or wholly invalid. The precise answer is
  between those: the predicate is redundant for refusal semantics, while its named reason is an
  independently observable contract and the mutant dies on that reason.
- If T9 changes the constructor's serve-arm choice or tie policy without moving the parser in
  lockstep, legitimate receipts will begin refusing. The W12 re-verification should compare the
  two expressions directly.
- A whole-prefix `stamp-check` rerun will again report correct failures for RED and mid-campaign
  records. The relevant future check is earlier-tip code identity, including the runner target,
  plus filed-tip stamps for final gates.
