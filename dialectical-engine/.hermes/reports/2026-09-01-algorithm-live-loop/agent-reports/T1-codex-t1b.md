CODEX REVIEW T1B — CHANGES · comments read through: t1b-2026-09-03
SKILLS LOADED: superpowers:using-superpowers, heartbeat-protocol, heartbeat-reviewer, superpowers:systematic-debugging, superpowers:verification-before-completion

# T1B codex static review

## VERDICT

**CHANGES — 1 blocking and 2 non-blocking findings (3 total).** T1B closes the three
published r3 evasions without removing any r3 hit, and the actual 102-commit merge preserves
both parents' code and all assertions landed by integration. It is not fit to merge because the
shipped oracle still changes its answer after an ordinary line wrap at `&&`, the exact layout
dependence V authorized T1B to eliminate. This opens T1B rework round 1 of 3; it is not a fourth
round of frozen T1 and requires no product-semantic change.

Answers to the five dispatched questions:

1. **Yes, for E1-E3, and no r3 hit is narrowed.** Each named evasion has a valid RED-at-parent /
   GREEN-at-tip pair. The retained line pass is output-monotone with respect to r3.
2. **The actual merge is sound; the advertised proof method is not sufficient on its own.**
   Direct parent/final inspection finds both import intents and no integration test edit or
   deletion. Sorted added/deleted line equality is only a content checksum; N2 corrects the
   stronger tooling claim.
3. **df1-df3 are acceptable scoped limits; df4 is B1.** Indirection, arithmetic and hexadecimal
   spellings require predicate expansion, symbol resolution or constant folding, which V froze
   out of this unit-only micro-ticket. The `&&` miss is different: the same expression is caught
   on one line and missed when wrapped.
4. **The worst-run verdict is honest.** The final filed triplicate is `13 failed / 1431`,
   `14 failed / 1431`, `13 failed / 1431`, so the reported verdict is `14 failed / 1431`.
   The stronger six-run and ownership claims are not fully supported by retained artifacts; N1
   narrows them without changing that verdict.
5. **No, not yet.** Fix B1 before merge; route N1 and N2 in the same T1B correction cycle.

## FINDINGS

### B1 — BLOCKING · T1B-CODEX-B1 · `&&` preserves the same layout-dependent escape

Ticket: **T1B-CODEX-B1**. Fix before merge in T1B rework round 1. Keep T1's product and the
four frozen predicates unchanged; repair only the oracle unit and add RED-first coverage for this
input while retaining the measured `page.tsx` negative control.

Files/evidence: `tests/unit/s1-1-depth-contract.test.ts:293-317,387-390,404-417` and
`logs/t01/t1b-defeat/df4-split-across-and.log`.

The declaration lexer flushes at `&&` when the operator is at the unit's starting bracket depth.
That makes these formatting-equivalent expressions produce different answers:

```ts
const ok = isDepthField(v) && v <= 5; // r3 line half sees /depth/ and bare 5

const ok = isDepthField(v) &&
  v <= 5;                             // shipped oracle returns []
```

On the wrapped form the physical-line pass has no row containing both tokens. The unit pass emits
`const ok = isDepthField(v)` and `v <= 5` separately; the first has no ceiling and the second no
`depth` token, so `kindOf` rejects both. The worker's own shipped-path df4 transcript confirms the
positive control fails with `expected [] to not deeply equal []` and records
`1 failed | 35 skipped (36)`, exit 1.

This is not the cross-statement semantic reach required by df1. It is one boolean declaration,
and inserting only a newline changes whether the retained r3 line pass rescues it. A generic
property validator such as `key === "depth" && value <= 5` has the same ordinary shape. The
measured false positive at `apps/ui/app/new/page.tsx:75` explains why deleting the boundary is not
the fix; it does not make a layout-sensitive boundary acceptable. Preserve the negative control
while carrying enough relation across adjacent conjuncts to catch the bound-bearing case.

### N1 — NON-BLOCKING · T1B-CODEX-N1 · four retained wide runs cannot prove the six-run/ownership wording

Ticket: **T1B-CODEX-N1**. When T1B is refiled, before the judge consumes F-T1B-1, either attach
the two missing stamped wide-suite transcripts or narrow the report to the four retained runs and
classify lane causality as **CANNOT-ASSESS**.

The filed artifacts retain four, not six, wide-suite records; the worker's own Records section
says `unit+arch ×4`:

- `t1b-lane-unit-arch.log` at `3a579a68`: `14 failed / 1431`, with the registration RSS test extra;
- final run 1: `13 failed / 1431`, exactly the known-red seed;
- final run 2: `14 failed / 1431`, with obs-L2 S05 Tier-0 extra;
- final run 3: `13 failed / 1431`, exactly the known-red seed.

Both rotating names do pass in each of three isolated invocations: registration records
`2 passed | 56 skipped (58)` and obs-L2 records `3 passed | 50 skipped (53)`, all exit 0. Neither
test file changed from `386efd39` through the filed tip. This supports the useful conclusion that
a single full-suite run cannot distinguish a regression from load-sensitive instability. It does
not reconstruct two overwritten/unfiled runs, and isolation plus an untouched file does not prove
the categorical statement **"Neither is mine"**: adding a concurrently executing test file can
change host load even when no direct code path reaches the flaky test. The exact six-run history
and lane ownership are therefore CANNOT-ASSESS from the retained evidence. The worker nevertheless
handled the gate result honestly by reporting the worst filed run, not by calling the suite green.

### N2 — NON-BLOCKING · T1B-CODEX-N2 · sorted diff line sets are not a semantic merge proof

Ticket: **T1B-CODEX-N2**. Before the new `.hermes/TOOLING-TRAPS.md` advice is reused or made into
`merge-preserved.sh`, amend it to describe sorted `+`/`-` equality as a preservation cross-check
and require position/context-aware parent diffs plus combined-diff inspection for conflict
resolutions.

I reproduced all six reported hash equalities for the three overlapping files in both directions.
They establish that the same added/deleted line **multisets** occur. Sorting erases position,
order and surrounding ownership, so the check can accept a line moved into the wrong declaration,
reordered imports with side effects, or equal text attached to the wrong repeated construct. It is
therefore not sufficient to prove "meaning" or that neither contribution was dropped. The trap's
claim that the two comparisons prove preservation and supersede reading hunks is too strong.

This is not a defect in the current merge. Direct inspection of `7828d220` shows the contract
import and integration's extended kernel import together in the sole combined runner hunk; the
contract and audit additions remain in their intended declarations. Relative to integration, the
only test-tree changes are T1's added `s1-1-depth-contract.test.ts` and modified
`v2ui-pages.test.ts`, and integration had changed neither since the merge base. Thus no assertion
landed by the 102 incoming commits was weakened, renamed or deleted.

## ORACLE AND RED/GREEN AUDIT

The r3 body is intact: SHA-256 over worker-report lines 3-437 is
`b7c8c7f5b1ff125b1aa7b8778301d9f167737dc13e0798752e14287f18879e7d`.

All three RED records stamp `7828d220`, carry the uncommitted positive control appropriate to a
RED-first run, and fail with `expected [] to not deeply equal []`:

- E1 multiline Zod chain: `1 failed | 33 skipped (34)`, exit 1;
- E2 split refinement: `1 failed | 33 skipped (34)`, exit 1;
- E3 multiline `[1,2,3,4,5]`: `1 failed | 33 skipped (34)`, exit 1.

Their final-tip GREEN counterparts each record `1 passed | 35 skipped (36)`, exit 0. The combined
RED record has `3 failed | 31 skipped (34)`, exit 1.

The additive claim is proved directly by the implementation. The four regex declarations and the
owning path/text are byte-identical at `7828d220`, `3a579a68`, and `ad44f507`; `kindOf` preserves
the old predicate priority. `duplicateBoundSites` first inserts every r3 physical-line result into
a map with the same line, kind and trimmed text. Unit results are inserted only when their
`line:kind` address is absent, so they cannot overwrite an r3 result; the final numeric line sort
cannot remove one. Every old result therefore remains present, while E1-E3 and the brace control
are additions.

The filed refutation evidence matches the report:

- m1: exactly the four layout controls fail, `4 failed | 32 passed (36)`;
- m2: both real-tree assertions and the negative control fail, `3 failed | 33 passed (36)`;
- m3: the neighbour survives, `36 passed (36)`;
- m4: the real contract-tree plant is reported, `2 failed | 34 passed (36)`;
- m4b: the generated comparator reports `LINE sites: 1` and `UNIT sites: 2`, including the
  planted `DepthAgainSchema` only in the unit results.

df1 constant indirection, df2 arithmetic and df3 hexadecimal spelling are genuine disclosed
predicate/semantic limits. They do not weaken r3, and they are properly carried by F-T1B-3 for a
future V scope decision. df4 is excluded from that acceptance for the reason in B1.

## MERGE, SURFACE, AND STORED GATES

Read-only Git metadata verifies merge base `1c9578a2`, exactly 102 commits in
`386efd39..19bbb4c4`, parents `386efd39` and `19bbb4c4` for merge `7828d220`, filed HEAD
`ad44f5073ea1fd82b28eb00ebdaeb84c5bd4a54d`, tree
`d9566772438572a1968b0ac9d0ca4a0af1a192e6`, and a clean lane worktree. The exact historical
conflict count is CANNOT-ASSESS without a retained merge transcript; the merge object does expose
only the runner import resolution as a combined hunk, and that resolution is correct.

The diff from integration has 11 files, not 10. The eleventh is `.hermes/TOOLING-TRAPS.md` with
19 additions at `ad44f507`; the fix commit itself changes only the S1-1 test. `git diff --check
19bbb4c4..ad44f507` returned no output.

I did not rerun any gate. The stored final-tip records report:

- S1-1 cluster: `36/36` in run 1, run 2 and run 3;
- typecheck: exit 0 with no diagnostics;
- wide run 1: `13 failed / 1431`;
- wide run 2: `14 failed / 1431`;
- wide run 3: `13 failed / 1431`.

Runs 1 and 3 match all 13 names in `ci-known-red-mission-seed.txt`; run 2 adds only the named
obs-L2 test. This supports the stated worst-run verdict `14 failed / 1431`.

F-T1B-2 is a valid existing non-blocking ticket: the exact `:112` expectation at test line 460
will fail loudly on a line insertion, so it is current churn risk rather than a silent expiry.
Fix it when the contract file next moves, before accepting that lane. The worker self-report
plainly says `systematic-debugging` was not loaded; skill-tool telemetry is not present, so only
the honesty of that disclosure, not the historical invocation fact, is statically assessable.

## NOT VERIFIED

- Per packet law, I ran no tests, builds, installs, typechecks, mutation campaigns, provider calls,
  or mutating Git commands. Dynamic results above are readings of stored logs.
- The two unretained members of the claimed six wide-suite runs and the exact historical conflict
  count are CANNOT-ASSESS.
- I did not assess a TypeScript-parser dependency or design the rework implementation. B1 requires
  a discriminating RED-first input and retention of the measured false-positive control, not a
  prescribed parser architecture.

## PREDICTIONS

Another lens may approve because E1-E3 are green and treat every disclosed defeat as an accepted
limitation; the first falsifier is to compare the one-line and wrapped `isDepthField(v) && v <= 5`
forms and observe that whitespace alone toggles the result. A merge-evidence lens may accept the
two symmetric sorted-line equalities as semantics; moving an unchanged added line into another
repeated declaration is the counterexample to that proof method, while the actual merge survives
position-aware inspection. A suite-count lens may either call all 14 failures lane-owned or all
extras pre-existing; the retained artifacts support neither categorical claim, only the honest
worst-run count and load-sensitive suspicion.
