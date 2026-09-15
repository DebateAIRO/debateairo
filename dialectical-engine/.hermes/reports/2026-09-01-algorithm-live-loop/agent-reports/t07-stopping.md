READY FOR PEER REVIEW — T7 merge · comments read through: t7b-codex-2026-09-02
report sha256: 0689ef4fb399d39c45f2f50d1e1b8df2dfecc9b012ddbacdac7c8a11b67fc0b2

# T7 STOPPING r2

Seat T7 · PROGRAMMING loop · Opus 5 · session `opus-t07-w5` · base `7433be7` ·
worktree `.worktrees/lane-t7` · branch `lane/t7` · never pushed, never merged.
Rework rounds spent: 1 of 3.

**Headline.** Ruling J15 answered both of r1's blocking findings and this round
lands them. The global round boundary is now DERIVED from the root-major plan
(J15(a)) and the loop is wired to it — the depth-2 two-maker fixture that r1's
naive hook broke is GREEN again, with the four numeric cases unchanged. A δ stop
taken over zero measured edges is now REFUSED (J15(b)), and the degenerate
all-UNKNOWN debate ends by marked-freeze exhaustion instead of fake convergence.
`NO_PREVIOUS_ROUND` is kept and cited per J15(c). F-T7-4 self-closes with a
behavioural proof, not a source pin alone.

## WHAT CHANGED SINCE r1

| ruling | change | proof |
|---|---|---|
| J15(a) | `deriveGlobalRoundCompletions(plan)` — round k completes at the LAST leg carrying round k, when every root has finished k. The expansion loop evaluates stop/freeze exactly there. | mutant **M6** + fixture back to green |
| J15(b) | `RoundContinuationDecision.measuredEdgeCount`; a stop over ZERO measured edges is refused (`NO_MEASURED_EDGE` continues). | mutant **M7** + the all-UNKNOWN exhaustion test |
| J15(c) | `NO_PREVIOUS_ROUND` kept unchanged, now cited to J15(c) in code and test. | unchanged from r1, re-run green |
| J15(d) | F-T7-4 closed: the depth-2 fixture asserts the boundary's own ledger rows. | `STOPPING:round:1`, `STOPPING:round:2`, zero `MODEL_CALL` |

## RED

**RED (r2)** — `logs/t07/r2-RED-boundary-and-vacuity.log`, written before any
implementation:

```
 Test Files  1 failed (1)
      Tests  16 failed | 14 passed (30)
   → countMeasuredEdges is not a function
   → runner.deriveGlobalRoundCompletions is not a function
```

All sixteen are feature-absence. The r1 RED frames stand unchanged in the log
directory (`red-1.log`: `19 failed | 1 passed (20)`; `red-2-previous-round.log`:
`2 failed | 19 passed (21)`).

## GREEN — J15(a), the derived boundary

For M=2, depth 2 the plan is 12 legs and its round sequence is **root-major**:

```
index:  0  1  2  3  4  5  6  7  8  9 10 11
root:   0  0  0  0  0  0  1  1  1  1  1  1
round:  1  1  2  2  2  2  1  1  2  2  2  2
```

`deriveGlobalRoundCompletions` returns `Map { 7 => 1, 11 => 2 }` — round 1
completes at leg 7 (root 1's second round-1 leg), round 2 at the plan's end.

**The refutation target J15(a) names, pinned as a test.** The naive rule r1
shipped — a boundary wherever `leg.round` changes — fires at `[2, 6, 8]`. Leg 6
is the killer: `legs[5].round === 2` and `legs[6]` is `{ rootIndex: 1, round: 1 }`,
so the naive rule reports "round 2 completed" **while root 1 has authored
nothing**. The derived map contains none of `2`, `6`, `8`.

Generalised over `(M, depth)` ∈ {(2,2), (2,3), (3,2), (4,5)}: the derived
boundaries are exactly rounds `1..depth` in order, no leg of round k sits after
k's boundary, and every one of the M roots has a round-k leg at or before it.

## GREEN — J15(b), a δ stop that cannot be vacuous

`countMeasuredEdges` counts arrows that are `MEASURED` **and** carry a magnitude —
the exact set `computeGraph` is willing to propagate. Counts: `allUnknown` 0,
`roundTwo` 1, `discriminator` 2, and a `MEASURED` edge with a null strength also
**0** (a stamp is not a magnitude — see M8 below).

On an all-UNKNOWN graph (`root:A` 0.5 with one UNKNOWN support and one UNKNOWN
attack; every node sits at its own τ = 0.5), with movement exactly `0` at
`completedRounds 2`:

```
{ kind: "CONTINUE", reason: "NO_MEASURED_EDGE",
  maxRootMovement: 0, movedRootNodeIds: [], measuredEdgeCount: 0 }
```

The same call with `measuredEdgeCount: 1` gives `GLOBAL_DELTA_CONVERGED` — the
refusal is driven by the evidence count, not by the movement.

**And it still terminates, honestly.** On that same graph every branch has zero
root-scoped leverage, so with ε `0.01` the freeze rule returns
`[{b1, 0, FROZEN}, {b2, 0, FROZEN}]`, and through the runner's own boundary:
`continuation.reason === "NO_MEASURED_EDGE"`, `frozenCarryingNodeIds ===
["b1","b2"]`, `conditionMarkRecords === ["BRANCH-FROZEN-LOW-LEVERAGE",
"BRANCH-FROZEN-LOW-LEVERAGE"]`. Expansion ends by **marked** exhaustion. No
loop-forever risk: the ceiling is unconditional and precedes the movement rule.

## GREEN — the four DoD numeric cases, UNCHANGED

Re-run identical to r1; every number below is a dyadic rational asserted with
`toBe`. δ/ε in unit tests are thresholds chosen by the test — the product reads
T16's sealed rows through `readAdaptiveStoppingControls` and carries no constant.
Each decision now additionally carries `measuredEdgeCount` per J15(b).

The graph (τ = 0.5 everywhere): `heavy --0.5 MEASURED--> root:A`;
`mid --UNKNOWN--> root:A`; `light --0.5 MEASURED--> mid`.
Values: `root:A` 0.625, `mid` 0.625, `heavy` 0.5, `light` 0.5.

- **(a) δ stop before the ceiling** — `completedRounds 2`, ceiling 5, δ 0.01:
  `root:A` 0.625 → **0.6279296875**, `root:B` 0.5 → 0.5, maxRootMovement
  **0.0029296875** (3/1024), `measuredEdgeCount` 2 → `STOP /
  GLOBAL_DELTA_CONVERGED`. Discriminator: movement **0.046875** (3/64) →
  `CONTINUE / ROOT_MOVED`, `movedRootNodeIds ["root:A"]`.
  δ boundary: movement exactly 0.046875 with δ exactly 0.046875 → **STOP**
  ("no root moved **>** δ"); δ 0.0468749 → CONTINUE.
- **(b) one branch frozen, sibling continues** — ε 0.01, roots `["root:A"]`:
  `heavy` leverage **0.125** CONTINUES, `light` leverage **0** FROZEN. Under the
  all-nodes reading J3 overrode, both read 0.125 and neither would freeze —
  asserted. `mid` also resolves to 0: its only path to a root is UNKNOWN, so
  UNKNOWN can never unfreeze a branch.
- **(c) round-1 floor** — `completedRounds 0`, movement exactly **0** (inside
  δ 0.01) → `CONTINUE / ROUND_1_FLOOR`; the identical zero at `completedRounds 1`
  → `STOP / GLOBAL_DELTA_CONVERGED`. Only the floor separates them.
- **(d) EQUALITY AT ε CONTINUES** — ε set to exactly `heavy`'s leverage 0.125:
  `0.125 < 0.125` is false → **CONTINUES**; ε 0.126 → FROZEN.

## LEDGER PROOF — zero model calls, now also observed in a real run

`runAdaptiveStoppingRound` takes exactly one dependency, `appendLedger`; its
dependency surface contains **no model client at all**. Unit-observed: the spy
**was called** (positive control), `new Set(actionKinds) === {"PROPAGATION"}`,
`MODEL_CALL` count `[]`, a throwing provider spy never invoked, and three
concurrent invocations set-equal.

**New in r2 — the same claim proved through the database on a real depth-2 run**
(`tests/integration/database.test.ts`, the fixture r1 broke):

```
SELECT call_site_key, action_kind FROM ledger.ledger_entry
 WHERE run_id=$1 AND call_site_key LIKE 'STOPPING:round:%' ORDER BY sequence
→ ["STOPPING:round:1", "STOPPING:round:2"], action kinds = {"PROPAGATION"}
… AND action_kind='MODEL_CALL' → count "0"
```

Two rounds, two boundaries, zero model calls — and the fixture's envelope
(48 attempts, exhausted exactly) is untouched, because the envelope counts only
`MODEL_CALL` (`packages/budget/src/index.ts:237-245`).

## REFIT DRAFT (J2 — the judge executes this at closure; I never edit DECISIONS.md)

Unchanged from r1 except the caveat, which J15(b) has now turned from a warning
into an enforced rule:

```
## <YYYY-MM-DD> · δ/ε REFIT from the first M>=2 acceptance run (T7 closure duty, J2)
SOURCE RUN: run <run_id> / answer <answer_id>, register version <v>, discovered panel M=<m>,
            depth <d>, integration tip <sha>.
OBSERVED (from ledger PROPAGATION rows at call_site_key 'STOPPING:round:%' + the run's
          propagation.sensitivity_record):
  per-round max |dStrength| over ROOT nodes, one row per derived boundary:  <r1>, <r2>, ...
  measuredEdgeCount at each of those boundaries:                            <m1>, <m2>, ...
  root-scoped branch leverage, one row per expanded subtree root:           <l1>, <l2>, ...
FITTED RECOMMENDATION:
  globalStopDelta      = <value>   basis: <e.g. the median inter-round root movement of the
                                   last two rounds, so a round that changes no answer stops>
  branchFreezeEpsilon  = <value>   basis: <e.g. the 25th percentile of observed root-scoped
                                   leverage, so the least influential quartile freezes>
  dispersionScale      = <value>   basis: <observed panel tau-range on that run>   (J2 symmetry)
  disagreementThreshold= <value>   basis: <observed panel tau-spread on that run>  (J2 symmetry)
PROVENANCE: each refitted row is RE-SEALED at a new register version citing THIS ruling id in
            source_ref; the pre-refit values (delta 0.02, epsilon 0.01, #J1) stay on the record
            as dev-provisional, superseded not deleted.
VALIDITY GATE (J15(b), now enforced in code): any boundary whose measuredEdgeCount is 0 is NOT
            a fitting observation — the engine refuses to stop there, and a delta fitted to it
            would be fitted to ignorance. If EVERY boundary of the source run reads 0, the run
            is not a valid fitting basis and the refit waits for one that measured something.
```

## FINDINGS

**CLOSED THIS ROUND** — F-T7-1 (J15(a), boundary derived and wired; the mutant
that restores the naive reading re-breaks the fixture), F-T7-2 (J15(b), vacuous
stops refused), F-T7-3 (J15(c) ratified my reading; cited in code and test),
F-T7-4 (the consumer is live, proved from the ledger in a real run). F-T7-5
accepted as precedent-consistent per J15(d), no action.

**F-T7-8 · NEW, non-blocking · the derived boundary is late in a root-major
plan.** J15(a)'s derivation is correct and I have implemented exactly it, but it
is worth the judge knowing the consequence: because the plan is root-major, "every
root has finished round k" is only true near the END of the plan. For M=2/depth 2
the round-1 boundary is leg 7 of 12 — by which point root 0 has ALREADY expanded
to full depth. So a δ stop can only ever truncate the LAST root's remaining
rounds, not the debate as a whole. The rule is honest and non-truncating (it
never stops early on unmeasured evidence), but its *savings* are much smaller
than the goal's cost note implies ("bounded by the freeze/stop rules keeping N
small"). The ε freeze is unaffected — it is per-branch and applies at every
boundary. If the mission wants the δ stop to bound cost as the goal intends, the
plan has to become round-major, which is the trade J15(a) explicitly declined.
Recorded, not acted on.

**F-T7-9 · NEW, non-blocking · `measuredEdgeCount` is graph-wide, not
root-restricted.** It counts every MEASURED edge in the evaluated snapshot, not
only those on a path to a root. A graph with measured edges deep in a subtree but
nothing measured beneath any root would pass the non-vacuity gate. J15(b) says
"the count of measured edges considered" and the decision considers the whole
propagated graph, so this reading is faithful — but the strictly-safer variant
(root-reachable measured edges only) exists and is a one-function change if the
judge prefers it.

**One-way-door clause (F-T5-10).** Unchanged from r1: no append-only + UNIQUE +
filtered-reader shape created. One TOUCHED — `CONDITION_MARKS`, which is read
positionally at its tail (`slice(-4)`); the new member is minted MID-LIST beside
`LEVERAGE_UNRESOLVED` (`packages/kernel/src/index.ts:80`) and the tail is
asserted unchanged. No new UNIQUE index, no new filtered reader, no migration.
r2 added no new persisted shape — the `STOPPING:round:%` rows are ordinary
append-only ledger entries on the existing writer.

## SUITES

Host under fleet contention throughout (load 8.0–13.2 during r2 runs, 12 cores).
Full `pnpm test` is **D15-DEFERRED** per D13/D15 and the packet.

**Root typecheck** — `npx tsc --noEmit`: **exit 0, 0 errors.**

**D16 surface gates (REQUIRED — this diff touches `packages/kernel`), base pairs
at `7433be7` measured in r1 and unchanged:**

| gate | base `7433be7` | r2 tip | new |
|---|---|---|---|
| `tsc --noEmit -p apps/ui/tsconfig.json` | 1 error — `apps/ui/app/layout.tsx(3,8): TS2882` | 1 error — same | **0** |
| `tsc --noEmit -p web/tsconfig.json` | 1 error — `web/app/layout.tsx(3,8): TS2882` | 1 error — same | **0** |

**Zone ×3 (worst run wins), 9 files:**

| run | result |
|---|---|
| 1 | `Tests  197 passed (197)` — exit 0 |
| 2 | `Tests  197 passed (197)` — exit 0 |
| 3 | `Tests  197 passed (197)` — exit 0 |

Worst run GREEN; failure membership is the empty set three times. Base of the
same zone before any T7 edit: `167 passed (167)`. The lane now adds 30 tests
(22 at r1, 8 more in r2), all passing.

**`tests/integration/database.test.ts` ×3 (heavy, embedded postgres):**

| run | result | failure membership |
|---|---|---|
| base `7433be7` | `1 failed \| 64 passed (65)` | `{claims, judges through the HTTP gateway…}` |
| r2 tip 1 | `1 failed \| 65 passed (66)` | `{claims, judges through the HTTP gateway…}` |
| r2 tip 2 | `1 failed \| 65 passed (66)` | same |
| r2 tip 3 | `1 failed \| 65 passed (66)` | same |

**SET-EQUAL to base: zero new, zero vanished.** The `runs a depth-2 two-maker
tree…` regression r1 disclosed against itself is GONE — that fixture passes at
the r2 tip and now carries the boundary's own ledger assertions. The one
remaining failure is pre-existing at base (F-T7-6, r1's classification).

**Audits:** `orphans` exit 0. `architecture` / `source` exit 1, `diff`
byte-identical to the base logs captured in r1 (F-T7-7).

## REFUTATION EVIDENCE (protocol §2)

Each mutant applied, suite run, then restored from a pristine copy with
`git status --porcelain` verified after every restore (clean, every time).
r1's mutants M0–M5 stand in the log directory and were not re-run.

| # | mutant | property it attacks | result |
|---|---|---|---|
| baseline | — | — | `30 passed (30)` |
| **M6** | `deriveGlobalRoundCompletions` reverted to the NAIVE rule (boundary at every `leg.round` change) — **the exact bug r1 shipped** | J15(a)'s derived boundary | **CAUGHT** — 3 unit failures, AND the depth-2 fixture returns `COMPOSITION_CONTRACT_ERROR`, byte-for-byte r1's regression |
| **M7** | the `measuredEdgeCount === 0` refusal made unreachable | J15(b)'s non-vacuity | **CAUGHT** — 2 failed; the decision reverts to `GLOBAL_DELTA_CONVERGED` where `NO_MEASURED_EDGE` is required |
| **M8** | `countMeasuredEdges` drops its `strength !== null` conjunct | whether a *stamp* counts as evidence | **SURVIVED at first — a GAP, not a neighbour.** Pinned (commit `89565aa`); re-run: **CAUGHT**, 1 failed |

**M8 is the honest one and it is disclosed as a miss.** I designed it as a
neighbour I expected to survive, and it did — but for the wrong reason: no
fixture put a `MEASURED` edge with a null magnitude in front of it. A neighbour
survives because the property is unrelated; this survived because the property
was untested, which makes it a gap. `computeGraph` skips a null-strength edge
exactly as it skips an UNKNOWN one, so counting it would let a graph that weighed
nothing claim evidence and take a vacuous stop — precisely what J15(b) forbids.
Pinned, then the mutant fails.

M6 is the refutation J15(a) asked for: **RED = the mid-plan cutoff, on the very
fixture that broke; GREEN = the derived boundary with that fixture back to green
and the four numeric cases unchanged.**

## PROPERTIES PINNED

1. The freeze quantity for a branch is the maximum |Δstrength| over the branch
   subtree root's recorded fragility rows, **restricted to the caller-supplied
   root ids**, with a `null` difference contributing nothing.
2. A branch freezes iff that quantity is **strictly** below ε.
3. The debate continues unconditionally until round 1 has completed.
4. The debate stops when no root moved **more than** δ against the previous
   ROUND; the ceiling stops it regardless of movement.
5. A δ stop is never taken over zero measured edges (J15(b)).
6. A global round is complete only when **every** root has finished it (J15(a)).
7. Deciding a round boundary reaches no provider and writes no `MODEL_CALL`.

## COMMITS (on `lane/t7`, local only — never pushed, never merged)

```
89565aa T7 r2: pin the measured-but-empty edge — a stamp is not a magnitude
6132589 T7 r2: the derived global round boundary, and a delta stop that cannot be vacuous
e48e2b5 T7: tooling traps from this lane (worker contract §6)
0a7396d T7: pin the delta boundary — equality at delta STOPS, the mirror of epsilon
940a36d T7: the delta comparison needs a previous ROUND, and the loop hook is HELD
1b08f7f T7: adaptive stopping — root-scoped leverage, delta stop, epsilon freeze
```

14 files, +1536 / −51, plus the docs-only append to `.hermes/TOOLING-TRAPS.md`
(four traps, worker contract §6) — the hand-merge is the orchestrator's at
closure per J15(d).

Reproduce the report hash: `tail -n +3 <this file> | shasum -a 256`.

---

# T7 STOPPING r3

Seat T7 · PROGRAMMING loop · Opus 5 · session `opus-t07-w5b` — a **FRESH seat**
(the r1/r2 seat `opus-t07-w5` was killed by the weekly limit; D22 ADDENDUM).
Base `7433be7` · worktree `.worktrees/lane-t7` · branch `lane/t7` · never pushed,
never merged. Rework rounds spent: **2 of 3**.
Answering codex r1 (`T7-codex-r1.md`) under J15 ADDENDUM-2.

**Headline.** Codex B1 and B2 are both closed, but the round's real finding is
about the *inherited* fix: it was correct and **unpinned**. Rebuilding codex's
exact bug at the caller left the entire suite green (mutant `MB1a`, 37/37). So
B1 is answered by moving the law out of the caller and into the decision — it is
told `expectedRootCount`, and δ-convergence is refused unless it compared that
many roots — which makes a narrowed scope unable to buy a stop no matter who
narrows it. B2's "no mark for a branch that prevented nothing" is kept and
generalised from codex's one enumeration to four plan shapes. N1's wording is
corrected below.

## THE INHERITED CHECKPOINT `c248f7f`, READ CRITICALLY

Not mine: the orchestrator checkpointed the killed seat's uncommitted work
(diff at `logs/rl-checkpoint/t7-uncommitted.diff`). Verdict: **KEPT, with one
correction and three additions.** It is preserved as its own commit rather than
amended, so a reviewer can diff what I inherited against what I changed
(`git diff c248f7f..HEAD`).

| inherited | verdict |
|---|---|
| `decideRoundBoundary` + `partitionComparableRoots` + `ROOT_SCOPE_INCOMPLETE` | **KEPT** — the right shape for a root that is present but unscored |
| the caller no longer filters by `scoredNodeIds` | **KEPT**, but proved UNPINNED (`MB1a` below) → the invariant added |
| `selectPreventableBranches` + `frozenAndPrevented` (B2) | **KEPT** — this is J15 ADDENDUM-2's "emit NO freeze mark" arm; no new mark value minted, so the T4/T3 discipline is not engaged |
| the four B1 tests, the three B2 tests, the N1 three-state test | **KEPT** — all still green, all still asserted |
| `comparedRootNodeIds` listing every root on a decision that compared NONE | **CORRECTED** — a false field, minted in the very round whose ruling is "records must be TRUE" |

## RED — my own frames, before any implementation

`logs/t07/r3b-RED-B1-invariant-B2-general.log` (product files at `c248f7f`,
`git status --porcelain` in the log shows only the test file modified):

```
 Test Files  1 failed (1)
      Tests  8 failed | 38 passed (46)
```

Eight: three false-`comparedRootNodeIds` arms, four B1-invariant/scope-law
absences (`expectedRootCount` and `selectAuthoritativeRootScope` do not exist),
one B1 short-scope refusal.

**Disclosed:** three of my four new B2-generality tests were GREEN at inherit —
they characterise a property the checkpoint already had, so they are refutation
strength, **not** RED frames. Their red evidence is mutant `MB2a`, which fails
all three. The B2 RED-before-GREEN frame in my own hand is mutant `MB2b`
(`logs/t07/r3b-mut-MB2b-mark-every-frozen-branch.log`) — the B2 fix reverted, the
false mark back, suite RED. The previous seat's own B2 RED frame is on disk at
`logs/t07/r3-RED-B1-B2-N1.log` (`4 failed | 33 passed (37)`); **I did not produce
it** and do not claim it.

## GREEN — B1: a short root scope is never a δ-stop, whoever shortened it

`logs/t07/r3b-GREEN-B1-invariant-B2-general.log` → `46 passed (46)`, `tsc` exit 0.
Final tip after the guard pins: `49 passed (49)` (`logs/t07/r3b-FINAL.log`).

The r2 caller narrowed `rootNodeIds` to the roots carrying judged standing, so a
run could answer `GLOBAL_DELTA_CONVERGED` about a root it had never compared.
The checkpoint fixed that line. **`MB1a` proves fixing that line is not enough** —
see the refutation table. Three changes make the defect unable to produce the
failure at all:

1. **`selectAuthoritativeRootScope(effectiveMakerCount, authoredRootNodeIdByMakerIndex)`**
   (`apps/runner/src/index.ts`) returns `{ expectedRootCount, rootNodeIds }`. It
   is **never told which roots have standing**, so it structurally cannot narrow
   by it. `expectedRootCount` is the maker count and nothing else: a root the run
   never authored is not named but is still COUNTED, so its absence reaches the
   decision instead of vanishing into a smaller scope.
2. **`expectedRootCount` is a REQUIRED field** of `AdaptiveStoppingRoundInput`
   and of `decideRoundBoundary`. `tsc` named all seven call sites that had not
   said what their run expects; a caller cannot forget it.
3. **One gate, in one place** (`packages/propagation/src/index.ts`, the strict
   `decideRoundContinuation`): `moved.length === 0 && compared.length !==
   expectedRootCount` → `CONTINUE / ROOT_SCOPE_INCOMPLETE`. Convergence is the
   only arm gated; the floor and the ceiling never consult movement and are
   unchanged. So narrowing upstream cannot buy a stop — it can only fail here.

The callee's loud guard stays reachable exactly where codex said it should be:
a complete scope still delegates to the strict decision, and
`STOPPING_ROOT_STRENGTH_UNRESOLVED` still throws for a caller asserting a
comparison it cannot make (test: "keeps the callee's loud guard reachable").

**The record is now TRUE about what it compared.** A decision with no previous
round compared nothing, and no longer lists every root as compared:

```
at(0, false) → { reason: "ROUND_1_FLOOR",   comparedRootNodeIds: [],
                 uncomparedRootNodeIds: ["root:A","root:B"], expectedRootCount: 2 }
at(1, false) → { reason: "NO_PREVIOUS_ROUND", … same … }
at(2, true)  → { reason: "GLOBAL_DELTA_CONVERGED", comparedRootNodeIds: ["root:A","root:B"],
                 uncomparedRootNodeIds: [], expectedRootCount: 2, maxRootMovement: 0 }
```

`expectedRootCount` earns its place on the record: a root a caller DROPPED appears
in neither list, so the count is the only field that can reveal it.

## GREEN — B2: the freeze record's truth, generalised past one enumeration

J15 ADDENDUM-2 narrowed codex's "required correction" (which asked for a
round-major plan or a per-root ε evaluation point) to the mark's TRUTH; the
replan was declined by J15 ADDENDUM and lives as V-T7-r2-1. The checkpoint took
the ruling's first arm — **no mark at all** for a branch already fully expanded —
which mints no new vocabulary value, so the T4/T3 canonical-mark discipline is
not engaged this round.

Codex's enumeration is asserted verbatim (M=2/d=2, boundary 7, carrying
`[2,3,8,9]` → preventable `[8,9]`). Three new tests carry the property behind it
over `(depth, makerCount)` ∈ {(2,2), (3,2), (2,3), (4,3)}:

- **every branch that may publish a mark has an EMPTY authored subtree at the
  boundary** — which is precisely why `affectedNodeIds` may be the carrying node
  alone. This is the general form of the falsehood codex found.
- **the final round's boundary marks nothing at all** — at plan end no freeze
  prevents anything, so no honesty mark is owed there.
- **the markable set is exactly the LAST maker's carrying branches** — J15
  ADDENDUM's accepted late boundary, stated as a checkable property rather than
  a caveat.

`frozenCarryingNodeIds` still names every frozen branch (the freeze DECISION is
timing-independent, asserted set-equal in both arms); only the RECORD is
restricted. Adding an already-expanded branch's indices to `frozenIndices` is a
no-op by construction — a non-preventable branch has no future legs.

## N1 — the r2 wording, corrected

r2's case (c) said: *"the identical zero at `completedRounds 1` → STOP /
GLOBAL_DELTA_CONVERGED. Only the floor separates them."* **That is withdrawn.**
Codex is right: at the round-1 boundary the live caller necessarily holds
`previousRoundStrengths === null`, so a `completedRounds: 1` STOP fed a non-null
previous round is not a state this engine can occupy. The arithmetic was exact
and is unchanged (movement exactly `0` in both calls); the construction was not
a live state. The lawful sequence, on identical graphs whose movement is exactly
zero, is the three-state walk shown above: round 0 `ROUND_1_FLOOR`, round 1
`NO_PREVIOUS_ROUND` (J15(c)), round 2 `GLOBAL_DELTA_CONVERGED`. The floor is one
of THREE gates before convergence, not the only one.

N2 and N3 were orchestrator packet defects, ledgered; nothing here. For the
record, the true commit count from base is now **10** (codex measured 6 against
a packet claiming 5).

## SUITES

Host under fleet contention throughout; load recorded in each log header
(9.0–29.6 across the runs, 12 cores). Full `pnpm test` is **D15-DEFERRED**.

**Root typecheck** — `npx tsc --noEmit`: **exit 0, 0 errors**.

**D16 surface gates (REQUIRED — the lane diff touches `packages/kernel`):**

| gate | base `7433be7` | r3 tip | new |
|---|---|---|---|
| `tsc --noEmit -p apps/ui/tsconfig.json` | 1 — `apps/ui/app/layout.tsx(3,8): TS2882` | 1 — same | **0** |
| `tsc --noEmit -p web/tsconfig.json` | 1 — `web/app/layout.tsx(3,8): TS2882` | 1 — same | **0** |

**Zone ×3 (worst run wins), 9 files** — `r3b-zone-r{1,2,3}.log`:

| run | result |
|---|---|
| 1 | `Tests 216 passed (216)` — exit 0 |
| 2 | `Tests 216 passed (216)` — exit 0 |
| 3 | `Tests 216 passed (216)` — exit 0 |

Worst run GREEN; failure membership empty three times. Zone at base before any
T7 edit was `167 passed (167)`; r1 added 22, r2 8, r3 **19** (49 in the T7 file).

**`tests/integration/database.test.ts` ×3 (heavy, embedded postgres)** —
`r3b-intg-r{1,2,3}.log`:

| run | result | failure membership |
|---|---|---|
| base `7433be7` | `1 failed \| 64 passed (65)` | `{claims, judges through the HTTP gateway…}` |
| r3 tip 1 | `1 failed \| 65 passed (66)` | same |
| r3 tip 2 | `1 failed \| 65 passed (66)` | same |
| r3 tip 3 | `1 failed \| 65 passed (66)` | same |

**SET-EQUAL to base: zero new, zero vanished.** The one failure is pre-existing
at base (F-T7-6). Runs 2 and 3 started at load 21.6 and 29.6 and returned the
identical membership. **Disclosed:** the base row is read from the stored
`logs/t07/integration-TRUEbase.log`, measured by the r1 seat — **I did not
re-measure the base**; re-measuring needs a branch switch in the shared lane
worktree, which I judged the larger risk. Only the TIP rows are mine.

**Audits** — `r3b-audit-{orphans,architecture,source}.log`: `orphans` exit 0;
`architecture` and `source` exit 1 and are **byte-identical to the stored BASE
logs** (`audit-architecture-base.log`, `audit-source-base.log`), i.e. three
pre-existing `obs-capture` edge violations and three pre-existing env-read
violations, none mine (F-T7-7).

## REFUTATION EVIDENCE (protocol §2)

Every mutant: token applied, suite run, restored with `git checkout HEAD -- <file>`,
`git status --porcelain` and a `shasum -a 256` printed on both sides of the
restore. Transcripts at `logs/t07/r3b-mut-*.log`. Baseline before the campaign:
`47 passed (47)`; after the two guard pins, `49 passed (49)`.

| # | mutant | property it attacks | result |
|---|---|---|---|
| **MB1a** | restore `scoredNodeIds.has(root)` at the live caller — **codex B1's exact bug, at the exact seam the review named** | the loop never narrows the authoritative scope | **SURVIVED TWICE — the round's finding.** 37/37 green against the inherited fix; 46/46 green after the invariant. CAUGHT only once the seam pin was added: `1 failed \| 46 passed (47)` |
| **MB1b** | the convergence gate made unreachable | a short scope may never converge | **CAUGHT** — 2 failed |
| **MB1c** | `expectedRootCount` forged from the surviving scope instead of the maker count | the count is the RUN's, not the scope's | **CAUGHT** — 1 failed |
| **MB1d** | every root listed as compared even when nothing was compared | the scope record is TRUE | **CAUGHT** — 3 failed |
| **MB2a** | `selectPreventableBranches` returns every carrying branch (r2's behaviour) | only a freeze that prevented something may be marked | **CAUGHT** — 4 failed (all three generality tests + codex's enumeration) |
| **MB2b** | the mark published for every frozen branch — **codex B2's false record, restored** | the freeze record's truth | **CAUGHT** — 1 failed |
| **MN1** *(neighbour)* | `index >= boundaryLegIndex` — the boundary leg counted as future work | — | **SURVIVED, correctly.** The boundary leg's own parent is a maker root, never inside a carrying branch's subtree, in every shape tested — the two readings are indistinguishable on reachable input, so this is a true neighbour and not a gap |
| **MN2** *(intended neighbour)* | the OVERFULL-scope guard removed | — | **SURVIVED — and that made it a GAP, not a neighbour** (r2's own lesson applied: if the reason is "no fixture covers it", it is a gap). Three defensive guards pinned; re-run **CAUGHT**, 1 failed |

**MB1a is the honest one and it is disclosed as an inherited miss.** It is also
the reason the fix is where it is: after it survived the invariant too, the
conclusion was that no unit test in this repo can observe that closure. The seam
pin that finally catches it is **STRUCTURAL** — it reads the runner source and
asserts the call site hands `rootScope`'s two fields down untouched — and the
test says so in its own comment. It is a real regression pin for the exact defect
class; it is not a behavioural proof, and I am not presenting it as one.

## FINDINGS

**CLOSED THIS ROUND** — codex **B1** (the law moved into the decision; the caller
can no longer produce the failure), codex **B2** (mark truth kept and generalised),
codex **N1** (wording withdrawn and corrected; the lawful three-state sequence
asserted). N2/N3 are packet-owned.

**F-T7-10 · NEW, non-blocking · a permanently uncomparable root now costs the
δ-stop entirely.** The correct reading of J15 ADDENDUM-2 is that convergence
requires every expected maker root compared. So a run in which one maker's root
never reaches judged standing (its cross-maker review exhausted) can never δ-stop
and will expand to the ASK-time ceiling. That is the honest behaviour — the
alternative is r2's false convergence — but it is a real cost consequence and it
compounds J15 ADDENDUM's already-partial savings. The engine still terminates:
the ceiling is unconditional and precedes the movement rule. Recorded, not acted
on; it is the judge's to weigh alongside V-T7-r2-1.

**F-T7-11 · NEW, non-blocking · the live boundary closure has no behavioural test
harness.** `closeGlobalRound` is a closure inside `executeWorkItem`; the only
harness reaching it is the embedded-postgres integration suite, whose two-maker
fixture gives BOTH roots standing — so no fixture in the repo can distinguish a
narrowed scope from a whole one. A partial-standing M=2 fixture (scripted
review exhaustion + the 48-attempt envelope re-derived) is the true pin and is
priced at 45–90 minutes; not taken this round. The gap is covered by the
semantic invariant plus the structural pin, both labelled.

**F-T7-12 · NEW, non-blocking · `buildMultiMakerExpansionPlan(depth,
effectiveMakerCount)` is a positional-argument hazard.** Two same-typed small
integers: the reversed call builds a legal plan for a DIFFERENT shape and every
assertion about it is quietly wrong (only the symmetric `(2,2)` case is safe). It
cost me two false RED failures and a diagnostic run. An object parameter would
end the class; the signature has callers outside my charge, so it is named, not
changed. Recorded in `.hermes/TOOLING-TRAPS.md` (lane copy).

**F-T7-9 residual, unchanged** — `measuredEdgeCount` stays graph-wide per J15
ADDENDUM's KEPT disposition.

**One-way-door clause (F-T5-10).** r3 creates NO append-only + UNIQUE +
filtered-reader shape, mints NO mark value, adds NO persisted field, and changes
no DDL. `ROOT_SCOPE_INCOMPLETE` is a member of the in-memory
`RoundContinuationReason` union, which is not persisted and not read positionally.
The `CONDITION_MARKS` mid-list mint from r2 is untouched.

**Packet check (§1).** Every constant in `packets/t07-rework-r2-resume.md`
verified: base `7433be7` ✓, checkpoint `c248f7f` ✓, checkpoint diff path ✓,
codex verdict path ✓, ruling ids ✓, SPEC path ✓. **One discrepancy, disclosed:**
the packet specifies the D21 hash as `sed '2d' <file> | shasum -a 256`, while the
r2 artifact and codex's verification used `tail -n +3` (drops the marker line as
well). I follow the PACKET. The recipe is restated at the foot of this file so
the next reviewer does not compute the superseded one and read a mismatch.
**One ordering note:** the packet lists codex's verdict before the ruling that
narrows it; reading it in that order nearly cost a round on B2's widest reading.

## PROPERTIES PINNED — r3 additions to the r2 list

8. The authoritative root scope is built from the RUN's maker count and is blind
   to judged standing; a root that was never authored is still counted.
9. δ-convergence requires that the decision compared **every** expected maker
   root — a short or partial scope is `ROOT_SCOPE_INCOMPLETE`, never a stop.
10. A decision that compared nothing lists nothing as compared.
11. A branch may publish `BRANCH-FROZEN-LOW-LEVERAGE` only if the decision can
    still prevent its expansion; such a branch has authored nothing, so the
    record's `affectedNodeIds` is the whole truth of the cut.
12. The final round's boundary marks no branch at all.

## COMMITS (on `lane/t7`, local only — never pushed, never merged)

r3, mine — `git diff c248f7f..HEAD` is exactly this round's work:

```
754090a T7 r3: tooling traps from this seat (worker contract §6)
87eaf8b T7 r3: pin the three scope guards mutant MN2 proved unexercised
e9ef104 T7 r3: pin the live seam — the authoritative scope is handed down unnarrowed
2d40ae1 T7 r3: a short root scope can never be a δ-stop, and the freeze record's truth generalised
```

Inherited, kept as its own commit for provenance: `c248f7f` (orchestrator's
capture-before-destroy of the killed seat's work). r1/r2's six commits are listed
in the r2 section above. **Ten commits from base.** `git diff --stat
c248f7f..HEAD` = 4 files, **+466/−24** (of which `.hermes/TOOLING-TRAPS.md` is
+16 and docs-only, so the r3 code change is 3 files, +450/−24). Lane total from
base `7433be7`: 14 files, +2377/−51.

Reproduce the report hash: `sed '2d' <this file> | shasum -a 256` (D21; note this
supersedes r2's `tail -n +3` recipe).

---

# T7 STOPPING r4 — FINAL lawful round (3 of 3)

Seat T7 · PROGRAMMING loop · Opus 5 · session `opus-t07-w5b` · base `7433be7` ·
worktree `.worktrees/lane-t7` · branch `lane/t7` · never pushed, never merged.
Answering codex r2 (`T7-codex-r2.md`) under J15 + ADDENDUM + ADDENDUM-2 and D24.

**Headline, and it is a correction of my own.** r3's headline said "the law now
lives where no caller can get around it." That sentence was false: the field
carrying the law was OPTIONAL, with a fallback that handed a narrowed caller its
own narrowed scope back as the standard to measure against. Codex r2 B1 is
correct and it is r1's B1 at the public API. It is now required, with no fallback
and a compile-time negative fixture. Codex r2 B2 is also correct: the boundary
partitioned before validating and hand-wrote a second copy of the arm ordering
whose movement fields were pinned to null/empty — so a comparable root could move
by exactly 1/4 and the record denied it. The root cause was **having two copies
of the decision's arms**; there is now one, shared and validated.

## RED — both channels, before any implementation

`logs/t07/r4-RED-B1-required-B2-partial-scope.log`, product files at the r3 tip
`754090a` (`git status --porcelain` in the log shows only the test file):

```
tests/unit/t07-adaptive-stopping.test.ts(1427,5): error TS2578: Unused '@ts-expect-error' directive.
tsc exit=1

 Test Files  1 failed (1)
      Tests  6 failed | 53 passed (59)
```

The TS2578 **is** the B1 RED: at the r3 tip the omission compiles, so the
`@ts-expect-error` guarding it is "unused" and `tsc` fails. The six runtime
failures are B2's: the erased movement, the erased movement at the ceiling, the
convergence check on a partial scope, the OVERFULL guard through the outer path,
and the five other input guards through the outer path.

**Disclosed:** N2 has NO red frame. It corrects a false claim in a test title and
literal (`0.126` is not the next representable value above `1/8`), not product
behaviour — the strict `<` predicate was already right. N1 is a report-metadata
correction. Neither is a behaviour change and I do not present them as TDD.

## GREEN — B1: the count is REQUIRED, with no fallback

`logs/t07/r4-GREEN-B1-required-B2-partial-scope.log` → `tsc exit=0`,
`60 passed (60)`. Final tip after the floor-arm consistency fix:
`61 passed (61)`, `tsc exit=0` (`logs/t07/r4-FINAL.log`).

- `expectedRootCount: number` is now **required** on the exported
  `decideRoundContinuation`; the `?? input.rootNodeIds.length` fallback is gone.
  Making it required turned `tsc` into the complete worklist of callers that had
  never stated their run's maker count — 15 of them, all updated.
- **Compile-time negative fixture**, the only mechanical guard against this exact
  regression: a `@ts-expect-error`-pinned call that omits the field. If the field
  ever becomes optional again the directive reports unused and `tsc` fails
  (proved by mutant `MC1`). The same call, forced past the compiler, throws
  `STOPPING_EXPECTED_ROOT_COUNT_INVALID` at runtime — the fixture is executable,
  not decorative.
- The runtime shortened-scope case codex specifies (`rootNodeIds: ["root:A"]`,
  `expectedRootCount: 2`, movement 0) continues as `ROOT_SCOPE_INCOMPLETE`; the
  identical graph with `expectedRootCount: 1` converges.
- Verified: the only product caller of either entry point is
  `apps/runner/src/index.ts:1454` (`decideRoundBoundary`), which already passes
  the count. The structural live-seam pin from r3 stays, as codex allows.

## GREEN — B2: one validated decision body; a partial scope erases nothing

The defect was duplication. `decideRoundBoundary` partitioned first and then ran
its own copy of floor/ceiling/no-previous/coverage with `maxRootMovement: null`
and `movedRootNodeIds: []` written in as literals. Both entry points now delegate
to **one** body:

- `assertRoundDecisionInputs(input)` runs **first, on the scope the caller
  supplied**, in both entry points — so OVERFULL, delta, completed rounds, depth
  ceiling, measured-edge count, expected-count integrality and empty scope are all
  enforced on the partial path they used to bypass.
- `decideWithScope(input, comparable, uncomparable)` computes movement over every
  comparable root even when others are uncomparable. Codex's counterexample now
  reads exactly as he specified:

```
root:A 1/2 -> 3/4, root:B uncomparable, expectedRootCount 2, delta 0.01
→ CONTINUE / ROOT_SCOPE_INCOMPLETE
  maxRootMovement    = 0.25            (|3/4 - 1/2| = 1/4, exact)
  movedRootNodeIds   = ["root:A"]
  comparedRootNodeIds= ["root:A"]   uncomparedRootNodeIds = ["root:B"]
```

- **Documented precedence** (in the source): ceiling > floor > missing-previous >
  no-measured-edge > `ROOT_SCOPE_INCOMPLETE` > {`GLOBAL_DELTA_CONVERGED` |
  `ROOT_MOVED`}. Short coverage stays the dominant REASON because it is the
  durable fact that forbids convergence for the rest of the run; the movement it
  outranks is still on the record. Convergence remains impossible below full
  coverage.
- **The `maxRootMovement` interface doc is true again**, and is now a pinned
  biconditional rather than prose: *null EXACTLY when `comparedRootNodeIds` is
  empty*. The test walks seven arms — partial-moved, floor, ceiling, no-evidence,
  no-previous-round, nothing-comparable, full-scope-converged — and asserts both
  directions plus that both sides of the biconditional are actually exercised.
- **Same class, found by the restructure:** the ROUND-1 FLOOR arm was also
  erasing `movedRootNodeIds` while the ceiling arm recorded them. Invisible with
  two copies, obvious with one. Fixed and pinned.

## N1 — the commit count, verbatim

```
$ git rev-list --count 7433be7..HEAD
13
```

Eleven at codex's reading plus this round's two commits. r3's report said "ten"
and "Ten commits from base"; both were wrong and both are corrected here. The
count is generated from the command above, never from arithmetic.

## N2 — the epsilon discriminator is now exactly one representable step

`0.126` is above `1/8` but is not its successor. `1/8 = 2^-3`, so the spacing
immediately above is `2^(-3-52) = 2^-55` and the true next binary64 is
`1/8 + 2^-55`. The test now builds it by **bit-pattern increment** (a `DataView`
`+1n` on the unsigned reading, which is monotonic for positive finite doubles)
and cross-checks it against the closed form, so two independent derivations agree:

```
nextUpBinary64(0.125) !== 0.125
nextUpBinary64(0.125) === 0.125 + 2 ** -55
nextUpBinary64(0.125) < 0.126
(nextUpBinary64(0.125) - 0.125) / 2 ** -55 === 1     // exactly ONE step
```

That value is the smallest epsilon in binary64 that can freeze a leverage of
exactly `1/8`, so the stronger wording is kept and is now true.

## SUITES

Host shared with another session throughout; load recorded in every log header
(16.0–27.1, 12 cores). Per the coordinator's instruction, **focused and zone runs
only** — the three-run heavy integration cluster was NOT repeated this round.

**Root typecheck** — `npx tsc --noEmit`: **exit 0**.

**Focused cluster** — `tests/unit/t07-adaptive-stopping.test.ts`:
**`61 passed (61)`** (r3 tip: 49; r4 adds 12).

**Zone ×3 (worst run wins), 9 files** — `r4-zone-r{1,2,3}.log`:

| run | host load at start | result |
|---|---|---|
| 1 | 16.05 | `Tests 228 passed (228)` — exit 0 |
| 2 | 16.15 | `Tests 228 passed (228)` — exit 0 |
| 3 | 17.79 | `Tests 228 passed (228)` — exit 0 |

Worst run GREEN; failure membership empty three times. (r3 tip: 216.)

**D16 surface gates.** This round's diff touches NEITHER surface nor the packages
their tsconfigs consume:

```
$ git diff --stat 754090a..HEAD
 .../packages/propagation/src/index.ts        | 261 ++++++++++++---------
 .../tests/unit/t07-adaptive-stopping.test.ts | 250 +++++++++++++++++++-
 2 files changed, 396 insertions(+), 115 deletions(-)
```

Neither `apps/ui` nor `web` imports `@debateai/propagation` (grep: no match). The
LANE diff still touches `packages/kernel`, so both gates were re-run anyway at the
r4 tip and are **byte-identical to the stored base logs** — `apps/ui` and `web`
each carry only their one pre-existing `layout.tsx(3,8): TS2882`. **New: 0/0.**

**Audits** — `r4-audit-{orphans,architecture,source}.log`: `orphans` exit 0 and
byte-identical to the r3 tip; `architecture` and `source` exit 1 and are
**byte-identical to the stored BASE logs** (the same three pre-existing
`obs-capture` edge violations and three pre-existing env-read violations).

**Live-path evidence, focused** — `r4-intg-focused-t7-fixture.log`. Rather than
repeat the heavy cluster under a shared host, I ran the one integration fixture
that exercises the live boundary:

```
$ npx vitest run tests/integration/database.test.ts -t "runs a depth-2 two-maker tree"
 ✓ runs a depth-2 two-maker tree and preserves the single-root disclosure at envelope terminal 1212ms
 Tests  1 passed | 65 skipped (66)          (host load 27.12)
```

**Disclosed:** this is ONE focused test, not a three-run cluster. r3's three full
runs (`1 failed | 65 passed (66)`, set-equal to the stored base) stand as the
lane's integration evidence. The r4 diff cannot move them by construction — the
live caller supplies a complete, comparable scope, on which the shared body takes
exactly the arms the strict decision always took — but that is an argument, and
the D15 batch suite remains the closure measurement.

## REFUTATION EVIDENCE (protocol §2, transcripts in **D24 shape**)

Every transcript at `logs/t07/r4-mut-*.log` records: the mutation itself as
`git diff --unified=2`, the token grep before and after applying, the
discriminating result, the restore command, the post-restore porcelain and
`git diff --stat` (zero residue), and the file `shasum -a 256` on **both** sides.
Baseline `61 passed (61)`, `tsc exit=0`.

| # | mutant | property it attacks | result |
|---|---|---|---|
| **MC1** | `expectedRootCount` made OPTIONAL again with the `?? rootNodeIds.length` fallback — **codex r2 B1 restored verbatim** | the run's maker count is required, with no fallback | **CAUGHT on both channels** — `tsc` TS2578 (exit 1) AND 1 runtime failure |
| **MC2** | the partial-coverage arm's `maxRootMovement`/`movedRootNodeIds` pinned back to null/empty — **codex r2 B2 restored verbatim** | a partial scope records the movement it measured | **CAUGHT** — 3 failed |
| **MC3** | `assertRoundDecisionInputs` removed from the boundary (r3's validate-after-partition bypass) | every input guard runs through the OUTER path | **CAUGHT** — 2 failed |
| **MC4** | the boundary drops the uncomparable roots from the record | the record names what it could not compare | **CAUGHT** — 2 failed |
| **MC5** | precedence flipped: `ROOT_MOVED` outranks the coverage shortfall | the documented precedence | **CAUGHT** — 1 failed |
| **MC6** | the coverage gate made unreachable in the SHARED body (**r3's MB1b, re-aimed**) | a short scope may never converge | **CAUGHT** — 6 failed |
| **MC7** | roots listed as compared when nothing was compared (**r3's MB1d, re-aimed**) | the scope record is true | **CAUGHT** — 4 failed |
| **MN3** *(neighbour)* | concat order of `uncomparedRootNodeIds` on the nothing-compared path | — | **SURVIVED, correctly** — that list is empty on every reachable path into that arm, so the two orderings are indistinguishable |

MC6 and MC7 exist to answer a specific risk of this round: the restructure moved
r3's pins into a shared body, so r3's mutants no longer apply at their old tokens.
Re-aimed, both still fail — the refactor preserved every r3 pin. r3's MN1
neighbour is unaffected (it lives in the runner, untouched this round).

## FINDINGS

**CLOSED THIS ROUND** — codex r2 **B1** (required, no fallback, compile-time
negative + runtime case), **B2** (validate-first, one shared body, movement
computed and recorded, guards reachable through the outer path, interface doc
true and pinned as a biconditional), **N1** (count generated verbatim), **N2**
(true next binary64, two independent derivations).

**CORRECTION TO THE r3 REPORT, on the record.** r3 §"GREEN — B1" claimed the law
lived "where no caller can get around it" and r3's PROPERTIES 9 stated the
coverage rule without noting that the field carrying it was optional. Both
overstated the code. The r3 text stays historical; this is its correction.

**F-T7-13 · NEW, non-blocking · the two blocking findings of the last two rounds
were both DUPLICATION defects.** r3's B1 was a caller's private copy of the root
scope; r4's B2 was a second copy of the arm ordering. Both were introduced as
"local" fixes and both erased a fact in the copy. Recorded as a lane lesson: a
fix that adds a copy of a decision is a finding waiting to be filed.

### V-ROW DRAFTS (round 3/3 is spent; these are for V, not a round 4)

**V-T7-r4-1 · the live boundary closure has no behavioural test harness.**
*Decision required:* whether to build the partial-standing M=2 embedded-postgres
fixture that would pin `closeGlobalRound` behaviourally. Today the only harness
that reaches that closure gives BOTH maker roots judged standing, so no fixture
can distinguish a narrowed scope from a whole one; the seam is held by a semantic
invariant (now mandatory at the API) plus an explicitly labelled structural pin.
*My recommendation:* defer — codex r2 accepted the substitution "in principle,
with a bounded risk", and the required `expectedRootCount` closes the failure mode
even if the structural pin is deleted. *Default if V does not rule:* deferred,
carried as F-T7-11.
*Residual risk, stated:* a semantically equivalent refactor, or a caller that
forges BOTH fields, would pass the structural pin.

**V-T7-r4-2 · a permanently uncomparable root disables δ-stopping for the whole
run** (F-T7-10, sharpened by codex r2). Coverage can never reach the maker count,
so no δ-convergence is possible; the run proceeds to the ASK-time ceiling with
ε-freeze and halts as the only adaptive savings — and under J15 ADDENDUM's
accepted late boundary only the LAST maker's branches are ever preventable, so
earlier makers have already paid their author calls. *Decision required:* whether
that coupled worst case changes the disposition of V-T7-r2-1 (the round-major
replan). *My recommendation:* keep the conservative rule — weakening coverage
restores false convergence, which is the defect this lane exists to repeal — and
weigh the replan on the flagship run's measured spend. *Default:* as J15
ADDENDUM ruled, defer past this mission.

**F-T7-9 residual, unchanged** — `measuredEdgeCount` stays graph-wide per J15
ADDENDUM's KEPT disposition.

**One-way-door clause (F-T5-10).** r4 creates NO append-only + UNIQUE +
filtered-reader shape, NO DDL, NO persisted field, NO new mark value, and no
positional vocabulary change. `ROOT_SCOPE_INCOMPLETE` remains a member of the
in-memory `RoundContinuationReason` union with no persisted representation. The
only signature change is a field made REQUIRED on a package-internal export whose
sole product caller is in this lane.

**Packet check (§1).** Every constant in `packets/t07-rework-r3.md` verified: lane
tip `754090a` clean ✓, ticket path ✓, codex r2 path and its provenance note ✓,
ruling ids J15/ADDENDUM/ADDENDUM-2/D24 ✓, the cited source lines resolve to the
code the findings describe ✓. The packet's "it should not this round" prediction
about D16 is confirmed with `git diff --stat` above. **No packet defects found.**
The packet's ordering instruction (rulings first, then the review) was followed
and is the correction of the r3 packet's hazard.

## PROPERTIES PINNED — r4 additions

13. The run's maker-root count is REQUIRED at the decision's own API; omitting it
    does not compile, and does not run.
14. Every input guard runs before any partition-dependent return, on the scope the
    caller supplied.
15. A partial scope computes and records the movement of every root it compared;
    `ROOT_SCOPE_INCOMPLETE` outranks `ROOT_MOVED` as the reason and erases neither.
16. `maxRootMovement` is null EXACTLY when `comparedRootNodeIds` is empty.
17. The round-1 floor names its moved roots, as the ceiling always did.

## COMMITS (on `lane/t7`, local only — never pushed, never merged)

r4, mine:

```
b64c1d0 T7 r4: the round-1 floor names its moved roots too
ab0fba0 T7 r4: the expected root count is REQUIRED, and a partial scope erases no fact
```

r3's four and r1/r2's six are listed in the sections above; `c248f7f` is the
orchestrator's checkpoint of the killed seat.

```
$ git rev-list --count 7433be7..HEAD
13
```

**J16(b) filing law** (ruled 07:51 EEST, mid-round — complied with here):

```
$ git diff --summary 7433be7..HEAD | grep -c "mode change"
0
```

`git diff --stat 754090a..HEAD` = 2 files, +396/−115. Lane total from base:
`git diff --stat 7433be7..HEAD` = 14 files changed, +2658/−51.

Reproduce the report hash: `sed '2d' <this file> | shasum -a 256` (D21).

---

# r4b evidence repair — D24 transcript admissibility (codex r3 N1)

**Not a worker round.** No product code changed: the lane tip is `b64c1d04`, the
same commit this report was filed at, and `git status --porcelain` is empty
before and after. codex r3's **B1** (the `NO_MEASURED_EDGE` arm erasing
`movedRootNodeIds`) is **not touched here** — it is V row `V-T7-codex-r3-1`, and
round 4 does not exist.

**Head note.** Lines 1–2 are the FROZEN r4 head and are deliberately unchanged;
an evidence repair does not re-issue a marker. The line-2 hash therefore covers
the artifact **as filed at r4** and does NOT cover this appended section. A
reviewer recomputing `sed '2d' | shasum -a 256` over the current file will get a
different value, by design, and that is not a marker defect. The frozen head stays
verifiable against the artifact it describes — the r4 report is lines 1–939, and

```text
$ sed -n '1,939p' t07-stopping.md | sed '2d' | shasum -a 256
1343e230896235ae2035baeb8218004c8241ad9af8efd11797026762a1d6f3cc
```

which is exactly line 2. Everything from line 940 on is this repair.

## The finding, and its root cause measured rather than guessed

codex r3 N1 is correct. All eight r4 transcripts printed a post-restore count of
5, 2, 2, 2, 2, 1, 1, 2 — never D24's required zero.

The cause was not the mutation and not the restore: it was **the token**. My r4
harness took the grep token as a hand-passed argument, and the strings I passed
were text that exists in the **unmutated** file. Counted against the pristine
file at the r4 tip:

```text
readonly expectedRootCount: number;              pre-count=5
reason: "ROOT_SCOPE_INCOMPLETE"                  pre-count=2
compared.length !== input.expectedRootCount      pre-count=1
```

Those are exactly the numbers codex reported, in the order the mutants used them
— so "post-restore count" was only ever measuring the file's ordinary occurrence
count of unchanged text. The harness compounded it by echoing the literal
placeholder `grep … '<mutation token>'`, so the log never disclosed which string
it had counted. The mutation diffs, results, restores, clean porcelain and
matching both-side hashes in those logs were sound; the admissibility field was
not.

## The repair

The token is no longer hand-passed: **it is the mutation**. Each mutant is an
(OLD, NEW) pair and the token is NEW — the exact text the mutation introduces —
printed verbatim in every transcript between `<<<TOKEN` and `TOKEN>>>`, so the
reader can see the counted string rather than a placeholder. The harness enforces
three HARD GATES and aborts on any violation:

```text
pre = 0   →   applied > 0   →   restored = 0
```

Retained from r4 unchanged: the mutation diff (`git diff --unified=2`), the
discriminating result, the restore command, and `shasum -a 256` on **both** sides
of the restore (pre-apply and post-restore are byte-identical in all eight).

**Refiled: `logs/t07/r4b-mut-*.log` (eight) + `logs/t07/r4b-INDEX.md`.** The r4
logs are left in place; they are superseded, not deleted.

| mutant | pre | applied | restored | discriminating result |
|---|---|---|---|---|
| `MC1-expected-count-optional-again` | 0 | 1 | **0** | tsc exit=1 (TS2578) + 1 failed / 60 passed (61) |
| `MC2-partial-arm-erases-movement` | 0 | 1 | **0** | 3 failed / 58 passed (61) |
| `MC3-boundary-skips-validation` | 0 | 1 | **0** | 2 failed / 59 passed (61) |
| `MC4-uncomparable-roots-dropped` | 0 | 1 | **0** | 2 failed / 59 passed (61) |
| `MC5-precedence-flipped` | 0 | 1 | **0** | 1 failed / 60 passed (61) |
| `MC6-coverage-gate-unreachable` | 0 | 1 | **0** | 6 failed / 55 passed (61) |
| `MC7-false-compared-record` | 0 | 1 | **0** | 4 failed / 57 passed (61) |
| `MN3-neighbour-concat-order` | 0 | 1 | **0** | 61 passed (61) — the declared neighbour, survives by design |

Post-restore counts, verbatim, in codex r3's order:

```text
0, 0, 0, 0, 0, 0, 0, 0
```

**Every discriminating outcome is identical to r4.** This repair makes the
transcripts admissible; it revises no result. Seven of eight caught, MN3 the
declared neighbour.

Product code, before and after the campaign:

```text
$ git rev-parse --short HEAD   -> b64c1d04   (the r4 filing tip, unchanged)
$ git status --porcelain       -> (empty)
$ shasum -a 256 packages/propagation/src/index.ts
05c3322cef78e7dff18a547cf23856b72193d3cfd5d6366dd066ff4cae4334e5
```

That hash is the pre-apply AND post-restore value in all eight transcripts.

## The lesson, for the fleet

D24 says a transcript must carry "the token grep proving it applied" and a
post-restore grep. My harness satisfied the *shape* of that and none of its
*meaning*, because a hand-passed token is a free parameter — and a free parameter
in an evidence format is where the evidence goes to die. **The token must be
derived from the mutation, not supplied alongside it**, and the harness must
refuse to emit a transcript whose counts are not 0 / >0 / 0.

This is the third mutation logger written in this mission and the second D24
defect found in one. My r4 self-report already argued the harness should be
committed in-repo rather than re-invented per seat; this round is the evidence
for that argument. Recommended as a D24 addendum: **the three counts are gates,
not fields**, and the token is the mutation's own introduced text.

---

# T7B — `NO_MEASURED_EDGE` outranks the movement, it does not delete it

**V-authorized micro-ticket (V-T7-codex-r3-1). This is NOT a fourth rework
round** — the rework cap stands at 3/3 and is not touched. Same seat, same
session, one arm, one pin, one transcript, then codex re-review.

Seat T7 · Opus 5 · session `opus-t07-w5b` · base `7433be7` · lane `lane/t7`,
never pushed, never merged. Filed tip:

```
commit 3ea7fd3325d5daf9716221105a1af8e2a7512afa
tree   f7bbe9c9a45d8460493a837557df0b62c84223ec
```

Every gate below ran at exactly that commit and tree, stamped in its own header
(D27), on a clean tree — the runner refuses to start on a dirty one.

## The finding, and it is correct

codex r3 B1. On the no-evidence arm the shared body had already computed
`maxRootMovement` and `moved`, and the record published the first while discarding
the second. Codex's input — my own r4 counterexample with only the evidence count
changed:

```text
rootNodeIds ["root:A","root:B"], expectedRootCount 2, delta 0.01,
root:A 1/2 → 3/4, root:B absent from both strength sets, measuredEdgeCount 0
```

r4 returned `CONTINUE / NO_MEASURED_EDGE`, `maxRootMovement 0.25`,
`movedRootNodeIds []`, `comparedRootNodeIds ["root:A"]`. That record says A was
compared, that the maximum movement was 0.25, and that no root moved by more than
0.01. Two of those three cannot both be true. Same fact-erasure class as codex
r2 B2, one arm further in.

## The change — exactly one arm, one line

`packages/propagation/src/index.ts`, the `NO_MEASURED_EDGE` arm of
`decideWithScope`: `movedRootNodeIds: Object.freeze([])` → `movedRootNodeIds: moved`.

Nothing else changed; no other file was needed. The dominant reason is unchanged
and still conservative — J15(b)'s refusal to stop over zero measured edges is
untouched, and a moved root named on a zero-evidence record still cannot become a
reason to converge (pinned separately below). Dominant reason and diagnostic
truth are independent, which is exactly codex's point.

## RED — the reported-defect mutant, and what it does and does not prove

**Labelled honestly: this is NOT a pre-implementation RED.** The host hold in
force at dispatch ("write the code and the test now, run nothing until released")
forced the order write → commit → run, so the RED frame is the reported-defect
mutant `T7B-M1`, which restores codex's defect verbatim at the line he named:

`logs/t07/t7b-mut-T7B-M1-no-evidence-arm-erases-moved.log`

```
-      movedRootNodeIds: moved,
+      movedRootNodeIds: Object.freeze([]),

 × T7 / codex r2 B2 … > keeps NO_MEASURED_EDGE as the reason WITHOUT deleting the movement it computed
 ❯ tests/unit/t07-adaptive-stopping.test.ts:1576:39
   Tests  1 failed | 62 passed (63)

D24 COUNTS  pre=0  applied=1  restored=0
```

D24 shape (post-addendum): the token IS the mutation, printed verbatim between
`<<<TOKEN` and `TOKEN>>>`; the three counts are enforced gates; the mutation diff,
discriminating result, restore command and both-side `shasum -a 256` are all
present, and the pre-apply and post-restore hashes are identical
(`bc2b4fe35ceb…`).

**What this evidence has and lacks.** A mutant-as-RED proves the assertion
*catches* the defect; it cannot prove the assertion was written before its author
knew the answer. Here that second property comes from provenance instead of
sequence: the expected values are codex's published input, fixed by someone else
before I wrote a line.

## GREEN — the pin, and the gates at the filed tip

The test asserts the reason **together with** the record it used to contradict:

```ts
decideRoundBoundary({ ...boundaryInput, measuredEdgeCount: 0 })
→ kind CONTINUE · reason NO_MEASURED_EDGE · measuredEdgeCount 0
  maxRootMovement 0.25 · movedRootNodeIds ["root:A"]
  comparedRootNodeIds ["root:A"] · uncomparedRootNodeIds ["root:B"] · expectedRootCount 2
```

A second test pins that this record still does not stop: `kind` is not `STOP` and
the reason is not `GLOBAL_DELTA_CONVERGED` — J15(b) is unaffected by T7B.

| gate | log | result |
|---|---|---|
| root typecheck | `t7b-typecheck.log` | **`tsc exit=0`** |
| unit cluster run 1/3 | `t7b-unit-r1.log` | `Tests 63 passed (63)` |
| unit cluster run 2/3 | `t7b-unit-r2.log` | `Tests 63 passed (63)` |
| unit cluster run 3/3 | `t7b-unit-r3.log` | `Tests 63 passed (63)` |
| zone cluster run 1/3 | `t7b-zone-r1.log` | `Tests 230 passed (230)` |
| zone cluster run 2/3 | `t7b-zone-r2.log` | `Tests 230 passed (230)` |
| zone cluster run 3/3 | `t7b-zone-r3.log` | `Tests 230 passed (230)` |

Worst run GREEN in both clusters; failure membership empty six times. Unit 61 → 63
and zone 228 → 230 (the two new tests). Host load 16.8–25.0 across the runs. The
zone cluster was not required by the packet — it is run because T7B edits a shared
package, and it is the cheapest check that nothing else consumes the changed arm.
Per the release instruction no full-suite run was attempted; the D15 batch suite
on integration remains the binding pre-merge measurement (codex r3, binding).

D16 is not triggered: this round's diff is `packages/propagation/src/index.ts`
plus its unit file, and neither Next app imports propagation.

## ARM SCAN — the class, enumerated (packet task 5: report, do not fix)

`decideWithScope` returns eight arms. Every one, classified:

| # | arm | `maxRootMovement` | `movedRootNodeIds` | verdict |
|---|---|---|---|---|
| 1 | `ROUND_1_FLOOR` | computed | `moved` | truthful (r4) |
| 2 | `DEPTH_CEILING` | computed | `moved` | truthful |
| 3 | `NO_PREVIOUS_ROUND` | `null` | literal `[]` | **safe** — inside `movement === null`, where `moved` is empty by construction |
| 4 | `ROOT_SCOPE_INCOMPLETE` (nothing comparable) | `null` | literal `[]` | **safe** — same branch, same reason |
| 5 | `NO_MEASURED_EDGE` | computed | literal `[]` | **THE DEFECT — fixed this round** |
| 6 | `ROOT_SCOPE_INCOMPLETE` (coverage) | computed | `moved` | truthful (r4) |
| 7 | `GLOBAL_DELTA_CONVERGED` | computed | literal `[]` | **safe** — only reachable when `moved.length === 0`, so the literal *is* `moved` |
| 8 | `ROOT_MOVED` | computed | `moved` | truthful |

Exactly one erasure, and it is the one fixed. This matches codex r3's independent
scan ("the other hard-coded empties justified: no previous comparison, no
comparable root, or proven convergence").

**Observation, recorded as a follow-up recommendation and deliberately NOT acted
on** (out of T7B's scope; the coordinator has recorded it): arms 3, 4 and 7 write
a literal `Object.freeze([])` where `moved` is provably identical. They are
correct today, and they are the same construct that produced both this defect and
codex r2 B2 — a hard-coded empty sitting beside a computed value. Writing `moved`
uniformly would remove the *class* rather than its instances, and no arm's
behaviour would change.

## FINDINGS

**CLOSED** — codex r3 **B1**: the arm returns the computed moved roots; codex's
exact input is pinned with the reason asserted alongside `maxRootMovement 0.25`
and `movedRootNodeIds ["root:A"]`; the reported-defect mutant is filed in valid
D24 shape.

**Why r4 missed it, on the record.** r4's seven-arm interface-contract test
*constructs* this exact input at
`tests/unit/t07-adaptive-stopping.test.ts` (the `measuredEdgeCount: 0` arm) and
asserts only the `maxRootMovement === null ⟺ comparedRootNodeIds.length === 0`
biconditional, which that arm satisfies. The fixture was rich enough to
discriminate and the assertion was not. That test is unchanged — it tests a
different property, and the new test covers the record.

**No new findings.** The arm scan produced no second defect.

**One-way-door clause (F-T5-10).** T7B creates no DDL, no persisted field, no new
mark value, no append-only/UNIQUE/filtered-reader shape, and no vocabulary change.
It alters one field of an in-memory decision record that has no persisted
representation.

**Packet check (§1).** Every constant verified: ticket path ✓, lane tip `b64c1d04`
clean at dispatch ✓, V's authorization at the DECISIONS tail ✓, codex r3 B1's
cited lines resolve to the arm described ✓, D24 addendum and D27 read before
starting ✓. **No packet defects found.** The packet's stop condition ("if the fix
needs any other file, stop and say so") did not trigger.

## PROPERTIES PINNED — T7B addition

18. A decision may outrank a fact without deleting it: `NO_MEASURED_EDGE` remains
    the dominant reason while the record still names the movement and the roots
    the body computed.

## COMMITS

```
3ea7fd3 T7B: NO_MEASURED_EDGE outranks the movement, it does not delete it
```

One commit, made before any gate ran (D27). r4's two, r3's four, r1/r2's six and
the orchestrator's checkpoint are listed in the sections above.

```
$ git rev-list --count 7433be7..HEAD
14
$ git diff --summary 7433be7..HEAD | grep -c "mode change"
0
$ git diff --stat b64c1d04..HEAD
 .../packages/propagation/src/index.ts              |  8 ++++-
 .../tests/unit/t07-adaptive-stopping.test.ts       | 37 ++++++++++++++++++++++
 2 files changed, 44 insertions(+), 1 deletion(-)
```

Reproduce the report hash: `sed '2d' <this file> | shasum -a 256` (D21).

---

# T7 merge — mission `1fad4e16` (TINT1 + T6 + S06) into `lane/t7`

Not a rework round and not a code change to T7's own semantics: this is the
integration merge the orchestrator ordered after T7 was judged PASS.

```
merge commit 376a614c7cd4b08eecfa447d229e911f1cfb4c32
tree         0b33a0a6f84bb7c38d1f97bdd9cf8531cf8fa616
parents      3ea7fd33 (lane/t7, T7B)  +  1fad4e16 (mission)
```

`git merge --no-ff 1fad4e16`. **Nine conflict hunks across eight files. Every one
resolved by KEEPING BOTH SIDES. No landed assertion weakened, no lane's semantics
changed, so no BLOCK was required.** Every gate below ran at that commit and tree,
on a clean tree, stamped in its own log header (D27).

## Every conflict hunk and its resolution

| # | file | hunk | resolution |
|---|---|---|---|
| 1 | `apps/runner/src/index.ts` | `RunnerSettings`: T7's `stoppingPolicy?` vs S06's `verdictLabelPolicy?` at the same insertion point | **Both kept.** Independent optional fields; both doc comments retained verbatim. |
| 2 | `apps/runner/src/index.ts` | startup guards: T7's `ADAPTIVE_STOPPING_UNRESOLVED` (binds at M≥2) vs S06's `VERDICT_LABEL_CONTROLS_UNRESOLVED` (binds always) | **Both kept**, ordered J12 → T7 → T11. See the ordering note below. |
| 3 | `packages/serve/src/index.ts` | condition-mark record union: `BRANCH-FROZEN-LOW-LEVERAGE` vs `LABEL-BASIS-INCOMPLETE` | **Both marks named** in one union. Union order is not semantic; it mirrors the kernel's mid-list placement. |
| 4 | `acceptance/main.ts` | runner settings: `stoppingPolicy` vs `verdictLabelPolicy` | **Both entries kept.** Both source identifiers (`adaptiveStopping`, `verdictLabels`) were already destructured together by the auto-merge at `:412`. |
| 5 | `tests/integration/database.test.ts` | `runnerSettings()` helper: both policy blocks | **Both kept.** The shared `}\n},` tail closes the second; the first is closed explicitly. |
| 6 | `.hermes/TOOLING-TRAPS.md` | both lanes appended trap blocks | **Both blocks kept in full** (append-only file), ours first, then the incoming lanes'. Spot-checked one entry from each side survives. |
| 7 | `tests/unit/dr174-resilience.test.ts` | comment above a **count pin** | **Both narratives merged; the pin raised 32 → 33.** See the arithmetic below. |
| 8 | `tests/unit/obs-l2-s02-registry.test.ts` | comment above the severity-map **count pin** | Same: merged comment, pin 32 → 33. |
| 9 | `tests/unit/s14-ui.test.ts` | comment above a **count pin** | Same: merged comment, pin 32 → 33. |

### Hunk 2 — the guard ordering, and why it changes nothing

Both guards throw before the work item is claimed. Order is observable only if a
run reached them with BOTH policies unset. It does not affect either lane's
landed assertion, and I checked rather than assumed: T7's test omits **only**
`stoppingPolicy` from a `runnerSettings()` helper that supplies both, and S06's
omits **only** `verdictLabelPolicy` — so in each case the other guard passes and
the expected code is the one thrown. I placed T11's guard last so that T7's
comment ("same shape and same place" as the J12 gate *directly above*) and S06's
("beside J12's") both remain true; a comment made false by a merge is the same
class of defect this lane spent three rounds on.

### Hunks 7–9 — the count arithmetic, stated because it is the one number I changed

The mark vocabulary is **31 at base `7433be7`; 32 at T7's tip; 32 at `1fad4e16`;
33 merged** — each lane minted one. Three landed pins asserted 32 and are now 33:

```
tests/unit/dr174-resilience.test.ts      expect(CONDITION_MARKS).toHaveLength(33)
tests/unit/obs-l2-s02-registry.test.ts   expect(Object.keys(CONDITION_MARK_SEVERITY)).toHaveLength(33)
tests/unit/s14-ui.test.ts                expect(CONDITION_MARKS).toHaveLength(33)
```

**This is the merge's arithmetic, not a loosened assertion** — each remains an
exact count that still fails on any accidental append. I grepped the whole tree
for mark-count pins so none was left stale: those three are the only ones. The
two `new Set(labels).size === CONDITION_MARKS.length` assertions are derived and
needed no change; the other `32`s in the suite (argon2 salt lengths, registration
slots) are unrelated and untouched.

## Auto-merged, verified by hand rather than trusted

- **`packages/kernel/src/index.ts`** — both mints present exactly once, both
  MID-LIST with their own DR-176 comments, and the positional tail is exactly
  `HIDDEN-UNJUDGEABLE, DERIVED-STANDING-UNREVIEWED, HIDDEN-LOW-SCORE,
  UNAUTHORED-BRANCH-HALTED` (measured from the array's own bounds, not eyeballed).
  Four tests read that tail via `slice(-4)`; all four pass.
- **`apps/ui/lib/v3/labels.ts`** and **`web/lib/v3Presentation.ts`** — one forced
  label line per mint in each surface (4 lines total), as J5/J11 require.
- **T7's boundary code survived S06's served-root replacement intact**:
  `selectAuthoritativeRootScope`, `selectPreventableBranches`,
  `deriveGlobalRoundCompletions`, `runAdaptiveStoppingRound`, `decideRoundBoundary`
  and `closeGlobalRound` are all present, and the live seam still reads
  `rootNodeIds: rootScope.rootNodeIds,` / `expectedRootCount: rootScope.expectedRootCount,`
  — the exact text T7's structural seam pin greps, which is why that pin still passes.

## Gates at the merged tip

Every log header carries `commit 376a614c…` and `tree 0b33a0a6…` with a clean
`git status --porcelain` (D27). Host: focused and zone runs only, no full suite.

| gate | log | result |
|---|---|---|
| `pnpm run generate:contract` | `merge-generate-contract.log` | **exit 0** |
| root typecheck | `merge-typecheck.log` | **`tsc exit=0`, 0 errors** |
| T7 unit cluster ×3 | `merge-unit-r{1,2,3}.log` | `63 passed (63)` · `63 passed (63)` · `63 passed (63)` |
| S06 t10 + t11 clusters | `merge-s06-t10-t11.log` | `30 passed (30)` — T7's merge did not break them |
| zone cluster ×3 (9 files) | `merge-zone-r{1,2,3}.log` | `230 passed (230)` three times |

**Zone set-equality by NAME against `1fad4e16`** — baseline measured on a clean
detached checkout of `1fad4e16`, in the self-proving artifact
**`merge-zone-base-refile.log`** (see the evidence repair below; it supersedes the
first `merge-zone-base.log`):

```
baseline (8 files) : 167 passed (167)   failing names: {}
merged   (9 files) : 230 passed (230)   failing names: {}
SET-EQUAL BY NAME — 0 new, 0 vanished
```

The baseline runs 8 files because `tests/unit/t07-adaptive-stopping.test.ts` does
not exist at `1fad4e16`; it contributes 63 tests and no failures at the merged
tip, which is the whole of the 167 → 230 difference.

**D14/D16 pairs against `1fad4e16`** (the merge brings in `packages/kernel` and
`packages/contract` changes, so both gates are required):

| surface | baseline `1fad4e16` | merged tip | new |
|---|---|---|---|
| `tsc --noEmit -p apps/ui/tsconfig.json` | 1 — `apps/ui/app/layout.tsx(3,8): TS2882` | 1 — identical | **0** |
| `tsc --noEmit -p web/tsconfig.json` | 1 — `web/app/layout.tsx(3,8): TS2882` | 1 — identical | **0** |

Both pairs **set-equal, 0 new and 0 vanished**. (D23 ADDENDUM-2 retires the web
gate at W12b when `web/` goes; it still exists on this mission base, so it is
still reported.)

**Provenance:**

```
$ git diff --summary 1fad4e16..HEAD | grep -c "mode change"
0
$ git diff --summary 7433be7..HEAD | grep -c "mode change"
0
$ git rev-list --count 7433be7..HEAD
42
$ git status --porcelain
(empty)
```

`git diff --stat 1fad4e16..HEAD` = 14 files, +2715/−56 — T7's own contribution on
top of the mission, dominated by its unit file (1652 lines) and propagation (468).

## FINDINGS

**No BLOCK.** No resolution changes a landed lane's semantics: every hunk was
additive, both sides survive in all nine, and the only value I altered is the
mark-count pin, which is the arithmetic consequence of two mid-list mints.

**No new findings.** The merge produced no failing test at either tip and no new
diagnostic on either surface gate.

Not re-run this round, and disclosed: the heavy integration cluster and the
acceptance suites (host restricted to focused and zone runs; a peer suite was
finishing). The **D15 batch suite on integration remains the binding pre-merge
measurement** (codex r3, binding) and this filing does not stand in for it.

## EVIDENCE REPAIR — the zone baseline now proves its own provisioning

Merge-review finding, evidence-only, no product defect: the first baseline log
(`merge-zone-base.log`) recorded the vitest command but **not its own
`generate:contract`** — I had redirected that command to `/dev/null` and echoed
only its exit code to the terminal, so it never entered the artifact. Contract
output is gitignored, so nothing in that log ruled out the baseline having run
against artifacts generated at the merged tip. The finding is correct: that log
contains zero occurrences of the string `generate:contract`.

Refiled as **`logs/t07/merge-zone-base-refile.log`** — one stamped log that proves
its own provisioning instead of asserting it:

```text
[1] git rev-parse HEAD         -> 1fad4e166019b027c5bbc362451b602531d58401
    git rev-parse HEAD^{tree}  -> d888dcf21f2d61ca5f7d77202b0ab1ceeed0f9db
    git status --porcelain     -> (empty)
[2] rm -rf packages/contract/generated
    ls packages/contract/generated -> No such file or directory
[3] $ pnpm run generate:contract        ... exit=0     (full command and output)
[4] sha256 of each generated artifact, and the combined fingerprint
[5] $ npx vitest run <8 zone files>     -> Tests  167 passed (167)
[6] git rev-parse HEAD unchanged; git status --porcelain still empty
```

Step [2] is the point: the generated directory is **destroyed and shown absent**
before step [3] regenerates it, so nothing from the merged tip can survive into
the measurement. The result is unchanged at `167 passed (167)`.

One fact the repair surfaced, recorded because it cuts against my own defence
rather than for it: the combined artifact fingerprint at `1fad4e16` is
`857a92737327f28ed46c4ce0ebccb4b085b8eb1bfd18a88fce51e048208788dc`, **byte-identical
to the merged tip's** — T7 changes nothing under `packages/contract`, so both
checkouts generate the same bytes, and the original measurement could not have
been contaminated in a way that altered its result. That does not rescue the old
log. An artifact that cannot prove its own provisioning is inadmissible whether or
not it happened to be right — the same standard D24 applies to mutant transcripts
and D27 to stale tips. Both statements belong on the record.

The lane is untouched by this repair: tip still `376a614c`, tree still
`0b33a0a6`, `git status --porcelain` empty, no product or test change.

Reproduce the report hash: `sed '2d' <this file> | shasum -a 256` (D21).
