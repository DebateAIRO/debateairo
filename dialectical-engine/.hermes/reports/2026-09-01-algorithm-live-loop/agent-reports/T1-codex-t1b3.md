CODEX REVIEW T1B 3 — CHANGES · comments read through: t1b3-2026-09-03

# T1B codex static review 3 — final worker round

## VERDICT

**CHANGES — 1 blocking and 1 non-blocking finding (2 total). There is no worker round 4.**

The lane-tip rework closes `T1B2-CODEX-B1`: the exclusive-`6` arm now uses a
layout-independent conjunct unit, the boundary applies at any bracket depth, the two manifestations
have valid RED/GREEN pairs, the retained page-shaped negative exists in both orders, and `df5` is
caught. `T1B2-CODEX-N1` also closes: the assembly record now reads resolved object IDs and says
plainly that it proves two files and does not prove the runner.

The lane is nevertheless **not fit to merge into integration `58c4715e`**. F-T1B-6 measured only
the intersection of paths changed by the lane and paths changed by incoming integration. It missed
an integration-only path that the repo-wide oracle reads:
`packages/register/src/algorithm-policy.ts:257` adds `maxDepth: 5`. That line is a second literal
depth ceiling under T1's frozen predicate and J6's repo-wide single-source ruling. A catch-up would
therefore carry a known violation into the oracle; the hazard was not absent. Because this is the
last authorized worker round, the blocker is supplied below as a V DECISIONS PACKET row rather
than as a fourth rework request.

Answers to the dispatched questions:

1. **B1 is closed at the lane tip, including nested bracket depth.** The boundary at
   `s1-1-depth-contract.test.ts:445-446` has no `bracketDepth === startDepth` guard, and the
   exclusive arm runs over `declarationUnits(source, true)` at `:478`. The literal proposition
   “nothing r3 caught narrowed” is false: the r3 full `kindOf` line pass is no longer the operative
   line pass. Its manufactured same-line pairing of an unrelated `> 6` with another conjunct's
   `depth` is deliberately removed and explicitly asserted at `:681-685`. That is a correction of
   a false positive, not a lost genuine bound manifestation; the four r3 regexes remain unchanged.
2. **The m10 reframing is accurate, and fixture-pinning is acceptable here.** m10 kills exactly the
   planted nested-condition control and records `Tests  1 failed | 45 passed (46)`. It does not
   prove real-code reach. m8 and m6 each record `Tests  7 failed | 39 passed (46)`, including both
   shipped-tree assertions; m4 records `Tests  2 failed | 44 passed (46)` against an actual planted
   shipped-source mutation. A lexer boundary intended to guard future legal formatting may be
   pinned by a discriminating fixture; the whole-tree assertions separately prove that the oracle
   bites on shipped source.
3. **Yes.** The assembly script is now honest about both its positive and negative conclusions.
   Every supplied revision is resolved with `git rev-parse --verify "$1^{commit}"`; subsequent
   content reads use only the resolved IDs. The mission ref appears only in the comment describing
   the old defect. The record ends exactly
   `SUMMARY: 2 file(s) PROVEN by assembly; 1 file(s) NOT-APPLICABLE (inspection only, no proof claimed).`
4. **No. The merge-after-approval ruling is wrong on its stated premise.** Deferring an ordinary
   catch-up until after lane review is procedurally reasonable, but F-T1B-6's hazard analysis is
   incomplete and its “no depth-bearing line collides” conclusion is false at the semantic level.
   The incoming register literal is not a textual overlap, yet it violates the invariant the lane's
   whole-tree test enforces.
5. **Not fit to merge.** V must reconcile T17B's sealed `maxDepth` row with T1/J6's single source,
   then the integrated result needs its post-merge verification. No fourth T1B worker round is
   authorized or requested.

## FINDINGS

### B1 — BLOCKING · F-T1B-6 / T1B3-CODEX-B1 · the drift check misses an incoming second depth source

**WHAT.** Integration `58c4715e` contains this incoming shipped-code declaration:

```ts
// packages/register/src/algorithm-policy.ts:257 @ 58c4715e
maxDepth: 5
```

Commit `4bbb13e5` added it after the lane's merged integration base `19bbb4c4`. The lane did not
change `packages/register/src/algorithm-policy.ts`, so the drift script never examines it.

**WHERE.** `logs/t01/t1b-scripts/integration-drift.sh:21-26` iterates only
`git diff --name-only "$A" "$TIP"`, then asks which of those lane paths incoming commits also
touched. The omitted incoming site is
`58c4715e:dialectical-engine/packages/register/src/algorithm-policy.ts:257`. The consuming oracle
is `tests/unit/s1-1-depth-contract.test.ts:252-255,476-478,482-523`.

**WHY.** `SHIPPED_ROOTS` includes `packages`. On `maxDepth: 5`, `MENTIONS_A_DEPTH` and `BARE_FIVE`
both match in the line and declaration windows. The owner filter exempts only the exact
`packages/contract/src/index.ts` declaration. Static source tracing therefore establishes a
second `DEPTH_BOUND_LITERAL` after catch-up, contrary to both whole-tree assertions and J6's
repo-wide “No second literal 5” ruling. The exact post-merge dynamic failure count is
**CANNOT-ASSESS** under this review's static-only law, but the invariant violation itself is
deterministic and does not require a test run.

The ruling's two reported overlap facts remain true: incoming integration touched
`apps/runner/src/index.ts` and `packages/budget/src/index.ts` without changing a line containing
`depth`. They are insufficient because a repo-wide invariant must also be evaluated over
integration-only changed paths inside the oracle's read roots.

**DISPOSITION.** Do not send this back as T1B rework 3. Route the row below to V. The likely
resolution is either to preserve J6 by deriving the sealed register seed from
`EXPANSION_DEPTH_MAX` (including whatever dependency/audit reconciliation that requires), or to
explicitly supersede/narrow J6 and the oracle for this register value. After the ruling is
implemented in integration, verify the merged tree, including the T1 cluster, typecheck, and D15
batch suite.

### N1 — NON-BLOCKING · T1B3-CODEX-N1 · one retained comment still describes the retired line window

**WHERE.** `tests/unit/s1-1-depth-contract.test.ts:607-615`.

**WHAT/WHY.** The negative-control comment still says, “This is what makes the exclusive-`6` arm
line-scoped.” The implementation and the report correctly make it conjunct-scoped. The stale
sentence directly contradicts the reason for this rework but cannot change runtime behavior.

**SUGGESTED FIX.** During the authorized integration resolution, replace “line-scoped” with
“conjunct-scoped” and point to `kindOfExclusiveBound`/the conjunct pass rather than
`kindOfCeilingLiteral`. This is cleanup, not grounds for another worker round.

## B1 CLOSURE AT `d4a3eae9`

The implementation is the principled middle requested in review 2:

- `kindOfCeilingLiteral` owns bare `5` and the whole-domain arm over line and declaration windows.
- `kindOfExclusiveBound` owns exclusive `6` over conjunct windows.
- `declarationUnits(source, true)` recognizes `&&`, `||`, and `??` without a bracket-depth
  condition, outside its existing comment/string handling.
- The `page.tsx`-shaped negative remains in both conjunct orders at `:616-635`; m8's seven victims
  include those two controls, the nested control, both collapsed assertions, and both real-tree
  assertions.

The paired stored records are correctly revision-bound:

- split comparison: RED at `42360f81`, `Tests  1 failed | 44 skipped (45)`; GREEN at `d4a3eae9`,
  `Tests  1 passed | 45 skipped (46)`;
- collapsed negative: RED at `42360f81`, `Tests  1 failed | 44 skipped (45)`; GREEN at
  `d4a3eae9`, `Tests  1 passed | 45 skipped (46)`;
- combined RED: `Tests  3 failed | 2 passed | 40 skipped (45)`; combined GREEN:
  `Tests  6 passed | 40 skipped (46)`.

The combined RED isolates layout: the same-comparison one-line form and the form split after a
logical operator pass, while the comparison split after `<` fails; the collapsed negative and its
r3-narrowing assertion fail for the inverse direction. The `df5` shipped-oracle probe at the filed
tip records `Tests  1 passed | 45 skipped (46)`, `EXIT = 0`, and `HASHES MATCH`.

## ASSEMBLY, RECORDS, AND PACKET REVIEW

The corrected assembly log passes full 40-hex revisions to the script, prints the actual merge
parents, reconstructs and hash-matches `packages/contract/src/index.ts` and
`tools/orphan-audit/src/index.ts`, and labels `apps/runner/src/index.ts` NOT-APPLICABLE beneath the
literal heading `THE LINES BELOW ARE AN INSPECTION AID, NOT A PROOF:`. The displayed runner import
region retains both T1's contract import and integration's extended kernel import. This establishes
the conflict resolution, not whole-file runner assembly; the script now says exactly that.

Read-only Git metadata shows a clean `lane/t1` at
`d4a3eae9bdba4e846d824c3582479a441d54a97b`. The reviewed `42360f81..d4a3eae9` delta changes only
`tests/unit/s1-1-depth-contract.test.ts`. The three stored cluster logs each contain
`Tests  46 passed (46)` and `EXIT = 0`. The stored typecheck contains `EXIT = 0`; the cite-check
contains `TOTAL 14  unique=14  problems=0`. Each filed-tip wide record contains
`Tests  13 failed | 1428 passed (1441)`, with the recorded known-red classification. I did not
rerun any dynamic gate.

The record headers I inspected bind filed-tip GREEN/gate/mutant/defeat/assembly/drift artifacts to
`d4a3eae9`; the r0, r1, and r2 RED records bind respectively to `7828d220`, `ad44f507`, and
`42360f81`, all ancestors of the filed tip. The worker report's “fourteen groups” predates the
drift record; the packet's fifteenth group is that new `t1b-integration-drift.log` and its header
also stamps `d4a3eae9`.

The review packet correctly pins the lane and reviewed tips, writable surfaces, static-only law,
and last-round routing. Its F-T1B-6 ruling embeds the incomplete overlap-only hazard analysis;
that is finding B1, not a separate packet ticket.

## V DECISIONS PACKET RESIDUE — ROW READY

| residue | severity | law / impact | evidence | decision required |
|---|---|---|---|---|
| `V-T1B3-1` (`F-T1B-6`, `T1B3-CODEX-B1`) | BLOCKING | Catching up to `58c4715e` carries a second shipped-code literal depth ceiling, so T1/J6's repo-wide single-source invariant is false and the T1 whole-tree oracle cannot remain green | `integration-drift.sh:21-26` checks only lane-changed paths; `4bbb13e5` adds `packages/register/src/algorithm-policy.ts:257` `maxDepth: 5`; the oracle scans `packages` and exempts only the exact contract owner | Preserve J6 by deriving the sealed register seed from the contract owner and reconcile dependencies/audits, or explicitly supersede/narrow J6 for the sealed register value; then verify the integrated tree |

## NOT VERIFIED

- Per packet law, I ran no tests, builds, installs, typechecks, mutation campaigns, provider calls,
  merge simulations that write objects, or mutating Git commands. Dynamic results above are
  readings of stored records.
- The exact post-resolution merge result, its test counts, and the D15 batch suite are
  CANNOT-ASSESS until V selects and integration implements the cross-lane resolution.
- Assessment of drift is pinned to the packet's named integration commit `58c4715e`; any later
  integration tip requires the same full-invariant check over its complete incoming tree.

## PREDICTIONS

Another lens may approve because the two textually overlapping files contain no changed line with
`depth`. The first falsifier is the integration-only register path: the drift loop cannot print a
file the lane never changed, while the oracle deliberately scans it. A T17-focused lens may call
`maxDepth: 5` sealed data rather than a source, but J6's invariant is explicitly repo-wide and the
committed detector classifies that exact property/value line. A mutation-focused lens may overstate
m10 as real-code proof; its transcript names exactly one failed assertion, the planted nested
condition, which is sufficient for the boundary rule but not evidence of a current shipped victim.
