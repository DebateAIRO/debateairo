CODEX REVIEW T7 r2 — CHANGES · comments read through: t07-r2-2026-09-01

# T7 codex peer review r2

## VERDICT

**REWORK / CHANGES.** Finding count: **4** — **B1-B2 blocking**, **N1-N2
non-blocking but mandatory**. This review opens the worker's last lawful rework, 3/3; it
does not open an unlawful round 4.

The r3 work does close the original live-caller standing filter and the false
`BRANCH-FROZEN-LOW-LEVERAGE` marks. The current live closure constructs a maker-count
scope without standing, passes its two fields unchanged, refuses convergence on a short or
uncomparable scope, and marks only branches with future descendant work. The exact dyadic
arithmetic, lawful round-0/1/2 walk, derived boundaries, non-vacuity gate, canonical mark
placement, one-way-door analysis, stored suite totals, mutation transcripts, D16 pairs,
and report hash also check statically.

Approval remains blocked for two related contract failures. The supposedly required
maker-root count is still optional at the exported strict decision, so a direct caller can
recreate r1 B1 by narrowing the roots and omitting the count. Separately, the live
partial-root branch bypasses the strict decision's validation and movement calculation. It
can list root A as compared while returning `maxRootMovement: null` and no moved roots even
when A moved by exactly `1/4` against a non-null previous round.

## FINDINGS

### B1 — `expectedRootCount` remains optional at the exported strict decision, so a narrowed caller can still buy convergence

**Files/lines:** `dialectical-engine/packages/propagation/src/index.ts:780-795`,
especially `:789-794`; `:837`; `:897-920`. Worker report
`agent-reports/t07-stopping.md:390-397`.

**Concrete failure:** consider a two-maker run in which a caller has pre-filtered root B.
It calls the exported `decideRoundContinuation` with:

```text
completedRounds = 2
depthCeiling = 5
rootNodeIds = ["root:A"]
previous root:A strength = 1/2
current root:A strength = 1/2
measuredEdgeCount = 1
delta = 0.01
expectedRootCount = OMITTED
```

The input type explicitly permits that omission at line 794. Line 837 then substitutes
`rootNodeIds.length`, so `expectedRootCount` becomes 1. Movement is exactly 0,
`compared.length === expectedRootCount === 1`, and lines 912-920 return:

```text
STOP / GLOBAL_DELTA_CONVERGED
comparedRootNodeIds = ["root:A"]
uncomparedRootNodeIds = []
expectedRootCount = 1
maxRootMovement = 0
```

The real run has two maker roots, and root B was not compared. This is the original B1
failure at the public pure API. It directly contradicts the packet's REQUIRED-field check
and the report's statement that the law now lives where “no caller can get around it.” The
current live runner does supply the count; that makes today's closure safe but does not make
the exported decision closed by construction.

**Evidence:** this is a direct type-and-control-flow derivation. The production signature
uses `expectedRootCount?: number`; the fallback is `input.expectedRootCount ??
input.rootNodeIds.length`; the only coverage gate compares against that fallback. A static
call-site scan found no current non-test product caller other than
`decideRoundBoundary`, but exported API correctness cannot depend on every future caller
remembering an optional fact that the ruling makes mandatory.

**Required fix:** make `expectedRootCount` required on
`decideRoundContinuation` itself, update every strict call site to state the run's expected
root count, and remove the fallback to the supplied scope length. Add a compile-time
negative contract fixture showing omission is rejected, plus the runtime shortened-scope
case above with `expectedRootCount: 2`, which must continue as
`ROOT_SCOPE_INCOMPLETE`. The current labelled structural live-seam pin may remain; this fix
makes its downstream safety claim true even if the source-reading pin is later removed.

### B2 — the partial-root boundary bypasses validation and records no movement for roots it says it compared

**Files/lines:** `dialectical-engine/packages/propagation/src/index.ts:702-719`,
especially the field contracts at `:705-718`; `:947-990`, especially the early partial
branch at `:958-990`; `dialectical-engine/tests/unit/t07-adaptive-stopping.test.ts:923-957`
and `:1220-1243`. Worker report `agent-reports/t07-stopping.md:393-416` and
`:526`.

**Concrete failure:** call `decideRoundBoundary` with a valid two-root run:

```text
completedRounds = 2
depthCeiling = 5
rootNodeIds = ["root:A", "root:B"]
expectedRootCount = 2
previous strengths = { root:A: 1/2 }
current strengths = { root:A: 3/4 }
root:B is absent from both strength sets
measuredEdgeCount = 1
delta = 0.01
```

Root A is comparable and moved by exactly
`|3/4 - 1/2| = 1/4 = 0.25 > 0.01`; root B is uncomparable. Lines 959-963 partition
the IDs as `compared = ["root:A"]`, `uncompared = ["root:B"]`. Because the latter is
non-empty, line 968 does not call the strict decision or `rootMovement`. Lines 987-990
instead return, by inspection:

```text
CONTINUE / ROOT_SCOPE_INCOMPLETE
maxRootMovement = null
movedRootNodeIds = []
comparedRootNodeIds = ["root:A"]
uncomparedRootNodeIds = ["root:B"]
expectedRootCount = 2
```

The continuation itself is conservative, but the record is false twice. The interface says
`maxRootMovement` is null **only** when there is no previous round; this input has one. It
also says `comparedRootNodeIds` names roots the decision actually compared, but the partial
branch only checked map membership and never subtracted A's strengths. The current partial
fixture asserts the two ID lists but uses a stable A and never asserts `maxRootMovement` or
`movedRootNodeIds`, so it cannot detect this failure.

The same bypass defeats the newly pinned guards. For example, keep B uncomparable but set
`expectedRootCount = 1` while supplying `[A, B]`. The strict function would throw
`STOPPING_ROOT_SCOPE_OVERFULL`; `decideRoundBoundary` returns
`ROOT_SCOPE_INCOMPLETE` instead because it partitions before delegating. Invalid delta,
round, ceiling, measured-edge count, and expected-count values likewise avoid the strict
validation whenever any root is uncomparable. The MN2 tests at lines 1220-1243 exercise
`decideRoundContinuation`, not the outer boundary used by the live runner.

**Evidence:** the root cause is the early return architecture, not a guessed output.
`decideRoundBoundary` delegates to the validated strict decision only when
`scope.uncompared.length === 0`; every partial scope follows literal object-return arms
whose movement fields are hard-coded to null/empty. This also refutes the report's broader
claim that only the convergence arm is gated: on the partial path a real moved-root arm is
never evaluated.

**Required fix:** validate the full boundary input before partition-dependent returns, and
calculate movement for every comparable root even when other expected roots are
uncomparable. The example record must report `maxRootMovement: 1/4` and
`movedRootNodeIds: ["root:A"]`; the implementation may retain
`ROOT_SCOPE_INCOMPLETE` as the dominant reason or define a documented precedence with
`ROOT_MOVED`, but it may not erase either fact. Keep convergence impossible unless compared
coverage reaches the mandatory expected count. Add outer-boundary tests for (a) one moved
comparable root plus one uncomparable root and (b) the overfull/invalid expected-count
guards, then mutate the outer path rather than only the strict helper.

### N1 — the worker report's commit count is still false

**Files/lines:** primary worker report `agent-reports/t07-stopping.md:458-460` and
`:612-617`.

The report says the true count from base is 10. Fresh read-only metadata gives:

```text
$ git rev-list --count 7433be7..HEAD
11

1b08f7f2
940a36d1
0a7396d2
e48e2b5a
61325896
89565aa1
c248f7f5
2d40ae17
e9ef1041
87eaf8b8
754090a0
```

The arithmetic is six r1/r2 commits, the orchestrator's checkpoint, and four r3 commits:
`6 + 1 + 4 = 11`. The report's per-round r3 list and diff statistics are correct; only
the prose total is not.

**Required fix:** change both occurrences of 10/Ten to 11/Eleven and generate the total
from `git rev-list --count 7433be7..HEAD` in future reports. **Routing ticket:** T7 final
rework report-metadata correction; non-blocking does not make it optional.

### N2 — the epsilon discriminator is higher, but not “one representable step” above `1/8`

**File/lines:** `dialectical-engine/tests/unit/t07-adaptive-stopping.test.ts:246-252`,
especially the test title at `:246` and `epsilon: 0.126` at `:252`.

The exact leverage is `1/8 = 0.125`. In IEEE-754 binary64, the spacing immediately above
`1/8` is `2^-55`, so the next representable value is exactly:

```text
1/8 + 2^-55
= (2^52 + 1) / 2^55
≈ 0.1250000000000000277555756156289135
```

The literal `0.126` is higher and correctly makes the strict predicate
`1/8 < epsilon` true, but it is not the next representable value. The behavior under test
is sound; the test's exact numeric claim is false in a lane whose contract requires exact
threshold arithmetic.

**Required fix:** either rename the case to say “when epsilon rises above it” or construct
the actual next binary64 value with a reviewed `nextUp` helper and retain the stronger
wording. **Routing ticket:** T7 final rework exact-threshold test wording; mandatory but
non-blocking.

## R1 FINDING DISPOSITIONS AND REQUIRED RULINGS

### B1 fixture substitution — accepted in principle, with a bounded risk

I accept closure-by-construction plus the explicitly labelled structural pin as a
proportionate substitute for the 45–90 minute partial-standing embedded-postgres fixture
for this lane. `selectAuthoritativeRootScope` receives maker count and authored root IDs,
not standing; the live closure passes `rootScope.rootNodeIds` and
`rootScope.expectedRootCount` unchanged; and the downstream expected-count gate prevents a
narrowed scope from converging. The source-reading test is honestly labelled structural
rather than behavioural.

The accepted residual risk is that a syntax-coupled source pin can miss a semantically
equivalent refactor or a caller that forges both fields. F-T7-11 records that risk and the
true integration fixture remains the better long-term proof. I do **not** require that
fixture inside rework 3/3. B1 remains open here for the narrower, concrete reason in this
review: the exported strict input still makes the authoritative count optional. Once that
field is mandatory at the law's own API, the substitution is sufficient for this lane.

### Record truth and N1's lawful three-state walk — accepted for the no-previous-round path

The corrected live sequence on identical measured graphs is lawful under J15(c):

```text
at(0, previous=null): CONTINUE / ROUND_1_FLOOR
  compared=[]; uncompared=[A,B]; expected=2; max=null

at(1, previous=null): CONTINUE / NO_PREVIOUS_ROUND
  compared=[]; uncompared=[A,B]; expected=2; max=null

at(2, previous=round1): STOP / GLOBAL_DELTA_CONVERGED
  compared=[A,B]; uncompared=[]; expected=2; max=0
```

At round 0 the floor applies; at round 1 the pre-expansion graph is a baseline rather than
a previous round; only at round 2 is there a prior completed round. The report correctly
withdraws r2's impossible completed-round-1/non-null-previous STOP construction. This
acceptance does not cure B2 above, which concerns a different state: a non-null previous
round with a mixed comparable/uncomparable scope.

### B2 no-mark arm and RED-before-GREEN — accepted

J15 ADDENDUM-2 selected mark truth, not a round-major replan. The implementation now makes
freeze decisions for every carrying branch but builds condition-mark records only for
`frozenAndPrevented`. An already expanded branch may enter `frozenIndices`, but it has no
future descendants, so the write is a no-op and no false record is published. No new mark
was minted in r3: the only T7 value remains `BRANCH-FROZEN-LOW-LEVERAGE` at
`packages/kernel/src/index.ts:80`, beside `LEVERAGE_UNRESOLVED`; the positional tail remains
`HIDDEN-UNJUDGEABLE`, `DERIVED-STANDING-UNREVIEWED`, `HIDDEN-LOW-SCORE`,
`UNAUTHORED-BRANCH-HALTED`.

For M=2, depth=2, independent zero-based enumeration is:

```text
root 0: round-1 legs 0,1 -> carrying children 2,3
        round-2 descendant legs 2,3,4,5
root 1: round-1 legs 6,7 -> carrying children 8,9
        round-2 descendant legs 8,9,10,11
global round-1 boundary = 7
carrying = [2,3,8,9]
preventable after boundary = [8,9]
global round-2 boundary = 11; preventable = []
```

For depth `d`, one root has `L = 2 + 4 + ... + 2^d = 2^(d+1)-2` legs. In a
root-major M-maker plan the zero-based global round-k boundary is
`(M-1)L + 2^(k+1)-3`. This gives `[7,11]` for (depth=2,M=2), `[15,19,27]` for
(3,2), `[13,17]` for (2,3), and `[61,65,73,89]` for (4,3). At every non-final
boundary only the last maker's round-k children have future descendants, their authored
subtrees are empty at that point, and the final boundary has none. The product selector
implements that property rather than only the symmetric enumeration.

The RED-before-GREEN evidence is sufficient for the product correction. The prior seat's
`r3-RED-B1-B2-N1.log` genuinely failed because `selectPreventableBranches` did not exist
and because the record was emitted for a nonpreventable frozen branch. MB2b later restores
that exact false-record behavior and is caught. The three generality tests were green at
inherit and therefore are characterization tests, not a claimed TDD RED; the worker
discloses that correctly. MB2a makes all four B2 tests fail and proves those characterizing
tests discriminate the generalized property. They do not need a fictional pre-implementation
RED to be useful or honest.

## EXACT DYADIC RECOMPUTATION

The propagation arithmetic remains exact. With support aggregate
`agg(values) = 1 - product(1-value)` and support greater than attack,
`sigma(tau,a,s) = tau + (1-tau)(s-a)`:

| case | independent exact derivation | result |
|---|---|---|
| base root | heavy contribution `1/2 * 1/2 = 1/4`; root `1/2 + (1/2)(1/4)` | `5/8 = 0.625` |
| converged addition | whisper contribution `1/64 * 1/2 = 1/128`; aggregate `1-(3/4)(127/128)=131/512`; root `1/2+(1/2)(131/512)` | `643/1024 = 0.6279296875`; movement `3/1024 = 0.0029296875 < 0.01` |
| moved discriminator | loud contribution `1/4 * 1/2 = 1/8`; aggregate `1-(3/4)(7/8)=11/32`; root `1/2+(1/2)(11/32)` | `43/64`; movement from `5/8=40/64` is `3/64 = 0.046875` |
| root-scoped leverage | removing heavy moves root `5/8 -> 1/2`; removing light moves an intermediate node but its root edge is UNKNOWN | heavy `1/8 = 0.125`; light `0` |
| equality laws | moved predicate is strict `movement > delta`; freeze predicate is strict `leverage < epsilon` | movement `3/64` at delta `3/64` STOPS; leverage `1/8` at epsilon `1/8` CONTINUES |
| B2 record counterexample | comparable A moves `1/2 -> 3/4` | exact movement `1/4 = 0.25`, not null |

The report's dyadic values remain correct. N2 is specifically about calling `0.126` the
next representable value, not about the strict epsilon behavior.

## MUTANTS AND STORED SUITES

Static review of the stored transcripts confirms:

- MB1a restored the exact live standing filter. It survived at the checkpoint (37/37) and
  after the semantic invariant (46/46), then the labelled structural seam pin caught it
  with 1 failed / 46 passed. This accurately establishes both the pin and its limitation.
- MB1b was caught with 2 failures; MB1c with 1; MB1d with 3; MB2a with 4; MB2b with 1.
- MN1 (`index >= boundaryLegIndex`) survived 49/49. That is a true neighbour on reachable
  root-major plans because the boundary leg's parent is a maker root, not inside a carrying
  child's subtree.
- MN2 initially survived and was correctly reclassified as a gap. Its strict-helper recheck
  is caught with 1 failure / 48 passed. B2 above records the remaining outer-wrapper gap.
- Each reviewed mutant transcript names a token, prints a changed hash, runs the focused
  suite, restores, shows no product-file porcelain output, and prints the original hash
  again.

Stored suite evidence matches the report:

```text
r3b-FINAL: 1 file, 49 passed; root tsc exit=0
r3b-zone-r1: 9 files, 216 passed
r3b-zone-r2: 9 files, 216 passed
r3b-zone-r3: 9 files, 216 passed
r3b-intg-r1: 1 failed | 65 passed (66)
r3b-intg-r2: 1 failed | 65 passed (66)
r3b-intg-r3: 1 failed | 65 passed (66)
stored base integration: 1 failed | 64 passed (65)
```

All three tip integration failures have the same membership as the stored base failure:
`claims, judges through the HTTP gateway, propagates, serves, and settles`. The worker
explicitly did not remeasure base; the comparison is to the r1 stored artifact, which is
acceptable as disclosed pending D15.

The UI base and tip logs are byte-identical and each contain only
`apps/ui/app/layout.tsx(3,8): TS2882`; SHA-256 is
`6729556094431e66e106dbe8c340436ed2b15bdaf6bd0593e45559108c26f1e9` on both.
The web pair is likewise byte-identical with only
`web/app/layout.tsx(3,8): TS2882`; SHA-256 is
`7692c06ab0582cb9f020d3fcc53338d9ab7d3cb72ac2287b72ea37b6a3075670` on both.

The architecture audit pair is byte-identical at
`dc0a7a867d159dc8edca62ca446087b6415322428df283210b1839ac5f494c7e`
and contains the same three pre-existing `obs-capture` edge violations. The source audit
pair is byte-identical at
`93a3f80a6da26c98011f04d24c3bb2e2c5ca4ace0d78caf0548479667b3ab763`
and contains the same three pre-existing environment-read violations. The orphan audit
stored exit is clean.

## F-T7-10, PARTIAL SAVINGS, AND THE ONE-WAY DOOR

F-T7-10's core analysis is true: if even one expected maker root remains permanently
uncomparable, compared coverage can never reach the maker count, so a delta-convergence
stop is impossible. The loop still terminates because the ASK-time ceiling is unconditional.
Individual author calls may disappear through epsilon freezes or halted branches, but the
global boundaries and pure propagation decisions continue to the ceiling.

The interaction with J15 ADDENDUM is sharper than “some partial savings.” Delta stopping is
disabled for the entire run, making epsilon/halt the only adaptive call savings. At a late
root-major global boundary, only the last maker's carrying branches still have preventable
future work; earlier makers have already paid their next-level author calls. Thus a single
permanently uncomparable root can force every later round boundary while the accepted epsilon
timing still cannot save earlier-maker work. The judge should weigh that coupled worst case
under V-T7-r2-1. It does not make the present conservative convergence rule wrong; weakening
coverage would restore false convergence.

No r3 one-way door is created. There is no DDL, persisted field, new mark mint, append-only
UNIQUE reader shape, or positional vocabulary change. `ROOT_SCOPE_INCOMPLETE` occurs only in
the in-memory `RoundContinuationReason` union and propagation decision code; a static search
found no persisted representation or external reader. The r2 condition mark remains mid-list
and the DR-176 tail is unchanged.

## PACKET AND REPORT AUDIT

- Board state resolved and matched the packet: T07 was `waiting_review`,
  `rework_round: 2`.
- Rulings were read first. J15 ADDENDUM-2 narrows B2 to truthful marking and leaves the
  round-major replan to V-T7-r2-1. D22 establishes checkpoint `c248f7f` and a fresh r3 seat.
- Base `7433be7`, checkpoint `c248f7f`, and tip
  `754090a079629243594eb06d06748fd1e925c793` resolve in the lane history.
- `git diff c248f7f..HEAD` is exactly four files, +466/-24; the tooling-traps file is
  docs-only +16. `git diff 7433be7..HEAD` is 14 files, +2377/-51.
- The report's r3 heading begins at line 316. Its line-2 hash verifies under the packet's
  D21 recipe `sed '2d'` as
  `59ef6101c58157e965e37e3cfd6843a8c8bfa6e61dcd87df1a9492b51ec526ec`.
- The resume packet's base, checkpoint, checkpoint-diff path, verdict path, ruling IDs, and
  SPEC path resolve. The worker correctly discloses both its historical `tail -n +3` versus
  current `sed '2d'` hash-recipe discrepancy and the resume packet's verdict-before-ruling
  ordering hazard.
- The r2 review packet itself correctly says to count commits independently rather than
  endorsing the worker's “ten”; N1 is therefore a worker-report defect, not a packet count
  defect.
- The original packet's primary-checkout filing paths were outside this seat's writable
  mount. The first filing attempt was rejected without writing. The explicit recovery
  instruction superseded only the output destinations and authorized these two worktree
  files; it did not alter the review evidence or verdict.

## STATIC VERIFICATION

This was a static review as ordered. I read the r2 packet in full before the role contract,
then the named rulings, ticket, resume packet, r3 report and self-report, source diff, focused
source/test regions, and stored logs. Read-only metadata checks established the clean tip,
11-commit count, exact diff surfaces, clean `git diff --check`, report hash, D16 hashes, audit
hashes, suite totals, failure membership, and mutant restore hashes. I independently derived
the root-major boundary formula, enumerated M=2/depth=2 without importing product code, and
recomputed every quoted dyadic value as fractions.

No product file, git state, board row, provider, database, dependency, or test process was
mutated or invoked. The only writes are this recovered verdict and its separate r2
self-report, as authorized by the recovery instruction.

## NOT VERIFIED

- I ran no reviewer-owned tests, builds, typechecks, mutation commands, installs, database
  fixtures, browser flows, or provider calls. All runtime totals above are readings of stored
  worker artifacts, not fresh reviewer executions.
- I did not independently remeasure the integration base. Neither did the r3 worker; both
  rely on the disclosed stored r1 base until D15 performs closure measurement.
- Full `pnpm test` remains D15-deferred.
- I did not verify a behavioural partial-standing M=2 run through the embedded-postgres
  `executeWorkItem` closure. I accept the semantic invariant plus labelled structural pin for
  the current live seam, with F-T7-11's stated residual risk.
- I did not validate the worker's 45–90 minute estimate for building that integration fixture.
- I did not read the prohibited 1959-line spine and did not consult another review lens.

## PREDICTIONS

Other lenses will likely approve B1 after seeing the live closure pass both fields and the
short-scope tests remain conservative; I predict at least one will miss that the exported
strict input still spells `expectedRootCount?:` and defaults it to the already-narrowed
scope. I also expect a lens to accept `comparedRootNodeIds: [A]` on the partial path without
checking that `maxRootMovement` is hard-coded null and A's exact `1/4` movement is never
computed. Most should catch the 10-versus-11 commit count; few will challenge `0.126` as
“one representable step” above `1/8`. The first cross-lens checks should therefore be the
strict input's optional marker, a mixed moved-plus-uncomparable root probe, and whether MN2
was exercised through `decideRoundBoundary` rather than only its strict helper.

---
PROVENANCE (orchestrator): filed by the codex reviewer inside the lane worktree in a resumed session after the sandbox rejected the out-of-tree write (logs/t07-codex-r2.log, logs/t07-codex-r2-refile.log); copied byte-for-byte to this path by the orchestrator on 2026-09-02 00:09:14 EEST; original sha256 04dec35677142532ac0338e6a92a1e9708fa38bf568ac9e8a4d9ed57df38ac61.
