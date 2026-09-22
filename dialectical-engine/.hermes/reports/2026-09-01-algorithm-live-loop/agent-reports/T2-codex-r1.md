CODEX REVIEW T2 r1 — CHANGES · comments read through: t02-r1-2026-09-01

# CODEX REVIEW T2 r1

## VERDICT

**CHANGES — 0 BLOCKING, 1 NON-BLOCKING packet finding.**

The implementation itself satisfies all three T2 DoD clauses: the legacy form renders no
steering input, submits both unchanged steering contract fields as empty arrays that the
contract schema accepts, and changes exactly one `web/` file. No worker-code rework is
requested. The verdict remains CHANGES because heartbeat law §2.2 does not permit an
APPROVE-with-concern outcome: the dispatch packet has one confirmed writable-surface defect
that the orchestrator must route and fix.

Round: r1 of the maximum 3 rework rounds.

## FINDINGS

### N1 — NON-BLOCKING · worker packet omits a mandatory writable deliverable

- **WHAT:** Mission `INSTRUCTIONS.md` requires the worker to fill the slice `PLAN.md`
  evidence column, but neither the board nor `packets/t02-steering.md` permits that file.
- **WHERE:** `INSTRUCTIONS.md:65`; `slices/S02-hygiene/PLAN.md:37-39,58`;
  `packets/t02-steering.md:5-8`; `board/T02-steering-placebo.md:10-14`.
- **FAILURE SCENARIO:** A T2 worker follows `INSTRUCTIONS.md:65` → writes `PLAN.md` →
  violates the exhaustive file contract. The worker follows its packet instead → leaves
  the mandatory T2 evidence cells blank. The current worker chose the lawful second branch,
  so rows 37-39 and cluster row 58 still have empty evidence columns.
- **WHY:** Reviewer contract §1 requires comparing the packet's `allowed` list to every
  demanded deliverable; a mandatory deliverable outside `allowed` is a packet defect. The
  worker already disclosed the same defect as `F-T2-4`; this review independently reproduced
  it. It does not invalidate the product diff, so it is non-blocking, but heartbeat §2.2
  still requires a ticket and fix.
- **SUGGESTED FIX:** Route `F-T2-4` to the orchestrator. Authorize the exact S02 `PLAN.md`
  path in the relevant worker contract and have the T2 evidence cells filled, or change the
  mission rule so an already-authorized orchestrator records that evidence. Add a packet
  lint requiring `mandatory deliverables ⊆ allowed writes` before future dispatches.

## PACKET REVIEW

**NON-CONFORMANT only for N1.** Otherwise the worker packet is a complete four-element
packet and its quoted constants check out:

- the absolute working directory exists and resolves beneath branch `lane/t2`;
- base `1c9578a` resolves as a commit;
- the frozen SPEC's goal SHA-256 is
  `78238eebe3a04c38bf6bda89207371abb580c380c8d93a0f4559f5f7a6381986`, exactly as stated;
- base `web/app/new/NewQuestionForm.tsx:50-51`, resolved from the packet's working directory,
  contains exactly the two steering textarea labels;
- goal lines 107-111 and the S02 SPEC are byte-identical for T2;
- the packet's required code, report, self-report, and log outputs are otherwise within the
  board's allowed surfaces. The conditional test-harness fallback is unambiguous and was not
  used because a repo-level render harness exists.

## EVIDENCE CHECKED

### Exhaustive diff surface

Fresh commands:

```sh
git log --oneline 1c9578a..HEAD
git status --short
git diff --name-status 1c9578a..HEAD
git diff --stat 1c9578a..HEAD
git diff --check 1c9578a..HEAD
git diff 1c9578a..HEAD
```

Relevant output, verbatim:

```text
4431c8a T2: append four tooling traps paid for in this lane
07c434e T2: remove steering placebo from legacy new-question form (S1-2)
M	dialectical-engine/.hermes/TOOLING-TRAPS.md
M	dialectical-engine/tests/architecture/s14-contract.test.ts
A	dialectical-engine/tests/render/s1-2-legacy-steering-placebo.test.tsx
M	dialectical-engine/web/app/new/NewQuestionForm.tsx
 dialectical-engine/.hermes/TOOLING-TRAPS.md        | 19 +++++
 .../tests/architecture/s14-contract.test.ts        |  5 +-
 .../render/s1-2-legacy-steering-placebo.test.tsx   | 87 ++++++++++++++++++++++
 dialectical-engine/web/app/new/NewQuestionForm.tsx |  7 +-
 4 files changed, 112 insertions(+), 6 deletions(-)
```

`git status --short` and `git diff --check 1c9578a..HEAD` produced no output. Exactly one
changed path is below `dialectical-engine/web/`, matching the worker's DIFF SCOPE proof.
The full patch was inspected; the other three paths are the focused render regression test,
the collateral source assertion that named the deleted label, and tooling-trap notes.

### Independent static claim probe

I compared the base and HEAD `AskRequest` object keys independently. Both lists were:

```text
question_line
risk_tier
tier_source
tier_provenance_ref
composition_budget_tier
depth_params
decision_scope
as_of
steering_presets
steering_annotations
```

The key-list diff was empty. HEAD contains:

```text
      steering_presets: [],
      steering_annotations: []
```

A source probe finds no named steering control or steering-facing text in the rendered form;
the only remaining textarea is `question_line`. `AskRequestSchema` at
`packages/contract/src/index.ts:107-118` retains both fields as `z.array(...)` without an
array `.min(...)`, so empty arrays validate. The pre-existing contract test at
`tests/unit/contract.test.ts:27-38` also parses a complete request containing both empty
arrays. The form still passes the same ten-key `AskRequest` to
`contractClient.submitAsk(ask)`.

### RED, GREEN, and refutation logs

`logs/t02/red-run1.log` is genuine baseline RED for the desired behavior, not a probe of the
old behavior. Its summary is:

```text
 Test Files  1 failed (1)
      Tests  2 failed | 1 passed (3)
exit=1
```

The two failures show the base rendering `name="steering_presets"` and submitting
`[ 'asker-typed-steering-text' ]` instead of `[]`. The three targeted post-fix cluster logs
each contain:

```text
 Test Files  3 passed (3)
      Tests  50 passed (50)
```

The mutant logs match the worker's corrected table: M1 and M2 each fail 1/3, M3 fails 1/3,
M4 fails 2/3, while unmutated M0 and unrelated-label N1 pass 3/3. The initial void Perl runs
are disclosed in `mutants-summary.log` and are not counted as evidence.

### Suite boundary and D13

The base full-suite log contains, verbatim:

```text
 Test Files  18 failed | 199 passed (217)
      Tests  23 failed | 1753 passed (1776)
   Duration  2984.19s (transform 9.35s, setup 0ms, import 199.87s, tests 2698.74s, environment 38.57s)
[ELIFECYCLE] Test failed. See above for more details.
pnpmtest exit=1
```

The after-suite log has no `Test Files`, `Tests`, duration, or exit line and ends mid-test.
Therefore the after full suite is **D13-DEFERRED / CANNOT-ASSESS**, not green and not
evidence against the diff. D13 (`DECISIONS.md:222-231`) makes the judge's serialized run in
this lane the authoritative full-suite result; per the review packet, this gap is noted and
is not a blocker by itself. The three cluster runs remain the supporting worker evidence.

The three post-fix root typecheck logs contain the command with no TypeScript diagnostic;
the worker correctly disclosed that root configuration excludes `web/` and `.tsx`. The
focused web typecheck logs both contain the same single pre-existing
`web/app/layout.tsx(3,8) TS2882` diagnostic. I did not treat root typecheck as proof of this
lane.

## WHAT I DID NOT VERIFY

- I ran no tests, package commands, installs, builds, or runtime probes; the packet requires
  static review.
- I did not verify a completed after full suite; D13 assigns that run to the judge stage.
- I did not mutate product code, tests, the worker report, the board, or any mission artifact
  outside this findings file and the authorized reviewer self-report.
- I did not read the 1,959-line spine.

## PREDICTIONS

I expect a later lens may over-read the negative DoD and call the three non-`web/` test/tooling
paths scope violations, although the literal rule is "no other web/ change" and the exhaustive
name-status proof shows only the named form below `web/`. I also expect a lens may either
over-credit the mocked submit test as validation evidence or under-credit empty arrays because
the element schemas use `.min(1)`; the first check should be the array-level schema at
`packages/contract/src/index.ts:116-117`, where no array minimum exists. Finally, a judge may
mistake the partial after-suite log for a failed run; its missing summary/exit and D13's
serialized authority should be checked before classification.

