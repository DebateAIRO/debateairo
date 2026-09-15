CODEX REVIEW T1B 2 — CHANGES · comments read through: t1b2-2026-09-03

# T1B codex static review 2

## VERDICT

**CHANGES — 1 blocking and 1 non-blocking finding (2 total).** The rework closes the exact
wrapped-`5` finding I filed, and it does so additively: the r3 line scan is retained unchanged,
while the declaration scan now catches both wrapped conjunct orders. The claimed semantic
separation is only half implemented, however. The evidence correctly rules out a
declaration-wide window for the exclusive-`6` arm; it does not justify retaining the physical
line as that arm's window. A comparison/conjunct is the principled middle window, and the filed
df5 proves that the shipped oracle still changes its answer when only a newline is inserted inside
one comparison. The retained page-shaped negative control has the inverse defect: joining its
lines makes the old line pass manufacture the false site the control says must not exist.

Answers to the five dispatched questions:

1. **The `5`/`6` distinction is principled; the chosen `6` window is not.** A bare `5` or the
   enumerated domain can retain the frozen declaration-wide treatment, while an exclusive `6`
   must stay associated with its own comparison. But “comparison-local” does not mean
   “physical-line-local.” m6 disproves only the over-wide declaration window. It does not prove
   the under-wide line window.
2. **Yes for the filed wrapped conjunct, and no r3 hit is narrowed.** Both wrapped `5` orders now
   resolve, the one-line control remains green, and the unchanged r3 line pass makes the result
   set monotone with respect to r3. This does not complete T1B because the `6` arm remains
   layout-dependent.
3. **df5 is B1 again in a smaller costume, not an acceptable scoped limit.** It needs a different
   candidate unit for the already-frozen predicate, not a new product predicate. The same defect
   also appears in reverse when the page-shaped negative expression is collapsed to one line.
4. **The actual two-file assembly conclusion is sound, but the filed proof script is not
   revision-pinned; N1 corrects that evidence defect.** The third file is honestly marked
   NOT-APPLICABLE, and its conflict resolution is correct, but the printed conflict lines are not
   a whole-file assembly proof.
5. **Not fit to merge.** Close B1 within the oracle's unit boundary only; do not change frozen T1
   product code or the four r3 regexes. Correct N1 when the rework evidence is refiled.

## FINDINGS

### B1 — BLOCKING · T1B2-CODEX-B1 · the exclusive-`6` arm is still layout-dependent

Ticket: **T1B2-CODEX-B1**. Fix before merge in T1B rework round 2. Keep T1's product, the four
r3 regexes, and r3's `kindOf` frozen. Give the exclusive-`6` arm a layout-independent
comparison/conjunct unit, retain the real `page.tsx` negative control, and add RED-first paired
controls for both manifestations below.

Files/evidence: `tests/unit/s1-1-depth-contract.test.ts:252-255,273-304,437-450,578-607`,
`logs/t01/t1b-defeat/df5-six-split-from-its-operator.log`, and
`logs/t01/t1b-mutants/m6-widen-six-arm-window.log`.

The first manifestation is the disclosed df5:

```ts
if (depth < 6) stop();

if (depth <
  6) stop();
```

On one line, `kindOf` sees both `/depth/i` and the unchanged `<\s*6` arm. After the newline,
neither physical line has both facts, and the declaration pass deliberately calls
`kindOfCeilingLiteral`, which excludes `6`. The worker's shipped-oracle transcript confirms the
miss at the filed tip: `1 failed | 39 skipped (40)`. Normalizing whitespace across this single
comparison would let the existing regex recognize it; no predicate expansion, symbol resolution,
constant folding, or product change is required. This is therefore inside the unit-only ticket.

The second manifestation is the inverse metamorphic failure in the retained negative fixture:

```ts
const ready = topic.trim().length > 6 &&
  depth >= EXPANSION_DEPTH_MIN &&
  depth <= EXPANSION_DEPTH_MAX;
```

The fixture is green only because `> 6` and `depth` occupy different physical lines. Collapse the
same declaration to one line and the retained r3 line pass calls `kindOf` on text containing both
`depth` and `> 6`, so it reports `DEPTH_BOUND_LITERAL`. The unit pass cannot undo that result.
Thus layout alone toggles a correct negative into the exact manufactured pairing m6 demonstrates.
Testing both operand orders does not test this axis because both filed orders retain the newline.

m6 is good refutation of the declaration-wide alternative: it produces exactly four failures —
the two planted negatives plus the two shipped-tree assertions after `page.tsx:73` becomes a
reported site. The inference drawn from it is too broad. There is a third choice between a line
and a declaration: for this arm, scan a comparison/conjunct across whitespace and stop at the
logical boundary. That preserves the association between `6` and its own depth comparison,
catches df5, and does not join the page's unrelated topic-length conjunct to the depth conjunct.

### N1 — NON-BLOCKING · T1B2-CODEX-N1 · the assembly script names an immutable input but reads a mutable ref

Ticket: **T1B2-CODEX-N1**. When T1B is refiled, before the assembly record is accepted or the
script is reused, replace every `mission/2026-09-01-algorithm-live-loop:<path>` read with the
recorded immutable integration commit `19bbb4c4:<path>` (or a checked argument), print the resolved
object ID, and keep the runner explicitly outside the two-file proof.

Files/evidence: `logs/t01/t1b-scripts/merge-assembly-proof.sh` and
`logs/t01/t1b-merge-assembly-proof.log`.

The log says `integration=19bbb4c4`, but that label is hard-coded. The script actually reconstructs
from `git show mission/2026-09-01-algorithm-live-loop:<path>`. The proof ran at 02:01:53 EEST;
the branch reflog shows that mutable ref had already advanced from `19bbb4c4` to `152ed7ed` at
01:30:02. A proof cannot silently read one revision while naming another.

This does not overturn the current two-file result. The contract and orphan-audit blobs are
byte-identical at `19bbb4c4` and `152ed7ed`, the context-bearing base-to-lane changes reproduce at
the merge, and the logged SHA-256 values match the merged blobs:

- `packages/contract/src/index.ts` —
  `f452279d5a98ce721ced771f3b622202c24288ad4a89ec6ada1f4ca392ce9b30`;
- `tools/orphan-audit/src/index.ts` —
  `2a3335cdc0a0aca85a46174302b08b668bfba671c608c741a21d2f461b8d1193`.

The runner treatment is honest in scope. It is printed as NOT-APPLICABLE rather than PROVEN, and
the merge's combined diff confirms that the resolution keeps T1's contract import plus
integration's extended kernel import. The later `152ed7ed` runner blob differs elsewhere from
`19bbb4c4`, although the printed kernel import line is identical; printing that one conflict line
validates the hand resolution, not the entire runner file. The report does not claim otherwise.

## RED/GREEN, REFUTATION, AND STORED GATES

The r3 body remains intact. SHA-256 over worker-report lines 3-437 is
`b7c8c7f5b1ff125b1aa7b8778301d9f167737dc13e0798752e14287f18879e7d`.

The combined RED record stamps parent `ad44f507` with the new test file dirty and reports
`2 failed | 1 passed | 37 skipped (40)`: both wrapped orders fail while the one-line expression
passes. The per-order RED frames report `1 failed | 1 passed | 38 skipped (40)`; the extra pass is
the matching negative-control order selected by the filter. The one-line-only parent frame reports
`1 passed | 39 skipped (40)`. At `42360f81`, each wrapped-order filter reports
`2 passed | 38 skipped (40)`, and the one-line-only frame reports
`1 passed | 39 skipped (40)`. This is valid RED/GREEN evidence for the exact `5`-arm finding.

The implementation is additive relative to r3. `source.split("\n")` still calls the byte-unchanged
`kindOf` first and inserts every old `line:kind` result. The declaration pass adds results only
when that address is absent. The four r3 regexes are unchanged. No old result can be removed or
overwritten.

The refutation records support the worker's stated counts:

- m5: exactly the two wrapped orders fail; the same one-line form stays green —
  `2 failed | 38 passed (40)`;
- m6: both negative controls and both shipped-tree assertions fail —
  `4 failed | 36 passed (40)`;
- m1: the four original layout controls plus both wrapped orders fail —
  `6 failed | 34 passed (40)`;
- m4: the real multiline duplicate makes both shipped-tree assertions fail —
  `2 failed | 38 passed (40)`;
- m3: the neighbour survives — `40 passed (40)`.

All six wide-suite records now exist. At `ad44f507` they report, respectively,
`13 failed | 1418 passed (1431)`, `14 failed | 1417 passed (1431)`, and
`13 failed | 1418 passed (1431)`. At `42360f81` all three report
`13 failed | 1422 passed (1435)`. The worst retained run is therefore exactly
`14 failed | 1417 passed (1431)`. The registration RSS history and both ownership attributions
remain CANNOT-ASSESS from retained evidence and are now explicitly withdrawn rather than asserted.

The three final cluster logs each report `40 passed (40)`, so the stored result is 40 passed / 40
total in 3/3. The typecheck log is silent apart from `EXIT = 0`, supporting the reported 0 errors.
I did not rerun either command.

## MERGE AND SURFACE

Read-only Git metadata confirms clean branch `lane/t1` at
`42360f81b04234ef76f6a703256ababf7e9d7748`, parent `ad44f507`, and tree
`465710063ea2541a93cf687d0ab755d67cdbfa84`. The rework commit changes only
`tests/unit/s1-1-depth-contract.test.ts`; T1 product code is untouched.

The earlier merge `7828d220` has parents `386efd39` and `19bbb4c4`, with merge base
`1c9578a2`. Direct parent/final diffs for contract and orphan-audit preserve T1's changes in the
same declarations atop integration. The runner combined diff preserves both sides of the only
conflicting import line. Subject to N1's evidence-tool correction, the actual assembly remains
sound and the third-file limitation is honestly stated.

## NOT VERIFIED

- Per packet law, I ran no tests, builds, installs, typechecks, mutation campaigns, provider calls,
  or mutating Git commands. Dynamic results above are readings of stored records.
- Registration-RSS behavior and causal ownership of either wide-suite extra are CANNOT-ASSESS;
  the worker correctly withdrew those claims.
- The runner's entire merged blob is not proven by the assembly script. Only its conflict
  resolution is established by the four printed versions and the combined diff.

## PREDICTIONS

Another lens may accept df5 because the worker labels comparison binding a predicate change. The
first falsifier is that the frozen `<\s*6` regex already accepts a newline once the candidate unit
spans the comparison; only the supplied text window must change. A fixture-focused lens may see
m6 and conclude line scope is the only alternative to declaration scope; collapsing the existing
page-shaped negative fixture to one line immediately refutes that conclusion. An evidence lens may
accept the assembly log's printed `integration=19bbb4c4`; the branch reflog and the script's
`git show mission/...` call show that the run actually read `152ed7ed`.
