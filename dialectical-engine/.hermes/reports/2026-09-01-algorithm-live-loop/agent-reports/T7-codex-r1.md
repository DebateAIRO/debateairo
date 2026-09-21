CODEX REVIEW T7 r1 — CHANGES · comments read through: t07-r1-2026-09-01

# T7 codex peer review r1

## VERDICT

**REWORK / CHANGES.** Finding count: **5** — **B1-B2 blocking**, **N1-N3
non-blocking but mandatory**. This is codex round r1; the J15 ruling consumed worker
rework 1/3, so the next worker pass is rework 2/3, not an unlawful round 4.

The exact dyadic arithmetic, J3 root-scoped discriminator, derived boundary indices,
zero-edge refusal, sealed-row wiring, M8 pin, canonical mark mint, D16 pairs, and static
ledger path all check. Approval is blocked because the live caller can stop on only a
subset of the roots, and because the root-major global boundary makes epsilon freezing
retroactive/no-op for every earlier root while publishing a mark that says the branch was
not expanded.

## FINDINGS

### B1 — the live caller filters away an unscored root before the loud guard can reject it

**Files/lines:** `dialectical-engine/apps/runner/src/index.ts:2583-2597`, especially
`:2589-2596`; `dialectical-engine/packages/propagation/src/index.ts:841-867`.

**Concrete failure:** M=2, depth>=3. Root 0 and its measured branches obtain judged
standing; every review under root 1 takes the already-supported HALTED path, so root 1 and
its subtree have no judged basis. At the round-2 boundary, root 0 is stable within delta
and at least one root-0 edge is MEASURED. The caller constructs `rootNodeIds` by retaining
only roots present in `scoredNodeIds`, producing `[root0]`; it refuses only
`rootNodeIds.length === 0`. `decideRoundContinuation` therefore sees one stable root and a
positive measured-edge count and returns `STOP / GLOBAL_DELTA_CONVERGED`. Root 1 was never
compared at all, so the claimed predicate "no root moved > delta" is unproved.

**Why the existing guard does not save it:** `rootMovement` correctly throws
`STOPPING_ROOT_STRENGTH_UNRESOLVED` when a supplied root is missing. The live caller removes
that root before the call, bypassing the guard. The unit test at
`tests/unit/t07-adaptive-stopping.test.ts:359-368` proves the callee, not this caller seam.

**Required correction:** preserve the authoritative maker-root scope and refuse delta
convergence unless all expected roots have strengths in both compared rounds. Pin the live
caller with a partial-standing M=2 fixture whose surviving root is stable and measured;
the correct outcome must not be `GLOBAL_DELTA_CONVERGED`.

### B2 — the late global boundary makes earlier-root freezes retroactive and their honesty marks false

**Files/lines:** `dialectical-engine/apps/runner/src/index.ts:1182-1237`, `:1295-1319`,
`:2567-2628`, `:2633-2685`; worker report `t07-stopping.md:183-193`.

**Concrete failure:** M=2, depth=2. The derived round-1 boundary is correctly index 7, but
root 0's round-1 carrying nodes have already had every depth-2 descendant authored at legs
2-5. A freeze decided at index 7 adds those indices to `frozenIndices` only after their
model calls occurred; the loop consults that set only on future iterations. Thus the
freeze prevents no expansion under either root-0 branch. Only root 1's remaining legs can
be skipped.

Independent enumeration output, with no product import:

```text
boundary(round=1)=7
root=0 carrying=2 authored-descendant-legs=[2,3] future-descendant-legs=[]
root=0 carrying=3 authored-descendant-legs=[4,5] future-descendant-legs=[]
root=1 carrying=8 authored-descendant-legs=[] future-descendant-legs=[8,9]
root=1 carrying=9 authored-descendant-legs=[] future-descendant-legs=[10,11]
```

The persisted record compounds the failure. `runAdaptiveStoppingRound` always passes
`frozenSubtreeNodeIds: [decision.carryingNodeId]`, while its reason says "nothing was
expanded beneath it"; UI and web render "Branch not expanded". For root 0 above, descendants
already exist and are omitted from `affectedNodeIds`. The mark is therefore factually
false as well as the freeze being ineffective.

**F-T7-8 result:** its delta analysis is right, but its statement that "the epsilon freeze
is unaffected" is false. The same root-major lateness affects epsilon for every root before
the last. J15 ADDENDUM's disposition may remain V's choice; the analysis cannot.

**Required correction:** this is an authority/architecture seam, not a local comparison
fix. Either permit a round-major plan or establish an epsilon evaluation point before each
root proceeds beneath the current-round carrying branches. The integrated proof must show
zero descendant author calls after a low-leverage branch is eligible to freeze, for an
earlier root as well as the last root, and the persisted affected-node/reason fields must
match what actually happened. If J15(a)'s "exactly there" forbids both lawful remedies,
route the contradiction to a V DECISIONS PACKET rather than preserving the false analysis.

### N1 — numeric case (c) is arithmetically exact but its "only the floor" arm is not a lawful J15(c) live state

**Files/lines:** worker report `t07-stopping.md:117-119`;
`tests/unit/t07-adaptive-stopping.test.ts:372-413`;
`dialectical-engine/apps/runner/src/index.ts:2574,2616,2622`.

Movement is exactly zero in both synthetic calls. However the `completedRounds: 1` STOP
arm supplies non-null `previousStrengths`. J15(c) says the pre-expansion baseline is not a
round, and the live caller necessarily holds `previousRoundStrengths === null` at the
round-1 boundary; that state returns `CONTINUE / NO_PREVIOUS_ROUND`, as the next test itself
asserts. The report's claim that only the floor separates the two outcomes is therefore
not a live-state proof. Correct the wording and add the lawful three-state sequence:
round 0 floor, round 1 no previous round, round 2 zero movement with measured evidence can
converge.

### N2 — packet commit count is false

**File/line:** `packets/t07-codex-r1.md:12` says five commits. Fresh read-only evidence:

```text
$ git rev-list --count 7433be7..HEAD
6
```

The six commits are `1b08f7f`, `940a36d`, `0a7396d`, `e48e2b5`, `6132589`, and
`89565aa`. Correct the orchestrator packet metadata and route this as a packet finding.

### N3 — the packet's mandatory goal-prompt reference does not resolve from the seat cwd

**File/line:** `packets/t07-codex-r1.md:18` names only `goal-prompt.md`. There is no such
path in the assigned lane cwd or current mission directory. The actual artifact is
`.../.hermes/reports/2026-08-31-algorithm-correctness/goal-prompt.md`. Give the absolute path
as the packet does for its other mandatory artifacts; repository search should not be part
of reviewing quoted lines 28-40.

## INDEPENDENT NUMERIC RECOMPUTATION

Published arithmetic is `agg(values) = 1 - product(1-value)` and, with support greater
than attack, `sigma(tau,a,s) = tau + (1-tau)(s-a)`. Every value below is dyadic and exactly
representable.

| case | independent derivation | result |
|---|---|---|
| (a), converged | prior support `1/2 * 1/2 = 1/4`, so root=`1/2 + (1/2)(1/4)=5/8`; add whisper `1/64 * 1/2=1/128`; aggregate support `1-(3/4)(127/128)=131/512`; root=`1/2+(1/2)(131/512)=643/1024` | movement `643/1024-640/1024=3/1024=0.0029296875 < 0.01`, STOP before ceiling |
| (a), discriminator | add loud contribution `1/4 * 1/2=1/8`; aggregate support `1-(3/4)(7/8)=11/32`; root=`43/64` | movement `43/64-40/64=3/64=0.046875`; equality at delta stops because the moved predicate is strict `>` |
| (b), J3 | removing heavy removes root support `1/4`, moving root `5/8 -> 1/2`; removing light moves mid `5/8 -> 1/2`, but mid->root is UNKNOWN | all-node leverage is `1/8` for both; root-scoped leverage is heavy `1/8`, light `0`; the all-node reading cannot discriminate |
| (c), floor | identical strength sets give exact movement `0` | the pure gate returns FLOOR at count 0; see N1 for the lawful J15(c) count-1 state |
| (d), epsilon | heavy leverage `1/8` and epsilon `1/8` | `1/8 < 1/8` is false, so CONTINUES; epsilon `0.126` freezes |

The reported decimals `0.625`, `0.6279296875`, `0.046875`, and `0.125` therefore match
the exact fractions `5/8`, `643/1024`, `3/64`, and `1/8`.

## DERIVED ROUND BOUNDARIES

For branching factor 2, one root contributes `L = 2^(depth+1)-2` legs. In the root-major
plan, the last occurrence of round k is
`(M-1)L + 2^(k+1)-3`. Independent output:

```text
M=2,depth=2,legs=12,boundaries=[7,11 ]
M=2,depth=3,legs=28,boundaries=[15,19,27 ]
M=3,depth=2,legs=18,boundaries=[13,17 ]
M=4,depth=5,legs=248,boundaries=[187,191,199,215,247 ]
```

`deriveGlobalRoundCompletions` implements the same last-occurrence law. The M6 log returns
the same typed error payload as the r1 trace, while the complete failure blocks naturally
differ at shifted source lines:

```text
typed_payload_diff_exit=0
failure_block_diff_exit=1
```

The stored r2 integration logs show the depth-2 fixture itself green in all three runs;
its source asserts boundary keys `STOPPING:round:1`, `STOPPING:round:2`, action-kind set
`{PROPAGATION}`, and stopping-site `MODEL_CALL` count `"0"`.

## J15(b), M8, SEALED ROWS, MARKS, AND D16

- `countMeasuredEdges` requires both `magnitudeStatus === "MEASURED"` and non-null strength.
  At count 0, stable roots return `CONTINUE / NO_MEASURED_EDGE`; the same strength sets with
  count 1 return `STOP / GLOBAL_DELTA_CONVERGED`. The all-UNKNOWN fixture gives leverage 0
  for both branches, so both freeze with marks and the plan exhausts without fake delta
  convergence.
- Commit `89565aa` adds the previously missing measured-but-null case. The stored first M8
  run is 30/30 green (the gap survived); the recheck after the pin fails exactly one test,
  `expected 1 to be +0`. The disclosure is accurate: gap, not neighbour.
- `BRANCH-FROZEN-LOW-LEVERAGE` is minted beside `LEVERAGE_UNRESOLVED`, not appended. The
  tail remains `HIDDEN-UNJUDGEABLE`, `DERIVED-STANDING-UNREVIEWED`, `HIDDEN-LOW-SCORE`,
  `UNAUTHORED-BRANCH-HALTED`. B2 concerns the truth of live records, not vocabulary minting.
- Delta and epsilon are read by `readAdaptiveStoppingControls` and handed whole into the
  acceptance runner. A zero-context diff scan found no product literal `0.02` or `0.01`
  introduced under apps/packages/acceptance, and no T16 register source was changed.
- D16 evidence is set-equal: UI base/tip each report only
  `apps/ui/app/layout.tsx(3,8): TS2882`; web base/tip each report only
  `web/app/layout.tsx(3,8): TS2882`. New failures: 0/0.

## STATIC EVIDENCE AND LIMITS

Fresh metadata checks: base `7433be75ef2da9ccca452c067fdac4cded07dece`, tip
`89565aa100930bc52afd051416830f9fcb401221`, 14 files, +1536/-51. The worker report's
`tail -n +3 | shasum -a 256` is exactly
`81474fe36182641318a00e4c38730fdcc0c1923a5a7867f1acf3ad68890e1939`.

Per packet, I ran no tests, builds, mutation, database, or provider calls and made no
product or git changes. I independently recomputed the arithmetic and plan timing, read
the diff and stored logs, and used read-only metadata commands. I did not independently
query a live depth-2 database; the ledger-row claim is statically supported by the live
source, fixture assertions, and three stored passing fixture lines, not a reviewer-owned
runtime. Full-suite status remains D15-deferred. Stored logs report zone 197/197 three
times and integration 65/66 three times with the sole failure set-equal to the base
`claims, judges through the HTTP gateway, propagates, serves, and settles` failure.

## PREDICTIONS

Other lenses will likely approve the exact fractions and catch the packet's five-versus-six
commit count, but miss B1 because the callee's missing-root unit test looks protective and
miss B2 because the returned freeze decisions and canonical marks are locally green. I
expect at least one lens to repeat F-T7-8's "epsilon unaffected" claim without enumerating
which descendant legs precede the boundary. The first checks I would compare are whether
another lens demanded `rootNodeIds.length === effectiveMakerCount` before convergence and
whether it traced an earlier root's round-1 freeze through legs 2-5 rather than stopping at
the boundary map.
